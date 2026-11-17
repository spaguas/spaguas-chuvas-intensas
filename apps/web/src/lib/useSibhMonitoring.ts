import { useCallback,useEffect,useRef,useState } from 'react';
import { api,type Observation,type IntegrationStatus } from './api';
interface Snapshot {hours:number;observations:Observation[];status:IntegrationStatus;truncated:boolean;receivedAt:number}
async function observationsFor(hours:number,signal:AbortSignal){
 const rows:Observation[]=[];let truncated=false;
 for(let offset=0;offset<20000;offset+=2000){const page=await api<Observation[]>(`/observations?limit=2000&offset=${offset}&hours=${hours}`,{signal});rows.push(...page);if(page.length<2000)break;if(offset===18000)truncated=true;}
 return {observations:[...new Map(rows.map(o=>[o.station_id,o])).values()],truncated};
}
export default function useSibhMonitoring(hours:number){
 const [snapshot,setSnapshot]=useState<Snapshot|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[clock,setClock]=useState(Date.now);
 const request=useRef<AbortController|null>(null);
 const refresh=useCallback(async()=>{
  request.current?.abort();const abort=new AbortController();request.current=abort;
  const signal=AbortSignal.any([abort.signal,AbortSignal.timeout(30000)]);setLoading(true);
  try{const [status,result]=await Promise.all([api<IntegrationStatus>(`/integration/status?hours=${hours}`,{signal}),observationsFor(hours,signal)]);if(abort.signal.aborted)return;setSnapshot({hours,status,...result,receivedAt:Date.now()});setError('');}
  catch(error){if(abort.signal.aborted)return;setError((error as Error).message);}
  finally{if(!abort.signal.aborted){setLoading(false);setClock(Date.now());}}
 },[hours]);
 useEffect(()=>{setError('');void refresh();const timer=setInterval(()=>{setClock(Date.now());if(!document.hidden)void refresh()},60000);const visible=()=>{if(!document.hidden)void refresh()};document.addEventListener('visibilitychange',visible);return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',visible);request.current?.abort()}},[refresh]);
 const current=snapshot?.hours===hours?snapshot:null;
 return {observations:current?.observations||[],status:current?.status||null,truncated:current?.truncated||false,receivedAt:current?.receivedAt||null,error,loading:loading||(!current&&!error),clock,refresh};
}
