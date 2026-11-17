import { SIBH_WINDOWS,validateSibhHours } from '@chuvas/hydrology';
import { db } from '../db.js';
import { config } from '../config.js';
import { getEquation } from '../repositories/catalog-repository.js';
import { normalizeMeasurement,parseEnvelope } from './sibh-normalizer.js';
export function sibhUrl(hours){const url=new URL(config.SIBH_URL);url.searchParams.set('hours',String(validateSibhHours(hours)));return url.toString();}
export async function syncSibh({fetcher=fetch,now=new Date(),hours=1,signal}={}){
 const endpoint=sibhUrl(hours),duration=hours*60;
 let runId;const started=Date.now();
 try {
  return await db.transaction(async trx=>{
   const {rows}=await trx.raw('SELECT pg_try_advisory_xact_lock(762314802) AS acquired');
   if(!rows[0].acquired)return {skipped:true,reason:'Sincronização já em execução.'};
   // Once this lock is acquired, previous running records can only be abandoned runs.
   await db('integration_runs').where({status:'running',query_hours:hours}).update({status:'failed',finished_at:new Date(),error:'Execução interrompida antes da conclusão.'});
   // Run record survives a rollback so a fatal import is still visible.
   const [run]=await db('integration_runs').insert({status:'running',endpoint,query_hours:hours}).returning('id');runId=run.id;
   const timeout=AbortSignal.timeout(config.SIBH_TIMEOUT_MS);
   const response=await fetcher(endpoint,{signal:signal?AbortSignal.any([signal,timeout]):timeout,headers:{accept:'application/json'}});
   if(!response.ok)throw new Error(`SIBH HTTP ${response.status}`);
   const buffer=await response.text();if(buffer.length>20_000_000)throw new Error('Resposta SIBH muito grande.');
   const records=parseEnvelope(JSON.parse(buffer));
   const cityIds=new Set((await trx('municipalities').select('id')).map(m=>m.id));
   const eqs=await trx('idf_equations').whereIn('status',['active','pending']).orderBy('version','desc');
   const equationMap=new Map();
   for(const e of eqs){if(!equationMap.has(e.municipality_id)||e.status==='active')equationMap.set(e.municipality_id,await getEquation(e.id,trx));}
   let processed=0,classified=0,rejected=0;const reasons={},stations=new Map(),observations=new Map();
   for(const raw of records){
    let normalized;
    try{normalized=normalizeMeasurement(raw,equationMap.get(String(raw?.cod_ibge)),now,hours);}catch{rejected++;reasons.invalid_measurement=(reasons.invalid_measurement||0)+1;continue;}
    const {measurement:m,...result}=normalized;const municipalId=cityIds.has(m.cod_ibge)?m.cod_ibge:null;
    stations.set(m.station_prefix_id,{id:m.station_prefix_id,prefix:m.prefix,name:m.station_name.trim(),municipality_id:municipalId,source_ibge_code:m.cod_ibge,source_city:m.city,latitude:m.latitude,longitude:m.longitude,owner:m.station_owner,updated_at:trx.fn.now()});
    const row={station_id:m.station_prefix_id,run_id:runId,equation_id:equationMap.get(m.cod_ibge)?.id||null,observed_at:m.max_date,first_reading_at:m.min_date,depth_mm:m.value,sample_count:m.qtd,measurement_gap:m.measurement_gap,duration_minutes:duration,...result,raw_payload:JSON.stringify(raw),updated_at:trx.fn.now()};
    observations.set(`${row.station_id}:${row.observed_at}`,row);
    processed++;if(result.classification!=='unclassified')classified++;
   }
   for(const [table,values,key] of [['stations',[...stations.values()],'id'],['observations',[...observations.values()],['station_id','observed_at','duration_minutes']]]){
    for(let i=0;i<values.length;i+=200)await trx(table).insert(values.slice(i,i+200)).onConflict(key).merge();
   }
   const result={status:rejected?'partial':'success',finished_at:new Date(),received:records.length,processed,classified,rejected,rejection_reasons:JSON.stringify(reasons),duration_ms:Date.now()-started};
   await trx('integration_runs').where({id:runId}).update(result);
   return {id:runId,query_hours:hours,...result};
  });
 }catch(e){if(runId)await db('integration_runs').where({id:runId}).update({status:'failed',finished_at:db.fn.now(),error:String(e.message).slice(0,1000),duration_ms:Date.now()-started});throw e;}
}
export async function integrationStatus(hours=1){
 validateSibhHours(hours);
 const [latest,lastSuccess]=await Promise.all([db('integration_runs').where({query_hours:hours}).orderBy('started_at','desc').first(),db('integration_runs').where({query_hours:hours}).whereIn('status',['success','partial']).orderBy('finished_at','desc').first()]);
 const age=lastSuccess?(Date.now()-new Date(lastSuccess.finished_at).getTime())/1000:Infinity;
 return {query_hours:hours,available_windows:SIBH_WINDOWS,state:latest?.status==='failed'?'offline':!lastSuccess?'waiting':age>config.SIBH_POLL_SECONDS*2?'stale':'current',poll_seconds:config.SIBH_POLL_SECONDS,latest,last_success_at:lastSuccess?.finished_at||null};
}
export async function latestObservations({municipality_id,limit=100,offset=0,hours=1}={}){
 const duration=validateSibhHours(hours)*60;
 const latest=db('observations').where({duration_minutes:duration}).distinctOn('station_id').orderBy('station_id').orderBy('observed_at','desc').as('o');
 let query=db(latest).join('stations as s','s.id','o.station_id').select('o.id','o.observed_at','o.first_reading_at','o.measurement_gap','o.sample_count','o.depth_mm','o.return_period','o.return_bound','o.return_limit','o.classification','o.quality','o.quality_note','o.equation_id','o.duration_minutes','s.id as station_id','s.prefix','s.name as station_name','s.source_city as city','s.municipality_id','s.latitude','s.longitude');
 if(municipality_id)query=query.where('s.municipality_id',municipality_id);
 const rows=await query.orderBy('o.depth_mm','desc').limit(limit).offset(offset);
 return rows.map(o=>({...o,is_stale:Date.now()-new Date(o.observed_at).getTime()>90*60000}));
}

export async function syncSibhWindows(options={}){
 const connection=await db.client.acquireConnection();let locked=false;
 try{
  const {rows}=await db.raw('SELECT pg_try_advisory_lock(762314804) AS acquired').connection(connection);locked=rows[0].acquired;
  if(!locked)return {skipped:true,reason:'Ciclo SIBH já em execução.'};
  const windows=[];
  for(const hours of SIBH_WINDOWS){
   if(options.signal?.aborted)break;
   try{windows.push(await syncSibh({...options,hours}));}
   catch(e){windows.push({query_hours:hours,status:'failed',error:e.message});}
  }
  return {status:windows.length<SIBH_WINDOWS.length||windows.some(w=>w.status==='failed'||w.skipped||w.status==='partial')?'partial':'success',windows};
 }finally{if(locked)await db.raw('SELECT pg_advisory_unlock(762314804)').connection(connection);await db.client.releaseConnection(connection);}
}
