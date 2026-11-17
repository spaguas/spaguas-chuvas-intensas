import type { Observation } from './api';
export type RainMetric='rain'|'return';
export type StationFilter='all'|'rain'|'high'|'valid';
export type ReadingTone='green'|'orange'|'red'|'neutral'|'rain1'|'rain2'|'rain3'|'rain4'|'rain5';
export interface MapReading {label:string;tone:ReadingTone;description:string;rank:number|null}
export const qualityLabels:Record<string,string>={stale:'Leitura desatualizada',incomplete:'Janela incompleta',no_equation:'Sem equação local',pending_equation:'Equação em revisão',outside_domain:'Fora do domínio da IDF'};
export const compactNumber=(value:number,digits=1)=>value.toLocaleString('pt-BR',{maximumFractionDigits:digits});
export const normalizeSearch=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
export function hasCoordinates(o:Observation):boolean{return o.latitude!==null&&o.longitude!==null&&Number.isFinite(o.latitude)&&Number.isFinite(o.longitude)&&Math.abs(o.latitude)<=90&&Math.abs(o.longitude)<=180}
export function staleReading(o:Observation,now=Date.now()):boolean{
 return o.is_stale||o.quality==='stale'||!Number.isFinite(Date.parse(o.observed_at))||now-Date.parse(o.observed_at)>Math.max(20,(o.measurement_gap??10)+10)*60000;
}
const thresholdEpsilon=1e-6;
function returnNumber(value:number){
 if(Math.abs(value-10)<=thresholdEpsilon)return '10';
 const rounded=Number(value.toFixed(2));
 if(rounded===10)return value<10?'<10':'>10';
 return compactNumber(rounded,2);
}
export function returnReading(o:Observation,now=Date.now()):MapReading{
 if(staleReading(o,now))return {label:'—',tone:'neutral',description:'Leitura desatualizada; retorno suspenso.',rank:null};
 if(o.quality!=='aggregate')return {label:'—',tone:'neutral',description:qualityLabels[o.quality]||'Sem estimativa válida',rank:null};
 if(o.return_bound==='below'&&o.return_limit!==null&&o.return_limit>1)return {label:`<${compactNumber(o.return_limit,2)}T`,tone:o.return_limit<=10?'green':'neutral',description:`Retorno abaixo de ${compactNumber(o.return_limit,2)} anos; limite inferior da IDF.`,rank:null};
 if(o.return_bound==='above'&&o.return_limit!==null&&o.return_limit>1)return {label:`>${compactNumber(o.return_limit,2)}T`,tone:o.return_limit>=10?'red':'neutral',description:`Retorno acima de ${compactNumber(o.return_limit,2)} anos; sem extrapolação.`,rank:o.return_limit};
 const value=o.return_period;
 if(value===null||!Number.isFinite(value)||value<=1)return {label:'—',tone:'neutral',description:'Sem estimativa válida',rank:null};
 const tone=Math.abs(value-10)<=thresholdEpsilon?'orange':value>10?'red':'green';
 const precise=Math.abs(value-10)>thresholdEpsilon&&Number(value.toFixed(2))===10?value.toLocaleString('pt-BR',{maximumSignificantDigits:8}):compactNumber(value,2);
 return {label:`${returnNumber(value)}T`,tone,description:`Período de retorno estimado de ${precise} anos.`,rank:value};
}
export function rainReading(o:Observation,now=Date.now()):MapReading{
 const value=o.depth_mm,stale=staleReading(o,now);
 return {label:compactNumber(value),tone:stale||value===0?'neutral':value<5?'rain1':value<15?'rain2':value<30?'rain3':value<60?'rain4':'rain5',description:`${compactNumber(value)} mm acumulados${stale?' · leitura desatualizada':''}`,rank:stale?null:value};
}
export const reading=(o:Observation,metric:RainMetric,now=Date.now())=>metric==='rain'?rainReading(o,now):returnReading(o,now);
export function filterStations(rows:Observation[],query:string,filter:StationFilter,now=Date.now()){
 const search=normalizeSearch(query.trim());
 return rows.filter(o=>{
  if(search&&!normalizeSearch(`${o.station_name} ${o.city} ${o.prefix}`).includes(search))return false;
  if(filter==='rain')return o.depth_mm>0&&!staleReading(o,now);
  if(filter==='high')return returnReading(o,now).tone==='red';
  if(filter==='valid')return returnReading(o,now).tone!=='neutral';
  return true;
 });
}
export interface StationGroup {key:string;stations:Observation[];latitude:number;longitude:number;representative:Observation}
export function groupStations(rows:Observation[],project:(o:Observation)=>{x:number;y:number},metric:RainMetric,cellSize=66,now=Date.now()):StationGroup[]{
 const groups=new Map<string,StationGroup>();
 for(const o of rows){
  if(!hasCoordinates(o))continue;
  const p=project(o),key=cellSize?`${Math.floor(p.x/cellSize)}:${Math.floor(p.y/cellSize)}`:`${o.latitude}:${o.longitude}`;
  const group=groups.get(key);
  if(!group){groups.set(key,{key,stations:[o],latitude:o.latitude!,longitude:o.longitude!,representative:o});continue;}
  group.stations.push(o);
  const rank=(station:Observation)=>{const r=reading(station,metric,now);return r.rank??(r.tone==='green'?-1:-2)};
  if(rank(o)>rank(group.representative))group.representative=o;
 }
 for(const group of groups.values())if(group.stations.length>1){group.latitude=group.stations.reduce((sum,o)=>sum+o.latitude!,0)/group.stations.length;group.longitude=group.stations.reduce((sum,o)=>sum+o.longitude!,0)/group.stations.length;}
 return [...groups.values()];
}
export function monitoringCsv(rows:Observation[],hours:number,now=Date.now()):string{
 const cell=(value:unknown)=>{let text=String(value??'');if(typeof value==='string'&&/^[=+@\-\t\r]/.test(text.trimStart()))text=`'${text}`;return `"${text.replaceAll('"','""')}"`};
 const lines=[['Fonte: SIBH / Chuva Agora; retornos indicativos; sem extrapolação'],[`Janela de acumulação: ${hours}h; exportado em ${new Date(now).toISOString()}`],['Estação','Município','Prefixo','Janela (h)','Acumulado (mm)','Retorno','Qualidade','Última leitura','Latitude','Longitude'],...rows.map(o=>[o.station_name,o.city,o.prefix,hours,String(o.depth_mm).replace('.',','),returnReading(o,now).label,staleReading(o,now)?'Leitura desatualizada':qualityLabels[o.quality]||'Acumulado agregado',o.observed_at,o.latitude,o.longitude])];
 return '\ufeff'+lines.map(row=>row.map(cell).join(';')).join('\r\n');
}
export function exportMonitoring(rows:Observation[],hours:number){
 const url=URL.createObjectURL(new Blob([monitoringCsv(rows,hours)],{type:'text/csv;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download=`chuva-observada-sibh-${hours}h.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
