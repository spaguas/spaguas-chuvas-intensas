import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { distanceKm, spatialReturnPeriod } from '@chuvas/hydrology';
import { locateMunicipality, municipalBoundaries } from '../src/services/geography-service.js';

const origin = { latitude: 0, longitude: 0 };
const input = { ...origin, duration: 60, depth_mm: 20, neighbors: 3, power: 2, radius_km: 300 };
function reference(id, longitude, coefficient=1, latitude=0) {
  return { municipality_id:id, municipality_name:`Posto ${id}`, latitude, longitude,
    equation:{ id, version:1, status:'active', return_min:2, return_max:200,
      segments:[{family:'GENERAL',unit:'mm_h',duration_min:10,duration_max:1440,parameters:{C:coefficient,to:0,n:0,k:0,m:1,d:0,p:0}}] } };
}
test('Haversine: distância nula, simetria e um grau no equador em km',()=>{
  assert.equal(distanceKm(origin,origin),0);
  assert.ok(Math.abs(distanceKm(origin,{latitude:0,longitude:1})-111.19508)<.001);
  assert.equal(distanceKm(origin,{latitude:-23,longitude:-46}),distanceKm({latitude:-23,longitude:-46},origin));
  assert.throws(()=>distanceKm({latitude:null,longitude:0},origin));
});
test('IDW: resultado independente para distâncias 1:2:3 e retornos 20,10,5 anos',()=>{
  const result=spatialReturnPeriod([reference('a',.5),reference('b',1,2),reference('c',1.5,4)],input);
  const denominator=1+1/4+1/9;
  const expected=(20+10/4+5/9)/denominator;
  assert.equal(result.status,'estimated');assert.ok(Math.abs(result.estimate.return_period-expected)<1e-10);
  assert.ok(Math.abs(result.stations.reduce((sum,s)=>sum+s.weight,0)-1)<1e-12);
  assert.ok(result.stations.every(s=>Number.isFinite(s.weight)&&s.weight>0));
  assert.equal(result.stations[0].municipality_id,'a');
});
test('Coincidência usa o posto, sem divisão por zero nem influência de vizinhos distantes',()=>{
  const result=spatialReturnPeriod([reference('a',0),reference('b',1,2),reference('c',2,4)],input);
  assert.equal(result.stations.length,1);assert.equal(result.stations[0].weight,1);assert.ok(Math.abs(result.estimate.return_period-20)<1e-10);
  assert.doesNotThrow(()=>JSON.stringify(result));
});
test('Vizinhança: exclui equações pendentes, coordenadas ausentes, raio e duração incompatível',()=>{
  const pending=reference('pending',.1);pending.equation.status='pending';
  const bad=reference('bad',.2);bad.latitude=null;
  const short=reference('short',.3);short.equation.segments[0].duration_min=120;
  const result=spatialReturnPeriod([pending,bad,short,reference('far',10),reference('valid',1)],input);
  assert.equal(result.status,'insufficient_neighbors');assert.equal(result.estimate,null);assert.equal(result.stations[0].weight,null);
  assert.deepEqual(new Set(result.excluded_stations.map(s=>s.reason)),new Set(['inactive_equation','missing_coordinates','outside_radius','invalid_equation_or_duration']));
});
test('Retornos censurados permanecem nos pesos e propagam desigualdades',()=>{
  const refs=[reference('a',1),reference('b',2),reference('c',2.5)];
  const low=spatialReturnPeriod(refs,{...input,depth_mm:0});assert.equal(low.status,'bounded');assert.equal(low.estimate.return_period,null);assert.equal(low.estimate.bound,'below');assert.ok(Math.abs(low.estimate.upper_bound-2)<1e-12);
  const high=spatialReturnPeriod(refs,{...input,depth_mm:500});assert.equal(high.estimate.bound,'above');assert.equal(high.estimate.upper_bound,null);assert.ok(Math.abs(high.estimate.lower_bound-200)<1e-10);
  const mixed=spatialReturnPeriod([reference('a',1),reference('b',2,20),reference('c',2.5,1)],input);
  assert.equal(mixed.estimate.bound,'interval');assert.equal(mixed.estimate.return_period,null);assert.equal(mixed.stations.length,3);assert.ok(mixed.estimate.lower_bound<mixed.estimate.upper_bound);
});
test('Limites de entrada e potência são validados antes de qualquer interpolação',()=>{
  for(const patch of [{latitude:91},{longitude:181},{duration:0},{depth_mm:-1},{depth_mm:NaN},{neighbors:2},{neighbors:13},{power:0},{power:5},{radius_km:0},{radius_km:301}])assert.throws(()=>spatialReturnPeriod([],{...input,...patch}));
});
test('Identificação municipal usa os 645 polígonos, incluindo cidades sem IDF',()=>{
  assert.equal(municipalBoundaries.features.length,645);
  assert.equal(locateMunicipality(-23.5505,-46.6333).name,'São Paulo');
  assert.equal(locateMunicipality(-23.1857,-46.8978).name,'Jundiaí');
  assert.throws(()=>locateMunicipality(0,0),{code:'POINT_OUTSIDE_SP'});
  assert.throws(()=>locateMunicipality(-22.9,-43.2),{code:'POINT_OUTSIDE_SP'});
  assert.throws(()=>locateMunicipality(NaN,-46),{code:'INVALID_COORDINATES'});
});
test('Pontos compartilhados por municípios não são associados arbitrariamente',()=>{
  const seen=new Map();let shared;
  for(const feature of municipalBoundaries.features){
    const polygons=feature.geometry.type==='Polygon'?[feature.geometry.coordinates]:feature.geometry.coordinates;
    for(const polygon of polygons)for(const ring of polygon)for(const p of ring){const key=p.join(',');if(seen.has(key)&&seen.get(key)!==feature.properties.codarea){shared=p;break}seen.set(key,feature.properties.codarea)}
    if(shared)break;
  }
  assert.ok(shared);assert.throws(()=>locateMunicipality(shared[1],shared[0]),{code:'AMBIGUOUS_BOUNDARY'});
});
test('As 75 coordenadas transcritas estão presentes no catálogo; correções não mudam coeficientes',async()=>{
  const c=JSON.parse(await readFile(new URL('../../../data/catalog.json',import.meta.url),'utf8'));
  assert.ok(c.municipalities.every(m=>Number.isFinite(m.latitude)&&Number.isFinite(m.longitude)));
  assert.equal(c.equations.filter(e=>e.status==='active').length,68);
});
