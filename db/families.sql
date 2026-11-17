-- Applied by migration 003. Definition versions are immutable; segments reference an exact version.
CREATE TABLE equation_families (
 code text PRIMARY KEY CHECK(code ~ '^[A-Z][A-Z0-9_]{2,39}$'),
 active boolean NOT NULL DEFAULT true, is_builtin boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION valid_family_variables(variables jsonb) RETURNS boolean
 LANGUAGE plpgsql IMMUTABLE AS $$
 DECLARE item jsonb; seen text[]:=ARRAY[]::text[]; var_name text;
 BEGIN
 IF jsonb_typeof(variables) <> 'array' OR jsonb_array_length(variables)>24 THEN RETURN false; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(variables) LOOP
 var_name:=item->>'name';
 IF var_name IS NULL OR var_name !~ '^[A-Za-z][A-Za-z0-9_]{0,31}$' OR var_name=ANY(seen)
 OR var_name=ANY(ARRAY['t','T','pi','e','ln','log','log10','log1p','exp','sqrt','abs','pow','min','max','constructor','prototype']) THEN RETURN false; END IF;
 IF jsonb_typeof(item->'default_value') IS DISTINCT FROM 'number' OR jsonb_typeof(item->'min_value') IS DISTINCT FROM 'number' OR jsonb_typeof(item->'max_value') IS DISTINCT FROM 'number' THEN RETURN false; END IF;
 IF (item->>'min_value')::numeric < -1e12 OR (item->>'max_value')::numeric > 1e12
 OR (item->>'min_value')::numeric > (item->>'max_value')::numeric
 OR (item->>'default_value')::numeric < (item->>'min_value')::numeric
 OR (item->>'default_value')::numeric > (item->>'max_value')::numeric THEN RETURN false; END IF;
 seen:=array_append(seen,var_name);
 END LOOP; RETURN true; END $$;
CREATE TABLE equation_family_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), family_code text NOT NULL REFERENCES equation_families(code),
 version integer NOT NULL CHECK(version>0), name text NOT NULL CHECK(length(name) BETWEEN 2 AND 120),
 description text NOT NULL DEFAULT '', expression text NOT NULL CHECK(length(expression) BETWEEN 1 AND 500),
 variables jsonb NOT NULL CHECK(valid_family_variables(variables)), default_unit text NOT NULL CHECK(default_unit IN ('mm_min','mm_h')),
 change_notes text NOT NULL DEFAULT '', created_by uuid REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(family_code,version), UNIQUE(family_code,id)
);
CREATE INDEX family_versions_created_by_idx ON equation_family_versions(created_by);
CREATE FUNCTION reject_family_version_update() RETURNS trigger LANGUAGE plpgsql AS $$
 BEGIN RAISE EXCEPTION 'Definições de família são imutáveis. Crie uma nova versão.' USING ERRCODE='23514'; END $$;
CREATE TRIGGER immutable_family_definition BEFORE UPDATE ON equation_family_versions FOR EACH ROW EXECUTE FUNCTION reject_family_version_update();
ALTER TABLE idf_segments DROP CONSTRAINT idf_segments_family_check;
ALTER TABLE idf_segments DROP CONSTRAINT idf_segments_check1;
ALTER TABLE idf_segments ADD COLUMN family_version_id uuid;
