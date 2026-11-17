import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { db } from '../db.js';
import { config } from '../config.js';
const dummyHash=await bcrypt.hash(crypto.randomUUID(),12);
export async function login(req,res){
 const data=z.object({email:z.email().max(254).transform(v=>v.toLowerCase()),password:z.string().min(1).max(72).refine(v=>Buffer.byteLength(v,'utf8')<=72,'A senha deve ter no máximo 72 bytes em UTF-8.')}).parse(req.body);
 const user=await db('users').where({email:data.email,active:true}).first();
 const correct=await bcrypt.compare(data.password,user?.password_hash||dummyHash);
 if(!user||!correct)return res.status(401).json({error:'E-mail ou senha inválidos.'});
 const token=jwt.sign({ver:user.auth_version},config.JWT_SECRET,{subject:user.id,algorithm:'HS256',expiresIn:'15m',issuer:'chuvas-intensas',audience:'operacional'});
 await db('audit_logs').insert({actor_id:user.id,action:'auth.login',entity_id:user.id});
 res.json({token,expires_in:900,user:{id:user.id,name:user.name,email:user.email,role:user.role}});
}
export async function logout(req,res){await db('users').where({id:req.user.id}).increment('auth_version',1);res.status(204).end();}
