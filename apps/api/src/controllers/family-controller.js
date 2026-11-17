import { z } from 'zod';
import * as repo from '../repositories/family-repository.js';
import * as service from '../services/family-service.js';
export async function list(req,res){res.json(await repo.listFamilies());}
export async function create(req,res){res.status(201).json(await service.saveFamily(req.body,req.user.id,{create:true}));}
export async function revise(req,res){if(req.body.code!==req.params.code)return res.status(422).json({error:'O código da família não pode mudar em uma revisão.'});res.status(201).json(await service.saveFamily(req.body,req.user.id));}
export function preview(req,res){res.json(service.previewFamily(req.body));}
export async function status(req,res){const {active}=z.object({active:z.boolean()}).strict().parse(req.body);res.json(await repo.setFamilyActive(req.params.code,active,req.user.id));}
