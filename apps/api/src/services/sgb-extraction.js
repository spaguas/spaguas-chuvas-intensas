import { readFile } from 'node:fs/promises';
import { parseReport, validateSgbModel, normalizeName,SGB_FAMILIES } from './sgb-parser.js';
const reviewed=JSON.parse(await readFile(new URL('../../../../data/sgb/reviewed-extractions.json',import.meta.url),'utf8'));
const geo=JSON.parse(await readFile(new URL('../../../../data/geography/sp-municipalities.geojson',import.meta.url),'utf8'));
const municipalities=new Map(geo.features.map(f=>[normalizeName(f.properties.name),{id:String(f.properties.codarea),ibge_code:String(f.properties.codarea),name:f.properties.name}]));
// Official IBGE spelling; the SGB index uses "da Posse".
municipalities.set(normalizeName('Santo Antônio da Posse'),municipalities.get(normalizeName('Santo Antônio de Posse')));
municipalities.set(normalizeName('São Luís do Paraitinga'),municipalities.get(normalizeName('São Luiz do Paraitinga')));

export function extractSgbDocument(text,entry,metadata,sha256){
 const municipality=municipalities.get(normalizeName(entry.municipality));
 if(!municipality)throw new Error(`Município SGB sem correspondência IBGE inequívoca: ${entry.municipality}`);
 const result=parseReport(text,metadata), review=reviewed[entry.external_id];
 if(review?.sha256===sha256&&review.models){
  result.models=review.models.map(m=>{
   const model={return_min:2,reference_checks:[],station_latitude:null,station_longitude:null,station_prefix:'',coordinate_evidence:'',source_excerpt:review.reason,table_excerpt:'',...m,issues:[],reviewed_extraction:review.reason};
   model.segments=model.segments.map(s=>({...s,family_definition:SGB_FAMILIES.find(f=>f.id===s.family_version_id)}));
   return validateSgbModel(model);
  });result.issues=[];
 }
 if(review?.sha256===sha256&&review.reference_checks&&result.models.length===1){
  const m=result.models[0];m.reference_checks=review.reference_checks;m.issues=[];m.reviewed_extraction=review.reason;validateSgbModel(m);
 }
 const cover=text.split('\f')[0].normalize('NFKC');
 const names=[...cover.matchAll(/Estaç[ãa]o\s+Pluvi[óo](?:m[ée]trica|gr[áa]fica)\s*:\s*([^\n]+)/gi)].map(m=>m[1].trim());
 const prefixes=[...cover.matchAll(/\b[A-F]\d-\d{3}R?\b/g)].map(m=>m[0]);
 for(const [i,m] of result.models.entries()){
  m.station_name=m.station_name||(names.length===result.models.length?names[i]:names[0])||metadata.title.split(/estaç[ãa]o[^:]*:/i)[1]?.split(/[,;]/)[0]?.trim()||municipality.name;
  m.station_prefix=m.station_prefix||(prefixes.length===result.models.length?prefixes[i]:prefixes[0])||'';
  m.source_author=`${metadata.authors.join('; ')} (${metadata.issued_year})`;
  // The family snapshot is loaded authoritatively from PostgreSQL on import.
  m.segments=m.segments.map(({family_definition,...s})=>s);
 }
 if(entry.publication_year!==metadata.issued_year)result.issues.push(`Ano da listagem (${entry.publication_year}) difere do RIGeo (${metadata.issued_year}); ano bibliográfico preservado.`);
 return {...entry,metadata,sha256,municipality,...result};
}
