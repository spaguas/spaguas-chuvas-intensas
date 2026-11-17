import { z } from 'zod';
import { validateEquation,calculate,validateFamilyParameters } from '@chuvas/hydrology';
import * as repo from '../repositories/catalog-repository.js';
import { definitionsForSegments } from '../repositories/family-repository.js';
const segment=z.object({family:z.string().regex(/^[A-Z][A-Z0-9_]{2,39}$/),family_version_id:z.uuid().optional(),unit:z.enum(['mm_min','mm_h']),duration_min:z.number().positive().max(10080),duration_max:z.number().positive().max(10080),parameters:z.record(z.string(),z.number().min(-1e12).max(1e12))}).strict().superRefine((s,ctx)=>{
 if(s.duration_max<=s.duration_min)ctx.addIssue({code:'custom',path:['duration_max'],message:'O limite superior deve ser maior que o inferior.'});
});
export const equationInput=z.object({municipality_id:z.string().regex(/^35\d{5}$/),status:z.enum(['active','pending']),return_min:z.number().gt(1),return_max:z.number().max(10000),station_name:z.string().min(2).max(300),station_prefix:z.string().max(50),source_page:z.number().int().positive(),source_pdf_page:z.number().int().positive(),source_author:z.string().min(3).max(300),source_formula:z.string().min(5).max(10000),review_notes:z.string().max(5000),segments:z.array(segment).min(1).max(10),source_url:z.url().refine(u=>new URL(u).protocol==='https:','A fonte deve usar HTTPS.').nullable().optional(),publication_year:z.number().int().min(1900).max(2200).nullable().optional(),source_agency:z.string().min(2).max(100).optional(),station_latitude:z.number().min(-90).max(90).nullable().optional(),station_longitude:z.number().min(-180).max(180).nullable().optional(),reference_checks:z.array(z.object({duration:z.number().positive(),return_period:z.number().gt(1),intensity_mm_h:z.number().positive()})).max(1000)}).strict().refine(d=>d.return_max>d.return_min,{path:['return_max'],message:'O retorno máximo deve exceder o mínimo.'});
export async function publishEquation(input,actor){
 const data=equationInput.parse(input);
 data.segments=await definitionsForSegments(data.segments);
 for(const s of data.segments)validateFamilyParameters(s.family_definition,s.parameters);
 if(data.status==='active'){
  validateEquation(data);
  if(new Set(data.reference_checks.map(c=>`${c.duration}:${c.return_period}`)).size<3)throw Object.assign(new Error('Inclua pelo menos três pontos independentes de referência para publicar.'),{status:422});
  for(const c of data.reference_checks){const calculated=calculate(data,c.duration,c.return_period).intensity_mm_h;if(Math.abs(calculated-c.intensity_mm_h)>Math.max(.25,c.intensity_mm_h*.01))throw Object.assign(new Error('A equação diverge dos pontos de referência informados. Revise os coeficientes e a unidade.'),{status:422});}
  if(!data.review_notes.trim())throw Object.assign(new Error('Registre a justificativa da revisão técnica.'),{status:422});
 }
 return repo.saveEquation(data,actor);
}
