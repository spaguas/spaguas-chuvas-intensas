import { z } from 'zod';
import { evaluateSegment,validateFamilyDefinition } from '@chuvas/hydrology';
import * as repo from '../repositories/family-repository.js';
const finite=z.number().min(-1e12).max(1e12);
const variable=z.object({name:z.string().min(1).max(32),label:z.string().max(100).default(''),unit:z.string().max(40).default(''),default_value:finite.default(0),min_value:finite.default(-1e7),max_value:finite.default(1e7)}).strict();
const definition=z.object({name:z.string().trim().min(2).max(120),description:z.string().max(3000).default(''),expression:z.string().trim().min(1).max(500),variables:z.array(variable).max(24),default_unit:z.enum(['mm_min','mm_h']),change_notes:z.string().max(5000).default('')}).strict();
export const familyInput=definition.extend({code:z.string().regex(/^[A-Z][A-Z0-9_]{2,39}$/,'Use um código de 3 a 40 caracteres, com letras maiúsculas, números e sublinhado.')});
export async function saveFamily(input,actor,options){
 const data=familyInput.parse(input);validateFamilyDefinition(data);return repo.saveFamily(data,actor,options);
}
export function previewFamily(input){
 const parsed=z.object({definition:definition.pick({expression:true,variables:true,default_unit:true}),parameters:z.record(z.string(),finite),duration:z.number().positive().max(10080),return_period:z.number().gt(1).max(10000),unit:z.enum(['mm_min','mm_h'])}).strict().parse(input);
 validateFamilyDefinition(parsed.definition);
 const intensity=evaluateSegment({family:'PREVIEW',family_definition:parsed.definition,parameters:parsed.parameters,unit:parsed.unit},parsed.duration,parsed.return_period);
 return {intensity_mm_h:intensity,depth_mm:intensity*parsed.duration/60,duration:parsed.duration,return_period:parsed.return_period};
}
