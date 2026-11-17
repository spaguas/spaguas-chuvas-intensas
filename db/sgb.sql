-- SGB provenance and monitoring. Applied only through migration 004.
ALTER TABLE idf_equations
 ADD COLUMN source_url text,
 ADD COLUMN publication_year integer CHECK(publication_year BETWEEN 1900 AND 2200),
 ADD COLUMN source_agency text NOT NULL DEFAULT 'SP-ÁGUAS / DAEE / CTH',
 ADD COLUMN station_latitude double precision CHECK(station_latitude BETWEEN -90 AND 90),
 ADD COLUMN station_longitude double precision CHECK(station_longitude BETWEEN -180 AND 180),
 ADD COLUMN managed_by text NOT NULL DEFAULT 'manual' CHECK(managed_by IN ('manual','daee_seed','sgb'));
UPDATE idf_equations e SET managed_by='daee_seed',publication_year=2018,
 station_latitude=m.latitude,station_longitude=m.longitude
 FROM municipalities m WHERE m.id=e.municipality_id AND e.id=e.municipality_id||'-v1' AND e.created_by IS NULL;

CREATE TABLE sgb_sync_runs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),started_at timestamptz NOT NULL DEFAULT now(),finished_at timestamptz,
 status text NOT NULL CHECK(status IN ('running','success','partial','failed')),
 discovered integer NOT NULL DEFAULT 0, changed integer NOT NULL DEFAULT 0, unchanged integer NOT NULL DEFAULT 0,
 imported integer NOT NULL DEFAULT 0, duplicates integer NOT NULL DEFAULT 0, pending integer NOT NULL DEFAULT 0,
 failed integer NOT NULL DEFAULT 0, errors jsonb NOT NULL DEFAULT '[]', trigger text NOT NULL DEFAULT 'scheduled'
);
CREATE INDEX sgb_runs_started_idx ON sgb_sync_runs(started_at DESC);
CREATE TABLE sgb_publications (
 external_id text PRIMARY KEY CHECK(external_id ~ '^[0-9]+$'),municipality_id text REFERENCES municipalities(id),
 municipality_name text NOT NULL,url text NOT NULL UNIQUE,listing_year integer NOT NULL CHECK(listing_year BETWEEN 1900 AND 2200),
 method text NOT NULL,present_on_site boolean NOT NULL DEFAULT true,
 first_seen_at timestamptz NOT NULL DEFAULT now(),last_seen_at timestamptz NOT NULL DEFAULT now(),last_checked_at timestamptz,
 last_error text,etag text,last_modified text
);
CREATE INDEX sgb_publications_municipality_idx ON sgb_publications(municipality_id,listing_year DESC);
CREATE TABLE sgb_publication_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),publication_id text NOT NULL REFERENCES sgb_publications(external_id),
 sha256 char(64) NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'),issued_year integer NOT NULL CHECK(issued_year BETWEEN 1900 AND 2200),
 parser_version integer NOT NULL,metadata jsonb NOT NULL,pdf_url text NOT NULL,
 issues jsonb NOT NULL DEFAULT '[]',imported_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(publication_id,sha256,issued_year,parser_version)
);
CREATE INDEX sgb_versions_publication_idx ON sgb_publication_versions(publication_id,imported_at DESC);
CREATE TABLE sgb_models (
 publication_version_id uuid NOT NULL REFERENCES sgb_publication_versions(id),model_key text NOT NULL,
 equation_id text REFERENCES idf_equations(id) ON DELETE SET NULL,
 resolution text NOT NULL CHECK(resolution IN ('imported','duplicate','pending','alternative')),
 validated boolean NOT NULL,validation jsonb NOT NULL,payload jsonb NOT NULL,
 PRIMARY KEY(publication_version_id,model_key)
);
CREATE INDEX sgb_models_equation_idx ON sgb_models(equation_id);
