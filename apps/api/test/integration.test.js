import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import request from 'supertest';
import bcrypt from 'bcryptjs';
const url=process.env.TEST_DATABASE_URL;
const enabled=!!url;
if(enabled&&!new URL(url).pathname.endsWith('_test'))throw new Error('TEST_DATABASE_URL deve usar um banco isolado com sufixo _test.');
test('API, PostgreSQL, autenticação, versões, auditoria e worker idempotente',{skip:!enabled},async t=>{
 process.env.DATABASE_URL=url;process.env.JWT_SECRET='test-secret-'.repeat(8);process.env.NODE_ENV='test';
 const {db}=await import('../src/db.js');const {app}=await import('../src/app.js');const {syncSibh}=await import('../src/services/sibh-service.js');
 try{
  await db.migrate.latest({directory:new URL('../../../db/migrations',import.meta.url).pathname,loadExtensions:['.js']});
  const catalog=JSON.parse(await readFile(new URL('../../../data/catalog.json',import.meta.url),'utf8'));
  for(const table of ['sgb_models','sgb_publication_versions','sgb_publications','sgb_sync_runs','audit_logs','observations','stations','integration_runs','idf_segments','idf_equations','municipalities'])await db(table).delete();
  const builtinIds=[1,2,3,4,5].map(n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0'));
  await db('equation_family_versions').whereNotIn('id',builtinIds).delete();await db('equation_families').whereNotIn('code',['GUMBEL','GENERAL','SGB_POWER','SGB_LOG','SGB_POWER_LOG']).delete();await db('equation_families').update({active:true});await db('users').delete();
  await db('municipalities').insert(catalog.municipalities);
  for(const e of catalog.equations){const {segments,...r}=e;await db('idf_equations').insert({...r,reference_checks:JSON.stringify(r.reference_checks)});await db('idf_segments').insert(segments.map((s,ordinal)=>({...s,equation_id:e.id,ordinal})));}
  const [user]=await db('users').insert({name:'Operador teste',email:'test@example.org',password_hash:await bcrypt.hash('Password-test-12345',12),role:'admin'}).returning('*');
  const base='/chuvas_intensas/api';
  await t.test('Catálogo, Swagger e endpoints públicos respondem sob o subpath',async()=>{
   const list=await request(app).get(`${base}/municipalities`).expect(200);assert.equal(list.body.length,75);
   const spec=await request(app).get(`${base}/openapi.json`).expect(200);assert.equal(spec.body.servers[0].url,base);
   await request(app).get('/api/municipalities').expect(404);
   await request(app).post(`${base}/idf/calculate`).send({municipality_id:'3550308',duration:60,return_period:10}).expect(200);
   await request(app).post(`${base}/idf/calculate`).send({municipality_id:'3530706',duration:60,return_period:10}).expect(422);
   await request(app).post(`${base}/idf/calculate`).send({municipality_id:'3550308',duration:-1,return_period:10}).expect(422);
  });
  let token;
  await t.test('Mapa IDW: malha, coordenadas, município, pesos, censura e limites da API',async()=>{
   const refs=await request(app).get(`${base}/spatial/reference-stations`).expect(200);assert.equal(refs.body.stations.length,75);assert.ok(refs.body.stations.every(s=>s.latitude!==null&&s.longitude!==null));
   const geo=await request(app).get(`${base}/spatial/municipalities`).expect(200);assert.equal(geo.body.features.length,645);
   const input={latitude:-23.5505,longitude:-46.6333,duration:60,depth_mm:63};
   const r=await request(app).post(`${base}/idf/spatial-return-period`).send(input).expect(200);assert.equal(r.body.municipality.name,'São Paulo');assert.equal(r.body.status,'estimated');assert.equal(r.body.stations.length,5);assert.ok(Math.abs(r.body.stations.reduce((sum,s)=>sum+s.weight,0)-1)<1e-10);assert.ok(r.body.estimate.return_period>1);assert.ok(r.body.stations.every(s=>s.equation_id&&s.equation_version&&s.source_pdf_page));
   const low=await request(app).post(`${base}/idf/spatial-return-period`).send({...input,depth_mm:0}).expect(200);assert.equal(low.body.estimate.return_period,null);assert.equal(low.body.estimate.bound,'below');
   const empty=await request(app).post(`${base}/idf/spatial-return-period`).send({...input,radius_km:5}).expect(200);assert.equal(empty.body.status,'insufficient_neighbors');assert.equal(empty.body.estimate,null);
   const outside=await request(app).post(`${base}/idf/spatial-return-period`).send({...input,latitude:0,longitude:0}).expect(422);assert.equal(outside.body.code,'POINT_OUTSIDE_SP');
   await request(app).post(`${base}/idf/spatial-return-period`).send({...input,depth_mm:-1}).expect(422);
   await request(app).post(`${base}/idf/spatial-return-period`).send({...input,neighbors:100}).expect(422);
   const local=await request(app).post(`${base}/idf/spatial-return-period`).send({...input,latitude:-23.65,longitude:-(46+38/60)}).expect(200);assert.equal(local.body.stations.length,1);assert.equal(local.body.stations[0].weight,1);
  });
  await t.test('Login genérico, proteção de rotas e assinatura JWT',async()=>{
   await request(app).get(`${base}/admin/equations`).expect(401);
   await request(app).post(`${base}/auth/login`).send({email:user.email,password:'wrong'}).expect(401);
   const login=await request(app).post(`${base}/auth/login`).send({email:user.email,password:'Password-test-12345'}).expect(200);token=login.body.token;
   assert.equal(login.body.expires_in,900);assert.equal(login.body.user.password_hash,undefined);
   const equations=await request(app).get(`${base}/admin/equations`).set('Authorization',`Bearer ${token}`).expect(200);assert.ok(equations.body.every(e=>e.segments.length>0));
   await request(app).get(`${base}/auth/me`).set('Authorization',`Bearer ${token}tampered`).expect(401);
  });
  await t.test('Identidade visual: persistência, imagens públicas, limites, papéis, restauração e auditoria',async()=>{
   const headers={Authorization:`Bearer ${token}`};
   await db('system_branding').where({id:1}).update({logo:null,favicon:null});
   const initial=await request(app).get(`${base}/branding`).expect(200);assert.equal(initial.body.logo_url,null);assert.equal(initial.body.favicon_url,null);
   await request(app).get(`${base}/admin/branding`).expect(401);
   await request(app).put(`${base}/admin/branding`).send({logo:null,favicon:null}).expect(401);
   await db('users').where({id:user.id}).update({role:'editor'});
   try{
    await request(app).get(`${base}/admin/branding`).set(headers).expect(403);
    await request(app).put(`${base}/admin/branding`).set(headers).send({logo:null,favicon:null}).expect(403);
   }finally{await db('users').where({id:user.id}).update({role:'admin'});}
   const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aO3sAAAAASUVORK5CYII=','base64');
   const data=buffer=>`data:image/png;base64,${buffer.toString('base64')}`;
   // A logo above the ordinary 256 KB JSON limit must traverse the dedicated parser.
   const logo=data(Buffer.concat([png,Buffer.alloc(300000)])),favicon=data(png);
   const saved=await request(app).put(`${base}/admin/branding`).set(headers).send({logo,favicon}).expect(200);
   assert.match(saved.body.logo_url,/^\/chuvas_intensas\/api\/branding\/logo\?v=[a-f0-9]{64}$/);
   const publicSettings=await request(app).get(`${base}/branding`).expect(200);assert.deepEqual(publicSettings.body,saved.body);assert.equal(publicSettings.body.logo,undefined);
   const image=await request(app).get(saved.body.favicon_url).expect(200).expect('Content-Type','image/png');assert.deepEqual(image.body,png);assert.equal(image.headers['x-content-type-options'],'nosniff');
   const edited=await request(app).get(`${base}/admin/branding`).set(headers).expect(200);assert.equal(edited.body.logo,logo);assert.equal(edited.body.favicon,favicon);
   const audit=await db('audit_logs').where({action:'branding.updated'}).orderBy('id','desc').first();assert.equal(audit.actor_id,user.id);assert.equal(audit.details.before.logo,null);assert.match(audit.details.after.logo,/^[a-f0-9]{64}$/);assert.ok(JSON.stringify(audit.details).length<500);
   for(const bad of [
    {logo:'data:image/svg+xml;base64,PHN2Zy8+',favicon:null},
    {logo:'data:image/png;base64,aGVsbG8=',favicon:null},
    {logo:data(Buffer.concat([png,Buffer.alloc(1024*1024)])),favicon:null},
    {logo:null,favicon:data(Buffer.concat([png,Buffer.alloc(256*1024)]))},
    {logo:null},
    {logo:null,favicon:null,unexpected:true}
   ])await request(app).put(`${base}/admin/branding`).set(headers).send(bad).expect(422);
   const unchanged=await request(app).get(`${base}/branding`).expect(200);assert.deepEqual(unchanged.body,saved.body);
   await request(app).get(`${base}/branding/unknown`).expect(404);
   // Favicon changes invalidate its URL without changing the logo.
   const changed=await request(app).put(`${base}/admin/branding`).set(headers).send({logo,favicon:data(Buffer.concat([png,Buffer.from('changed')]))}).expect(200);
   assert.notEqual(changed.body.favicon_url,saved.body.favicon_url);assert.equal(changed.body.logo_url,saved.body.logo_url);
   const restored=await request(app).put(`${base}/admin/branding`).set(headers).send({logo:null,favicon:null}).expect(200);assert.equal(restored.body.logo_url,null);assert.equal(restored.body.favicon_url,null);
   await request(app).get(`${base}/branding/logo`).expect(404);await request(app).get(`${base}/branding/favicon`).expect(404);
  });
  await t.test('Editar preserva versões e auditoria; publicação rejeita referência divergente',async()=>{
   const e=catalog.equations.find(e=>e.municipality_id==='3550308');const {id,version,...input}=e;
   input.review_notes='Revisão numérica de teste com pontos independentes do estudo.';
   const saved=await request(app).put(`${base}/admin/equations/${id}`).set('Authorization',`Bearer ${token}`).send(input).expect(201);
   assert.equal(saved.body.version,2);assert.equal((await db('idf_equations').where({id}).first()).status,'retired');
   assert.equal((await db('idf_equations').where({municipality_id:e.municipality_id,status:'active'})).length,1);
   assert.equal((await db('audit_logs').where({entity_id:saved.body.id})).length,1);
   const concurrent=await Promise.all([request(app).post(`${base}/admin/equations`).set('Authorization',`Bearer ${token}`).send(input),request(app).post(`${base}/admin/equations`).set('Authorization',`Bearer ${token}`).send(input)]);
   assert.ok(concurrent.every(r=>r.status===201));assert.deepEqual(concurrent.map(r=>r.body.version).sort(),[3,4]);assert.equal((await db('idf_equations').where({municipality_id:e.municipality_id,status:'active'})).length,1);
   await request(app).post(`${base}/admin/equations`).set('Authorization',`Bearer ${token}`).send({...input,status:'pending',segments:[{...input.segments[0],parameters:{A:1}}]}).expect(422);
   input.reference_checks=[{duration:60,return_period:10,intensity_mm_h:999},{duration:60,return_period:25,intensity_mm_h:999},{duration:60,return_period:50,intensity_mm_h:999}];
   await request(app).post(`${base}/admin/equations`).set('Authorization',`Bearer ${token}`).send(input).expect(422);
  });
  await t.test('Famílias: cadastro, prévia, parâmetros, cálculo, IDW, versões imutáveis e auditoria',async()=>{
   await request(app).get(`${base}/admin/equation-families`).expect(401);
   const variables=Object.entries({K:1000,a:.2,b:20,n:.8}).map(([name,default_value])=>({name,label:name,unit:'',default_value,min_value:-1e7,max_value:1e7}));
   const definition={name:'Potência de teste',description:'Teste isolado',expression:'K*T^a/(t+b)^n',variables,default_unit:'mm_h',change_notes:'Primeira versão'};
   const code='POTENCIA_TESTE',headers={Authorization:`Bearer ${token}`};
   const created=await request(app).post(`${base}/admin/equation-families`).set(headers).send({code,...definition}).expect(201);
   assert.equal(created.body.version,1);
   await request(app).post(`${base}/admin/equation-families`).set(headers).send({code,...definition}).expect(409);
   await request(app).post(`${base}/admin/equation-families`).set(headers).send({code:'INVALIDA',...definition,expression:'process.exit()'}).expect(422);
   await request(app).post(`${base}/admin/equation-families`).set(headers).send({code:'INVALIDA',...definition,variables:[...variables,variables[0]]}).expect(422);
   const parameters={K:1000,a:.2,b:20,n:.8};const expected=(t,T)=>1000*Math.pow(T,.2)/Math.pow(t+20,.8);
   const preview=await request(app).post(`${base}/admin/equation-families/preview`).set(headers).send({definition:{expression:definition.expression,variables,default_unit:'mm_h'},parameters,duration:60,return_period:10,unit:'mm_h'}).expect(200);assert.ok(Math.abs(preview.body.intensity_mm_h-expected(60,10))<1e-9);
   const original=catalog.equations.find(e=>e.municipality_id==='3550308'),{id,version,...payload}=original;
   payload.status='active';payload.review_notes='Revisão de teste matemático, em banco isolado.';payload.source_author='Teste matemático';payload.source_formula=definition.expression;
   payload.segments=[{family:code,family_version_id:created.body.id,unit:'mm_h',duration_min:10,duration_max:1440,parameters}];
   payload.reference_checks=[2,10,50].map(T=>({duration:60,return_period:T,intensity_mm_h:expected(60,T)}));
   const saved=await request(app).post(`${base}/admin/equations`).set(headers).send(payload).expect(201);assert.equal(saved.body.segments[0].family_definition.version,1);
   const calculation=await request(app).post(`${base}/idf/calculate`).send({municipality_id:'3550308',duration:60,return_period:10}).expect(200);assert.ok(Math.abs(calculation.body.intensity_mm_h-expected(60,10))<1e-9);
   await request(app).post(`${base}/admin/equations`).set(headers).send({...payload,segments:[{...payload.segments[0],parameters:{K:1}}]}).expect(422);
   await request(app).post(`${base}/admin/equations`).set(headers).send({...payload,segments:[{...payload.segments[0],family:'GUMBEL'}]}).expect(422);
   const revised=await request(app).put(`${base}/admin/equation-families/${code}`).set(headers).send({code,...definition,expression:'2*K*T^a/(t+b)^n'}).expect(201);assert.equal(revised.body.version,2);
   const unchanged=await request(app).post(`${base}/idf/calculate`).send({municipality_id:'3550308',duration:60,return_period:10}).expect(200);assert.equal(unchanged.body.intensity_mm_h,calculation.body.intensity_mm_h);
   const old=await request(app).get(`${base}/admin/equations/${saved.body.id}`).set(headers).expect(200);assert.equal(old.body.segments[0].family_definition.expression,definition.expression);
   await assert.rejects(db('equation_family_versions').where({id:created.body.id}).update({expression:'1'}),e=>e.code==='23514');
   payload.segments[0].family_version_id=revised.body.id;payload.reference_checks=payload.reference_checks.map(p=>({...p,intensity_mm_h:p.intensity_mm_h*2}));
   await request(app).post(`${base}/admin/equations`).set(headers).send(payload).expect(201);
   const doubled=await request(app).post(`${base}/idf/calculate`).send({municipality_id:'3550308',duration:60,return_period:10}).expect(200);assert.ok(Math.abs(doubled.body.intensity_mm_h-expected(60,10)*2)<1e-9);
   const inverse=await request(app).post(`${base}/idf/return-period`).send({municipality_id:'3550308',duration:60,depth_mm:doubled.body.depth_mm}).expect(200);assert.ok(Math.abs(inverse.body.return_period-10)<1e-8);
   const spatial=await request(app).post(`${base}/idf/spatial-return-period`).send({latitude:-23.65,longitude:-(46+38/60),duration:60,depth_mm:doubled.body.depth_mm}).expect(200);assert.ok(Math.abs(spatial.body.estimate.return_period-10)<1e-8);
   await request(app).patch(`${base}/admin/equation-families/${code}/status`).set(headers).send({active:false}).expect(200);
   await request(app).post(`${base}/admin/equations`).set(headers).send(payload).expect(422);
   await request(app).post(`${base}/idf/calculate`).send({municipality_id:'3550308',duration:60,return_period:10}).expect(200);
   await request(app).patch(`${base}/admin/equation-families/${code}/status`).set(headers).send({active:true}).expect(200);
   const concurrent=await Promise.all([1,2].map(()=>request(app).put(`${base}/admin/equation-families/${code}`).set(headers).send({code,...definition})));
   assert.ok(concurrent.every(r=>r.status===201));assert.deepEqual(concurrent.map(r=>r.body.version).sort(),[3,4]);
   const list=await request(app).get(`${base}/admin/equation-families`).set(headers).expect(200);const family=list.body.find(f=>f.code===code);assert.equal(family.versions.length,4);assert.equal(family.usage_count,2);
   assert.ok((await db('audit_logs').where({action:'family.created',entity_id:created.body.id})).length>0);
  });
  await t.test('SGB: importação, repetição, duplicatas DAEE, anos, revisão manual e monitor HTTP',async()=>{
   const {importSgbDocument}=await import('../src/repositories/sgb-repository.js');
   const {syncSgb,sgbFetch}=await import('../src/services/sgb-service.js');
   const source=JSON.parse(await readFile(new URL('../../../data/sgb/catalog.json',import.meta.url),'utf8'));
   const original=source.documents.find(d=>d.municipality.name==='Alambari');
   const r=await importSgbDocument(original);assert.equal(r.imported,1);
   const first=await db('idf_equations').where({municipality_id:original.municipality.id,status:'active'}).first();assert.equal(first.publication_year,2020);
   assert.equal((await importSgbDocument(original)).unchanged,1);
   const duplicate=source.documents.find(d=>d.municipality.name==='Itararé');assert.equal((await importSgbDocument(duplicate)).duplicates,1);
   const revised=structuredClone(original);revised.external_id='900001';revised.url='https://rigeo.sgb.gov.br/handle/doc/900001';revised.sha256='a'.repeat(64);revised.publication_year=2025;revised.metadata.issued_year=2025;
   revised.models[0].segments[0].parameters.a*=1.1;revised.models[0].reference_checks=revised.models[0].reference_checks.map(c=>({...c,intensity_mm_h:c.duration<=60?c.intensity_mm_h*1.1:c.intensity_mm_h}));
   // Changing only a does not scale the whole logarithmic expression. An invalid revision must not replace the active model.
   const invalid=await importSgbDocument(revised);assert.ok(invalid.pending>0);assert.equal((await db('idf_equations').where({municipality_id:original.municipality.id,status:'active'}).first()).id,first.id);
   await db('idf_equations').where({id:first.id}).update({managed_by:'manual'});
   const other=structuredClone(original);other.external_id='900002';other.url='https://rigeo.sgb.gov.br/handle/doc/900002';other.sha256='b'.repeat(64);other.publication_year=2026;other.metadata.issued_year=2026;
   for(const seg of other.models[0].segments)for(const k of ['a','b','c','d'])seg.parameters[k]*=1.2;
   other.models[0].reference_checks=other.models[0].reference_checks.map(c=>({...c,intensity_mm_h:c.intensity_mm_h*1.2}));
   await importSgbDocument(other);assert.equal((await db('idf_equations').where({municipality_id:original.municipality.id,status:'active'}).first()).id,first.id);
   const headers={Authorization:`Bearer ${token}`};
   await request(app).get(`${base}/admin/sgb/publications`).expect(401);
   const list=await request(app).get(`${base}/admin/sgb/publications?year=2020`).set(headers).expect(200);assert.ok(list.body.length>0&&list.body.every(r=>r.issued_year===2020));
   await request(app).get(`${base}/admin/sgb/publications?year=bad`).set(headers).expect(422);
   await request(app).get(`${base}/admin/sgb/status`).set(headers).expect(200);
   let hits=0;
   await assert.rejects(sgbFetch('https://example.org/file',{fetchImpl:()=>{hits++;}}));assert.equal(hits,0);
   await assert.rejects(sgbFetch('https://www.sgb.gov.br/file',{fetchImpl:async()=>new Response(null,{status:302,headers:{location:'http://127.0.0.1/private'}})}));
   const connection=await db.client.acquireConnection();await db.raw('SELECT pg_advisory_lock(?)',[762314803]).connection(connection);
   try{const skipped=await syncSgb({fetchImpl:async()=>{throw new Error('must not fetch')}});assert.equal(skipped.status,'skipped');}finally{await db.raw('SELECT pg_advisory_unlock(?)',[762314803]).connection(connection);await db.client.releaseConnection(connection);}
   // Full worker protocol fixture: index -> metadata -> PDF -> extraction -> PostgreSQL.
   const doc=source.documents.find(d=>d.municipality.name==='Analândia'),text=`10min ≤ t ≤ 24h
   a = 3781,1; b = 0,1757; c = 34,4; d = 0,9808
   Tabela 01 - Intensidade da chuva em mm/h
   Duração 2 5 10 15 20
   10 Minutos 100 110 120 130 140
   60 Minutos 40 45 50 55 60
   24 Horas 3 4 5 6 7
   Tabela 02 - Altura da chuva em mm`;
   const index=`<table><tr><th>Município</th><th>Publicações</th><th>Tipo</th></tr><tr><td><a href="${doc.url}">Analândia</a></td><td>2020</td><td>Desagregação</td></tr></table>`;
   // Isolate the fixture index from the shrink safeguard without deleting the imported history.
   await db('sgb_publications').update({present_on_site:false});
   const meta=`<meta name="citation_title" content="Analândia IDF"><meta name="citation_publication_date" content="2020"><meta name="citation_author" content="Autor"><a href="/bitstreams/12345678-abcd/download">PDF</a>`;
   const fetchImpl=async url=>String(url).includes('chuvas-intensas-e-equacoes')?new Response(index):String(url).includes('/handle/')?new Response(meta):new Response('%PDF-1.7 fixture',{headers:{etag:'"fixture-v1"'}});
   const synced=await syncSgb({fetchImpl,extractText:async()=>text,trigger:'test'});assert.equal(synced.status,'success');assert.equal(synced.changed,1);assert.equal(synced.pending,1);
   const conditional=async(url,options)=>String(url).includes('/bitstreams/')?(assert.equal(options.headers['If-None-Match'],'"fixture-v1"'),new Response(null,{status:304})):fetchImpl(url,options);
   const unchanged=await syncSgb({fetchImpl:conditional,extractText:()=>{throw new Error('304 must not re-extract')},trigger:'test'});assert.equal(unchanged.unchanged,1);
   const cached=await db('sgb_publications').where({external_id:doc.external_id}).first();assert.equal(cached.etag,'"fixture-v1"');
   const again=await syncSgb({fetchImpl:conditional,extractText:()=>{throw new Error('304 must retain validators')},trigger:'test'});assert.equal(again.unchanged,1);
   const {settings:initialSettings}=await (await import('../src/services/sgb-settings-service.js')).getSgbSettings();
   await db('sgb_settings').where({id:1}).update({settings:{...initialSettings,conditional_requests:false}});
   try{
    const noConditional=async(url,options)=>{if(String(url).includes('/bitstreams/'))assert.equal(options.headers['If-None-Match'],undefined);return fetchImpl(url,options)};
    const uncached=await syncSgb({fetchImpl:noConditional,extractText:()=>{throw new Error('same hash must not re-extract')},trigger:'test'});assert.equal(uncached.unchanged,1);
   }finally{await db('sgb_settings').where({id:1}).update({settings:initialSettings});}
   const failed=await syncSgb({fetchImpl:async()=>{throw new Error('SGB offline')},trigger:'test'}).catch(e=>e);assert.match(failed.message,/offline/);assert.equal((await db('sgb_sync_runs').orderBy('started_at','desc').first()).status,'failed');
   assert.ok(await db('audit_logs').where({action:'sgb.publication_discovered'}).first());
  });
  await t.test('SGB: configurações administrativas persistem, validam, auditam e controlam o monitor',async()=>{
   const {DEFAULT_SGB_SETTINGS}=await import('../src/services/sgb-policy.js');
   const {getSgbSettings}=await import('../src/services/sgb-settings-service.js');
   const {syncSgb,sgbFetch}=await import('../src/services/sgb-service.js');
   const headers={Authorization:`Bearer ${token}`},path=`${base}/admin/sgb/settings`;
   await db('sgb_settings').where({id:1}).update({settings:DEFAULT_SGB_SETTINGS});
   const previous=await getSgbSettings();
   await request(app).get(path).expect(401);await request(app).put(path).send({}).expect(401);
   await db('users').where({id:user.id}).update({role:'editor'});
   try{await request(app).get(path).set(headers).expect(403);await request(app).put(path).set(headers).send({}).expect(403);}finally{await db('users').where({id:user.id}).update({role:'admin'});}
   const settings={...DEFAULT_SGB_SETTINGS,enabled:false,poll_seconds:7200,adoption_mode:'review',timeout_ms:45000};
   const input={revision:previous.revision,settings,change_notes:'Pausa e periodicidade para teste isolado.'};
   try{
    await request(app).put(path).set(headers).send({...input,settings:{...settings,poll_seconds:10}}).expect(422);
    await request(app).put(path).set(headers).send({...input,change_notes:'curta'}).expect(422);
    const saved=await request(app).put(path).set(headers).send(input).expect(200);assert.deepEqual(saved.body.settings,settings);assert.equal(saved.body.revision,previous.revision+1);assert.equal(saved.body.next_check_at,null);
    const fetched=await request(app).get(path).set(headers).expect(200);assert.deepEqual(fetched.body.settings,settings);assert.deepEqual(fetched.body.defaults,DEFAULT_SGB_SETTINGS);
    await request(app).put(path).set(headers).send(input).expect(409);
    const audit=await db('audit_logs').where({action:'sgb.settings_updated',actor_id:user.id}).orderBy('id','desc').first();assert.equal(audit.details.before.enabled,true);assert.equal(audit.details.after.enabled,false);assert.equal(audit.details.change_notes,input.change_notes);
    const countBefore=await db('sgb_sync_runs').count('* as count').first();const disabled=await syncSgb({fetchImpl:()=>{throw new Error('must not fetch')}});assert.equal(disabled.reason,'disabled');assert.deepEqual(await db('sgb_sync_runs').count('* as count').first(),countBefore);
    await db('sgb_worker_state').where({id:1}).update({heartbeat_at:db.fn.now(),settings_revision:saved.body.revision});
    const status=await request(app).get(`${base}/admin/sgb/status`).set(headers).expect(200);assert.equal(status.body.worker_online,true);assert.equal(status.body.poll_seconds,7200);assert.equal(status.body.enabled,false);assert.equal(status.body.worker_settings_revision,saved.body.revision);
    let calls=0;const retrySettings={...settings,retry_attempts:2,retry_delay_ms:100};
    const response=await sgbFetch('https://www.sgb.gov.br/file',{settings:retrySettings,fetchImpl:async()=>++calls<3?new Response('',{status:503}):new Response('ok')});assert.equal(calls,3);assert.equal(response.body,'ok');
    calls=0;await assert.rejects(sgbFetch('https://www.sgb.gov.br/file',{settings:retrySettings,fetchImpl:async()=>{calls++;return new Response('',{status:404})}}));assert.equal(calls,1);
    calls=0;await assert.rejects(sgbFetch('https://www.sgb.gov.br/file',{settings:{...retrySettings,max_html_mb:1},fetchImpl:async()=>{calls++;return new Response('x'.repeat(1024*1024+1))}}),/tamanho/);assert.equal(calls,1);
    const latest=await db('sgb_sync_runs').orderBy('started_at','desc').first();assert.ok(latest.settings_snapshot);assert.equal(latest.settings_snapshot.adoption_mode,'newer');
    await db('sgb_settings').where({id:1}).update({settings:DEFAULT_SGB_SETTINGS});
    await db('sgb_sync_runs').where({id:latest.id}).update({status:'success',finished_at:db.fn.now()});
    const notDue=await syncSgb({fetchImpl:()=>{throw new Error('must not fetch')}});assert.equal(notDue.reason,'not_due');
    await db('sgb_sync_runs').where({id:latest.id}).update({status:'running'});
    const staleRun=await request(app).get(`${base}/admin/sgb/status`).set(headers).expect(200);assert.equal(staleRun.body.running,false);
    const connection=await db.client.acquireConnection();await db.raw('SELECT pg_advisory_lock(?)',[762314803]).connection(connection);
    try{const live=await request(app).get(`${base}/admin/sgb/status`).set(headers).expect(200);assert.equal(live.body.running,true);}finally{await db.raw('SELECT pg_advisory_unlock(?)',[762314803]).connection(connection);await db.client.releaseConnection(connection);await db('sgb_sync_runs').where({id:latest.id}).update({status:'success'});}

   }finally{await db('sgb_settings').where({id:1}).update({settings:previous.settings,revision:previous.revision});await db('sgb_worker_state').where({id:1}).update({heartbeat_at:null,settings_revision:null});}
  });
  await t.test('SGB: política administrativa determina a adoção real e preserva modelos inválidos',async()=>{
   const {DEFAULT_SGB_SETTINGS:defaults}=await import('../src/services/sgb-policy.js');const {importSgbDocument}=await import('../src/repositories/sgb-repository.js');
   const source=JSON.parse(await readFile(new URL('../../../data/sgb/catalog.json',import.meta.url),'utf8'));const original=source.documents.find(d=>d.municipality.name==='Alambari');
   const previousActive=await db('idf_equations').where({municipality_id:original.municipality.id,status:'active'}).first();
   let serial=0;
   function document(){const d=structuredClone(original);const scale=1.3+(serial++)/10;d.external_id=String(990000+serial);d.url=`https://rigeo.sgb.gov.br/handle/doc/${d.external_id}`;d.sha256=String(serial).repeat(64).slice(0,64);d.metadata.issued_year=2030+serial;d.publication_year=d.metadata.issued_year;for(const seg of d.models[0].segments)for(const key of ['a','b','c','d'])seg.parameters[key]*=scale;d.models[0].reference_checks=d.models[0].reference_checks.map(c=>({...c,intensity_mm_h:c.intensity_mm_h*scale}));return d;}
   const reviewed=document();await importSgbDocument(reviewed,db,{...defaults,adoption_mode:'review'});assert.equal((await db('idf_equations').where({id:previousActive.id}).first()).status,'active');
   const reviewedLink=await db('sgb_models as m').join('sgb_publication_versions as v','v.id','m.publication_version_id').where({'v.publication_id':reviewed.external_id}).first();assert.equal(reviewedLink.resolution,'alternative');
   const fill=document();await importSgbDocument(fill,db,{...defaults,adoption_mode:'fill_missing'});assert.equal((await db('idf_equations').where({id:previousActive.id}).first()).status,'active');
   const manualAllowed=document();await importSgbDocument(manualAllowed,db,{...defaults,protect_manual:false});const active=await db('idf_equations').where({municipality_id:original.municipality.id,status:'active'}).first();assert.notEqual(active.id,previousActive.id);assert.equal(active.publication_year,manualAllowed.metadata.issued_year);
   const stricter=document();await importSgbDocument(stricter,db,{...defaults,min_reference_points:2000});const linked=await db('sgb_models as m').join('sgb_publication_versions as v','v.id','m.publication_version_id').where({'v.publication_id':stricter.external_id}).first();assert.equal(linked.validated,false);assert.equal(linked.resolution,'pending');assert.equal((await db('idf_equations').where({id:active.id}).first()).status,'active');
   const sameYear=structuredClone(manualAllowed);sameYear.sha256='d'.repeat(64);for(const seg of sameYear.models[0].segments)for(const key of ['a','b','c','d'])seg.parameters[key]*=1.1;sameYear.models[0].reference_checks=sameYear.models[0].reference_checks.map(c=>({...c,intensity_mm_h:c.intensity_mm_h*1.1}));await importSgbDocument(sameYear,db,{...defaults,allow_same_year_revision:true});assert.equal((await db('idf_equations').where({id:active.id}).first()).status,'retired');
  });
  await t.test('Worker faz upsert, separa estação sem IDF, registra falhas e impede sobreposição',async()=>{
   const now=new Date('2026-11-05T17:00:00Z');const sample={station_prefix_id:'worker-test',prefix:'T1',station_name:'Teste SIBH',station_type_id:'2',city:'São Paulo',cod_ibge:'3550308',latitude:'-23.6',longitude:'-46.6',measurement_gap:10,qtd:'6',value:60,min_date:'2026-11-05T16:10:00.000Z',max_date:'2026-11-05T17:00:00.000Z'};
   const fetcher=async()=>new Response(JSON.stringify({measurements:[sample,{...sample,station_prefix_id:'unmapped',cod_ibge:'3556354',city:'Vargem'}, {...sample,value:null}]}),{status:200});
   const result=await syncSibh({fetcher,now});assert.doesNotThrow(()=>JSON.stringify(result));assert.equal(result.processed,2);assert.equal(result.classified,1);assert.equal(result.rejected,1);
   await syncSibh({fetcher,now});assert.equal(Number((await db('observations').count('* as n').first()).n),2);
   const unknown=await db('observations').where({station_id:'unmapped'}).first();assert.equal(unknown.quality,'no_equation');
   await assert.rejects(syncSibh({fetcher:async()=>new Response('{}',{status:503})}));assert.equal((await db('integration_runs').orderBy('started_at','desc').first()).status,'failed');
   await db.transaction(async trx=>{await trx.raw('SELECT pg_advisory_xact_lock(762314802)');const skipped=await syncSibh({fetcher,now});assert.equal(skipped.skipped,true);});
  });
  await t.test('SIBH: oito janelas independentes, status por janela, falha isolada e idempotência',async()=>{
   const {SIBH_WINDOWS}=await import('@chuvas/hydrology');const {syncSibhWindows,sibhUrl}=await import('../src/services/sibh-service.js');
   const now=new Date('2026-11-05T17:00:00Z'),station='multi-window-test';
   const fetcher=async url=>{const h=Number(new URL(url).searchParams.get('hours'));return new Response(JSON.stringify({measurements:[{station_prefix_id:station,prefix:'MULTI',station_name:'Teste múltiplas janelas',station_type_id:'2',city:'São Paulo',cod_ibge:'3550308',latitude:-23.6,longitude:-46.6,measurement_gap:1,qtd:h*60,value:h*2,min_date:new Date(now.getTime()-(h*60-1)*60000).toISOString(),max_date:now.toISOString()}]}));};
   const cycle=await syncSibhWindows({fetcher,now});assert.equal(cycle.status,'success');assert.deepEqual(cycle.windows.map(w=>w.query_hours),SIBH_WINDOWS);
   await syncSibhWindows({fetcher,now});assert.equal(Number((await db('observations').where({station_id:station}).count('* as n').first()).n),8);
   for(const h of SIBH_WINDOWS){
    assert.equal(new URL(sibhUrl(h)).searchParams.get('hours'),String(h));
    const r=await request(app).get(`${base}/observations?hours=${h}&limit=2000`).expect(200);assert.ok(r.body.every(o=>o.duration_minutes===h*60));const o=r.body.find(o=>o.station_id===station);assert.equal(o.depth_mm,h*2);assert.equal(o.measurement_gap,1);assert.equal(o.sample_count,h*60);assert.ok(o.first_reading_at);
    if(h>24){assert.equal(o.quality,'outside_domain');assert.equal(o.return_period,null);}
    const st=await request(app).get(`${base}/integration/status?hours=${h}`).expect(200);assert.equal(st.body.query_hours,h);assert.equal(st.body.latest.query_hours,h);assert.deepEqual(st.body.available_windows,SIBH_WINDOWS);
   }
   const legacy=await request(app).get(`${base}/observations`).expect(200);assert.ok(legacy.body.every(o=>o.duration_minutes===60));
   for(const h of ['4','0','-1','abc','72.5']){await request(app).get(`${base}/observations?hours=${h}`).expect(422);await request(app).get(`${base}/integration/status?hours=${h}`).expect(422);}
   const partial=await syncSibhWindows({now,fetcher:async url=>new URL(url).searchParams.get('hours')==='3'?new Response('{}',{status:503}):fetcher(url)});assert.equal(partial.status,'partial');assert.equal(partial.windows.filter(w=>w.status==='failed').length,1);
   const status3=await request(app).get(`${base}/integration/status?hours=3`).expect(200);assert.equal(status3.body.state,'offline');
   const status72=await request(app).get(`${base}/integration/status?hours=72`).expect(200);assert.equal(status72.body.latest.status,'success');
   assert.equal(Number((await db('observations').where({station_id:station,duration_minutes:180}).count('* as n').first()).n),1);
   const connection=await db.client.acquireConnection();await db.raw('SELECT pg_advisory_lock(762314804)').connection(connection);
   try{const skipped=await syncSibhWindows({fetcher:()=>{throw new Error('must not fetch')}});assert.equal(skipped.skipped,true);}finally{await db.raw('SELECT pg_advisory_unlock(762314804)').connection(connection);await db.client.releaseConnection(connection);}
  });
  await t.test('Editor não retira equações; logout e desativação revogam sessões',async()=>{
   await db('users').where({id:user.id}).update({role:'editor'});
   await request(app).patch(`${base}/admin/equation-families/POTENCIA_TESTE/status`).set('Authorization',`Bearer ${token}`).send({active:false}).expect(403);
   await request(app).delete(`${base}/admin/equations/3550308-v1`).set('Authorization',`Bearer ${token}`).expect(403);
   await request(app).post(`${base}/auth/logout`).set('Authorization',`Bearer ${token}`).expect(204);
   await request(app).get(`${base}/auth/me`).set('Authorization',`Bearer ${token}`).expect(401);
  });
 }finally{await db.destroy();}
});
