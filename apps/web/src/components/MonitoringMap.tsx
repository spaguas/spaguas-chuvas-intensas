import { useEffect,useRef,useState } from 'react';
import { Expand,Minimize,Scan,Layers,Hand } from 'lucide-react';
import L from 'leaflet';
import type { GeoJsonObject } from 'geojson';
import type { Observation } from '../lib/api';
import { compactNumber,groupStations,hasCoordinates,reading,type RainMetric } from '../lib/monitoring';
import boundary from '../lib/sp-boundary.json';
import 'leaflet/dist/leaflet.css';
interface Props {rows:Observation[];metric:RainMetric;selectedId:string|null;clock:number;focusKey:string;onSelect:(id:string)=>void;onGroup:(rows:Observation[])=>void}
const prefersReducedMotion=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
export default function MonitoringMap(props:Props){
 const element=useRef<HTMLDivElement>(null),shell=useRef<HTMLDivElement>(null),mapRef=useRef<L.Map|null>(null),overlayRef=useRef<L.LayerGroup|null>(null),tilesRef=useRef<L.TileLayer|null>(null),drawRef=useRef<()=>void>(()=>{}),latest=useRef(props);
 latest.current=props;
 const [tileError,setTileError]=useState(false),[baseEnabled,setBaseEnabled]=useState(true),[expanded,setExpanded]=useState(false),[touchPan,setTouchPan]=useState(false),[groupCount,setGroupCount]=useState(0);
 const selectedRef=useRef<string|null>(null),lastFilter=useRef<string|null>(null);
 useEffect(()=>{
  if(!element.current)return;
  const coarse=matchMedia('(pointer: coarse)').matches;
  const map=L.map(element.current,{center:[-22.6,-48.6],zoom:7,minZoom:4,maxZoom:18,scrollWheelZoom:false,dragging:!coarse,zoomControl:false,zoomAnimation:false,markerZoomAnimation:false,fadeAnimation:!prefersReducedMotion()});mapRef.current=map;
  L.control.zoom({position:'topleft',zoomInTitle:'Aproximar mapa',zoomOutTitle:'Afastar mapa'}).addTo(map);
  const tiles=L.tileLayer(import.meta.env.VITE_MAP_TILE_URL||'https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18,attribution:import.meta.env.VITE_MAP_TILE_ATTRIBUTION||'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',keepBuffer:1,updateWhenIdle:true});
  tiles.on('tileerror',()=>setTileError(true));tiles.addTo(map);tilesRef.current=tiles;
  const limits=L.geoJSON(boundary as GeoJsonObject,{style:{color:'#18877e',weight:1.6,fillOpacity:.035,fillColor:'#007e77'},interactive:false}).addTo(map);
  map.attributionControl.addAttribution('Limite estadual: IBGE');L.control.scale({imperial:false,maxWidth:100}).addTo(map);
  const url=new URLSearchParams(location.search),lat=Number(url.get('map_lat')),lng=Number(url.get('map_lng')),zoom=Number(url.get('map_zoom'));
  if(url.has('map_lat')&&url.has('map_lng')&&Number.isFinite(lat)&&Math.abs(lat)<=85&&Number.isFinite(lng)&&Math.abs(lng)<=180&&zoom>=4&&zoom<=18)map.setView([lat,lng],zoom,{animate:false});
  else map.fitBounds(limits.getBounds(),{padding:[24,24],animate:false});
  overlayRef.current=L.layerGroup().addTo(map);
  function draw(){
   const overlay=overlayRef.current;if(!overlay)return;
   const focused=document.activeElement instanceof HTMLElement&&document.activeElement.classList.contains('rain-map-marker')?document.activeElement.dataset.stationId:null;
   overlay.clearLayers();
   const {rows,metric,selectedId,clock}=latest.current;
   const visible=rows.filter(o=>hasCoordinates(o)&&map.getBounds().pad(.15).contains([o.latitude!,o.longitude!]));
   const groups=groupStations(visible.filter(o=>o.station_id!==selectedId),o=>map.project([o.latitude!,o.longitude!],map.getZoom()),metric,map.getZoom()>=14?0:matchMedia('(max-width:600px)').matches?92:86,clock);
   const selected=rows.find(o=>o.station_id===selectedId&&hasCoordinates(o));
   if(selected)groups.push({key:`selected-${selected.station_id}`,stations:[selected],latitude:selected.latitude!,longitude:selected.longitude!,representative:selected});
   setGroupCount(groups.filter(group=>group.stations.length>1).length);
   for(const group of groups){
    const o=group.representative,r=reading(o,metric,clock),cluster=group.stations.length>1,isSelected=o.station_id===selectedId;
    const content=document.createElement('span');content.className=`rain-map-label tone-${r.tone}${cluster?' is-cluster':''}${isSelected?' is-selected':''}`;
    const value=document.createElement('strong');value.textContent=r.label;content.append(value);
    if(cluster){const count=document.createElement('small');count.textContent=`+${group.stations.length-1}`;content.append(count);}
    const label=cluster?`${group.stations.length} estações próximas; ${metric==='rain'?'maior acumulado':'destaque de retorno'}: ${r.label}${metric==='rain'?' mm':''}. Clique para expandir.`:`${o.station_name} · ${o.city} · ${r.description}`;
    const marker=L.marker([group.latitude,group.longitude],{icon:L.divIcon({className:'rain-map-marker',html:content,iconSize:[cluster?76:60,44],iconAnchor:[cluster?38:30,32]}),title:label,alt:label,keyboard:true,autoPanOnFocus:false,riseOnHover:true,zIndexOffset:isSelected?1000:r.tone==='red'?400:r.tone==='orange'?300:0}).addTo(overlay);
    const tooltip=document.createElement('span');tooltip.textContent=label;
    marker.bindTooltip(tooltip,{direction:'top',offset:[0,-22],className:'rain-map-tooltip'});
    const node=marker.getElement();if(node){node.setAttribute('aria-label',label);node.dataset.stationId=cluster?'':o.station_id;node.dataset.tone=r.tone;node.dataset.cluster=cluster?'true':'false';node.addEventListener('keydown',event=>{if([' ','Enter'].includes((event as KeyboardEvent).key)){event.preventDefault();event.stopPropagation();marker.fire('click')}});if(focused&&focused===o.station_id&&!cluster)node.focus({preventScroll:true});}
    marker.on('click',()=>{
     if(cluster){latest.current.onGroup(group.stations);const bounds=L.latLngBounds(group.stations.map(station=>[station.latitude!,station.longitude!]));if(bounds.getNorthEast().distanceTo(bounds.getSouthWest())>10)map.fitBounds(bounds,{padding:[80,80],maxZoom:Math.min(18,map.getZoom()+3),animate:false});else map.setView([group.latitude,group.longitude],Math.min(18,map.getZoom()+2),{animate:false});}
     else latest.current.onSelect(o.station_id);
    });
   }
  }
  drawRef.current=draw;
  const moved=()=>{draw();const center=map.getCenter(),url=new URL(location.href);url.searchParams.set('map_lat',center.lat.toFixed(5));url.searchParams.set('map_lng',center.lng.toFixed(5));url.searchParams.set('map_zoom',String(map.getZoom()));history.replaceState(null,'',url)};
  map.on('moveend zoomend',moved);
  const resize=new ResizeObserver(()=>{map.invalidateSize({pan:false});draw()});resize.observe(element.current);draw();
  return()=>{resize.disconnect();map.off('moveend zoomend',moved);map.remove();mapRef.current=null;overlayRef.current=null;tilesRef.current=null;drawRef.current=()=>{};selectedRef.current=null;};
 },[]);
 useEffect(()=>{
  const map=mapRef.current;if(!map||lastFilter.current===props.focusKey)return;
  if(lastFilter.current===null&&props.focusKey==='|all'){lastFilter.current=props.focusKey;return;}
  if(props.focusKey==='|all'){lastFilter.current=props.focusKey;map.fitBounds(L.geoJSON(boundary as GeoJsonObject).getBounds(),{padding:[24,24],animate:false});return;}
  const points=props.rows.filter(hasCoordinates).map(o=>[o.latitude!,o.longitude!] as L.LatLngTuple);
  if(points.length){lastFilter.current=props.focusKey;map.fitBounds(L.latLngBounds(points),{padding:[55,55],maxZoom:11,animate:false});}
 },[props.focusKey,props.rows]);
 useEffect(()=>{drawRef.current()},[props.rows,props.metric,props.selectedId,props.clock]);
 useEffect(()=>{
  const map=mapRef.current,selected=props.rows.find(o=>o.station_id===props.selectedId);if(!map||!selected||!hasCoordinates(selected)||selectedRef.current===props.selectedId)return;
  selectedRef.current=props.selectedId;map.setView([selected.latitude!,selected.longitude!],Math.max(map.getZoom(),11),{animate:false});
 },[props.selectedId,props.rows]);
 useEffect(()=>{if(!props.selectedId)selectedRef.current=null},[props.selectedId]);
 useEffect(()=>{const map=mapRef.current,tiles=tilesRef.current;if(!map||!tiles)return;if(baseEnabled){tiles.addTo(map);setTileError(false)}else tiles.remove()},[baseEnabled]);
 useEffect(()=>{const map=mapRef.current;if(!map)return;if(!matchMedia('(pointer: coarse)').matches||touchPan||expanded)map.dragging.enable();else map.dragging.disable();map.invalidateSize({pan:false})},[touchPan,expanded]);
 useEffect(()=>{
  if(!expanded)return;const overflow=document.body.style.overflow;document.body.style.overflow='hidden';
  const key=(event:KeyboardEvent)=>{if(event.key==='Escape')setExpanded(false);if(event.key==='Tab'&&shell.current){const items=[...shell.current.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],[tabindex="0"]')].filter(item=>item.getBoundingClientRect().width>0);const first=items[0],last=items.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus()}}};
  document.addEventListener('keydown',key);return()=>{document.body.style.overflow=overflow;document.removeEventListener('keydown',key)};
 },[expanded]);
 function reset(){const map=mapRef.current;if(map)map.fitBounds(L.geoJSON(boundary as GeoJsonObject).getBounds(),{padding:[24,24],animate:false})}
 return <div ref={shell} className={`rain-map-shell${expanded?' is-expanded':''}`}><div ref={element} className="rain-leaflet" role="region" aria-label="Mapa Leaflet de chuva observada nas estações SIBH"/><div className="rain-map-tools"><button type="button" aria-label="Enquadrar Estado de São Paulo" title="Enquadrar São Paulo" onClick={reset}><Scan size={18}/></button><button type="button" aria-label={baseEnabled?'Ocultar mapa-base':'Exibir mapa-base'} aria-pressed={baseEnabled} title="Mapa-base" onClick={()=>setBaseEnabled(v=>!v)}><Layers size={18}/></button><button type="button" aria-label={expanded?'Recolher mapa':'Ampliar mapa'} aria-expanded={expanded} title={expanded?'Recolher mapa (Esc)':'Ampliar mapa'} onClick={()=>setExpanded(v=>!v)}>{expanded?<Minimize size={18}/>:<Expand size={18}/>}</button><button type="button" className="rain-touch-pan" aria-label="Permitir arrastar mapa no celular" aria-pressed={touchPan} title="Mover mapa" onClick={()=>setTouchPan(v=>!v)}><Hand size={18}/></button></div>
 <div className="rain-map-legend" aria-label={props.metric==='rain'?'Legenda de chuva acumulada':'Legenda de período de retorno'}><strong>{props.metric==='rain'?'Chuva acumulada · mm':'Retorno estimado · T'}</strong>{props.metric==='return'?<><span><i className="tone-green"/>&lt;10T</span><span><i className="tone-orange"/>10T</span><span><i className="tone-red"/>&gt;10T</span><span><i className="tone-neutral"/>Sem estimativa</span></>:<><span><i className="tone-neutral"/>0 / leitura antiga</span><span><i className="tone-rain1"/>&gt;0 a &lt;5</span><span><i className="tone-rain2"/>5 a &lt;15</span><span><i className="tone-rain3"/>15 a &lt;30</span><span><i className="tone-rain4"/>30 a &lt;60</span><span><i className="tone-rain5"/>≥60</span></>}</div>
 {groupCount?<div className="rain-cluster-note">+n: outras estações no grupo · clique para explorar</div>:null}
 {tileError&&baseEnabled?<div className="rain-tile-warning" role="status">Mapa-base parcialmente indisponível. Pontos e limite estadual continuam visíveis.<button type="button" onClick={()=>setBaseEnabled(false)}>Ocultar mapa-base</button></div>:null}
 <span className="rain-touch-hint">Use +/− para aproximar; ative a mão para arrastar.</span>
 </div>;
}
