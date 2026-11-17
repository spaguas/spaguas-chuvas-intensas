import { load } from 'cheerio';
import { calculate, validateEquation } from '@chuvas/hydrology';

export const SGB_INDEX = 'https://www.sgb.gov.br/chuvas-intensas-e-equacoes-idf-sao-paulo';
export const PARSER_VERSION = 1;
export const normalizeName = value => value.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^a-z0-9]/g,'');
export const SGB_FAMILIES = [
 {code:'SGB_POWER',id:'00000000-0000-4000-8000-000000000003',name:'SGB — potência',expression:'a*T^b/(t+c)^d',names:['a','b','c','d']},
 {code:'SGB_LOG',id:'00000000-0000-4000-8000-000000000004',name:'SGB — logarítmica (horas na fonte)',expression:'((a*ln(T)+b)*ln(t/60+delta/60)+c*ln(T)+d)/(t/60)',names:['a','b','c','d','delta']}
 ,{code:'SGB_POWER_LOG',id:'00000000-0000-4000-8000-000000000005',name:'SGB — potência e logaritmo (horas na fonte)',expression:'(a*T^b*ln(t/60+delta/60)+c*T^d)/(t/60)',names:['a','b','c','d','delta']}
].map(f=>({...f,family_code:f.code,version:1,description:'Transcrição do Atlas Pluviométrico do Brasil. Entrada normalizada em minutos e anos.',default_unit:'mm_h',change_notes:'Importação SGB v1',variables:f.names.map(name=>({name,label:name,unit:'',default_value:0,min_value:-1e7,max_value:1e7}))}));

export function parseIndex(html) {
 const $=load(html), entries=new Map();let table;
 $('table').each((_,el)=>{if($(el).text().includes('Município')&&$(el).text().includes('Publicações'))table=el;});
 if(!table)throw new Error('Tabela de publicações SGB não encontrada; verifique alteração do site.');
 $(table).find('tr').each((_,row)=>{
  const cells=$(row).find('td');if(cells.length<3)return;
  const municipality=$(cells[0]).text().trim(),method=$(cells[cells.length-1]).text().trim();
  $(row).find('a[href]').each((_,a)=>{
   const url=new URL($(a).attr('href'),SGB_INDEX);
   if(url.hostname!=='rigeo.sgb.gov.br'||!/^\/handle\/doc\/\d+$/.test(url.pathname))throw new Error(`Link de publicação inesperado: ${url}`);
   const label=$(a).text().trim(),year=Number(/^20\d{2}$/.test(label)?label:$(cells[1]).text().match(/20\d{2}/)?.[0]);
   if(!year)throw new Error(`Ano de publicação ausente: ${municipality}`);
   const entry={external_id:url.pathname.split('/').at(-1),municipality,publication_year:year,method,url:url.href};
   const previous=entries.get(entry.external_id);
   if(previous&&(previous.municipality!==municipality||previous.publication_year!==year))throw new Error('Mesmo documento associado a publicações incompatíveis.');
   entries.set(entry.external_id,entry);
  });
 });
 if(entries.size<1)throw new Error('Catálogo SGB vazio.');
 return [...entries.values()];
}

export function parseItem(html) {
 const $=load(html), meta=name=>$(`meta[name="${name}"]`).map((_,el)=>$(el).attr('content')).get();
 const title=meta('citation_title')[0],year=Number(meta('citation_publication_date')[0]?.slice(0,4));
 const pdfs=$('a[href]').map((_,a)=>$(a).attr('href')).get().filter(h=>/^\/bitstreams\/[a-f0-9-]+\/download$/.test(h));
 if(!title||!year||!pdfs.length)throw new Error('Metadados ou PDF ausentes no RIGeo.');
 return {title,issued_year:year,authors:meta('citation_author'),publisher:meta('citation_publisher')[0]||'SGB/CPRM',pdf_url:new URL(pdfs[0],'https://rigeo.sgb.gov.br').href};
}

const numeric = value => Number(value.replace(/\s/g,'').replace(',','.'));
const num='[-+]?\\d+(?:[.,]\\d+)?';
function normalizeText(text){return text.normalize('NFKC').replace(/[−–—]/g,'-').replace(/[\uF064𝛿δα]/gu,'delta').replace(/\u0301/g,"'").replace(/(?<=\p{L})-\s*\n\s*(?=\p{L})/gu,'').replace(/\u00ad/g,'').replace(/([+-])\s+(?=\d)/g,'$1').replace(/\b\d{1,3}(?:\.\d{3})+,\d+/g,n=>n.replaceAll('.',''));}

function domainBefore(text,index){
 const context=text.slice(Math.max(0,index-900),index);
 const matches=[...context.matchAll(/(\d+(?:[.,]\d+)?)\s*(min(?:utos)?|h(?:oras?)?)\s*[≤<]\s*t\s*[≤<]\s*(\d+(?:[.,]\d+)?)\s*(min(?:utos)?|h(?:oras?)?)/gi)];
 const m=matches.at(-1);return m?{duration_min:numeric(m[1])*(/^h/i.test(m[2])?60:1),duration_max:numeric(m[3])*(/^h/i.test(m[4])?60:1)}:null;
}

