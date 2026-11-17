-- Canonical schema. Executed exclusively by the Knex migration 001_initial.js.
CREATE TABLE users (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL,
 email text NOT NULL UNIQUE CHECK (email = lower(email)), password_hash text NOT NULL,
 role text NOT NULL CHECK (role IN ('admin','editor')), active boolean NOT NULL DEFAULT true,
 auth_version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE municipalities (
 id text PRIMARY KEY, ibge_code char(7) NOT NULL UNIQUE CHECK (ibge_code ~ '^35[0-9]{5}$'),
 name text NOT NULL UNIQUE, latitude double precision CHECK (latitude BETWEEN -90 AND 90),
 longitude double precision CHECK (longitude BETWEEN -180 AND 180), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE idf_equations (
 id text PRIMARY KEY, municipality_id text NOT NULL REFERENCES municipalities(id),
 version integer NOT NULL CHECK (version > 0), status text NOT NULL CHECK (status IN ('active','pending','retired')),
 return_min double precision NOT NULL CHECK (return_min > 1), return_max double precision NOT NULL,
 station_name text NOT NULL, station_prefix text NOT NULL DEFAULT '', source_page integer NOT NULL CHECK(source_page > 0),
 source_pdf_page integer NOT NULL CHECK(source_pdf_page > 0), source_author text NOT NULL, source_formula text NOT NULL,
 review_notes text NOT NULL DEFAULT '', reference_checks jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(reference_checks)='array'),
 created_by uuid REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(return_max > return_min AND return_max <= 10000), UNIQUE(municipality_id,version)
);
CREATE UNIQUE INDEX one_active_equation_per_municipality ON idf_equations(municipality_id) WHERE status='active';
CREATE INDEX equations_municipality_idx ON idf_equations(municipality_id,version DESC);
CREATE FUNCTION valid_idf_parameters(family text, parameters jsonb) RETURNS boolean
 LANGUAGE plpgsql IMMUTABLE AS $$
 DECLARE required text[]; key text;
 BEGIN
 required := CASE family WHEN 'GUMBEL' THEN ARRAY['A','B','C','D','E','F','G','H']
 WHEN 'GENERAL' THEN ARRAY['C','to','n','k','m','d','p'] ELSE ARRAY[]::text[] END;
 IF jsonb_typeof(parameters) <> 'object' OR cardinality(required)=0 THEN RETURN false; END IF;
 IF (SELECT count(*) FROM jsonb_object_keys(parameters)) <> cardinality(required) THEN RETURN false; END IF;
 FOREACH key IN ARRAY required LOOP
 IF NOT jsonb_exists(parameters,key) OR jsonb_typeof(parameters->key) <> 'number' THEN RETURN false; END IF;
 END LOOP; RETURN true; END $$;
CREATE TABLE idf_segments (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, equation_id text NOT NULL REFERENCES idf_equations(id),
 ordinal integer NOT NULL CHECK(ordinal>=0), family text NOT NULL CHECK(family IN ('GUMBEL','GENERAL')),
 unit text NOT NULL CHECK(unit IN ('mm_min','mm_h')), duration_min double precision NOT NULL CHECK(duration_min>0),
 duration_max double precision NOT NULL CHECK(duration_max>duration_min AND duration_max<=10080),
 parameters jsonb NOT NULL, CHECK(valid_idf_parameters(family,parameters)), UNIQUE(equation_id,ordinal)
);
CREATE TABLE integration_runs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), started_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz,
 status text NOT NULL CHECK(status IN ('running','success','partial','failed')), received integer NOT NULL DEFAULT 0,
 processed integer NOT NULL DEFAULT 0, classified integer NOT NULL DEFAULT 0, rejected integer NOT NULL DEFAULT 0,
 error text, endpoint text NOT NULL, duration_ms integer, rejection_reasons jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX integration_runs_started_idx ON integration_runs(started_at DESC);
CREATE TABLE stations (
 id text PRIMARY KEY, prefix text NOT NULL, name text NOT NULL, municipality_id text REFERENCES municipalities(id),
 source_ibge_code text NOT NULL, source_city text NOT NULL, latitude double precision CHECK(latitude BETWEEN -90 AND 90),
 longitude double precision CHECK(longitude BETWEEN -180 AND 180), owner text, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX stations_municipality_idx ON stations(municipality_id);
CREATE TABLE observations (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, station_id text NOT NULL REFERENCES stations(id),
 run_id uuid NOT NULL REFERENCES integration_runs(id), equation_id text REFERENCES idf_equations(id),
 observed_at timestamptz NOT NULL, first_reading_at timestamptz NOT NULL, duration_minutes integer NOT NULL DEFAULT 60 CHECK(duration_minutes=60),
 depth_mm double precision NOT NULL CHECK(depth_mm>=0 AND depth_mm<=1000), sample_count integer NOT NULL CHECK(sample_count>0),
 measurement_gap integer NOT NULL CHECK(measurement_gap>0), return_period double precision CHECK(return_period>1),
 return_bound text CHECK(return_bound IN ('below','within','above')), return_limit double precision,
 classification text NOT NULL, quality text NOT NULL, quality_note text NOT NULL,
 raw_payload jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(station_id,observed_at,duration_minutes)
);
CREATE INDEX observations_latest_idx ON observations(observed_at DESC,station_id);
CREATE INDEX observations_station_idx ON observations(station_id,observed_at DESC);
CREATE INDEX observations_equation_idx ON observations(equation_id);
CREATE INDEX observations_run_idx ON observations(run_id);
CREATE TABLE audit_logs (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, actor_id uuid REFERENCES users(id), action text NOT NULL,
 entity_id text NOT NULL, details jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_created_idx ON audit_logs(created_at DESC);
CREATE INDEX audit_actor_idx ON audit_logs(actor_id);
CREATE TABLE source_documents (
 sha256 char(64) PRIMARY KEY, title text NOT NULL, metadata jsonb NOT NULL, imported_at timestamptz NOT NULL DEFAULT now()
);
