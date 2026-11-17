import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { calculate,estimateReturnPeriod,validateEquation,buildCurves } from '@chuvas/hydrology';
const catalog=JSON.parse(await readFile(new URL('../../../data/catalog.json',import.meta.url),'utf8'));
const active=catalog.equations.filter(e=>e.status==='active');
test('75 códigos IBGE únicos; divergências preservadas em sete equações pendentes',()=>{
 assert.equal(catalog.municipalities.length,75);assert.equal(new Set(catalog.municipalities.map(m=>m.ibge_code)).size,75);assert.equal(active.length,68);
 for(const e of catalog.equations.filter(e=>e.status==='pending'))assert.throws(()=>calculate(e,60,10),{code:'EQUATION_PENDING'});
});
for(const e of active){const city=catalog.municipalities.find(m=>m.id===e.municipality_id);test(`${city.name}: todos os pontos de referência do PDF e domínio matemático`,()=>{
 validateEquation(e);assert.ok(e.reference_checks.length>=40);
 for(const c of e.reference_checks){const r=calculate(e,c.duration,c.return_period);assert.ok(Math.abs(r.intensity_mm_h-c.intensity_mm_h)<=Math.max(.25,c.intensity_mm_h*.01),JSON.stringify(c));assert.equal(r.depth_mm,r.intensity_mm_h*c.duration/60);}
});}
test('São Paulo: valor independente da tabela (60min,10anos) e inversão recupera o retorno',()=>{
 const e=catalog.equations.find(e=>e.municipality_id==='3550308');const reference=e.reference_checks.find(c=>c.duration===60&&c.return_period===10);
 assert.ok(Math.abs(calculate(e,60,10).intensity_mm_h-reference.intensity_mm_h)<.1);
 for(const T of [2,5,10,25,50,100,199]){const result=calculate(e,60,T);assert.ok(Math.abs(estimateReturnPeriod(e,60,result.depth_mm).return_period-T)<1e-8);}
 for(const t of [10,20,30,60,120,1440])for(const T of [2,200])assert.ok(Math.abs(estimateReturnPeriod(e,t,calculate(e,t,T).depth_mm).return_period-T)<1e-7);
 assert.equal(estimateReturnPeriod(e,60,0).bound,'below');assert.equal(estimateReturnPeriod(e,60,10000).bound,'above');
});
test('Durações e retornos inválidos não são extrapolados',()=>{
 for(const [t,T] of [[9,10],[1441,10],[60,1],[60,201],[NaN,10],[60,Infinity]])assert.throws(()=>calculate(active[0],t,T));
 const e=structuredClone(active[0]);e.segments[0].parameters.A=NaN;assert.throws(()=>validateEquation(e));
 const decreasing=structuredClone(active[0]);decreasing.segments[0].parameters.H=1;assert.throws(()=>validateEquation(decreasing));
});
test('Trechos de Araraquara e Iguape; unidades mm/h de Guarulhos são respeitados',()=>{
 for(const id of ['3503208','3520301']){const e=catalog.equations.find(e=>e.municipality_id===id),t=e.segments[0].duration_max;assert.ok(calculate(e,t,10).intensity_mm_h>0);assert.ok(calculate(e,t+.001,10).intensity_mm_h>0);}
 const e=catalog.equations.find(e=>e.municipality_id==='3518800');assert.ok(calculate(e,60,10).intensity_mm_h<150);
});
test('Ambos os gráficos usam as famílias publicadas e produzem valores finitos',()=>{
 for(const mode of ['duration','return']){const c=buildCurves(active[0],mode);assert.ok(c.rows.length>=100);assert.ok(c.series.length>=7);assert.ok(c.rows.every(r=>Object.values(r).every(Number.isFinite)));}
});
