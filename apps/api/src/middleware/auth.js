import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { db } from '../db.js';
export async function requireAuth(req,res,next){
 try{
  const bearer=req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
  if(!bearer)return res.status(401).json({error:'Autenticação necessária.'});
  const payload=jwt.verify(bearer,config.JWT_SECRET,{algorithms:['HS256'],issuer:'chuvas-intensas',audience:'operacional'});
  const user=await db('users').where({id:payload.sub,active:true,auth_version:payload.ver}).select('id','name','email','role','auth_version').first();
  if(!user)return res.status(401).json({error:'Sessão inválida.'});req.user=user;next();
 }catch(e){if(e.name==='JsonWebTokenError'||e.name==='TokenExpiredError')return res.status(401).json({error:'Sessão inválida ou expirada.'});next(e);}
}
export function requireAdmin(req,res,next){if(req.user.role!=='admin')return res.status(403).json({error:'Ação restrita a administradores.'});next();}
