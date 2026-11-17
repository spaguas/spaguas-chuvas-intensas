import { readFile } from 'node:fs/promises';
import { BUILTIN_FAMILIES } from '../../packages/hydrology/src/families.js';
export async function up(knex){
 await knex.raw(await readFile(new URL('../families.sql',import.meta.url),'utf8'));
 for(const definition of BUILTIN_FAMILIES){
  await knex('equation_families').insert({code:definition.family_code,is_builtin:true});
  await knex('equation_family_versions').insert({...definition,variables:JSON.stringify(definition.variables)});
  await knex('idf_segments').where({family:definition.family_code}).update({family_version_id:definition.id});
 }
 await knex.raw(`
 ALTER TABLE idf_segments ALTER COLUMN family_version_id SET NOT NULL;
 ALTER TABLE idf_segments ADD CONSTRAINT segment_family_version_fk FOREIGN KEY (family,family_version_id) REFERENCES equation_family_versions(family_code,id);
 CREATE INDEX segments_family_version_idx ON idf_segments(family_version_id);
 CREATE FUNCTION validate_segment_family() RETURNS trigger LANGUAGE plpgsql AS $$
 DECLARE definitions jsonb; item jsonb; coefficient text;
 BEGIN
 IF NEW.family_version_id IS NULL AND NEW.family IN ('GUMBEL','GENERAL') THEN
 SELECT id INTO NEW.family_version_id FROM equation_family_versions WHERE family_code=NEW.family AND version=1;
 END IF;
 SELECT variables INTO definitions FROM equation_family_versions WHERE id=NEW.family_version_id AND family_code=NEW.family;
 IF definitions IS NULL THEN RAISE EXCEPTION 'Família e versão incompatíveis.' USING ERRCODE='23514'; END IF;
 IF jsonb_typeof(NEW.parameters) <> 'object' OR (SELECT count(*) FROM jsonb_object_keys(NEW.parameters)) <> jsonb_array_length(definitions) THEN
 RAISE EXCEPTION 'Os coeficientes não correspondem à família.' USING ERRCODE='23514'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(definitions) LOOP
 coefficient:=item->>'name';
 IF jsonb_typeof(NEW.parameters->coefficient) IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'Coeficiente ausente ou inválido: %',coefficient USING ERRCODE='23514'; END IF;
 IF (NEW.parameters->>coefficient)::numeric < (item->>'min_value')::numeric OR (NEW.parameters->>coefficient)::numeric > (item->>'max_value')::numeric THEN
 RAISE EXCEPTION 'Coeficiente fora dos limites: %',coefficient USING ERRCODE='23514'; END IF;
 END LOOP; RETURN NEW; END $$;
 CREATE TRIGGER validate_segment_family_definition BEFORE INSERT OR UPDATE OF family,family_version_id,parameters ON idf_segments FOR EACH ROW EXECUTE FUNCTION validate_segment_family();
 `);
}
export async function down(knex){
 const custom=await knex('idf_segments').whereNotIn('family_version_id',BUILTIN_FAMILIES.map(d=>d.id)).first();
 if(custom)throw new Error('Há equações usando novas famílias/versões. Preserve essas definições antes de reverter a migration.');
 await knex.raw(`DROP TRIGGER validate_segment_family_definition ON idf_segments; DROP FUNCTION validate_segment_family();
 ALTER TABLE idf_segments DROP CONSTRAINT segment_family_version_fk;
 ALTER TABLE idf_segments DROP COLUMN family_version_id;
 ALTER TABLE idf_segments ADD CONSTRAINT idf_segments_family_check CHECK(family IN ('GUMBEL','GENERAL'));
 ALTER TABLE idf_segments ADD CONSTRAINT idf_segments_check1 CHECK(valid_idf_parameters(family,parameters));
 DROP TABLE equation_family_versions, equation_families;
 DROP FUNCTION reject_family_version_update(); DROP FUNCTION valid_family_variables(jsonb);`);
}
