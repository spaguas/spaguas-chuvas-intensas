import { getSgbSettings } from '../services/sgb-settings-service.js';
import { sgbAdoptionDecision } from '../services/sgb-policy.js';
import { db } from '../db.js';
import { calculate } from '@chuvas/hydrology';
import { getEquation } from './catalog-repository.js';
import { SGB_FAMILIES,validateSgbModel } from '../services/sgb-parser.js';

function comparable(a,b){
 if(a.segments.length!==b.segments.length)return false;
 const lo=Math.max(a.return_min,b.return_min),hi=Math.min(a.return_max,b.return_max);if(lo>=hi)return false;
 for(let i=0;i<a.segments.length;i++){
  const x=a.segments[i],y=b.segments[i];if(x.duration_min!==y.duration_min||x.duration_max!==y.duration_max)return false;
  for(const duration of [x.duration_min,(x.duration_min+x.duration_max)/2,x.duration_max])for(const T of [lo,Math.sqrt(lo*hi),hi]){
   try{const av=calculate({...a,status:'active'},duration,T).intensity_mm_h,bv=calculate({...b,status:'active'},duration,T).intensity_mm_h;if(Math.abs(av-bv)>Math.max(1e-7,Math.abs(av)*1e-7))return false;}catch{return false;}
  }
 }
 return true;
}

