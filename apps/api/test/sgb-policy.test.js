import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SGB_SETTINGS as defaults,sgbSettingsSchema,nextSgbCheck,sgbAdoptionDecision } from '../src/services/sgb-policy.js';

test('SGB: agenda normal, falha, pausa e alteração de periodicidade usam o término da execução',()=>{
 const latest={status:'success',started_at:'2026-11-17T10:00:00Z',finished_at:'2026-11-17T11:00:00Z'};
 assert.equal(nextSgbCheck(defaults,latest).toISOString(),'2026-11-18T11:00:00.000Z');
 assert.equal(nextSgbCheck({...defaults,poll_seconds:7200},latest).toISOString(),'2026-11-17T13:00:00.000Z');
 for(const status of ['failed','partial'])assert.equal(nextSgbCheck(defaults,{...latest,status}).toISOString(),'2026-11-17T12:00:00.000Z');
 assert.equal(nextSgbCheck({...defaults,enabled:false},latest),null);
 assert.equal(nextSgbCheck(defaults,null).getTime(),0);
});
const active={managed_by:'sgb',publication_year:2020};
for(const example of [
 ['sem equação ativa',{},true],
 ['revisão obrigatória',{settings:{adoption_mode:'review'}},false],
 ['revisão obrigatória sem seleção ativa',{settings:{adoption_mode:'review'},active:null},false],
 ['preencher lacuna',{settings:{adoption_mode:'fill_missing'},active:null},true],
 ['não substituir ao preencher lacunas',{settings:{adoption_mode:'fill_missing'},active},false],
 ['ano mais recente',{active},true],
 ['ano mais antigo',{active,year:2019},false],
 ['mesmo ano não substitui por padrão',{active,year:2020,samePublication:true},false],
 ['nova revisão no mesmo ano',{settings:{allow_same_year_revision:true},active,year:2020,samePublication:true},true],
 ['outro relatório do mesmo ano',{settings:{allow_same_year_revision:true},active,year:2020},false],
 ['não substituir DAEE por revisão do mesmo ano',{settings:{allow_same_year_revision:true},active:{...active,managed_by:'daee_seed'},year:2020,samePublication:true},false],
 ['manual protegido',{active:{...active,managed_by:'manual'}},false],
 ['manual com substituição autorizada',{settings:{protect_manual:false},active:{...active,managed_by:'manual'}},true],
 ['múltiplos modelos exigem escolha',{modelCount:2},false],
 ['modelo inválido bloqueado',{validated:false},false]
])test(`SGB adoção: ${example[0]}`,()=>{
 const [,options,expected]=example;
 const {settings,...input}=options;
 const decision=sgbAdoptionDecision({...defaults,...settings},{validated:true,modelCount:1,year:2025,...input});
 assert.equal(decision.activate,expected);assert.ok(decision.reason.length>10);
});
test('SGB: configuração rejeita limites excessivos, coerção, propriedades extras e relaxamento numérico',()=>{
 assert.deepEqual(sgbSettingsSchema.parse(defaults),defaults);
 for(const change of [{poll_seconds:3599},{failure_retry_seconds:0},{timeout_ms:180001},{max_pdf_mb:100},{max_catalog_shrink_percent:100},{retry_attempts:4},{enabled:'true'},{min_reference_points:11},{absolute_tolerance:.26},{relative_tolerance_percent:1.1},{url:'http://localhost'},{ocr_max_pages:0}])assert.equal(sgbSettingsSchema.safeParse({...defaults,...change}).success,false,JSON.stringify(change));
 assert.equal(sgbSettingsSchema.safeParse({...defaults,absolute_tolerance:.1,relative_tolerance_percent:.5,min_reference_points:24}).success,true);
});
