import type { Equation } from '@chuvas/hydrology';
export const BASE='/chuvas_intensas';
export const sourceLink=(source:{source_url?:string|null;source_pdf_page?:number}|null)=>`${source?.source_url||`${BASE}/source/estudo.pdf`}#page=${source?.source_pdf_page||1}`;
export interface Municipality {id:string;ibge_code:string;name:string;latitude:number|null;longitude:number|null;status:string;equation_id:string;station_name:string;station_prefix:string;version:number}
export interface Observation {duration_minutes:number;id:string;station_id:string;station_name:string;prefix:string;city:string;municipality_id:string|null;observed_at:string;first_reading_at?:string;measurement_gap?:number;sample_count?:number;depth_mm:number;return_period:number|null;return_bound:string|null;return_limit:number|null;classification:string;quality:string;quality_note:string;is_stale:boolean;latitude:number|null;longitude:number|null}
export interface IntegrationRun {query_hours:number;id:string;status:string;started_at:string;finished_at:string;received:number;processed:number;classified:number;rejected:number;error:string|null;duration_ms:number}
export interface IntegrationStatus {query_hours:number;available_windows:number[];state:string;poll_seconds:number;last_success_at:string|null;latest:IntegrationRun|null}
export interface Session {token:string;user:{id:string;name:string;email:string;role:string}}
export async function api<T>(path:string,options:RequestInit={},token?:string):Promise<T>{
 const response=await fetch(`${BASE}/api${path}`,{...options,signal:options.signal??AbortSignal.timeout(15000),headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`} : {}),...options.headers}});
 if(!response.ok){const payload=await response.json().catch(()=>({error:'Serviço temporariamente indisponível.'}));throw new Error(payload.error+(payload.details?.length?` ${payload.details.map((d:{path:string;message:string})=>`${d.path}: ${d.message}`).join('; ')}`:''));}
 return response.status===204?undefined as T:response.json();
}
export const number=(v:number,digits=1)=>v.toLocaleString('pt-BR',{minimumFractionDigits:digits,maximumFractionDigits:digits});
export const date=(value:string|null)=>value?new Date(value).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'Aguardando sincronização';
export function exportCsv(equation:Equation,rows:Record<string,number>[],series:number[],mode:string){
 const contents=[`# ${equation.municipality_id}; equação ${equation.id}; versão ${equation.version}; ${equation.source_agency||'DAEE/CTH'} ${equation.publication_year||''} p.${equation.source_page}; ${equation.source_url||''}`,`${mode==='duration'?'Duração (min)':'Retorno (anos)'};${series.map(s=>`${mode==='duration'?'T':'t'}=${s} ${mode==='duration'?'anos':'min'} (mm/h)`).join(';')}`,...rows.map(row=>[row.x,...series.map(s=>row[String(s)])].map(n=>n.toFixed(4).replace('.',',')).join(';'))].join('\r\n');
 const url=URL.createObjectURL(new Blob(['\ufeff'+contents],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=`idf-${equation.municipality_id}-${mode}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
