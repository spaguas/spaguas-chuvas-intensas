import { useEffect,useRef,useState } from 'react';
import { ImageUp,RotateCcw,Save } from 'lucide-react';
import { api,type Session } from '../lib/api';
import { DEFAULT_FAVICON,readBrandingImage,type Branding } from '../lib/branding';
import Brand from './Brand';
import './branding.css';
type Images={logo:string|null;favicon:string|null};
export default function BrandingSettings({session,onChange}:{session:Session;onChange:(branding:Branding)=>void}){
 const [saved,setSaved]=useState<Images|null>(null),[draft,setDraft]=useState<Images>({logo:null,favicon:null});
 const [error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[reading,setReading]=useState(false),[loading,setLoading]=useState(true);
 const formRef=useRef<HTMLFormElement>(null);
 const dirty=saved!==null&&(draft.logo!==saved.logo||draft.favicon!==saved.favicon);
 async function load(signal?:AbortSignal){setLoading(true);setError('');try{const data=await api<Branding&Images>('/admin/branding',{signal},session.token);if(signal?.aborted)return;const images={logo:data.logo,favicon:data.favicon};setSaved(images);setDraft(images)}catch(e){if(!signal?.aborted)setError((e as Error).message)}finally{if(!signal?.aborted)setLoading(false)}}
 useEffect(()=>{const controller=new AbortController();void load(controller.signal);return()=>controller.abort()},[session.token]);
 async function select(file:File|undefined,kind:keyof Images){if(!file)return;setError('');setMessage('');setReading(true);try{const data=await readBrandingImage(file,kind);setDraft(current=>({...current,[kind]:data}))}catch(e){setError((e as Error).message)}finally{setReading(false)}}
 function restore(kind:keyof Images){setDraft(current=>({...current,[kind]:null}));setMessage('');setError('')}
 async function save(event:React.FormEvent){event.preventDefault();if(!dirty||reading)return;setBusy(true);setError('');setMessage('');try{const data=await api<Branding>('/admin/branding',{method:'PUT',body:JSON.stringify(draft)},session.token);setSaved({...draft});onChange(data);setMessage('Identidade visual salva e aplicada ao sistema.')}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 if(loading)return <section className="panel empty" role="status">Carregando identidade visual…</section>;
 if(!saved)return <section className="panel branding-settings"><p className="error" role="alert">{error}</p><button className="secondary" onClick={()=>void load()}>Tentar novamente</button></section>;
 return <form ref={formRef} className="panel branding-settings" onSubmit={save}>
  <div className="branding-heading"><h2>Identidade visual</h2><p>Personalize o logotipo do cabeçalho e o ícone exibido na aba do navegador. As imagens serão utilizadas por todos os usuários.</p></div>
  {error?<p className="error" role="alert">{error}</p>:null}{message?<p className="success" role="status">{message}</p>:null}
  <fieldset disabled={busy||reading} className="branding-fields"><legend className="sr-only">Imagens do sistema</legend>
   <section className="branding-card"><h3>Logotipo</h3><p>PNG, JPEG, WebP ou ICO · até 1 MB. Prefira uma imagem com fundo transparente e boa leitura sobre azul escuro.</p><div className="branding-logo-preview"><span className="brand"><Brand logoUrl={draft.logo}/></span></div><label htmlFor="branding-logo"><ImageUp size={16}/>Selecionar logotipo</label><input id="branding-logo" type="file" accept=".png,.jpg,.jpeg,.webp,.ico" onChange={event=>{void select(event.target.files?.[0],'logo');event.target.value=''}}/><button type="button" className="text-button" disabled={!draft.logo} onClick={()=>restore('logo')}><RotateCcw size={14}/>Usar logotipo padrão</button></section>
   <section className="branding-card"><h3>Favicon</h3><p>PNG, JPEG, WebP ou ICO · até 256 KB. Recomendado: imagem quadrada de 32 × 32 ou 64 × 64 pixels.</p><div className="branding-favicon-preview"><img src={draft.favicon||DEFAULT_FAVICON} alt="Prévia do favicon"/><span>Precipitações intensas · SP-ÁGUAS</span></div><label htmlFor="branding-favicon"><ImageUp size={16}/>Selecionar favicon</label><input id="branding-favicon" type="file" accept=".png,.jpg,.jpeg,.webp,.ico" onChange={event=>{void select(event.target.files?.[0],'favicon');event.target.value=''}}/><button type="button" className="text-button" disabled={!draft.favicon} onClick={()=>restore('favicon')}><RotateCcw size={14}/>Usar favicon padrão</button></section>
  </fieldset>
  <div className="branding-actions"><button className="primary" disabled={!dirty||busy||reading}><Save size={16}/>{busy?'Salvando…':'Salvar identidade visual'}</button><button type="button" className="secondary" disabled={!dirty||busy||reading} onClick={()=>{setDraft({...saved});formRef.current?.reset();setError('');setMessage('')}}>Descartar alterações</button><span role="status">{reading?'Validando imagem…':dirty?'Há alterações não salvas.':'As prévias mostram as imagens atuais.'}</span></div>
 </form>;
}
