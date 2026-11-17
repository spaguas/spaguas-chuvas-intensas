import { z } from 'zod';
export const sgbSettingsSchema=z.object({
 enabled:z.boolean(),poll_seconds:z.number().int().min(3600).max(2592000),
 failure_retry_seconds:z.number().int().min(60).max(2592000),timeout_ms:z.number().int().min(1000).max(180000),
 max_pdf_mb:z.number().int().min(1).max(50),max_html_mb:z.number().int().min(1).max(10),
 retry_attempts:z.number().int().min(0).max(3),retry_delay_ms:z.number().int().min(100).max(30000),
 request_delay_ms:z.number().int().min(0).max(30000),max_catalog_shrink_percent:z.number().min(0).max(50),
 conditional_requests:z.boolean(),ocr_enabled:z.boolean(),ocr_max_pages:z.number().int().min(1).max(100),
 extraction_timeout_seconds:z.number().int().min(10).max(180),
 adoption_mode:z.enum(['review','fill_missing','newer']),protect_manual:z.boolean(),allow_same_year_revision:z.boolean(),
 min_reference_points:z.number().int().min(12).max(2000),absolute_tolerance:z.number().positive().max(.25),relative_tolerance_percent:z.number().positive().max(1)
}).strict();
export const DEFAULT_SGB_SETTINGS=Object.freeze({enabled:true,poll_seconds:86400,failure_retry_seconds:3600,timeout_ms:90000,max_pdf_mb:20,max_html_mb:5,retry_attempts:0,retry_delay_ms:1000,request_delay_ms:0,max_catalog_shrink_percent:20,conditional_requests:true,ocr_enabled:true,ocr_max_pages:40,extraction_timeout_seconds:60,adoption_mode:'newer',protect_manual:true,allow_same_year_revision:false,min_reference_points:12,absolute_tolerance:.25,relative_tolerance_percent:1});
export function nextSgbCheck(settings,latest){
 if(!settings.enabled)return null;
 if(!latest)return new Date(0);
 const interval=latest.status==='failed'||latest.status==='partial'?settings.failure_retry_seconds:settings.poll_seconds;
 return new Date(new Date(latest.finished_at||latest.started_at).getTime()+interval*1000);
}
export function sgbAdoptionDecision(settings,{validated,modelCount,active,year,samePublication=false}){
 if(!validated)return {activate:false,reason:'Modelo reprovado na validação numérica.'};
 if(modelCount!==1)return {activate:false,reason:'Relatório com múltiplos modelos exige escolha técnica.'};
 if(settings.adoption_mode==='review')return {activate:false,reason:'Política exige revisão antes da adoção.'};
 if(!active)return {activate:true,reason:'Município sem equação ativa.'};
 if(settings.protect_manual&&active.managed_by==='manual')return {activate:false,reason:'Equação manual protegida pela configuração.'};
 if(settings.adoption_mode==='fill_missing')return {activate:false,reason:'Política permite adoção apenas em municípios sem equação ativa.'};
 if(year>(active.publication_year||0))return {activate:true,reason:'Publicação com ano bibliográfico mais recente.'};
 if(settings.allow_same_year_revision&&active.managed_by==='sgb'&&year===active.publication_year&&samePublication)return {activate:true,reason:'Nova revisão do mesmo relatório SGB no mesmo ano.'};
 return {activate:false,reason:'Publicação não é mais recente que a equação ativa.'};
}
