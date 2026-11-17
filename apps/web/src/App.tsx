import { lazy,Suspense,useCallback,useEffect,useState } from 'react';
import { UserRound,Menu,X,ExternalLink } from 'lucide-react';
import Brand from './components/Brand';
import { DEFAULT_BRANDING,applyFavicon,type Branding } from './lib/branding';
import Calculator from './components/Calculator';
const Monitoring=lazy(()=>import('./components/Monitoring'));
import Methodology from './components/Methodology';
import LoginDialog from './components/LoginDialog';
import { api,BASE,type Municipality,type Session } from './lib/api';
const AdminPanel=lazy(()=>import('./components/AdminPanel'));
const SpatialWorkspace=lazy(()=>import('./components/SpatialWorkspace'));
type View='calculator'|'spatial'|'monitoring'|'methodology'|'admin';
function initialView():View{const v=new URLSearchParams(location.search).get('view');return v==='monitoring'||v==='methodology'||v==='spatial'?v:'calculator';}
export default function App(){
 const [branding,setBranding]=useState<Branding>(DEFAULT_BRANDING);
 useEffect(()=>{const abort=new AbortController();api<Branding>('/branding',{signal:abort.signal}).then(value=>{if(!abort.signal.aborted)setBranding(value)}).catch(()=>{});return()=>abort.abort()},[]);
 useEffect(()=>{applyFavicon(branding)},[branding]);
 const [view,setView]=useState<View>(initialView),[selected,setSelected]=useState(()=>new URLSearchParams(location.search).get('city')||'3550308'),[cities,setCities]=useState<Municipality[]>([]),[error,setError]=useState('');
 const [login,setLogin]=useState(false),[session,setSession]=useState<Session|null>(null),[menu,setMenu]=useState(false);
 const loadCities=useCallback(()=>api<Municipality[]>('/municipalities').then(rows=>{setCities(rows);setSelected(id=>rows.some(c=>c.id===id)?id:rows[0]?.id||'3550308');setError('')}).catch(e=>setError(e.message)),[]);
 useEffect(()=>{void loadCities()},[loadCities]);
 useEffect(()=>{const url=new URL(location.href);url.searchParams.set('city',selected);url.searchParams.set('view',view==='admin'?'calculator':view);history.replaceState(null,'',url)},[selected,view]);
 useEffect(()=>{if(!session)return;const timer=setTimeout(()=>{setSession(null);setView('calculator');setError('Sua sessão expirou. Entre novamente na área operacional.')},15*60000);return()=>clearTimeout(timer)},[session]);
 function navigate(v:View){if(v!==view){const url=new URL(location.href);url.searchParams.set('view',v==='admin'?'calculator':v);history.pushState(null,'',url)}setView(v);setMenu(false);window.scrollTo({top:0,behavior:'instant'})}
 useEffect(()=>{const pop=()=>{setView(initialView());setSelected(new URLSearchParams(location.search).get('city')||'3550308');setMenu(false)};window.addEventListener('popstate',pop);return()=>window.removeEventListener('popstate',pop)},[]);
 async function logout(){try{await api('/auth/logout',{method:'POST'},session?.token)}catch(e){setError((e as Error).message)}finally{setSession(null);navigate('calculator')}}
 return <><a className="skip-link" href="#main">Ir para o conteúdo</a><header className="site-header"><a className="brand" href={`${BASE}/`} aria-label="SP-ÁGUAS início"><Brand logoUrl={branding.logo_url}/></a><button className="mobile-toggle" onClick={()=>setMenu(!menu)} aria-expanded={menu} aria-label="Abrir navegação">{menu?<X/>:<Menu/>}</button><nav aria-label="Navegação principal" className={menu?'open':''}>{([['calculator','Calculadora IDF'],['spatial','Mapa IDW'],['monitoring','Chuva observada'],['methodology','Metodologia']] as const).map(([id,label])=><button key={id} className={view===id?'active':''} aria-current={view===id?'page':undefined} onClick={()=>navigate(id)}>{label}</button>)}</nav><button className="operational-link" onClick={()=>session?navigate('admin'):setLogin(true)}><UserRound size={18}/><span>{session?session.user.name:'Área operacional'}</span></button></header>
 <main id="main"><div className="page-container">{view==='calculator'?<div className="page-heading"><h1>Precipitações intensas</h1><p>Relações entre intensidade, duração e frequência para o Estado de São Paulo.</p></div>:null}
 {error?<div className="error service-error" role="alert">{error}<button className="text-button" onClick={loadCities}>Tentar novamente</button></div>:null}
 {view==='calculator'?<>{cities.length?<Calculator cities={cities} selected={selected} onSelected={setSelected} onMethodology={()=>navigate('methodology')}/>:<div className="panel empty">{error?'Não foi possível carregar o catálogo municipal.':'Carregando catálogo municipal…'}</div>}</>:null}
 {view==='spatial'?<Suspense fallback={<div className="panel empty">Carregando ferramenta espacial…</div>}><SpatialWorkspace/></Suspense>:null}
 {view==='monitoring'?<Suspense fallback={<div className="panel empty">Carregando painel de chuva observada…</div>}><Monitoring/></Suspense>:null}
 {view==='methodology'?<Methodology cities={cities}/>:null}
 {view==='admin'&&session?<Suspense fallback={<div className="empty">Carregando área operacional…</div>}><AdminPanel session={session} cities={cities} onLogout={logout} onChange={loadCities} onBrandingChange={setBranding}/></Suspense>:null}
 </div></main><footer className="site-footer"><span><strong>Fonte:</strong> SP-ÁGUAS / DAEE / CTH · SGB / CPRM</span><a href={`${BASE}/docs/`} target="_blank" rel="noreferrer">API e documentação <ExternalLink size={12}/></a></footer>
 {login?<LoginDialog onClose={()=>setLogin(false)} onLogin={s=>{setSession(s);setLogin(false);navigate('admin')}}/>:null}</>;
}
