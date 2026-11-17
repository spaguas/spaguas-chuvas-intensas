import { setTimeout as delay } from 'node:timers/promises';
import { syncSgb } from './services/sgb-service.js';
import { getSgbSettings } from './services/sgb-settings-service.js';
import { nextSgbCheck } from './services/sgb-policy.js';
import { db } from './db.js';
const abort=new AbortController(),once=process.argv.includes('--once');
let revision,heartbeat;
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>abort.abort());
async function beat(){await db('sgb_worker_state').where({id:1}).update({heartbeat_at:db.fn.now(),settings_revision:revision})}
try{
 if(!once)heartbeat=setInterval(()=>{void beat().catch(e=>console.error(JSON.stringify({event:'sgb.heartbeat_failed',error:e.message})))},30000);
 do{
  if(abort.signal.aborted)break;
  try{
   const configuration=await getSgbSettings();revision=configuration.revision;
   if(!once)await beat();
   const latest=await db('sgb_sync_runs').orderBy('started_at','desc').first();
   const next=nextSgbCheck(configuration.settings,latest);
   if(once||(next&&next.getTime()<=Date.now())||(configuration.settings.enabled&&latest?.status==='running')){
    console.log(JSON.stringify({event:'sgb.sync',...await syncSgb({signal:abort.signal,trigger:once?'cli':'scheduled'})}));
   }
  }catch(e){if(!abort.signal.aborted)console.error(JSON.stringify({event:'sgb.failed',error:e.message}));if(once)process.exitCode=1;}
  if(once||abort.signal.aborted)break;
  await delay(30000,undefined,{signal:abort.signal}).catch(e=>{if(!abort.signal.aborted)throw e});
 }while(!abort.signal.aborted);
}finally{if(heartbeat)clearInterval(heartbeat);await db.destroy();}