function proseDomain(text){
 const matches=[...text.matchAll(/duraç[õo]es\s+(?:superiores\s+a\s+|(?:entre|de)\s+)?(\d+)\s*(minutos?|min|horas?|h)\s*(?:a|até|e)\s*(\d+)\s*(minutos?|min|horas?|h)/gi)];
 const m=matches.at(-1);return m?{duration_min:+m[1]*(/^h/i.test(m[2])?60:1),duration_max:+m[3]*(/^h/i.test(m[4])?60:1)}:null;
}

export function parseIntensityTable(text){
 const lines=text.split('\n');let columns,orientation;const checks=[];
 for(const line of lines){
  const tokens=line.trim().split(/\s+/);
  if(!columns){
   const numbers=tokens.filter(v=>/^\d+(?:[.,]\d+)?$/.test(v)).map(numeric);
   if(numbers.length>=5&&numbers.every((n,i)=>i===0||n>numbers[i-1])){
    if(numbers[0]===2){columns=numbers;orientation='duration';}
    else if([5,10].includes(numbers[0])&&numbers.at(-1)>=360){columns=numbers;orientation='return';}
   }
   continue;
  }
  const row=line.match(/^\s*(\d+(?:[.,]\d+)?)\s*(Minutos?|Min\.?|Horas?|H)?\s+(.+)$/i);if(!row)continue;
  const values=row[3].trim().split(/\s+/);
  if(values.length!==columns.length||!values.every(v=>/^\d+(?:[.,]\d+)?$/.test(v)))continue;
  const x=numeric(row[1])*(orientation==='duration'&&/^h/i.test(row[2]||'')?60:1);
  for(let i=0;i<values.length;i++)checks.push({duration:orientation==='duration'?x:columns[i],return_period:orientation==='duration'?columns[i]:x,intensity_mm_h:numeric(values[i])});
 }
 return checks;
}

function stationCoordinates(text){
 const pattern=/[Ll]atitude\s*(\d{2})\s*[°ºo]\s*(\d{1,2})\s*['’′´`]?\s*(?:(\d{1,2}(?:[.,]\d+)?)\s*["'”″’]*)?\s*S[\s\S]{0,65}?[Ll]ongitude\s*(\d{2,3})\s*[°ºo]\s*(\d{1,2})\s*['’′´`]?\s*(?:(\d{1,2}(?:[.,]\d+)?)\s*["'”″’]*)?\s*[OW]/g;
 const matches=[...text.matchAll(pattern)];
 // The last pair in the introduction describes the station; the first can be the municipal seat.
 const m=matches.at(-1);if(!m)return null;
 return {latitude:-(+m[1]+m[2]/60+numeric(m[3]||'0')/3600),longitude:-(+m[4]+m[5]/60+numeric(m[6]||'0')/3600),evidence:m[0]};
}

