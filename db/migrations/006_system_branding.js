export async function up(knex){
 await knex.schema.createTable('system_branding',table=>{
  table.integer('id').primary();
  table.check('id = 1');
  table.jsonb('logo').nullable();
  table.jsonb('favicon').nullable();
  table.timestamp('updated_at',{useTz:true}).notNullable().defaultTo(knex.fn.now());
 });
 await knex('system_branding').insert({id:1});
}
export async function down(knex){await knex.schema.dropTable('system_branding');}
