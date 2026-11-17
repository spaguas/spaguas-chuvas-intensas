import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {compileExpression,validateFamilyDefinition,validateFamilyParameters,BUILTIN_FAMILIES,calculate,estimateReturnPeriod,validateEquation} from '@chuvas/hydrology';
const variable=(name,value=1)=>({name,label:name,unit:'',default_value:value,min_value:-1e7,max_value:1e7});
const definition={expression:'K*T^a/(t+b)^n',default_unit:'mm_h',variables:[variable('K',1000),variable('a',.2),variable('b',20),variable('n',.8)]};
test('Linguagem aritmética: precedência, associatividade de potência e sinais',()=>{
 const evaluate=source=>compileExpression(source,[]).evaluate({});
 for(const [formula,expected] of [['2+3*4',14],['2^3^2',512],['-2^2',-4],['(-2)^2',4],['2^-2*3',.75],['1-2-3',-4],['8/4/2',1],['1e2+0.5',100.5],['2×3−4÷2',4]])assert.equal(evaluate(formula),expected,formula);
 assert.ok(Math.abs(evaluate('exp(ln(2))+sqrt(9)+abs(-4)+pow(2,3)+min(4,5)+max(4,5)')-26)<1e-12);
 assert.ok(Math.abs(evaluate('log10(100)+ln(e)+log(e)+pi')-(4+Math.PI))<1e-12);
});
test('Expressões bloqueiam acesso a objetos, código, atribuição e funções arbitrárias',()=>{
 for(const expression of ['Math.random()','process.exit()','globalThis','constructor(1)','t=1','1;2','[1,2]','({a:1})','import(1)','sin(t)','x + T','1 // comment','2t','min(1)','sqrt(1,2)','pow(2,3,4)','1e309'])assert.throws(()=>compileExpression(expression,['t','T']),{code:'INVALID_EXPRESSION'},expression);
 for(const expression of ['1/0','sqrt(-1)','ln(-1)','exp(10000)'])assert.throws(()=>compileExpression(expression,[]).evaluate({}),{code:'INVALID_EXPRESSION'});
 assert.throws(()=>compileExpression('('.repeat(40)+'1'+')'.repeat(40),[]));
 assert.throws(()=>compileExpression('1+'.repeat(150)+'1',[]));
});
test('Variáveis: nomes reservados, duplicação, limites e valores são verificados',()=>{
 validateFamilyDefinition(definition);
 for(const variables of [[variable('t')],[variable('T')],[variable('ln')],[variable('constructor')],[variable('a'),variable('a')],[{...variable('a'),default_value:10,min_value:20}],[{...variable('a'),max_value:NaN}]])assert.throws(()=>validateFamilyDefinition({...definition,variables}));
 assert.throws(()=>validateFamilyDefinition({...definition,expression:'K*T + nao_declarada'}));
 assert.throws(()=>validateFamilyParameters(definition,{K:1000,a:.2,b:20}));
 assert.throws(()=>validateFamilyParameters(definition,{K:1000,a:.2,b:20,n:.8,extra:1}));
});
test('Família personalizada calcula e inverte; mudança da expressão muda somente a nova definição',()=>{
 const e={id:'custom',municipality_id:'3550308',status:'active',return_min:2,return_max:200,version:1,segments:[{family:'POTENCIA',family_version_id:'v1',family_definition:{...definition,id:'v1',family_code:'POTENCIA',version:1},duration_min:10,duration_max:1440,unit:'mm_h',parameters:{K:1000,a:.2,b:20,n:.8}}]};
 validateEquation(e);const expected=1000*Math.pow(10,.2)/Math.pow(80,.8),value=calculate(e,60,10);assert.ok(Math.abs(value.intensity_mm_h-expected)<1e-10);assert.ok(Math.abs(estimateReturnPeriod(e,60,value.depth_mm).return_period-10)<1e-8);
 const revised=structuredClone(e);revised.segments[0].family_definition.expression='2*K*T^a/(t+b)^n';assert.equal(calculate(revised,60,10).intensity_mm_h,2*value.intensity_mm_h);assert.equal(calculate(e,60,10).intensity_mm_h,value.intensity_mm_h);
 assert.throws(()=>validateEquation({...e,segments:[{...e.segments[0],family_version_id:'wrong'}]}));
});
test('As expressões das famílias iniciais reproduzem todos os 6.120 pontos ativos do estudo',async()=>{
 const catalog=JSON.parse(await readFile(new URL('../../../data/catalog.json',import.meta.url),'utf8'));
 for(const e of catalog.equations.filter(e=>e.status==='active')){
  const hydrated={...e,segments:e.segments.map(s=>{const f=BUILTIN_FAMILIES.find(f=>f.family_code===s.family);return {...s,family_version_id:f.id,family_definition:f}})};
  for(const point of e.reference_checks){const a=calculate(e,point.duration,point.return_period),b=calculate(hydrated,point.duration,point.return_period);assert.ok(Math.abs(a.intensity_mm_h-b.intensity_mm_h)<1e-9,`${e.id} ${point.duration} ${point.return_period}`)}
 }
});
