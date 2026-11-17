export async function up(knex){
 await knex.schema.createTable('sgb_settings',table=>{
  table.integer('id').primary();table.check('id = 1');
  table.jsonb('settings').notNullable();table.integer('revision').notNullable().defaultTo(1);
  table.timestamp('updated_at',{useTz:true}).notNullable().defaultTo(knex.fn.now());
 });
 const bounded=(value,fallback,min,max)=>Number.isInteger(Number(value))&&Number(value)>=min&&Number(value)<=max?Number(value):fallback;
 await knex('sgb_settings').insert({id:1,settings:{enabled:true,poll_seconds:bounded(process.env.SGB_POLL_SECONDS,86400,3600,2592000),failure_retry_seconds:3600,timeout_ms:bounded(process.env.SGB_TIMEOUT_MS,90000,1000,180000),max_pdf_mb:20,max_html_mb:5,retry_attempts:0,retry_delay_ms:1000,request_delay_ms:0,max_catalog_shrink_percent:20,conditional_requests:true,ocr_enabled:true,ocr_max_pages:40,extraction_timeout_seconds:60,adoption_mode:'newer',protect_manual:true,allow_same_year_revision:false,min_reference_points:12,absolute_tolerance:.25,relative_tolerance_percent:1}});
 await knex.schema.createTable('sgb_worker_state',table=>{
  table.integer('id').primary();table.check('id = 1');
  table.timestamp('heartbeat_at',{useTz:true}).nullable();table.integer('settings_revision').nullable();
 });
 await knex('sgb_worker_state').insert({id:1});
 await knex.schema.alterTable('sgb_sync_runs',table=>{table.integer('settings_revision').nullable();table.jsonb('settings_snapshot').nullable()});
}
export async function down(knex){
 await knex.schema.alterTable('sgb_sync_runs',table=>{table.dropColumn('settings_revision');table.dropColumn('settings_snapshot')});
 await knex.schema.dropTable('sgb_worker_state');await knex.schema.dropTable('sgb_settings');
}
