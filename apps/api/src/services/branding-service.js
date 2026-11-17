import { createHash } from 'node:crypto';
import { z } from 'zod';
import { db } from '../db.js';
import { BASE } from '../config.js';

export const brandingInput=z.object({
 logo:z.string().max(1400000).nullable(),
 favicon:z.string().max(350000).nullable()
}).strict();
function invalid(message){throw Object.assign(new Error(message),{status:422});}
export function parseImage(value,kind){
 if(value===null)return null;
 const match=/^data:(image\/(?:png|jpeg|webp|x-icon|vnd\.microsoft\.icon));base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
 if(!match)invalid('Envie uma imagem PNG, JPEG, WebP ou ICO.');
 const [,mime,data]=match,buffer=Buffer.from(data,'base64');
 if(buffer.toString('base64')!==data)invalid('O conteúdo da imagem é inválido.');
 const limit=kind==='logo'?1024*1024:256*1024;
 if(buffer.length>limit)invalid(kind==='logo'?'O logotipo deve ter no máximo 1 MB.':'O favicon deve ter no máximo 256 KB.');
 const valid=mime==='image/png'?buffer.length>=33&&buffer.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'))&&buffer.toString('ascii',12,16)==='IHDR':
  mime==='image/jpeg'?buffer.length>=4&&buffer[0]===255&&buffer[1]===216&&buffer[2]===255:
  mime==='image/webp'?buffer.length>=20&&buffer.toString('ascii',0,4)==='RIFF'&&buffer.toString('ascii',8,12)==='WEBP':
  buffer.length>=22&&buffer.readUInt32LE(0)===65536&&buffer.readUInt16LE(4)>0;
 if(!valid)invalid('O conteúdo do arquivo não corresponde ao formato da imagem.');
 return {mime,data,hash:createHash('sha256').update(buffer).digest('hex')};
}
export function brandingMetadata(row){
 return {logo_url:row.logo?`${BASE}/api/branding/logo?v=${row.logo.hash}`:null,
  favicon_url:row.favicon?`${BASE}/api/branding/favicon?v=${row.favicon.hash}`:null,
  updated_at:row.updated_at};
}
export async function getBranding(){return db('system_branding').where({id:1}).first();}
export async function saveBranding(input,actorId){
 const parsed=brandingInput.parse(input);
 const next={logo:parseImage(parsed.logo,'logo'),favicon:parseImage(parsed.favicon,'favicon')};
 return db.transaction(async trx=>{
  const previous=await trx('system_branding').where({id:1}).forUpdate().first();
  const [saved]=await trx('system_branding').where({id:1}).update({...next,updated_at:trx.fn.now()}).returning('*');
  const hashes=row=>({logo:row.logo?.hash??null,favicon:row.favicon?.hash??null});
  await trx('audit_logs').insert({actor_id:actorId,action:'branding.updated',entity_id:'system',details:{before:hashes(previous),after:hashes(saved)}});
  return brandingMetadata(saved);
 });
}
