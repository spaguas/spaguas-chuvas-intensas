import { useEffect,useRef,useState } from 'react';
import { X,LockKeyhole,LogIn } from 'lucide-react';
import { api,type Session } from '../lib/api';
export default function LoginDialog({onClose,onLogin}:{onClose:()=>void;onLogin:(s:Session)=>void}){
 const ref=useRef<HTMLDialogElement>(null);const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{ref.current?.showModal();return()=>ref.current?.close()},[]);
 async function submit(e:React.FormEvent){e.preventDefault();setBusy(true);setError('');try{onLogin(await api<Session>('/auth/login',{method:'POST',body:JSON.stringify({email,password})}));}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 return <dialog ref={ref} onCancel={onClose} className="login-dialog" aria-labelledby="login-title"><button className="icon-button close" aria-label="Fechar login" onClick={onClose}><X size={20}/></button><div className="login-mark"><LockKeyhole size={23}/></div><h2 id="login-title">Área operacional</h2><p>Acesso exclusivo às equipes da SP-ÁGUAS.</p><form onSubmit={submit}><label htmlFor="email">E-mail institucional</label><input autoFocus id="email" type="email" autoComplete="username" required value={email} onChange={e=>setEmail(e.target.value)}/><label htmlFor="password">Senha</label><input id="password" type="password" autoComplete="current-password" maxLength={72} required value={password} onChange={e=>setPassword(e.target.value)}/>{error?<p className="error" role="alert">{error}</p>:null}<button className="primary" disabled={busy}><LogIn size={17}/>{busy?'Autenticando…':'Entrar na área operacional'}</button></form><p className="login-note">Credenciais fornecidas pelo administrador da plataforma.</p></dialog>;
}
