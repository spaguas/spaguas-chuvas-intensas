import { db } from './db.js';
import { sgbRuntimeStatus } from './services/sgb-settings-service.js';
try{
 const status=await sgbRuntimeStatus();
 // A paused monitor is healthy when its scheduler still reports a heartbeat.
 if(!status.worker_online)process.exitCode=1;
 else if(status.enabled){
  const latest=await db('sgb_sync_runs').orderBy('started_at','desc').first();
  if(!latest||latest.status==='failed'||Date.now()-new Date(latest.finished_at||latest.started_at).getTime()>(status.poll_seconds+7200)*1000)process.exitCode=1;
 }
}finally{await db.destroy();}
