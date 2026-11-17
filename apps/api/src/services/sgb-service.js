import { setTimeout as delay } from 'node:timers/promises';
import { getSgbSettings } from './sgb-settings-service.js';
import { DEFAULT_SGB_SETTINGS,nextSgbCheck } from './sgb-policy.js';
import { createHash } from 'node:crypto';
import { mkdtemp,writeFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { db } from '../db.js';
import { config } from '../config.js';
import { importSgbDocument } from '../repositories/sgb-repository.js';
import { SGB_INDEX,PARSER_VERSION,parseIndex,parseItem } from './sgb-parser.js';
import { extractSgbDocument } from './sgb-extraction.js';
const execute=promisify(execFile),LOCK=762314803;

// Fixed allow-list: links found in a remote document never become arbitrary server requests.
async function fetchAttempt(url,{headers={},binary=false,fetchImpl=fetch,signal,settings}){
 let current=new URL(url);
 for(let redirects=0;redirects<5;redirects++){
  if(current.protocol!=='https:'||!['www.sgb.gov.br','rigeo.sgb.gov.br'].includes(current.hostname)||current.port||current.username||current.password)throw new Error('URL SGB fora dos domínios permitidos.');
  if(settings.request_delay_ms)await delay(settings.request_delay_ms,undefined,{signal});
  let response;
  try{response=await fetchImpl(current,{headers:{'User-Agent':'SP-AGUAS-IDF-Catalog/1.0',...headers},redirect:'manual',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(settings.timeout_ms)]):AbortSignal.timeout(settings.timeout_ms)});}catch(error){if(!signal?.aborted)error.retryable=true;throw error;}
  if([301,302,303,307,308].includes(response.status)){current=new URL(response.headers.get('location'),current);await response.body?.cancel();continue;}
  if(response.status===304)return {unchanged:true,headers:response.headers};
  if(!response.ok){await response.body?.cancel();throw Object.assign(new Error(`SGB HTTP ${response.status}`),{retryable:response.status===429||response.status>=500});}
  const limit=(binary?settings.max_pdf_mb:settings.max_html_mb)*1024*1024,parts=[];let size=0;
  try{for await(const part of response.body){signal?.throwIfAborted();size+=part.length;if(size>limit)throw new Error('Documento SGB excede limite de tamanho.');parts.push(part);}}
  catch(error){if(!signal?.aborted&&['AbortError','TimeoutError','TypeError'].includes(error.name))error.retryable=true;throw error;}
  const buffer=Buffer.concat(parts);
  if(binary&&!buffer.subarray(0,5).equals(Buffer.from('%PDF-')))throw new Error('O RIGeo retornou conteúdo diferente de PDF.');
  return {body:binary?buffer:buffer.toString('utf8'),headers:response.headers};
 }
 throw new Error('Redirecionamentos SGB em excesso.');
}

export async function sgbFetch(url,options={}){
 const settings=options.settings||{...DEFAULT_SGB_SETTINGS,timeout_ms:config.SGB_TIMEOUT_MS};
 for(let attempt=0;;attempt++){
  options.signal?.throwIfAborted();
  try{return await fetchAttempt(url,{...options,settings});}
  catch(error){if(options.signal?.aborted||!error.retryable||attempt>=settings.retry_attempts)throw error;await delay(settings.retry_delay_ms*(attempt+1),undefined,{signal:options.signal});}
 }
}

export async function pdfText(buffer,{signal,settings=DEFAULT_SGB_SETTINGS}={}){
 const folder=await mkdtemp(join(tmpdir(),'sgb-idf-'));
 try{
  const pdf=join(folder,'report.pdf');await writeFile(pdf,buffer);
  const {stdout}=await execute('pdftotext',['-layout',pdf,'-'],{timeout:settings.extraction_timeout_seconds*1000,maxBuffer:5*1024*1024,signal});
  if(stdout.trim().length>=1000)return stdout;
  if(!settings.ocr_enabled)throw new Error('PDF requer OCR, desativado na configuração administrativa.');
  const {stdout:info}=await execute('pdfinfo',[pdf],{timeout:15000,signal});
  const pages=Number(info.match(/^Pages:\s+(\d+)/m)?.[1]);if(!pages||pages>settings.ocr_max_pages)throw new Error('PDF digitalizado sem contagem de páginas segura.');
  const texts=[];
  for(let page=1;page<=pages;page++){
   const prefix=join(folder,'page');
   await execute('pdftoppm',['-f',String(page),'-l',String(page),'-r','200','-png','-singlefile',pdf,prefix],{timeout:30000,signal});
   const {stdout:text}=await execute('tesseract',[`${prefix}.png`,'stdout','-l','por','--psm','3'],{timeout:settings.extraction_timeout_seconds*1000,maxBuffer:1024*1024,signal,env:{...process.env,OMP_THREAD_LIMIT:'1'}});
   texts.push(text);
  }
  return texts.join('\f');
 }finally{await rm(folder,{recursive:true,force:true});}
}

