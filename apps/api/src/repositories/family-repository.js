import { db } from '../db.js';
export const FAMILY_DEFINITION_SQL="jsonb_build_object('id',f.id,'family_code',f.family_code,'version',f.version,'name',f.name,'description',f.description,'expression',f.expression,'variables',f.variables,'default_unit',f.default_unit,'change_notes',f.change_notes)";
export async function listFamilies(){
 const [families,versions,usage]=await Promise.all([
  db('equation_families').orderBy('code'),
  db('equation_family_versions').select('id','family_code','version','name','description','expression','variables','default_unit','change_notes','created_at').orderBy('version','desc'),
  db('idf_segments').select('family_version_id').count('* as count').groupBy('family_version_id')
 ]);
 const counts=new Map(usage.map(row=>[row.family_version_id,Number(row.count)]));
 return families.map(family=>{const history=versions.filter(v=>v.family_code===family.code).map(v=>({...v,usage_count:counts.get(v.id)||0}));return {...family,latest:history[0],versions:history,usage_count:history.reduce((sum,v)=>sum+v.usage_count,0)}});
}
export async function definitionsForSegments(segments){
 const ids=segments.map(s=>s.family_version_id).filter(Boolean);
 const rows=await db('equation_family_versions as v').join('equation_families as c','c.code','v.family_code').where(builder=>{if(ids.length)builder.whereIn('v.id',ids);builder.orWhere(nested=>nested.whereIn('v.family_code',['GUMBEL','GENERAL']).where('v.version',1))}).select('v.*','c.active');
 return segments.map(segment=>{
  const definition=rows.find(v=>segment.family_version_id?v.id===segment.family_version_id:v.family_code===segment.family&&v.version===1);
  if(!definition||definition.family_code!==segment.family)throw Object.assign(new Error('Informe uma versão válida da família para cada trecho.'),{status:422});
  if(!definition.active)throw Object.assign(new Error(`A família ${segment.family} está inativa para novas equações.`),{status:422});
  const {active,created_at,created_by,...publicDefinition}=definition;
  return {...segment,family_version_id:definition.id,family_definition:publicDefinition};
 });
}
export async function saveFamily(data,actor,{create=false}={}){
 return db.transaction(async trx=>{
  const {code,...definition}=data;
  if(create){
   const inserted=await trx('equation_families').insert({code}).onConflict('code').ignore().returning('code');
   if(!inserted.length)throw Object.assign(new Error('Já existe uma família com esse código.'),{status:409});
  }
  const family=await trx('equation_families').where({code}).forUpdate().first();
  if(!family)throw Object.assign(new Error('Família não encontrada.'),{status:404});
  if(!family.active)throw Object.assign(new Error('Reative a família antes de criar uma nova versão.'),{status:422});
  const previous=await trx('equation_family_versions').where({family_code:code}).max('version as version').first();
  const [saved]=await trx('equation_family_versions').insert({...definition,family_code:code,version:Number(previous.version||0)+1,created_by:actor,variables:JSON.stringify(definition.variables)}).returning('*');
  await trx('audit_logs').insert({actor_id:actor,action:create?'family.created':'family.version_created',entity_id:saved.id,details:{code,version:saved.version}});
  return saved;
 });
}
export async function setFamilyActive(code,active,actor){
 return db.transaction(async trx=>{
  const row=await trx('equation_families').where({code}).forUpdate().first();
  if(!row)throw Object.assign(new Error('Família não encontrada.'),{status:404});
  await trx('equation_families').where({code}).update({active});
  await trx('audit_logs').insert({actor_id:actor,action:active?'family.activated':'family.deactivated',entity_id:code});
  return {...row,active};
 });
}