export async function importSgbDocument(document,connection=db,settings){
 settings??=(await getSgbSettings(connection)).settings;
 const d=document,counts={imported:0,duplicates:0,pending:0,unchanged:0};
 return connection.transaction(async trx=>{
  await trx('municipalities').insert(d.municipality).onConflict('id').ignore();
  await trx('municipalities').where({id:d.municipality.id}).forUpdate().first();
  await trx('sgb_publications').insert({external_id:d.external_id,municipality_id:d.municipality.id,municipality_name:d.municipality.name,url:d.url,listing_year:d.publication_year,method:d.method,last_checked_at:trx.fn.now()}).onConflict('external_id').merge({municipality_id:d.municipality.id,listing_year:d.publication_year,method:d.method,present_on_site:true,last_seen_at:trx.fn.now(),last_checked_at:trx.fn.now(),last_error:null});
  let version=await trx('sgb_publication_versions').where({publication_id:d.external_id,sha256:d.sha256,issued_year:d.metadata.issued_year,parser_version:d.parser_version}).first();
  if(!version){
   [version]=await trx('sgb_publication_versions').insert({publication_id:d.external_id,sha256:d.sha256,issued_year:d.metadata.issued_year,parser_version:d.parser_version,metadata:d.metadata,pdf_url:d.metadata.pdf_url,issues:JSON.stringify(d.issues)}).returning('*');
   await trx('audit_logs').insert({action:'sgb.publication_discovered',entity_id:version.id,details:{publication_id:d.external_id,sha256:d.sha256,year:d.metadata.issued_year}});
  }
  for(const raw of d.models){
   const linked=await trx('sgb_models').where({publication_version_id:version.id,model_key:raw.key}).first();
   if(linked?.equation_id){counts.unchanged++;continue;}
   const candidate={...raw,issues:[],segments:raw.segments.map(s=>({...s,family_definition:SGB_FAMILIES.find(f=>f.id===s.family_version_id)}))};
   // Never trust the snapshot's boolean. Repeat validation before any publication.
   validateSgbModel(candidate,settings);
   const codes=[...new Set(candidate.segments.map(s=>s.family))].sort();
   const familyRows=await trx('equation_families').whereIn('code',codes).orderBy('code').forShare();
   if(familyRows.length!==codes.length)throw new Error('Família SGB ausente; aplique as migrations antes da importação.');
   if(familyRows.some(f=>!f.active)){candidate.issues.push('Família de equação desativada pela equipe operacional.');candidate.validated=false;}
   const validated=candidate.validated;
   const existing=await trx('idf_equations').where({municipality_id:d.municipality.id}).orderBy('version','desc');
   let match;
   for(const e of existing){if(comparable(candidate,await getEquation(e.id,trx))){match=e;break;}}
   let equationId=match?.id,resolution;
   if(match){resolution='duplicate';counts.duplicates++;}
   else if(!candidate.segments.length){resolution='pending';counts.pending++;}
   else{
    const active=existing.find(e=>e.status==='active');
    const samePublication=!!active&&!!await trx('sgb_models as m').join('sgb_publication_versions as v','v.id','m.publication_version_id').where({'m.equation_id':active.id,'v.publication_id':d.external_id}).first();
    const decision=sgbAdoptionDecision(settings,{validated,modelCount:d.models.length,active,year:d.metadata.issued_year,samePublication});
    const canActivate=decision.activate;
    const status=canActivate?'active':validated&&active?'retired':'pending';
    if(canActivate){await trx('idf_equations').where({municipality_id:d.municipality.id,status:'active'}).update({status:'retired'});}
    equationId=crypto.randomUUID();
    const reviewNotes=[`SGB/RIGeo ${d.external_id}, ${raw.key}; SHA-256 ${d.sha256}.`,candidate.validation?`Conferidos ${candidate.validation.checked} pontos; ${candidate.validation.failed} divergências.`:'',raw.reviewed_extraction||'',...candidate.issues,...d.issues,decision.reason,!canActivate&&validated?'Alternativa validada preservada no histórico. Seleção operacional requer revisão; equação ativa existente mantida.':''].filter(Boolean).join(' ');
    await trx('idf_equations').insert({id:equationId,municipality_id:d.municipality.id,version:Math.max(0,...existing.map(e=>e.version))+1,status,return_min:candidate.return_min,return_max:candidate.return_max,station_name:raw.station_name,station_prefix:raw.station_prefix,source_page:raw.source_page,source_pdf_page:raw.source_pdf_page,source_author:raw.source_author,source_formula:raw.source_excerpt,review_notes:reviewNotes,reference_checks:JSON.stringify(raw.reference_checks),source_url:d.metadata.pdf_url,publication_year:d.metadata.issued_year,source_agency:'SGB / CPRM',station_latitude:raw.station_latitude,station_longitude:raw.station_longitude,managed_by:'sgb'});
    await trx('idf_segments').insert(raw.segments.map(({family_definition,...s},ordinal)=>({...s,equation_id:equationId,ordinal})));
    resolution=validated?(canActivate?'imported':'alternative'):'pending';counts.imported++;if(!validated)counts.pending++;
    await trx('audit_logs').insert({action:'sgb.equation_imported',entity_id:equationId,details:{publication_id:d.external_id,model:raw.key,status,year:d.metadata.issued_year,adoption_reason:decision.reason,adoption_mode:settings.adoption_mode}});
   }
   await trx('sgb_models').insert({publication_version_id:version.id,model_key:raw.key,equation_id:equationId||null,resolution,validated,validation:{issues:candidate.issues,...candidate.validation},payload:raw}).onConflict(['publication_version_id','model_key']).merge();
  }
  return counts;
 });
}

export async function sgbCatalog({year,municipality_id}={}){
 const rows=await db('sgb_publications as p').leftJoin('sgb_publication_versions as v','v.publication_id','p.external_id').leftJoin('sgb_models as m','m.publication_version_id','v.id').leftJoin('idf_equations as e','e.id','m.equation_id')
 .modify(q=>{if(year)q.where('v.issued_year',year);if(municipality_id)q.where('p.municipality_id',municipality_id);})
 .select('p.*','v.id as publication_version_id','v.sha256','v.issued_year','v.metadata','v.pdf_url','v.issues','v.imported_at','m.model_key','m.equation_id','m.resolution','m.validated','m.validation','e.status as equation_status').orderBy('v.issued_year','desc').orderBy('p.municipality_name').orderBy('m.model_key');
 return rows;
}
export async function sgbStatus(){
 const [latest,publications,versions,pending]=await Promise.all([db('sgb_sync_runs').orderBy('started_at','desc').first(),db('sgb_publications').count('* as count').first(),db('sgb_publication_versions').count('* as count').first(),db('sgb_models').where({validated:false}).count('* as count').first()]);
 return {latest:latest||null,publications:Number(publications.count),versions:Number(versions.count),pending_models:Number(pending.count)};
}
