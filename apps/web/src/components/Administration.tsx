import { lazy,Suspense,useState } from 'react';
import type { Session } from '../lib/api';
import type { Branding } from '../lib/branding';
const BrandingSettings=lazy(()=>import('./BrandingSettings'));
const SgbSettings=lazy(()=>import('./SgbSettings'));
export default function Administration({session,onChange}:{session:Session;onChange:(branding:Branding)=>void}){
 const [tab,setTab]=useState<'branding'|'sgb'>('branding');
 return <><div className="tabs admin-tabs" aria-label="Configurações administrativas"><button aria-pressed={tab==='branding'} onClick={()=>setTab('branding')}>Identidade visual</button><button aria-pressed={tab==='sgb'} onClick={()=>setTab('sgb')}>Atualização SGB / CPRM</button></div><Suspense fallback={<div className="panel empty">Carregando configurações…</div>}>{tab==='branding'?<BrandingSettings session={session} onChange={onChange}/>:<SgbSettings session={session}/>}</Suspense></>;
}
