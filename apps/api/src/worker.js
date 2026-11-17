import { syncSibhWindows } from './services/sibh-service.js';
import { config } from './config.js';
import { db } from './db.js';
let stopped=false,wake;const abort=new AbortController();
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{stopped=true;abort.abort();wake?.();});
// Sequential polling plus a PostgreSQL advisory lock prevents overlap across replicas.
while(!stopped){
 try{const result=await syncSibhWindows({signal:abort.signal});console.log(JSON.stringify({event:'sibh.sync',...result}));if(process.argv.includes('--once')&&result.windows?.some(w=>w.status==='failed'))process.exitCode=1;}catch(e){console.error(JSON.stringify({event:'sibh.failed',error:e.message}));if(process.argv.includes('--once'))process.exitCode=1;}
 if(process.argv.includes('--once'))break;
 if(!stopped)await new Promise(resolve=>{const timer=setTimeout(resolve,config.SIBH_POLL_SECONDS*1000);wake=()=>{clearTimeout(timer);resolve();};});
}
await db.destroy();
