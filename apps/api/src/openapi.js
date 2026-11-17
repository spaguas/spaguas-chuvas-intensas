const ref=name=>({$ref:`#/components/schemas/${name}`});
const json=schema=>({'application/json':{schema}});
const response=(schema,description='Sucesso')=>({description,content:json(schema)});
const body=schema=>({required:true,content:json(schema)});
const param=(name,type='string',location='path',required=true)=>({name,in:location,required,schema:{type}});
const object=(properties,required=Object.keys(properties))=>({type:'object',properties,required});
const n={type:'number'},s={type:'string'};
const error={description:'Solicitação inválida, acesso negado ou recurso indisponível.',content:json(ref('Error'))};
const paths={};
function route(path,method,summary,{schema={type:'object'},request,parameters=[],auth=false,status=200,tag='Público'}={}){
 paths[path]??={};paths[path][method]={summary,tags:[tag],parameters,security:auth?[{bearerAuth:[]}]:[],responses:{[status]:status===204?{description:'Concluído'}:response(schema),400:error,401:error,403:error,404:error,422:error,429:error,500:error},...(request?{requestBody:body(request)}:{})};
}
route('/health','get','Verifica a conexão com PostgreSQL',{schema:object({status:s})});
route('/branding','get','Identidade visual pública; URLs sob /chuvas_intensas/api',{schema:ref('Branding')});
route('/admin/branding','get','Consulta imagens para edição; apenas administrador',{auth:true,tag:'Operacional',schema:ref('BrandingAdmin')});
route('/admin/branding','put','Salva logotipo e favicon com auditoria; null restaura o padrão; apenas administrador',{auth:true,tag:'Operacional',schema:ref('Branding'),request:ref('BrandingInput')});
route('/branding/{kind}','get','Imagem pública configurada; PNG, JPEG, WebP ou ICO',{parameters:[{name:'kind',in:'path',required:true,schema:{type:'string',enum:['logo','favicon']}}]});
paths['/branding/{kind}'].get.responses[200]={description:'Imagem configurada',content:Object.fromEntries(['image/png','image/jpeg','image/webp','image/x-icon','image/vnd.microsoft.icon'].map(mime=>[mime,{schema:{type:'string',format:'binary'}}]))};
route('/auth/login','post','Autentica um operador; JWT expira em 15 minutos',{request:object({email:{type:'string',format:'email'},password:{type:'string',maxLength:72}}),schema:object({token:s,expires_in:n,user:ref('User')}),tag:'Autenticação'});
route('/auth/me','get','Retorna a sessão atual',{auth:true,schema:ref('User'),tag:'Autenticação'});
route('/auth/logout','post','Revoga todos os JWTs do usuário',{auth:true,status:204,tag:'Autenticação'});
route('/municipalities','get','Lista localidades DAEE/CTH e SGB e o estado da equação',{schema:{type:'array',items:ref('Municipality')}});
route('/municipalities/{id}/equation','get','Consulta a versão ativa ou a última versão municipal',{schema:ref('Equation'),parameters:[param('id')]});
const input=object({municipality_id:s,duration:{type:'number',exclusiveMinimum:0,maximum:10080},return_period:{type:'number',exclusiveMinimum:1,maximum:10000}});
route('/idf/calculate','post','Calcula intensidade (mm/h), altura (mm) e probabilidade anual',{request:input,schema:ref('Calculation')});
route('/idf/return-period','post','Inverte a IDF com busca limitada ao domínio; não extrapola',{request:object({municipality_id:s,duration:n,depth_mm:{type:'number',minimum:0}}),schema:ref('ReturnEstimate')});
route('/idf/spatial-return-period','post','Identifica município por polígono e interpola retornos locais por IDW; propaga limites sem extrapolar',{tag:'Espacial',request:ref('SpatialInput'),schema:ref('SpatialResponse')});
route('/spatial/reference-stations','get','Postos IDF com coordenadas transcritas, versões e avisos de georreferenciamento',{tag:'Espacial',schema:object({source:ref('GeographySource'),stations:{type:'array',items:ref('ReferenceStation')}})});
route('/spatial/municipalities','get','645 polígonos municipais simplificados do IBGE; snapshot local',{tag:'Espacial',schema:ref('MunicipalBoundaries')});
route('/idf/curves','get','Gera curvas padronizadas para duração ou retorno',{parameters:[param('municipality_id','string','query'),{name:'mode',in:'query',schema:{type:'string',enum:['duration','return'],default:'duration'}},{name:'duration',in:'query',schema:{type:'number',default:60}}],schema:object({series:{type:'array',items:n},rows:{type:'array',items:{type:'object',additionalProperties:n}}})});
route('/observations','get','Última observação por estação, com qualidade e indicação de defasagem',{parameters:[param('municipality_id','string','query',false),param('limit','integer','query',false),param('offset','integer','query',false)],schema:{type:'array',items:ref('Observation')}});
route('/integration/status','get','Estado público da sincronização SIBH',{schema:object({state:{type:'string',enum:['waiting','current','stale','offline']},poll_seconds:n,last_success_at:{type:['string','null'],format:'date-time'},latest:{anyOf:[ref('IntegrationRun'),{type:'null'}]}})});
route('/admin/equations','get','Histórico de versões das equações',{auth:true,tag:'Operacional',schema:{type:'array',items:ref('Equation')}});
route('/admin/equations/{id}','get','Obtém uma versão completa',{auth:true,tag:'Operacional',parameters:[param('id')],schema:ref('Equation')});
route('/admin/equations','post','Cadastra nova versão; publicação exige validação numérica',{auth:true,tag:'Operacional',request:ref('EquationInput'),schema:ref('Equation'),status:201});
route('/admin/equations/{id}','put','Edita criando nova versão e preservando coeficientes anteriores',{auth:true,tag:'Operacional',parameters:[param('id')],request:ref('EquationInput'),schema:ref('Equation'),status:201});
route('/admin/equations/{id}','delete','Retira equação de uso; apenas administrador',{auth:true,tag:'Operacional',parameters:[param('id')],status:204});
route('/admin/integration/runs','get','Últimas 100 execuções do worker',{auth:true,tag:'Operacional',schema:{type:'array',items:ref('IntegrationRun')}});
route('/admin/audit','get','Últimos 100 registros de auditoria; apenas administrador',{auth:true,tag:'Operacional',schema:{type:'array',items:object({id:s,actor_id:s,action:s,entity_id:s,details:{type:'object'},created_at:{type:'string',format:'date-time'}})}});
route('/admin/equation-families','get','Lista famílias, definições versionadas e quantidade de trechos vinculados',{auth:true,tag:'Operacional',schema:{type:'array',items:ref('EquationFamily')}});
route('/admin/equation-families','post','Cadastra família com expressão matemática e variáveis declaradas',{auth:true,tag:'Operacional',request:ref('FamilyInput'),schema:ref('FamilyDefinition'),status:201});
route('/admin/equation-families/{code}','put','Cria nova versão imutável da definição sem alterar equações anteriores',{auth:true,tag:'Operacional',parameters:[param('code')],request:ref('FamilyInput'),schema:ref('FamilyDefinition'),status:201});
route('/admin/equation-families/{code}/status','patch','Ativa/desativa a família para novos vínculos; apenas administrador',{auth:true,tag:'Operacional',parameters:[param('code')],request:object({active:{type:'boolean'}}),schema:object({code:s,active:{type:'boolean'},is_builtin:{type:'boolean'},created_at:{type:'string',format:'date-time'}})});
route('/admin/equation-families/preview','post','Avalia expressão e coeficientes sem salvar; duração em min e retorno em anos',{auth:true,tag:'Operacional',request:ref('FamilyPreviewInput'),schema:object({intensity_mm_h:n,depth_mm:n,duration:n,return_period:n})});
route('/openapi.json','get','Contrato OpenAPI desta API');
const equationFields={municipality_id:{type:'string',pattern:'^35[0-9]{5}$'},status:{type:'string',enum:['active','pending']},return_min:{type:'number',exclusiveMinimum:1},return_max:{type:'number',maximum:10000},station_name:s,station_prefix:s,source_page:{type:'integer',minimum:1},source_pdf_page:{type:'integer',minimum:1},source_author:s,source_formula:s,review_notes:s,segments:{type:'array',minItems:1,maxItems:10,items:ref('Segment')},reference_checks:{type:'array',items:object({duration:n,return_period:n,intensity_mm_h:n})}};
export const openapi={openapi:'3.1.0',info:{title:'Precipitações Intensas · SP-ÁGUAS',version:'1.0.0',description:'DAEE/CTH. Durações em minutos, retorno em anos. Equações pendentes não podem ser usadas. GUMBEL: A(t+B)^C+D(t+E)^F[G+H ln ln(T/(T−1))]. GENERAL_V1: C T^m / (t+to)^(n+k T^d)+p. A unidade de cada trecho é convertida para mm/h. Observações agregadas do SIBH são estimativas indicativas, sem garantia de continuidade amostral.'},servers:[{url:'/chuvas_intensas/api'}],tags:[{name:'Público'},{name:'Autenticação'},{name:'Operacional'}],paths,components:{securitySchemes:{bearerAuth:{type:'http',scheme:'bearer',bearerFormat:'JWT'}},schemas:{
 Error:object({error:s,code:s,details:{type:'array',items:{type:'object'}}},['error']),
 Branding:object({logo_url:{type:['string','null']},favicon_url:{type:['string','null']},updated_at:{type:['string','null'],format:'date-time'}}),
 BrandingInput:{...object({logo:{type:['string','null'],maxLength:1400000,description:'Imagem data URI base64, PNG/JPEG/WebP/ICO, até 1 MB; null para padrão.'},favicon:{type:['string','null'],maxLength:350000,description:'Imagem data URI base64, PNG/JPEG/WebP/ICO, até 256 KB; null para padrão.'}}),additionalProperties:false},
 BrandingAdmin:object({logo_url:{type:['string','null']},favicon_url:{type:['string','null']},updated_at:{type:['string','null'],format:'date-time'},logo:{type:['string','null']},favicon:{type:['string','null']}}),
 User:object({id:s,name:s,email:{type:'string',format:'email'},role:{type:'string',enum:['admin','editor']}}),
 Municipality:object({id:s,ibge_code:s,name:s,latitude:{type:['number','null']},longitude:{type:['number','null']},status:{type:['string','null']},equation_id:s,station_name:s,station_prefix:s,version:n}),
 Segment:{oneOf:[['GUMBEL',['A','B','C','D','E','F','G','H']],['GENERAL',['C','to','n','k','m','d','p']]].map(([family,keys])=>({...object({family:{type:'string',const:family},unit:{type:'string',enum:['mm_min','mm_h']},duration_min:{type:'number',exclusiveMinimum:0,maximum:10080},duration_max:{type:'number',exclusiveMinimum:0,maximum:10080},parameters:{...object(Object.fromEntries(keys.map(k=>[k,{type:'number',minimum:-1e7,maximum:1e7}]))),additionalProperties:false}}),additionalProperties:false}))},
 EquationInput:{...object(equationFields),additionalProperties:false},
 Equation:object({...equationFields,status:{type:'string',enum:['active','pending','retired']},id:s,version:n}),
 Calculation:object({duration:n,return_period:n,intensity_mm_h:n,depth_mm:n,annual_exceedance_probability:n,equation_id:s,version:n}),
 ReturnEstimate:object({return_period:{type:['number','null']},bound:{type:'string',enum:['below','within','above']},limit:{type:['number','null']},classification:s}),
 IntegrationRun:object({id:s,started_at:{type:'string',format:'date-time'},finished_at:{type:['string','null'],format:'date-time'},status:{type:'string',enum:['running','success','partial','failed']},received:n,processed:n,classified:n,rejected:n,error:{type:['string','null']},duration_ms:{type:['integer','null']}}),
 Observation:object({id:s,station_id:s,station_name:s,prefix:s,city:s,municipality_id:{type:['string','null']},observed_at:{type:'string',format:'date-time'},depth_mm:n,return_period:{type:['number','null']},return_bound:{type:['string','null']},return_limit:{type:['number','null']},classification:s,quality:s,quality_note:s,is_stale:{type:'boolean'},latitude:{type:['number','null']},longitude:{type:['number','null']}})
}}};
openapi.tags.push({name:'Espacial'});
Object.assign(openapi.components.schemas,{
 SpatialInput:{...object({latitude:{type:'number',minimum:-90,maximum:90},longitude:{type:'number',minimum:-180,maximum:180},duration:{type:'number',exclusiveMinimum:0,maximum:10080},depth_mm:{type:'number',minimum:0,maximum:10000},neighbors:{type:'integer',minimum:3,maximum:12,default:5},power:{type:'number',minimum:1,maximum:4,default:2},radius_km:{type:'number',minimum:5,maximum:300,default:100}},['latitude','longitude','duration','depth_mm']),additionalProperties:false},
 GeographySource:object({provider:s,source_url:{type:'string',format:'uri'},names_url:{type:'string',format:'uri'},retrieved_on:{type:'string',format:'date'},coordinate_reference:s,quality:s,feature_count:n,original_sha256:s,local_sha256:s,note:s}),
 ReferenceStation:object({municipality_id:s,municipality_name:s,latitude:{type:['number','null']},longitude:{type:['number','null']},equation_id:s,equation_version:n,status:{type:'string',enum:['active','pending','retired']},station_name:s,station_prefix:s,coordinate_warning:{type:['string','null']},duration_min:n,duration_max:n}),
 SpatialContribution:object({municipality_id:s,municipality_name:s,latitude:n,longitude:n,equation_id:s,equation_version:n,station_name:s,station_prefix:s,source_pdf_page:n,distance_km:n,weight:{type:['number','null']},return_period:{type:['number','null']},bound:{type:'string',enum:['below','within','above']},limit:{type:['number','null']},contribution_years:{type:['number','null']},classification:s,coordinate_warning:{type:['string','null']}}),
 SpatialEstimate:object({return_period:{type:['number','null']},lower_bound:n,upper_bound:{type:['number','null']},bound:{type:'string',enum:['within','below','above','interval']},censored:{type:'boolean'}}),
 SpatialResponse:object({status:{type:'string',enum:['estimated','bounded','insufficient_neighbors']},point:object({latitude:n,longitude:n}),municipality:object({id:s,name:s}),local_equation_status:{type:'string',enum:['active','pending','retired','not_registered']},duration:n,depth_mm:n,intensity_mm_h:n,estimate:{anyOf:[ref('SpatialEstimate'),{type:'null'}]},parameters:object({neighbors:n,power:n,radius_km:n,minimum_neighbors:n,distance_method:{type:'string',const:'haversine'},target:{type:'string',const:'local_return_period_years'}}),stations:{type:'array',items:ref('SpatialContribution')},excluded_stations:{type:'array',items:object({municipality_id:s,municipality_name:s,distance_km:{type:['number','null']},reason:{type:'string',enum:['missing_coordinates','inactive_equation','outside_radius','invalid_equation_or_duration','beyond_neighbor_count','duplicate_reference_location']}})},effective_neighbors:{type:['number','null']},warning:s,geography_source:ref('GeographySource')}),
 MunicipalBoundaries:object({type:{type:'string',const:'FeatureCollection'},features:{type:'array',items:object({type:{type:'string',const:'Feature'},properties:object({codarea:s,name:s}),geometry:object({type:{type:'string',enum:['Polygon','MultiPolygon']},coordinates:{type:'array',items:{type:'array'}}})})}})
});
const coefficient={type:'number',minimum:-1e12,maximum:1e12};
const familyVariable=object({name:{type:'string',pattern:'^[A-Za-z][A-Za-z0-9_]{0,31}$',description:'Símbolo sensível a maiúsculas. t, T, funções e constantes são reservados.'},label:{type:'string',maxLength:100,default:''},unit:{type:'string',maxLength:40,default:''},default_value:{...coefficient,default:0},min_value:{...coefficient,default:-1e7},max_value:{...coefficient,default:1e7}},['name']);
const formulaFields={expression:{type:'string',minLength:1,maxLength:500,description:'Aritmética com + - * / ^, parênteses, t, T e coeficientes declarados. Funções: ln, log, log10, log1p, exp, sqrt, abs, pow, min, max. Constantes pi e e. Sem JavaScript, atribuições ou acesso a objetos.'},variables:{type:'array',maxItems:24,items:{...familyVariable,additionalProperties:false}},default_unit:{type:'string',enum:['mm_min','mm_h']}};
const familyFields={name:{type:'string',minLength:2,maxLength:120},description:{type:'string',maxLength:3000,default:''},...formulaFields,change_notes:{type:'string',maxLength:5000,default:''}};
const segmentFields={family:{type:'string',pattern:'^[A-Z][A-Z0-9_]{2,39}$'},family_version_id:{type:'string',format:'uuid',description:'Versão imutável selecionada. Obrigatória para famílias cadastradas. Para clientes legados, omitir em GUMBEL/GENERAL resolve a versão 1, nunca a última versão.'},unit:{type:'string',enum:['mm_min','mm_h']},duration_min:{type:'number',exclusiveMinimum:0,maximum:10080},duration_max:{type:'number',exclusiveMinimum:0,maximum:10080},parameters:{type:'object',additionalProperties:coefficient,description:'Exatamente os símbolos e limites da versão selecionada.'}};
Object.assign(openapi.components.schemas,{
 FamilyVariable:{...familyVariable,additionalProperties:false},
 FormulaDefinition:{...object(formulaFields),additionalProperties:false},
 FamilyInput:{...object({code:{type:'string',pattern:'^[A-Z][A-Z0-9_]{2,39}$'},...familyFields},['code','name','expression','variables','default_unit']),additionalProperties:false},
 FamilyDefinition:object({id:{type:'string',format:'uuid'},family_code:s,version:{type:'integer',minimum:1},...familyFields,created_at:{type:'string',format:'date-time'},usage_count:{type:'integer',minimum:0}},['id','family_code','version','name','description','expression','variables','default_unit','change_notes']),
 EquationFamily:object({code:s,active:{type:'boolean'},is_builtin:{type:'boolean'},created_at:{type:'string',format:'date-time'},latest:ref('FamilyDefinition'),versions:{type:'array',items:ref('FamilyDefinition')},usage_count:{type:'integer',minimum:0}}),
 FamilyPreviewInput:{...object({definition:ref('FormulaDefinition'),parameters:{type:'object',additionalProperties:coefficient},duration:{type:'number',exclusiveMinimum:0,maximum:10080},return_period:{type:'number',exclusiveMinimum:1,maximum:10000},unit:{type:'string',enum:['mm_min','mm_h']}}),additionalProperties:false},
 SegmentInput:{...object(segmentFields,['family','unit','duration_min','duration_max','parameters']),additionalProperties:false},
 Segment:{...object({...segmentFields,family_definition:ref('FamilyDefinition')}),additionalProperties:false}
});
openapi.components.schemas.EquationInput.properties.segments.items=ref('SegmentInput');
// Both equation schemas originally shared this property object; detach the response before setting its item contract.
openapi.components.schemas.Equation.properties.segments={...openapi.components.schemas.Equation.properties.segments,items:ref('Segment')};
openapi.info.description+=' Famílias adicionais são cadastradas na área operacional e vinculadas por versão imutável. As expressões são interpretadas por uma gramática aritmética limitada, sem execução de JavaScript.';

