import { db } from '../db.js';
import { z } from 'zod';
import { DEFAULT_SGB_SETTINGS,sgbSettingsSchema,nextSgbCheck } from './sgb-policy.js';
export async function getSgbSettings(connection=db){
 const row=await connection('sgb_settings').where({id:1}).first();
 return {settings:sgbSettingsSchema.parse(row.settings),revision:row.revision,updated_at:row.updated_at};
}
export async function saveSgbSettings(input,actorId){
 const parsed=z.object({revision:z.number().int().positive(),settings:sgbSettingsSchema,change_notes:z.string().trim().min(10).max(2000)}).strict().parse(input);
 return db.transaction(async trx=>{
  const current=await trx('sgb_settings').where({id:1}).forUpdate().first();
  if(current.revision!==parsed.revision)throw Object.assign(new Error('A configuração foi alterada por outro administrador. Recarregue antes de salvar.'),{status:409});
  const [saved]=await trx('sgb_settings').where({id:1}).update({settings:parsed.settings,revision:current.revision+1,updated_at:trx.fn.now()}).returning('*');
  await trx('audit_logs').insert({actor_id:actorId,action:'sgb.settings_updated',entity_id:'sgb',details:{before:current.settings,after:parsed.settings,revision:saved.revision,change_notes:parsed.change_notes}});
  return {settings:saved.settings,revision:saved.revision,updated_at:saved.updated_at};
 });
}
export async function sgbRuntimeStatus(){
 const [configuration,latest,worker,lock]=await Promise.all([getSgbSettings(),db('sgb_sync_runs').orderBy('started_at','desc').first(),db('sgb_worker_state').where({id:1}).first(),db('pg_locks').where({locktype:'advisory',classid:0,objid:762314803,objsubid:1,granted:true}).first('pid')]);
 const workerOnline=!!worker?.heartbeat_at&&Date.now()-new Date(worker.heartbeat_at).getTime()<90000;
 const next=nextSgbCheck(configuration.settings,latest);
 return {...configuration,poll_seconds:configuration.settings.poll_seconds,enabled:configuration.settings.enabled,next_check_at:next?(next.getTime()===0?new Date().toISOString():next.toISOString()):null,worker_online:workerOnline,worker_heartbeat_at:worker?.heartbeat_at||null,worker_settings_revision:worker?.settings_revision||null,running:!!lock&&latest?.status==='running'};
}
export async function sgbSettingsResponse(){return {...await sgbRuntimeStatus(),defaults:DEFAULT_SGB_SETTINGS};}
