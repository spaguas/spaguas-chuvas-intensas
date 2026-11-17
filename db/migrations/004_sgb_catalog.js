import { readFile } from 'node:fs/promises';
// Frozen migration definitions: future parser changes must not change this migration.
const SGB_FAMILIES=[
 {code:'SGB_POWER',suffix:3,name:'SGB — potência',expression:'a*T^b/(t+c)^d',names:['a','b','c','d']},
 {code:'SGB_LOG',suffix:4,name:'SGB — logarítmica (horas na fonte)',expression:'((a*ln(T)+b)*ln(t/60+delta/60)+c*ln(T)+d)/(t/60)',names:['a','b','c','d','delta']},
 {code:'SGB_POWER_LOG',suffix:5,name:'SGB — potência e logaritmo (horas na fonte)',expression:'(a*T^b*ln(t/60+delta/60)+c*T^d)/(t/60)',names:['a','b','c','d','delta']}
].map(f=>({...f,id:`00000000-0000-4000-8000-${String(f.suffix).padStart(12,'0')}`,description:'Transcrição do Atlas Pluviométrico do Brasil. Entrada normalizada em minutos e anos.',default_unit:'mm_h',change_notes:'Importação SGB v1',variables:f.names.map(name=>({name,label:name,unit:'',default_value:0,min_value:-1e7,max_value:1e7}))}));
export async function up(knex){
 await knex.raw(await readFile(new URL('../sgb.sql',import.meta.url),'utf8'));
 for(const f of SGB_FAMILIES){
  await knex('equation_families').insert({code:f.code,is_builtin:true,active:true});
  await knex('equation_family_versions').insert({id:f.id,family_code:f.code,version:1,name:f.name,description:f.description,expression:f.expression,variables:JSON.stringify(f.variables),default_unit:f.default_unit,change_notes:f.change_notes});
 }
}
export async function down(knex){
 if(await knex('idf_segments').whereIn('family',SGB_FAMILIES.map(f=>f.code)).first())throw new Error('Existem equações SGB; preserve o histórico antes de reverter.');
 await knex.raw('DROP TABLE sgb_models,sgb_publication_versions,sgb_publications,sgb_sync_runs; ALTER TABLE idf_equations DROP COLUMN source_url, DROP COLUMN publication_year, DROP COLUMN source_agency, DROP COLUMN station_latitude, DROP COLUMN station_longitude, DROP COLUMN managed_by;');
 await knex('equation_family_versions').whereIn('family_code',SGB_FAMILIES.map(f=>f.code)).delete();
 await knex('equation_families').whereIn('code',SGB_FAMILIES.map(f=>f.code)).delete();
}