const sourceFields={source_url:{type:['string','null'],format:'uri',description:'PDF da publicação selecionada; HTTPS. Ausente usa o estudo DAEE/CTH.'},publication_year:{type:['integer','null'],minimum:1900,maximum:2200},source_agency:{type:'string'},station_latitude:{type:['number','null'],minimum:-90,maximum:90},station_longitude:{type:['number','null'],minimum:-180,maximum:180}};
Object.assign(openapi.components.schemas.EquationInput.properties,sourceFields);
Object.assign(openapi.components.schemas.Equation.properties,sourceFields);
Object.assign(openapi.components.schemas.SpatialContribution.properties,{source_url:sourceFields.source_url,publication_year:sourceFields.publication_year,source_agency:s});
openapi.components.schemas.EquationInput.required=openapi.components.schemas.EquationInput.required.filter(k=>!Object.hasOwn(sourceFields,k));
const sgbRun=object({id:s,started_at:{type:'string',format:'date-time'},finished_at:{type:['string','null'],format:'date-time'},status:{type:'string',enum:['running','success','partial','failed']},discovered:n,changed:n,unchanged:n,imported:n,duplicates:n,pending:n,failed:n,errors:{type:'array',items:{type:'object'}},trigger:s});
const sgbPublication=object({external_id:s,municipality_id:{type:['string','null']},municipality_name:s,url:s,listing_year:n,method:s,present_on_site:{type:'boolean'},last_error:{type:['string','null']},last_checked_at:{type:['string','null'],format:'date-time'},publication_version_id:{type:['string','null']},sha256:{type:['string','null']},issued_year:{type:['integer','null']},metadata:{type:['object','null']},pdf_url:{type:['string','null']},issues:{type:['array','null'],items:s},model_key:{type:['string','null']},equation_id:{type:['string','null']},resolution:{type:['string','null'],enum:['imported','duplicate','pending','alternative',null]},validated:{type:['boolean','null']},validation:{type:['object','null']},equation_status:{type:['string','null']}});
Object.assign(openapi.components.schemas,{SgbRun:sgbRun,SgbPublication:sgbPublication,SgbStatus:object({publications:n,versions:n,pending_models:n,poll_seconds:n,latest:{anyOf:[ref('SgbRun'),{type:'null'}]}})});
const boundedInteger=(minimum,maximum)=>({type:'integer',minimum,maximum});
const sgbSettingsProperties={enabled:{type:'boolean'},poll_seconds:boundedInteger(3600,2592000),failure_retry_seconds:boundedInteger(60,2592000),timeout_ms:boundedInteger(1000,180000),max_pdf_mb:boundedInteger(1,50),max_html_mb:boundedInteger(1,10),retry_attempts:boundedInteger(0,3),retry_delay_ms:boundedInteger(100,30000),request_delay_ms:boundedInteger(0,30000),max_catalog_shrink_percent:{type:'number',minimum:0,maximum:50},conditional_requests:{type:'boolean'},ocr_enabled:{type:'boolean'},ocr_max_pages:boundedInteger(1,100),extraction_timeout_seconds:boundedInteger(10,180),adoption_mode:{type:'string',enum:['review','fill_missing','newer']},protect_manual:{type:'boolean'},allow_same_year_revision:{type:'boolean'},min_reference_points:boundedInteger(12,2000),absolute_tolerance:{type:'number',exclusiveMinimum:0,maximum:.25},relative_tolerance_percent:{type:'number',exclusiveMinimum:0,maximum:1}};
const runtimeProperties={revision:boundedInteger(1,2147483647),updated_at:{type:'string',format:'date-time'},settings:ref('SgbSettings'),enabled:{type:'boolean'},poll_seconds:n,next_check_at:{type:['string','null'],format:'date-time'},worker_online:{type:'boolean'},worker_heartbeat_at:{type:['string','null'],format:'date-time'},worker_settings_revision:{type:['integer','null']},running:{type:'boolean'}};
Object.assign(openapi.components.schemas,{
 SgbSettings:{...object(sgbSettingsProperties),additionalProperties:false},
 SgbSettingsUpdate:{...object({revision:boundedInteger(1,2147483647),settings:ref('SgbSettings'),change_notes:{type:'string',minLength:10,maxLength:2000}}),additionalProperties:false},
 SgbConfiguration:object({...runtimeProperties,defaults:ref('SgbSettings')})
});
Object.assign(openapi.components.schemas.SgbStatus.properties,runtimeProperties);
Object.assign(openapi.components.schemas.SgbRun.properties,{settings_revision:{type:['integer','null']},settings_snapshot:{anyOf:[ref('SgbSettings'),{type:'null'}]}});
route('/admin/sgb/settings','get','Configuração persistida, valores padrão e estado do monitor; somente admin',{auth:true,tag:'SGB',schema:ref('SgbConfiguration')});
route('/admin/sgb/settings','put','Configura periodicidade, downloads, OCR, validação e adoção; exige revisão atual e justificativa; somente admin',{auth:true,tag:'SGB',schema:ref('SgbConfiguration'),request:ref('SgbSettingsUpdate')});
paths['/admin/sgb/settings'].put.responses[409]=error;
route('/admin/sgb/publications','get','Publicações SGB por ano bibliográfico e município, histórico, compatibilização e validação',{auth:true,tag:'SGB',parameters:[param('year','integer','query',false),param('municipality_id','string','query',false)],schema:{type:'array',items:ref('SgbPublication')}});
route('/admin/sgb/status','get','Estado do monitor de publicações SGB e intervalo configurado',{auth:true,tag:'SGB',schema:ref('SgbStatus')});
route('/admin/sgb/runs','get','Últimas 100 verificações SGB, contadores e falhas por documento',{auth:true,tag:'SGB',schema:{type:'array',items:ref('SgbRun')}});
openapi.info.description+=' O catálogo SGB preserva ano bibliográfico, versões do PDF, SHA-256 e validações independentes. A proteção de publicações manuais é habilitada por padrão e pode ser configurada por administradores, com auditoria. Postos na mesma coordenada contribuem uma única vez no IDW.';

