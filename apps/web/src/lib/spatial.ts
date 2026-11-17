import type { GeoPoint, SpatialResult, SpatialEstimate } from '@chuvas/hydrology';
import type { FeatureCollection, Geometry } from 'geojson';
import { number } from './api';
export type MunicipalBoundaries = FeatureCollection<Geometry,{codarea:string;name:string}>;
export interface ReferenceStation {municipality_id:string;municipality_name:string;latitude:number|null;longitude:number|null;coordinate_warning:string|null;equation_id:string;equation_version:number;status:string;station_name:string;station_prefix:string;duration_min:number;duration_max:number}
export interface SpatialResponse extends SpatialResult {point:GeoPoint;municipality:{id:string;name:string};local_equation_status:string;duration:number;depth_mm:number;intensity_mm_h:number;geography_source:{provider:string;retrieved_on:string;quality:string;source_url:string}}
export const exclusionLabels:Record<string,string>={duplicate_reference_location:'Mesmo ponto de referência: publicação mais recente usada uma única vez',missing_coordinates:'Coordenadas ausentes',inactive_equation:'Equação pendente ou retirada',outside_radius:'Fora do raio de busca',invalid_equation_or_duration:'Duração ou equação inválida',beyond_neighbor_count:'Além da quantidade de vizinhos'};
export function estimateLabel(estimate:SpatialEstimate|null):string {
  if(!estimate)return 'Sem estimativa';
  if(estimate.return_period!==null)return `${number(estimate.return_period,2)} anos`;
  if(estimate.upper_bound===null)return `T > ${number(estimate.lower_bound,2)} anos`;
  if(estimate.bound==='below')return `T < ${number(estimate.upper_bound,2)} anos`;
  return `${number(estimate.lower_bound,2)} < T < ${number(estimate.upper_bound,2)} anos`;
}
export function exportSpatial(result:SpatialResponse){
  const text=[['# IDW de retornos locais; estimativa exploratória'],[`# Ponto: ${result.point.latitude}, ${result.point.longitude}; município: ${result.municipality.name}`],[`# Chuva: ${result.depth_mm} mm; duração: ${result.duration} min; potência: ${result.parameters.power}; raio: ${result.parameters.radius_km} km`],[`# Resultado: ${estimateLabel(result.estimate)}; intervalo por limites de domínio, não intervalo de confiança`],['Município','Equação','Versão','Latitude','Longitude','Distância (km)','Peso','T (anos)','Limite','Valor do limite (anos)','Contribuição (anos)'],...result.stations.map(s=>[s.municipality_name,s.equation_id,s.equation_version,s.latitude,s.longitude,s.distance_km,s.weight,s.return_period,s.bound,s.limit,s.contribution_years])].map(row=>row.map(v=>`"${String(v??'').replaceAll('"','""')}"`).join(';')).join('\r\n');
  const url=URL.createObjectURL(new Blob(['\ufeff'+text],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=`retorno-idw-${result.municipality.id}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
