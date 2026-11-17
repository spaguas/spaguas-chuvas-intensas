import test from 'node:test';
import assert from 'node:assert/strict';
import { returnReading,rainReading,staleReading,filterStations,groupStations,hasCoordinates,monitoringCsv } from '../../web/src/lib/monitoring.ts';
const now=Date.parse('2026-11-17T20:00:00Z');
const station={id:'1',station_id:'s1',station_name:'São José / Água Funda',city:'São Paulo',prefix:'P1',municipality_id:'3550308',duration_minutes:60,observed_at:'2026-11-17T19:55:00Z',depth_mm:32.5,return_period:2,return_bound:'within',return_limit:null,quality:'aggregate',quality_note:'Agregado SIBH',classification:'reference',is_stale:false,latitude:-23.6,longitude:-46.6,measurement_gap:10};
for(const [value,label,tone] of [[2,'2T','green'],[5,'5T','green'],[9.99,'9,99T','green'],[9.999,'<10T','green'],[10,'10T','orange'],[10.00000001,'10T','orange'],[10.001,'>10T','red'],[25,'25T','red'],[200,'200T','red']])test(`Mapa SIBH: retorno ${value} recebe ${label} e cor ${tone}`,()=>{
 const reading=returnReading({...station,return_period:value},now);assert.equal(reading.label,label);assert.equal(reading.tone,tone);
});
test('Mapa SIBH: limites da IDF são preservados e faixas indeterminadas não recebem cores de alerta',()=>{
 const bound=(return_bound,return_limit)=>returnReading({...station,return_period:null,return_bound,return_limit},now);
 assert.equal(bound('below',2).label,'<2T');assert.equal(bound('below',2).tone,'green');
 assert.equal(bound('below',25).tone,'neutral');assert.equal(bound('above',200).label,'>200T');assert.equal(bound('above',200).tone,'red');assert.equal(bound('above',5).tone,'neutral');
});
test('Mapa SIBH: dados antigos, incompletos, pendentes ou fora do domínio nunca exibem retorno válido',()=>{
 for(const quality of ['stale','incomplete','no_equation','pending_equation','outside_domain']){const r=returnReading({...station,quality,return_period:200},now);assert.equal(r.label,'—');assert.equal(r.tone,'neutral');}
 assert.equal(returnReading({...station,is_stale:true},now).tone,'neutral');
 assert.equal(returnReading({...station,return_period:null,return_bound:null},now).label,'—');
 assert.equal(staleReading({...station,observed_at:'2026-11-17T19:39:00Z'},now),true);
 assert.equal(staleReading({...station,observed_at:'2026-11-17T19:39:00Z',measurement_gap:30},now),false);
 assert.equal(staleReading({...station,observed_at:'invalid'},now),true);
});
test('Mapa SIBH: chuva continua visível sem IDF; leituras antigas usam cor neutra',()=>{
 const r=rainReading({...station,quality:'outside_domain'},now);assert.equal(r.label,'32,5');assert.equal(r.tone,'rain4');
 assert.equal(rainReading({...station,is_stale:true},now).label,'32,5');assert.equal(rainReading({...station,is_stale:true},now).tone,'neutral');
 assert.equal(rainReading({...station,depth_mm:0},now).tone,'neutral');
});
test('Mapa SIBH: busca ignora acentos, usa prefixo e aplica filtros sobre leituras válidas',()=>{
 const high={...station,station_id:'high',return_period:15},old={...station,station_id:'old',is_stale:true,depth_mm:99};const rows=[station,high,old];
 assert.equal(filterStations(rows,'sao jose','all',now).length,3);assert.equal(filterStations(rows,'P1','all',now).length,3);
 assert.equal(filterStations(rows,'','rain',now).length,2);assert.deepEqual(filterStations(rows,'','high',now).map(o=>o.station_id),['high']);assert.equal(filterStations(rows,'','valid',now).length,2);assert.equal(filterStations(rows,'inexistente','all',now).length,0);
});
test('Mapa SIBH: agrupamento preserva todos os pontos e representa máximo, sem somar chuvas',()=>{
 const rows=[station,{...station,station_id:'s2',depth_mm:60,longitude:-46.61},{...station,station_id:'s3',latitude:-21,longitude:-48,depth_mm:5},{...station,station_id:'missing',latitude:null}];
 const groups=groupStations(rows,o=>({x:o.station_id==='s3'?200:10,y:10}),'rain',66,now);
 assert.equal(groups.length,2);assert.equal(groups.flatMap(g=>g.stations).length,3);assert.equal(groups[0].stations.length,2);assert.equal(groups[0].representative.depth_mm,60);assert.equal(rows[0].depth_mm,32.5);assert.equal(hasCoordinates(rows.at(-1)),false);
 assert.ok(Math.abs(groups[0].longitude+46.605)<1e-8);
 const detailed=groupStations(rows,o=>({x:0,y:0}),'rain',0,now);assert.equal(detailed.length,3);
});
test('Mapa SIBH: agrupamento de retorno prioriza estimativas atuais sobre registros antigos',()=>{
 const old={...station,station_id:'old',is_stale:true,return_period:200};const high={...station,station_id:'high',return_period:15};const groups=groupStations([station,old,high],()=>({x:1,y:1}),'return',66,now);assert.equal(groups[0].representative.station_id,'high');
});
test('Mapa SIBH: CSV mantém unidades, janela, limites e protege fórmulas de planilhas',()=>{
 const csv=monitoringCsv([{...station,station_name:'=HYPERLINK("https://example.org")',return_period:null,return_bound:'below',return_limit:2}],6,now);
 assert.ok(csv.startsWith('\ufeff'));assert.ok(csv.includes('Janela de acumulação: 6h'));assert.ok(csv.includes('"Acumulado (mm)"'));assert.ok(csv.includes('"<2T"'));assert.ok(csv.includes('"\'=HYPERLINK'));assert.ok(csv.includes('"32,5"'));assert.ok(csv.includes('"-23.6"'));assert.ok(csv.includes('\r\n'));
});
