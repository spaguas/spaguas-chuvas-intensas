import { readFile } from 'node:fs/promises';
export async function up(knex) { await knex.raw(await readFile(new URL('../schema.sql',import.meta.url),'utf8')); }
export async function down(knex) { await knex.raw('DROP TABLE source_documents, audit_logs, observations, stations, integration_runs, idf_segments, idf_equations, municipalities, users; DROP FUNCTION valid_idf_parameters(text,jsonb);'); }
