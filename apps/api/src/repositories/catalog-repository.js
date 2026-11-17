import { db } from '../db.js';
import { FAMILY_DEFINITION_SQL } from './family-repository.js';
export async function spatialReferences() {
 const latest=db('idf_equations').distinctOn('municipality_id').orderBy('municipality_id').orderByRaw("CASE status WHEN 'active' THEN 0 ELSE 1 END").orderBy('version','desc').as('e');
 const rows=await db('municipalities as m').join(latest,'e.municipality_id','m.id').join('idf_segments as s','s.equation_id','e.id').join('equation_family_versions as f','f.id','s.family_version_id')
  .select('m.id as municipality_id','m.name as municipality_name',db.raw("CASE WHEN e.source_agency='SGB / CPRM' THEN e.station_latitude ELSE coalesce(e.station_latitude,m.latitude) END AS latitude"),db.raw("CASE WHEN e.source_agency='SGB / CPRM' THEN e.station_longitude ELSE coalesce(e.station_longitude,m.longitude) END AS longitude"),db.raw(`to_jsonb(e) || jsonb_build_object('segments', jsonb_agg(jsonb_build_object('family',s.family,'family_version_id',s.family_version_id,'family_definition',${FAMILY_DEFINITION_SQL},'unit',s.unit,'duration_min',s.duration_min,'duration_max',s.duration_max,'parameters',s.parameters) ORDER BY s.ordinal)) AS equation`))
  .groupBy('m.id','e','e.source_agency','e.station_latitude','e.station_longitude');
 return rows;
}
export async function listMunicipalities(){
 return db('municipalities as m').leftJoin(db('idf_equations').distinctOn('municipality_id').orderBy('municipality_id').orderByRaw("CASE status WHEN 'active' THEN 0 ELSE 1 END").orderBy('version','desc').as('e'),'e.municipality_id','m.id').select('m.*','e.status','e.id as equation_id','e.station_name','e.station_prefix','e.version').orderBy('m.name');
}
export async function getEquation(id,connection=db){
 const e=await connection('idf_equations').where({id}).first();
 if(!e)return null;
 const segments=await connection('idf_segments as s').join('equation_family_versions as f','f.id','s.family_version_id').where({'s.equation_id':id}).orderBy('s.ordinal').select('s.family','s.family_version_id','s.unit','s.duration_min','s.duration_max','s.parameters',connection.raw(`${FAMILY_DEFINITION_SQL} AS family_definition`));
 return {...e,segments};
}
export async function getMunicipalityEquation(id){
 const e=await db('idf_equations').where({municipality_id:id}).orderByRaw("CASE status WHEN 'active' THEN 0 ELSE 1 END").orderBy('version','desc').first();
 return e?getEquation(e.id):null;
}
export async function listEquations(){
 const [rows,segments]=await Promise.all([db('idf_equations as e').join('municipalities as m','m.id','e.municipality_id').select('e.*','m.name as municipality_name').orderBy('m.name').orderBy('e.version','desc'),db('idf_segments as s').join('equation_family_versions as f','f.id','s.family_version_id').orderBy('s.ordinal').select('s.equation_id','s.family','s.family_version_id','s.unit','s.duration_min','s.duration_max','s.parameters',db.raw(`${FAMILY_DEFINITION_SQL} AS family_definition`))]);
 const byEquation=new Map();for(const {equation_id,...segment} of segments){if(!byEquation.has(equation_id))byEquation.set(equation_id,[]);byEquation.get(equation_id).push(segment);}
 return rows.map(row=>({...row,segments:byEquation.get(row.id)||[]}));
}
export async function saveEquation(data,actor){
 return db.transaction(async trx=>{
  const city=await trx('municipalities').where({id:data.municipality_id}).forUpdate().first();
  if(!city)throw Object.assign(new Error('Município não encontrado.'),{status:404});
  const codes=[...new Set(data.segments.map(s=>s.family))].sort();
  const families=await trx('equation_families').whereIn('code',codes).orderBy('code').forShare();
  if(families.length!==codes.length||families.some(f=>!f.active))throw Object.assign(new Error('Uma das famílias foi desativada. Atualize a seleção dos trechos.'),{status:422});
  const previous=await trx('idf_equations').where({municipality_id:data.municipality_id}).max('version as version').first();
  const version=Number(previous.version||0)+1;
  if(data.status==='active')await trx('idf_equations').where({municipality_id:data.municipality_id,status:'active'}).update({status:'retired'});
  const {segments,...record}=data;const id=crypto.randomUUID();
  await trx('idf_equations').insert({...record,id,version,created_by:actor,reference_checks:JSON.stringify(data.reference_checks)});
  await trx('idf_segments').insert(segments.map(({family_definition,...s},ordinal)=>({...s,equation_id:id,ordinal})));
  await trx('audit_logs').insert({actor_id:actor,action:'equation.version_created',entity_id:id,details:{version,status:data.status,municipality_id:city.id}});
  return getEquation(id,trx);
 });
}
export async function retireEquation(id,actor){
 return db.transaction(async trx=>{
  const row=await trx('idf_equations').where({id}).first();
  if(!row)throw Object.assign(new Error('Equação não encontrada.'),{status:404});
  await trx('municipalities').where({id:row.municipality_id}).forUpdate().first();
  await trx('idf_equations').where({id}).update({status:'retired'});
  await trx('audit_logs').insert({actor_id:actor,action:'equation.retired',entity_id:id});
 });
}
