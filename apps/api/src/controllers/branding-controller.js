import { brandingMetadata,getBranding,saveBranding } from '../services/branding-service.js';
export async function settings(req,res){res.set('Cache-Control','no-store').json(brandingMetadata(await getBranding()));}
export async function adminSettings(req,res){
 const row=await getBranding();
 const data=asset=>asset?`data:${asset.mime};base64,${asset.data}`:null;
 res.set('Cache-Control','no-store').json({...brandingMetadata(row),logo:data(row.logo),favicon:data(row.favicon)});
}
export async function save(req,res){res.set('Cache-Control','no-store').json(await saveBranding(req.body,req.user.id));}
export async function image(req,res){
 const asset=(await getBranding())[req.params.kind];
 if(!asset)return res.status(404).json({error:'Imagem personalizada não configurada.'});
 res.set({'Content-Type':asset.mime,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'}).send(Buffer.from(asset.data,'base64'));
}
