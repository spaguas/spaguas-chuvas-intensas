import { z } from 'zod';
import { estimateReturnPeriod,validateSibhHours } from '@chuvas/hydrology';
const numeric=z.union([z.number(),z.string().trim().min(1)]).transform(Number).pipe(z.number().finite());
const measurement=z.object({station_prefix_id:z.union([z.string(),z.number()]).transform(String),prefix:z.union([z.string(),z.number()]).transform(String),station_type_id:z.union([z.string(),z.number()]).transform(String).refine(v=>v==='2'),station_name:z.string().min(1),city:z.string(),cod_ibge:z.string().regex(/^\d{7}$/),latitude:numeric,longitude:numeric,station_owner:z.string().nullable().optional(),measurement_gap:numeric.pipe(z.number().int().positive().max(1440)),qtd:numeric.pipe(z.number().int().positive().max(10080)),value:numeric.pipe(z.number().min(0).max(10000)),min_date:z.iso.datetime(),max_date:z.iso.datetime()}).passthrough();
export function normalizeMeasurement(raw,equation,now=new Date(),hours=1){
 const duration=validateSibhHours(hours)*60;
 const m=measurement.parse(raw);
 if(m.latitude < -90 || m.latitude > 90 || m.longitude < -180 || m.longitude > 180) throw new Error('Coordenadas inválidas.');
 const start=new Date(m.min_date),end=new Date(m.max_date),span=(end-start)/60000,age=(now-end)/60000;
 if(span<0||age < -5||span>duration+60)throw new Error('Janela temporal inválida.');
 let quality='aggregate',classification='unclassified',estimate={return_period:null,bound:null,limit:null};
 let note=`Estimativa indicativa: value é usado como acumulado da janela hours=${hours} do SIBH. A API agregada não comprova continuidade das leituras.`;
 if(age>Math.max(20,m.measurement_gap+10)){quality='stale';note='Leitura desatualizada; classificação suspensa.';}
 else if(m.measurement_gap>duration||m.qtd*m.measurement_gap<duration||span+m.measurement_gap<duration-1||span>duration+1){quality='incomplete';note=`Cobertura amostral insuficiente para comparar com a IDF de ${duration} minutos (${hours}h).`;}
 else if(!equation){quality='no_equation';note='Município sem equação local cadastrada; nenhuma associação por proximidade foi feita.';}
 else if(equation.status!=='active'){quality='pending_equation';note='Equação municipal pendente de revisão técnica.';}
 else {
  try {estimate=estimateReturnPeriod(equation,duration,m.value);classification=estimate.classification;}
  catch {quality='outside_domain';note=`A duração de ${duration} minutos (${hours}h) não pertence ao domínio da equação; acumulado exibido sem extrapolar o retorno.`;}
 }
 return {measurement:m,quality,quality_note:note,classification,return_period:estimate.return_period,return_bound:estimate.bound,return_limit:estimate.limit};
}
export function parseEnvelope(payload){if(!payload||!Array.isArray(payload.measurements))throw new Error('Contrato SIBH inválido: measurements deve ser um array.');if(payload.measurements.length>20000)throw new Error('Resposta SIBH excede o limite de estações.');return payload.measurements;}
