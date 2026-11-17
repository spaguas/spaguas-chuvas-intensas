import { z } from 'zod';
import { calculate,estimateReturnPeriod,buildCurves } from '@chuvas/hydrology';
import { getMunicipalityEquation } from '../repositories/catalog-repository.js';
const base=z.object({municipality_id:z.string().regex(/^35\d{5}$/),duration:z.number().positive().max(10080)});
async function load(id){const e=await getMunicipalityEquation(id);if(!e)throw Object.assign(new Error('Município ou equação não encontrado.'),{status:404});return e;}
export async function calculation(req,res){const d=base.extend({return_period:z.number().gt(1).max(10000)}).parse(req.body);res.json(calculate(await load(d.municipality_id),d.duration,d.return_period));}
export async function inverse(req,res){const d=base.extend({depth_mm:z.number().nonnegative().max(10000)}).parse(req.body);res.json(estimateReturnPeriod(await load(d.municipality_id),d.duration,d.depth_mm));}
export async function curves(req,res){const d=z.object({municipality_id:z.string().regex(/^35\d{5}$/),mode:z.enum(['duration','return']).default('duration'),duration:z.coerce.number().positive().max(10080).default(60)}).parse(req.query);res.json(buildCurves(await load(d.municipality_id),d.mode,d.duration));}
