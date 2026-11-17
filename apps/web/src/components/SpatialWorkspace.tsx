import { useEffect, useState } from 'react';
import { Download, MapPin, Network, RefreshCw, Info } from 'lucide-react';
import type { GeoPoint } from '@chuvas/hydrology';
import SpatialMap from './SpatialMap';
import { sourceLink,api, BASE, number } from '../lib/api';
import { estimateLabel, exclusionLabels, exportSpatial, type MunicipalBoundaries, type ReferenceStation, type SpatialResponse } from '../lib/spatial';
import './spatial.css';

function initial(){
  const params=new URLSearchParams(location.search);
  const value=(name:string,fallback:number)=>{const raw=params.get(name);return raw!==null&&Number.isFinite(Number(raw))?Number(raw):fallback};
  const latitude=value('lat',NaN),longitude=value('lon',NaN);
  return {point:Number.isFinite(latitude)&&Number.isFinite(longitude)?{latitude,longitude}:null,depth:value('rain',50),duration:value('duration',60),neighbors:value('neighbors',5),power:value('idw_power',2),radius:value('radius',100)};
}
const start=initial;
export default function SpatialWorkspace(){
  const [initialState]=useState(start),[point,setPoint]=useState<GeoPoint|null>(initialState.point);
  const [latitude,setLatitude]=useState(initialState.point?String(initialState.point.latitude):''),[longitude,setLongitude]=useState(initialState.point?String(initialState.point.longitude):'');
  const [depth,setDepth]=useState(initialState.depth),[duration,setDuration]=useState(initialState.duration),[neighbors,setNeighbors]=useState(initialState.neighbors),[power,setPower]=useState(initialState.power),[radius,setRadius]=useState(initialState.radius);
  const [boundaries,setBoundaries]=useState<MunicipalBoundaries|null>(null),[stations,setStations]=useState<ReferenceStation[]>([]),[response,setResult]=useState<SpatialResponse|null>(null);
  const [loadError,setLoadError]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[revision,setRevision]=useState(0),[retry,setRetry]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();setLoadError('');
    Promise.all([api<MunicipalBoundaries>('/spatial/municipalities',{signal:controller.signal}),api<{stations:ReferenceStation[]}>('/spatial/reference-stations',{signal:controller.signal})])
      .then(([geo,refs])=>{if(!controller.signal.aborted){setBoundaries(geo);setStations(refs.stations)}}).catch(e=>{if(!controller.signal.aborted)setLoadError(e.message)});
    return()=>controller.abort();
  },[retry]);
  useEffect(()=>{
    if(!point)return;
    const controller=new AbortController();setResult(null);setError('');
    if(!Number.isFinite(depth)||depth<0||depth>10000||!Number.isFinite(duration)||duration<=0||duration>10080){setBusy(false);setError('Informe chuva entre 0 e 10.000 mm e duração maior que zero, até 10.080 minutos.');return()=>controller.abort()}
    setBusy(true);
    const timer=setTimeout(()=>{
      api<SpatialResponse>('/idf/spatial-return-period',{method:'POST',body:JSON.stringify({...point,depth_mm:depth,duration,neighbors,power,radius_km:radius}),signal:controller.signal})
        .then(data=>{if(!controller.signal.aborted)setResult(data)}).catch(e=>{if(!controller.signal.aborted)setError(e.message)}).finally(()=>{if(!controller.signal.aborted)setBusy(false)});
    },300);
    const url=new URL(location.href);for(const [key,value] of Object.entries({lat:point.latitude,lon:point.longitude,rain:depth,duration,neighbors,idw_power:power,radius}))url.searchParams.set(key,String(value));history.replaceState(null,'',url);
    return()=>{clearTimeout(timer);controller.abort()};
  },[point,depth,duration,neighbors,power,radius,revision]);
  function pick(p:GeoPoint){setPoint(p);setLatitude(String(p.latitude));setLongitude(String(p.longitude));}
  function applyCoordinates(){
    const lat=latitude.trim()===''?NaN:Number(latitude),lon=longitude.trim()===''?NaN:Number(longitude);
    if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180){setError('Informe latitude e longitude válidas, em graus decimais.');return}
    pick({latitude:lat,longitude:lon});setRevision(r=>r+1);
  }
  const result=response&&point&&response.point.latitude===point.latitude&&response.point.longitude===point.longitude&&response.depth_mm===depth&&response.duration===duration&&response.parameters.neighbors===neighbors&&response.parameters.power===power&&response.parameters.radius_km===radius?response:null;
  const coordinateWarnings=result?.stations.filter(s=>s.coordinate_warning)||[];
  return <div className="spatial-workspace"><div className="page-heading"><h1>Retorno da chuva no mapa</h1><p>Selecione um ponto e estime o período de retorno com as equações IDF vizinhas, ponderadas pela distância.</p></div>
    <div className="spatial-layout"><section className="panel spatial-map-card"><div className="spatial-section-heading"><h2><MapPin size={19}/>Localização e hub de distâncias</h2><span>{stations.filter(s=>s.status==='active').length} IDFs ativas</span></div>
      {boundaries?<SpatialMap boundaries={boundaries} stations={stations} point={point} result={result} onPick={pick}/>:<div className="spatial-map-loading" role="status">{loadError?<><p>{loadError}</p><button className="secondary" onClick={()=>setRetry(r=>r+1)}>Tentar carregar o mapa novamente</button></>:'Carregando malha municipal do IBGE…'}</div>}
    </section>
    <aside className="panel spatial-controls"><h2>Chuva e duração</h2><p>Informe a altura acumulada durante o evento.</p><form onSubmit={e=>{e.preventDefault();applyCoordinates()}}>
      <div className="spatial-rain-fields"><label htmlFor="spatial-depth">Chuva acumulada (mm)<input id="spatial-depth" type="number" min="0" max="10000" step="any" required value={Number.isNaN(depth)?'':depth} onChange={e=>setDepth(e.target.value===''?NaN:Number(e.target.value))}/></label><label htmlFor="spatial-duration">Duração (min)<input id="spatial-duration" type="number" min="0.001" max="10080" step="any" required value={Number.isNaN(duration)?'':duration} onChange={e=>setDuration(e.target.value===''?NaN:Number(e.target.value))}/></label></div>
      <div className="spatial-intensity">Intensidade equivalente <strong>{Number.isFinite(depth)&&duration>0?`${number(depth*60/duration,2)} mm/h`:'—'}</strong></div>
      <div className="spatial-coordinate-heading"><h3>Ponto de cálculo</h3><span>Graus decimais</span></div><div className="spatial-coordinate-fields"><label htmlFor="spatial-latitude">Latitude<input id="spatial-latitude" type="number" min="-90" max="90" step="any" placeholder="Ex.: -23.5505" value={latitude} onChange={e=>setLatitude(e.target.value)}/></label><label htmlFor="spatial-longitude">Longitude<input id="spatial-longitude" type="number" min="-180" max="180" step="any" placeholder="Ex.: -46.6333" value={longitude} onChange={e=>setLongitude(e.target.value)}/></label></div><button type="button" className="secondary spatial-full" onClick={applyCoordinates}>Aplicar coordenadas</button>
      <details className="spatial-options"><summary>Parâmetros da interpolação</summary><label htmlFor="spatial-neighbors">Quantidade de vizinhos<select id="spatial-neighbors" value={neighbors} onChange={e=>setNeighbors(Number(e.target.value))}>{Array.from({length:10},(_,i)=>i+3).map(n=><option key={n} value={n}>{n} postos mais próximos</option>)}</select></label><label htmlFor="spatial-power">Potência da distância (p)<input id="spatial-power" type="number" min="1" max="4" step="0.1" value={power} onChange={e=>setPower(Number(e.target.value))}/></label><label htmlFor="spatial-radius">Raio máximo (km)<input id="spatial-radius" type="number" min="5" max="300" step="1" value={radius} onChange={e=>setRadius(Number(e.target.value))}/></label><p>Ao menos 3 postos elegíveis. Na coincidência com um posto, usa-se o retorno local.</p></details>
      <button className="primary spatial-full" type="submit" disabled={busy||!boundaries}><RefreshCw size={16} className={busy?'spinning':''}/>{busy?'Calculando…':'Calcular retorno IDW'}</button></form>
      <p className="spatial-control-note">O município é identificado por polígono. As distâncias são calculadas até os postos do estudo, não até os centros das cidades.</p>
    </aside></div>
    {error?<p className="error" role="alert">{error}</p>:null}
    <section className="panel spatial-result" aria-live="polite" aria-busy={busy}>
      {!result?<div className="spatial-result-placeholder"><Network size={24}/><div><h2>{busy?'Calculando distâncias e retornos locais…':point?'Resultado indisponível':'Escolha um ponto no mapa'}</h2><p>{point?'Confira os parâmetros ou selecione outro ponto.':'Você também pode digitar as coordenadas ou clicar em um posto IDF.'}</p></div></div>:<>
        <div className="spatial-result-top"><div><h2>Período de retorno ponderado</h2><strong className="spatial-return-value">{estimateLabel(result.estimate)}</strong><p>{result.status==='insufficient_neighbors'?'Vizinhança insuficiente para interpolar':result.estimate?.censored?'Resultado limitado pelos domínios das IDFs':'Média IDW dos retornos locais em anos'}</p></div><div className="spatial-location-summary"><span>Município do ponto</span><strong>{result.municipality.name}</strong><p>IBGE {result.municipality.id}</p><span>IDF municipal: {result.local_equation_status==='active'?'disponível':result.local_equation_status==='pending'?'pendente de revisão':result.local_equation_status==='retired'?'retirada de uso':'não cadastrada'}</span></div><div className="spatial-location-summary"><span>Postos selecionados</span><strong>{result.stations.length} <small>de {result.parameters.neighbors} solicitados</small></strong><p>Raio de {number(result.parameters.radius_km,0)} km · p = {number(result.parameters.power,1)}</p><span>Dados calculados para {number(result.depth_mm,1)} mm em {number(result.duration,1)} min</span></div></div>
        <div className={`spatial-method-note ${result.status==='insufficient_neighbors'?'spatial-insufficient':''}`}><Info size={17}/><p>{result.warning}{result.estimate?.censored?' O intervalo propaga os limites dos retornos locais; não representa um intervalo de confiança. Nenhum retorno fora do domínio foi substituído por um número exato.':''}</p></div>
        {coordinateWarnings.length?<p className="spatial-coordinate-warning">Conferência de localização: {coordinateWarnings.map(s=>s.municipality_name).join(', ')} apresenta(m) coordenada do estudo fora do polígono municipal simplificado. Confira o georreferenciamento antes de uso técnico.</p>:null}
      </>}
    </section>
    {result?<section className="panel spatial-hub-table"><div className="spatial-section-heading"><h2><Network size={18}/>Hub de distâncias e pesos</h2><button className="secondary" onClick={()=>exportSpatial(result)}><Download size={16}/>Exportar CSV</button></div><div className="table-scroll" tabIndex={0} role="region" aria-label="Postos IDF, distâncias, pesos e retornos locais"><table><caption>Pesos normalizados por 1/dᵖ. O mesmo evento de chuva é avaliado em todas as IDFs selecionadas.</caption><thead><tr><th>Posto de referência</th><th>Distância</th><th>Peso IDW</th><th>Retorno local T</th><th>Contribuição w × T</th><th>Fonte</th></tr></thead><tbody>{result.stations.map((s,i)=><tr key={s.equation_id}><td><strong><span className="spatial-row-number">{i+1}</span>{s.municipality_name}</strong><small>{stations.find(ref=>ref.municipality_id===s.municipality_id)?.station_name} · v{s.equation_version}</small></td><td>{number(s.distance_km,2)} km</td><td>{s.weight===null?'—':<><strong>{number(s.weight*100,2)}%</strong><span className="spatial-weight-bar"><i style={{width:`${s.weight*100}%`}}/></span></>}</td><td>{s.return_period===null?`T ${s.bound==='below'?'<':'>'} ${s.limit} anos`:`${number(s.return_period,2)} anos`}</td><td>{s.contribution_years===null?'Limitada pelo domínio':`${number(s.contribution_years,3)} anos`}</td><td><a href={sourceLink(s)} target="_blank" rel="noreferrer">Ver equação</a></td></tr>)}</tbody></table></div>
      <details className="spatial-exclusions"><summary>Postos não utilizados ({result.excluded_stations.length})</summary><ul>{result.excluded_stations.map(s=><li key={s.municipality_id}><strong>{s.municipality_name}</strong> — {exclusionLabels[s.reason]||s.reason}{s.distance_km!==null?` (${number(s.distance_km,1)} km)`:''}</li>)}</ul></details></section>:null}
    <details className="spatial-methodology"><summary>Como o retorno IDW é calculado</summary><p>Para a chuva e duração informadas, a API inverte cada IDF elegível e calcula o retorno local T. As distâncias em quilômetros usam a fórmula de Haversine. Os pesos são wᵢ = dᵢ⁻ᵖ / Σdⱼ⁻ᵖ, e o resultado é T_IDW = ΣwᵢTᵢ. Potência padrão 2, cinco vizinhos e raio padrão de 100 km são parâmetros exploratórios, não uma calibração regional.</p><p>Equações pendentes, retiradas, inválidas para a duração ou sem coordenadas são excluídas com motivo. Os retornos censurados permanecem na vizinhança e seus limites são propagados. A malha simplificada do IBGE pode aproximar divisas; pontos exatamente compartilhados por municípios precisam ser deslocados. As ligações do hub não representam trajetos rodoviários.</p></details>
  </div>;
}