export function parseReport(raw,metadata){
 const text=normalizeText(raw), tables=[...text.matchAll(/Tabela\s*0?\d+\s*[-:]\s*Intensidades?[^\n]*mm\s*\/\s*h[^\n]*/gi)].filter(m=>!/[.]{3}|continuaç/i.test(m[0]));
 if(!tables.length){const fallback=[''];fallback.index=text.length;tables.push(fallback);}
 const models=[];let previous=0;
 for(const [tableIndex,table] of tables.entries()){
  const before=text.slice(previous,table.index), end=text.slice(table.index+table[0].length).search(/Tabela\s*0?\d+\s*[-:]\s*Altura/i);
  const tableText=text.slice(table.index+table[0].length,end<0?text.length:table.index+table[0].length+end);
  const pageBefore=before.slice(before.lastIndexOf('\f')+1);
  const captionBelow=/^\s*(?:24\s+HORAS|100)\s+[\d.,]+\s+[\d.,]+/im.test(pageBefore)&&parseIntensityTable(pageBefore).length>=12;
  const checks=parseIntensityTable(captionBelow?pageBefore:tableText),segments=[];
  const paramsPattern=new RegExp(`\\ba\\s*=\\s*(${num})[\\s;]*b\\s*=\\s*(${num})[\\s;]*c\\s*=\\s*(${num})[\\s;e]*d\\s*=\\s*(${num})(?:[\\s;e]*delta\\s*=\\s*(${num}))?`,'g');
  const coefficients=[...before.matchAll(paramsPattern)];
  const eightPattern=new RegExp(['a','b','c','d','e','f','g','h'].map(k=>`${k}\\s*=\\s*(${num})`).join('[\\s;,e]*'),'g');
  for(const m of before.matchAll(eightPattern)){
   const domain=proseDomain(before.slice(Math.max(0,m.index-550),m.index))||domainBefore(before,m.index)||proseDomain(before.slice(m.index,m.index+1200));if(!domain)continue;
   segments.push({...domain,family:'GUMBEL',family_version_id:'00000000-0000-4000-8000-000000000001',unit:'mm_min',parameters:Object.fromEntries(['A','B','C','D','E','F','G','H'].map((k,i)=>[k,numeric(m[i+1])]))});
  }
  for(const m of coefficients){
   if(/^\s*[,;]\s*e\s*=/.test(before.slice(m.index+m[0].length)))continue; // Eight-coefficient Gumbel is a different family.
   const domain=domainBefore(before,m.index)||proseDomain(before.slice(Math.max(0,m.index-550),m.index))||proseDomain(before.slice(m.index,m.index+1200))||(coefficients.length===1?proseDomain(before):null);if(!domain)continue;
   const family=SGB_FAMILIES[m[5]===undefined?0: /a\s*\.?\s*\(T\)b/.test(before)?2:1];
   const parameters=Object.fromEntries(family.names.map((key,i)=>[key,numeric(m[i+1])]));
   segments.push({...domain,family:family.code,family_version_id:family.id,family_definition:family,unit:'mm_h',parameters});
  }
  if(!segments.length){
   const offsets=[];let compact='';for(let i=0;i<before.length;i++)if(!/\s/.test(before[i])){offsets.push(i);compact+=before[i].replace(',','.');}compact=compact.replace(/Ln/g,'ln');
   const gumbelPattern=new RegExp(`(${num})\\.?\\(t\\+(${num})\\)(${num})\\+(${num})\\.?\\(t\\+(${num})\\)(${num})\\.?[\\[{](${num})(${num})\\.?ln`,'g');
   const gumbels=[...compact.matchAll(gumbelPattern)];
   for(const m of gumbels){
    const domain=domainBefore(before,offsets[m.index])||proseDomain(before.slice(offsets[m.index],offsets[m.index]+1200))||(gumbels.length===1?domainBefore(before,before.length):null);if(!domain)continue;
    segments.push({...domain,family:'GUMBEL',family_version_id:'00000000-0000-4000-8000-000000000001',unit:'mm_min',parameters:Object.fromEntries(['A','B','C','D','E','F','G','H'].map((key,i)=>[key,numeric(m[i+1])]))});
   }
  }
  if(!segments.length&&!checks.length)continue;
  const coords=stationCoordinates(text.slice(0,table.index));
  const formulaOffset=previous+(coefficients[0]?.index??Math.max(0,before.lastIndexOf('equação estabelecida')));
  const page=text.slice(0,formulaOffset).split('\f').length;
  const printedPage=Number(text.split('\f')[page-1]?.trim().match(/(?:^|\n)\s*(\d{1,3})\s*$/)?.[1])||page;
  const excerpt=coefficients.length?before.slice(Math.max(0,coefficients[0].index-1000),coefficients.at(-1).index+1700).slice(0,10000):before.slice(-5500);
  const declaredMax=excerpt.match(/tempos?\s+de\s+retorno\s+(?:de\s+)?at[ée]\s+(\d+)\s+anos/i)?.[1];
  const model={key:`idf${models.length+1}`,segments,reference_checks:checks,return_min:checks.length?Math.min(...checks.map(c=>c.return_period)):2,return_max:checks.length?Math.max(...checks.map(c=>c.return_period)):Number(declaredMax||100),source_pdf_page:page,source_page:printedPage,station_latitude:coords?.latitude??null,station_longitude:coords?.longitude??null,coordinate_evidence:coords?.evidence||'',source_excerpt:excerpt,table_excerpt:tableText.slice(0,12000),issues:[]};
  validateSgbModel(model);
  models.push(model);previous=table.index+table[0].length;
 }
 return {parser_version:PARSER_VERSION,models,issues:models.length?[]:['Nenhuma tabela IDF reconhecida; revisão técnica necessária.']};
}

export function validateSgbModel(model,{min_reference_points=12,absolute_tolerance=.25,relative_tolerance_percent=1}={}){
  if(!model.segments.length)model.issues.push('Formato da fórmula não reconhecido automaticamente.');
  if(model.reference_checks.length<min_reference_points)model.issues.push('Tabela de intensidades insuficiente ou não reconhecida.');
  if(model.segments.length){
   try{validateEquation(model);for(const s of model.segments)if(!model.reference_checks.some(c=>c.duration>=s.duration_min&&c.duration<=s.duration_max))throw new Error('Trecho sem pontos independentes.');}
   catch(e){model.issues.push(e.message);}
   const failures=[];for(const c of model.reference_checks){try{const value=calculate({...model,status:'active'},c.duration,c.return_period).intensity_mm_h;if(Math.abs(value-c.intensity_mm_h)>Math.max(absolute_tolerance,c.intensity_mm_h*relative_tolerance_percent/100))failures.push({...c,calculated:value});}catch(e){failures.push({...c,error:e.message});}}
   if(failures.length)model.issues.push(`${failures.length}/${model.reference_checks.length} pontos divergem da fórmula ou do domínio.`);
   model.validation={checked:model.reference_checks.length,failed:failures.length,examples:failures.slice(0,6)};
  }
  model.validated=model.issues.length===0;
 return model;
}
