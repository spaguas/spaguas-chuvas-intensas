import { BASE } from './api';
export interface Branding {logo_url:string|null;favicon_url:string|null;updated_at:string|null}
export const DEFAULT_BRANDING:Branding={logo_url:null,favicon_url:null,updated_at:null};
export const DEFAULT_FAVICON=`${BASE}/favicon.svg`;
export const MAX_LOGO_BYTES=1024*1024;
export const MAX_FAVICON_BYTES=256*1024;
export function applyFavicon(branding:Branding){
 const link=document.querySelector<HTMLLinkElement>('link[rel="icon"]')||document.head.appendChild(document.createElement('link'));
 link.rel='icon';link.removeAttribute('type');link.href=branding.favicon_url||DEFAULT_FAVICON;
}
export async function readBrandingImage(file:File,kind:'logo'|'favicon'):Promise<string>{
 if(file.size>(kind==='logo'?MAX_LOGO_BYTES:MAX_FAVICON_BYTES))throw new Error(kind==='logo'?'O logotipo deve ter no máximo 1 MB.':'O favicon deve ter no máximo 256 KB.');
 const extension=file.name.split('.').pop()?.toLowerCase();
 const mime=({png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',ico:'image/x-icon'} as Record<string,string>)[extension||''];
 if(!mime)throw new Error('Selecione um arquivo PNG, JPEG, WebP ou ICO.');
 const data=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(`data:${mime};base64,${String(reader.result).split(',')[1]}`);reader.onerror=()=>reject(new Error('Não foi possível ler a imagem.'));reader.readAsDataURL(file)});
 await new Promise<void>((resolve,reject)=>{const image=new Image();image.onload=()=>{if(image.naturalWidth>8192||image.naturalHeight>8192)reject(new Error('A imagem deve ter no máximo 8192 pixels de largura e altura.'));else resolve()};image.onerror=()=>reject(new Error('O arquivo selecionado não é uma imagem válida.'));image.src=data});
 return data;
}
