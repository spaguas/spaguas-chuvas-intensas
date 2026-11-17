import { SIBH_WINDOWS } from '@chuvas/hydrology';
import { db } from './db.js';
import { config } from './config.js';
try{
 const runs=await db('integration_runs').distinctOn('query_hours').orderBy('query_hours').orderBy('started_at','desc');
 const good=SIBH_WINDOWS.every(hours=>runs.some(run=>run.query_hours===hours&&['success','partial'].includes(run.status)&&Date.now()-new Date(run.finished_at).getTime()<config.SIBH_POLL_SECONDS*2000));
 process.exitCode=good?0:1;
}catch{process.exitCode=1;}finally{await db.destroy();}
