import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeMeasurement,parseEnvelope } from '../src/services/sibh-normalizer.js';
import { calculate,SIBH_WINDOWS } from '@chuvas/hydrology';
const e=JSON.parse(await readFile(new URL('../../../data/catalog.json',import.meta.url),'utf8')).equations.find(e=>e.municipality_id==='3550308');
const now=new Date('2026-11-05T17:00:00Z');
const raw={station_prefix_id:'test1',prefix:'P1',station_name:'Estação teste',station_type_id:'2',city:'São Paulo',cod_ibge:'3550308',latitude:'-23.6',longitude:'-46.6',measurement_gap:10,qtd:'6',value:calculate(e,60,25).depth_mm,min_date:'2026-11-05T16:10:00.000Z',max_date:'2026-11-05T17:00:00.000Z'};
test('Contrato real agregado: value é acumulado; não se somam janelas sobrepostas',()=>{const r=normalizeMeasurement(raw,e,now);assert.equal(r.measurement.value,raw.value);assert.ok(Math.abs(r.return_period-25)<1e-7);assert.equal(r.quality,'aggregate');assert.match(r.quality_note,/não comprova/);});
test('Sem dados contínuos suficientes, sem IDF ou com equação pendente não se classifica',()=>{
 for(const patch of [{qtd:'2'},{min_date:'2026-11-05T15:50:00.000Z'},{measurement_gap:1440},{min_date:'2026-11-05T16:50:00.000Z'}]){const r=normalizeMeasurement({...raw,...patch},e,now);assert.equal(r.classification,'unclassified');assert.equal(r.quality,'incomplete');}
 assert.equal(normalizeMeasurement(raw,null,now).quality,'no_equation');assert.equal(normalizeMeasurement(raw,{...e,status:'pending'},now).quality,'pending_equation');
});
test('Dados desatualizados não geram classificações; timestamps inválidos são rejeitados',()=>{
 const stale=normalizeMeasurement({...raw,min_date:'2026-11-05T12:00:00Z',max_date:'2026-11-05T12:50:00Z'},e,now);assert.equal(stale.quality,'stale');assert.equal(stale.return_period,null);
 for(const patch of [{value:-1},{qtd:0},{value:null},{max_date:'garbage'},{max_date:'2026-11-06T17:00:00Z'},{latitude:''},{latitude:999},{station_type_id:'1'}])assert.throws(()=>normalizeMeasurement({...raw,...patch},e,now));
 assert.throws(()=>parseEnvelope({data:[]}));assert.deepEqual(parseEnvelope({measurements:[]}),[]);
});

for(const hours of SIBH_WINDOWS)test(`SIBH ${hours}h: duração, cobertura e limite de domínio`,()=>{
 const duration=hours*60,depth=hours<=24?calculate(e,duration,25).depth_mm:1200;
 const sample={...raw,measurement_gap:1,qtd:duration,value:depth,min_date:new Date(now.getTime()-(duration-1)*60000).toISOString()};
 const result=normalizeMeasurement(sample,e,now,hours);assert.equal(result.measurement.value,depth);
 if(hours<=24){assert.equal(result.quality,'aggregate');assert.ok(Math.abs(result.return_period-25)<1e-6);}else{assert.equal(result.quality,'outside_domain');assert.equal(result.return_period,null);assert.match(result.quality_note,new RegExp(`${hours}h`));}
 assert.equal(normalizeMeasurement({...sample,qtd:duration-10},e,now,hours).quality,'incomplete');
 assert.equal(normalizeMeasurement({...sample,min_date:now.toISOString()},e,now,hours).quality,'incomplete');
});
test('SIBH rejeita janelas não suportadas e não usa leituras antigas em uma janela longa',()=>{
 for(const h of [0,-1,4,1.5,96,'72'])assert.throws(()=>normalizeMeasurement(raw,e,now,h));
 const result=normalizeMeasurement({...raw,qtd:432,min_date:new Date(now.getTime()-4320*60000).toISOString(),max_date:new Date(now.getTime()-120*60000).toISOString()},e,now,72);assert.equal(result.quality,'stale');assert.equal(result.return_period,null);
});
