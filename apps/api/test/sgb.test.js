import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { calculate,BUILTIN_FAMILIES,spatialReturnPeriod } from '@chuvas/hydrology';
import { parseIndex,parseItem,parseReport,SGB_FAMILIES,validateSgbModel } from '../src/services/sgb-parser.js';
const catalog=JSON.parse(await readFile(new URL('../../../data/sgb/catalog.json',import.meta.url),'utf8'));
const families=[...BUILTIN_FAMILIES,...SGB_FAMILIES];

test('SGB: descobre todos os anos, remove link duplicado e rejeita links externos inesperados',()=>{
 const html='<table><tr><th>Município</th><th>Publicações</th><th>Tipo</th></tr><tr><td>Artur Nogueira</td><td><a href="https://rigeo.sgb.gov.br/handle/doc/1">2017</a> | <a href="https://rigeo.sgb.gov.br/handle/doc/2">2025</a></td><td>Desagregação</td></tr><tr><td><a href="https://rigeo.sgb.gov.br/handle/doc/1">Artur Nogueira</a></td><td>2017</td><td>Desagregação</td></tr></table>';
 assert.deepEqual(parseIndex(html).map(e=>[e.external_id,e.publication_year]),[['1',2017],['2',2025]]);
 assert.throws(()=>parseIndex(html.replace('rigeo.sgb.gov.br/handle/doc/2','example.org/malicious')));
 assert.throws(()=>parseIndex('<html><h1>Serviço temporariamente indisponível</h1></html>'));
});
test('RIGeo: extrai metadados SSR e o PDF; respostas HTML incompletas falham explicitamente',()=>{
 const item=parseItem('<meta name="citation_title" content="IDF Alambari"><meta name="citation_publication_date" content="2020"><meta name="citation_author" content="Autor"><a href="/bitstreams/12345678-abcd/download">PDF</a>');
 assert.equal(item.issued_year,2020);assert.equal(item.pdf_url,'https://rigeo.sgb.gov.br/bitstreams/12345678-abcd/download');assert.deepEqual(item.authors,['Autor']);
 assert.throws(()=>parseItem('<h1>502 Bad Gateway</h1>'));
});
test('Catálogo SGB: inventário integral, identidade IBGE, múltiplos anos e PDFs rastreáveis',()=>{
 assert.equal(catalog.documents.length,247);assert.equal(new Set(catalog.documents.map(d=>d.external_id)).size,247);
 assert.equal(new Set(catalog.documents.map(d=>d.municipality.id)).size,245);
 assert.equal(catalog.documents.flatMap(d=>d.models).length,256);
 assert.ok(catalog.documents.every(d=>/^35\d{5}$/.test(d.municipality.id)&&/^[a-f0-9]{64}$/.test(d.sha256)&&d.metadata.pdf_url.startsWith('https://rigeo.sgb.gov.br/bitstreams/')));
 assert.deepEqual(catalog.documents.filter(d=>d.municipality.name==='Artur Nogueira').map(d=>d.metadata.issued_year),[2017,2025]);
 assert.equal(catalog.documents.find(d=>d.municipality.name==='São João da Boa Vista').metadata.issued_year,2024);
 assert.ok(catalog.documents.every(d=>d.models.length>0),'Todas as publicações têm fórmula transcrita ou modelo pendente.');
});
for(const d of catalog.documents)for(const m of d.models.filter(m=>m.validated))test(`SGB ${d.municipality.name} ${d.metadata.issued_year} ${m.key}: tabela publicada e unidade`,()=>{
 const equation={...m,status:'active',segments:m.segments.map(s=>({...s,family_definition:families.find(f=>f.id===s.family_version_id)}))};
 validateSgbModel({...equation,issues:[]});
 for(const c of m.reference_checks){const value=calculate(equation,c.duration,c.return_period).intensity_mm_h;assert.ok(Math.abs(value-c.intensity_mm_h)<=Math.max(.25,c.intensity_mm_h*.01),JSON.stringify({id:d.external_id,...c,value}));}
});
test('SGB: unidades em horas são normalizadas e a equação Gumbel contínua não vira lei de potência',()=>{
 const d=catalog.documents.find(d=>d.municipality.name==='Alambari'),m=d.models[0];
 const e={...m,status:'active',segments:m.segments.map(s=>({...s,family_definition:families.find(f=>f.id===s.family_version_id)}))};
 assert.ok(Math.abs(calculate(e,60,10).intensity_mm_h-52.2)<.1);
 const itarare=catalog.documents.find(d=>d.municipality.name==='Itararé');assert.equal(itarare.models[0].segments[0].family,'GUMBEL');
 assert.equal(catalog.documents.find(d=>d.municipality.name==='Itapetininga').models[0].segments[0].family,'SGB_POWER_LOG');
});
test('SGB: divergências e ausência de referências ficam pendentes, inclusive sinal de São Simão',()=>{
 for(const name of ['Leme','São Simão','Santa Rosa de Viterbo','São João da Boa Vista','São José dos Campos'])assert.ok(catalog.documents.filter(d=>d.municipality.name===name).flatMap(d=>d.models).every(m=>!m.validated),name);
 const failed=catalog.documents.find(d=>d.municipality.name==='São Simão').models[0];assert.ok(failed.validation.failed>0);
 const report=parseReport('a = 123; b = 0,2; c = 10; d = 0,8\nEquação sem domínio ou tabela',{});assert.equal(report.models.length,0);assert.ok(report.issues.length>0);
});
test('IDW: uma coordenada republicada para várias cidades contribui uma única vez e preserva a fonte',()=>{
 const model=catalog.documents.find(d=>d.municipality.name==='Alambari').models[0];
 const ref=(id,year,longitude)=>({municipality_id:id,municipality_name:id,latitude:0,longitude,equation:{...model,id,version:1,status:'active',publication_year:year,source_url:'https://rigeo.sgb.gov.br/bitstreams/test/download',segments:model.segments.map(s=>({...s,family_definition:families.find(f=>f.id===s.family_version_id)}))}});
 const result=spatialReturnPeriod([ref('a',2020,0),ref('b',2025,0),ref('c',2023,1)],{latitude:0,longitude:0,duration:60,depth_mm:52.2,neighbors:3,power:2,radius_km:300});
 assert.equal(result.stations.length,1);assert.equal(result.stations[0].equation_id,'b');assert.equal(result.stations[0].weight,1);assert.equal(result.stations[0].publication_year,2025);assert.match(result.stations[0].source_url,/rigeo/);assert.ok(result.excluded_stations.some(s=>s.reason==='duplicate_reference_location'));
});
