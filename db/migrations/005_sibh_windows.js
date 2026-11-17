export async function up(knex){
 await knex.raw(`
  ALTER TABLE observations DROP CONSTRAINT observations_duration_minutes_check;
  ALTER TABLE observations ADD CONSTRAINT observations_duration_minutes_check CHECK(duration_minutes IN (60,120,180,360,720,1440,2880,4320));
  ALTER TABLE observations DROP CONSTRAINT observations_depth_mm_check;
  ALTER TABLE observations ADD CONSTRAINT observations_depth_mm_check CHECK(depth_mm>=0 AND depth_mm<=10000);
  ALTER TABLE integration_runs ADD COLUMN query_hours integer NOT NULL DEFAULT 1 CHECK(query_hours IN (1,2,3,6,12,24,48,72));
  CREATE INDEX observations_window_latest_idx ON observations(duration_minutes,station_id,observed_at DESC);
  CREATE INDEX integration_runs_window_started_idx ON integration_runs(query_hours,started_at DESC);
 `);
}
export async function down(knex){
 if(await knex('observations').whereNot({duration_minutes:60}).orWhere('depth_mm','>',1000).first())throw new Error('Existem acumulados de outras janelas; preserve os dados antes de reverter.');
 await knex.raw(`DROP INDEX observations_window_latest_idx;DROP INDEX integration_runs_window_started_idx;
  ALTER TABLE integration_runs DROP COLUMN query_hours;
  ALTER TABLE observations DROP CONSTRAINT observations_duration_minutes_check;
  ALTER TABLE observations ADD CONSTRAINT observations_duration_minutes_check CHECK(duration_minutes=60);
  ALTER TABLE observations DROP CONSTRAINT observations_depth_mm_check;
  ALTER TABLE observations ADD CONSTRAINT observations_depth_mm_check CHECK(depth_mm>=0 AND depth_mm<=1000);`);
}