export async function syncSgb({fetchImpl=fetch,extractText=pdfText,trigger='scheduled',signal}={}){
 const connection=await db.client.acquireConnection();let run;
 try{
  const {rows}=await db.raw('SELECT pg_try_advisory_lock(?) AS locked',[LOCK]).connection(connection);
  if(!rows[0].locked)return {status:'skipped',reason:'already_running'};
  const configuration=await getSgbSettings(),settings=configuration.settings;
  if(!settings.enabled)return {status:'skipped',reason:'disabled'};
  if(trigger==='scheduled'){const latest=await db('sgb_sync_runs').orderBy('started_at','desc').first();const next=nextSgbCheck(settings,latest);if(latest?.status!=='running'&&next&&next.getTime()>Date.now())return {status:'skipped',reason:'not_due',next_check_at:next.toISOString()};}
  await db('sgb_sync_runs').where({status:'running'}).update({status:'failed',finished_at:db.fn.now(),errors:JSON.stringify([{error:'Execução anterior interrompida antes da conclusão.'}])});
  [run]=await db('sgb_sync_runs').insert({status:'running',trigger,settings_revision:configuration.revision,settings_snapshot:settings}).returning('*');
  const counts={discovered:0,changed:0,unchanged:0,imported:0,duplicates:0,pending:0,failed:0},errors=[];
  try{
   const index=await sgbFetch(SGB_INDEX,{fetchImpl,signal,settings}),entries=parseIndex(index.body);
   const {count}=await db('sgb_publications').where({present_on_site:true}).count('* as count').first();
   if(entries.length<Number(count)*(1-settings.max_catalog_shrink_percent/100))throw new Error(`O catálogo encolheu mais de ${settings.max_catalog_shrink_percent}%; conferir estrutura da página antes de continuar.`);
   counts.discovered=entries.length;
   await db('sgb_publications').whereNotIn('external_id',entries.map(e=>e.external_id)).update({present_on_site:false});
   // Sequential, bounded downloads avoid stressing the government repository.
   for(const entry of entries){
    if(signal?.aborted)throw new Error('Monitoramento interrompido.');
    try{
     const current=await db('sgb_publications').where({external_id:entry.external_id}).first();
     const item=await sgbFetch(entry.url,{fetchImpl,signal,settings}),metadata=parseItem(item.body);
     const previous=await db('sgb_publication_versions').where({publication_id:entry.external_id}).orderBy('imported_at','desc').first();
     // JSONB key order is unspecified; use explicit canonical fields for comparisons.
     const same=previous&&previous.parser_version===PARSER_VERSION&&previous.issued_year===metadata.issued_year&&previous.pdf_url===metadata.pdf_url&&previous.metadata.title===metadata.title&&JSON.stringify(previous.metadata.authors)===JSON.stringify(metadata.authors);
     const headers={};if(settings.conditional_requests&&same&&current?.etag)headers['If-None-Match']=current.etag;if(settings.conditional_requests&&same&&current?.last_modified)headers['If-Modified-Since']=current.last_modified;
     const pdf=await sgbFetch(metadata.pdf_url,{headers,binary:true,fetchImpl,signal,settings});
     if(pdf.unchanged){
      if(!previous)throw new Error('Resposta 304 sem versão conhecida.');counts.unchanged++;
     }else{
      const sha256=createHash('sha256').update(pdf.body).digest('hex');
      if(same&&previous.sha256===sha256){counts.unchanged++;}
      else{
       const text=await extractText(pdf.body,{signal,settings});
       const d=extractSgbDocument(text,entry,metadata,sha256),result=await importSgbDocument(d,db,settings);
       counts.changed++;for(const k of ['imported','duplicates','pending'])counts[k]+=result[k];
      }
     }
     await db('sgb_publications').where({external_id:entry.external_id}).update({listing_year:entry.publication_year,method:entry.method,present_on_site:true,last_seen_at:db.fn.now(),last_checked_at:db.fn.now(),last_error:null,etag:pdf.headers.get('etag')||(pdf.unchanged?current?.etag:null)||null,last_modified:pdf.headers.get('last-modified')||(pdf.unchanged?current?.last_modified:null)||null});
    }catch(e){counts.failed++;errors.push({publication_id:entry.external_id,municipality:entry.municipality,error:e.message});await db('sgb_publications').insert({external_id:entry.external_id,municipality_name:entry.municipality,url:entry.url,listing_year:entry.publication_year,method:entry.method,last_error:e.message,last_checked_at:db.fn.now()}).onConflict('external_id').merge({last_seen_at:db.fn.now(),last_checked_at:db.fn.now(),last_error:e.message,present_on_site:true});}
    // Progress survives a worker interruption and is visible in the operational panel.
    await db('sgb_sync_runs').where({id:run.id}).update({...counts,errors:JSON.stringify(errors)});
   }
   const status=counts.failed?(counts.failed===counts.discovered?'failed':'partial'):'success';
   await db('sgb_sync_runs').where({id:run.id}).update({...counts,status,finished_at:db.fn.now(),errors:JSON.stringify(errors)});
   return {id:run.id,status,settings_revision:configuration.revision,...counts};
  }catch(e){await db('sgb_sync_runs').where({id:run.id}).update({status:'failed',finished_at:db.fn.now(),errors:JSON.stringify([...errors,{error:e.message}])});throw e;}
 }finally{
  // Unlock only on the dedicated connection; returning a locked session to the pool is unsafe.
  await db.raw('SELECT pg_advisory_unlock(?)',[LOCK]).connection(connection).catch(()=>{});
  await db.client.releaseConnection(connection);
 }
}