const hoursParameter={name:'hours',in:'query',required:false,schema:{type:'integer',enum:[1,2,3,6,12,24,48,72],default:1},description:'Janela de acumulação em horas. As observações e o estado da integração são independentes para cada janela.'};
paths['/observations'].get.parameters.push(hoursParameter);
paths['/integration/status'].get.parameters.push(hoursParameter);
paths['/observations'].get.summary='Última observação por estação na janela selecionada, sem misturar durações';
Object.assign(openapi.components.schemas.Observation.properties,{duration_minutes:{type:'integer',enum:[60,120,180,360,720,1440,2880,4320]}});
openapi.components.schemas.Observation.required.push('duration_minutes');
Object.assign(openapi.components.schemas.IntegrationRun.properties,{query_hours:{type:'integer',enum:[1,2,3,6,12,24,48,72]}});
openapi.components.schemas.IntegrationRun.required.push('query_hours');
const statusSchema=paths['/integration/status'].get.responses[200].content['application/json'].schema;
Object.assign(statusSchema.properties,{query_hours:{type:'integer',enum:[1,2,3,6,12,24,48,72]},available_windows:{type:'array',items:{type:'integer',enum:[1,2,3,6,12,24,48,72]}}});
statusSchema.required.push('query_hours','available_windows');
openapi.info.description+=' O SIBH é consultado separadamente para 1, 2, 3, 6, 12, 24, 48 e 72 horas. Acumulados de 48h/72h continuam visíveis quando excedem o domínio IDF; nesse caso não há estimativa de retorno.';

Object.assign(openapi.components.schemas.Observation.properties,{first_reading_at:{type:'string',format:'date-time'},measurement_gap:{type:'integer',description:'Intervalo amostral, em minutos.'},sample_count:{type:'integer',description:'Quantidade de amostras agregadas pelo provedor.'},duration_minutes:{type:'integer',description:'Janela de acumulação em minutos.'}});
