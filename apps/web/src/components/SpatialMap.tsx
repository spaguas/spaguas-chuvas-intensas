import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import type { GeoPoint } from '@chuvas/hydrology';
import type { MunicipalBoundaries, ReferenceStation, SpatialResponse } from '../lib/spatial';
import { number } from '../lib/api';
import 'leaflet/dist/leaflet.css';

function textNode(text:string){const node=document.createElement('span');node.textContent=text;return node;}
export default function SpatialMap({boundaries,stations,point,result,onPick}:{boundaries:MunicipalBoundaries;stations:ReferenceStation[];point:GeoPoint|null;result:SpatialResponse|null;onPick:(p:GeoPoint)=>void}){
  const element=useRef<HTMLDivElement>(null), mapRef=useRef<L.Map|null>(null), overlayRef=useRef<L.LayerGroup|null>(null),tileRef=useRef<L.TileLayer|null>(null);
  const fittedPoint=useRef('');
  const pickRef=useRef(onPick);pickRef.current=onPick;
  const [tileError,setTileError]=useState(false),[baseEnabled,setBaseEnabled]=useState(true),[touchPan,setTouchPan]=useState(false);
  useEffect(()=>{
    if(!element.current)return;
    const map=L.map(element.current,{center:[-22.5,-48.5],zoom:6,scrollWheelZoom:false,dragging:!matchMedia('(pointer: coarse)').matches});
    mapRef.current=map;
    const tiles=L.tileLayer(import.meta.env.VITE_MAP_TILE_URL||'https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18,attribution:import.meta.env.VITE_MAP_TILE_ATTRIBUTION||'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',detectRetina:false});
    tiles.on('tileerror',()=>setTileError(true));tiles.addTo(map);tileRef.current=tiles;
    const limits=L.geoJSON(boundaries,{style:{color:'#90aab3',weight:.8,fillColor:'#f0f7f7',fillOpacity:.16},interactive:false}).addTo(map);
    map.fitBounds(limits.getBounds(),{padding:[15,15]});L.control.scale({imperial:false}).addTo(map);
    map.attributionControl.addAttribution('Malha municipal: IBGE (simplificada)');
    overlayRef.current=L.layerGroup().addTo(map);
    map.on('click',(e:L.LeafletMouseEvent)=>pickRef.current({latitude:e.latlng.lat,longitude:e.latlng.lng}));
    const resize=new ResizeObserver(()=>map.invalidateSize());resize.observe(element.current);
    return()=>{resize.disconnect();map.remove();mapRef.current=null;overlayRef.current=null;tileRef.current=null;fittedPoint.current=''};
  },[boundaries]);
  useEffect(()=>{
    const map=mapRef.current, tiles=tileRef.current;if(!map||!tiles)return;
    if(baseEnabled){tiles.addTo(map);setTileError(false)}else tiles.remove();
  },[baseEnabled,boundaries]);
  useEffect(()=>{const map=mapRef.current;if(!map)return;if(!matchMedia('(pointer: coarse)').matches||touchPan)map.dragging.enable();else map.dragging.disable()},[touchPan,boundaries]);
  useEffect(()=>{
    const map=mapRef.current,overlay=overlayRef.current;if(!map||!overlay)return;overlay.clearLayers();
    const distanceLabels:Array<{tooltip:L.Tooltip;anchor:L.LatLngTuple}>=[];
    const selected=new Map(result?.stations.map((s,i)=>[s.municipality_id,{station:s,index:i+1}])||[]);
    if(point&&result)for(const [index,s] of result.stations.entries()){
      L.polyline([[point.latitude,point.longitude],[s.latitude,s.longitude]],{color:'#168b86',opacity:.75,weight:s.weight===null?1:1.5+s.weight*7,dashArray:s.weight===null?'4 5':undefined,interactive:false}).addTo(overlay);
      if(s.distance_km>.01){
        const anchor:L.LatLngTuple=[(point.latitude+s.latitude)/2,(point.longitude+s.longitude)/2];
        const tooltip=L.tooltip({permanent:true,direction:'center',className:'hub-distance-label',interactive:false})
          .setLatLng(anchor).setContent(textNode(`${index+1} · ${number(s.distance_km,1)} km`)).addTo(overlay);
        distanceLabels.push({tooltip,anchor});
      }
    }
    for(const s of stations){
      if(s.latitude===null||s.longitude===null)continue;
      const chosen=selected.get(s.municipality_id);
      const marker=L.circleMarker([s.latitude,s.longitude],{radius:chosen?8:s.status==='active'?4:3,color:chosen?'#075f5a':s.status==='active'?'#3c7787':'#bd8749',fillColor:chosen?'#0c8c83':s.status==='active'?'#6d9caa':'#d5ab72',fillOpacity:.9,weight:chosen?2:1,bubblingMouseEvents:false});
      marker.bindTooltip(textNode(`${s.municipality_name} · ${s.station_name}${chosen?` · ${number(chosen.station.distance_km)} km · peso ${chosen.station.weight===null?'—':number(chosen.station.weight*100)}%`:''}`));
      const choose=()=>pickRef.current({latitude:s.latitude!,longitude:s.longitude!});
      marker.on('click',choose);marker.addTo(overlay);
      const path=marker.getElement();
      if(path){path.setAttribute('data-station-id',s.municipality_id);path.setAttribute('role','button');path.setAttribute('tabindex','0');path.setAttribute('aria-label',`Selecionar posto IDF de ${s.municipality_name}`);path.addEventListener('keydown',event=>{const key=(event as KeyboardEvent).key;if(key==='Enter'||key===' '){event.preventDefault();event.stopPropagation();choose()}})}
      if(chosen)L.marker([s.latitude,s.longitude],{interactive:false,icon:L.divIcon({className:'hub-station-number',html:String(chosen.index),iconSize:[18,18],iconAnchor:[9,28]})}).addTo(overlay);
    }
    if(point){L.marker([point.latitude,point.longitude],{interactive:false,icon:L.divIcon({className:'hub-point',html:'<span></span>',iconSize:[22,22],iconAnchor:[11,11]})}).bindTooltip(textNode('Ponto selecionado')).addTo(overlay);if(!map.getBounds().contains([point.latitude,point.longitude]))map.panTo([point.latitude,point.longitude]);}
    if(point&&result?.stations.length&&fittedPoint.current!==`${point.latitude},${point.longitude}`){
      const positions:L.LatLngTuple[]=[[point.latitude,point.longitude],...result.stations.map(s=>[s.latitude,s.longitude] as L.LatLngTuple)];
      map.fitBounds(L.latLngBounds(positions),{padding:[55,55],maxZoom:11,animate:false});fittedPoint.current=`${point.latitude},${point.longitude}`;
    }
    function arrangeLabels(){
      const placed:Array<{left:number;top:number;right:number;bottom:number}>=[],size=map!.getSize();
      for(const {tooltip,anchor} of distanceLabels){
        const origin=map!.latLngToContainerPoint(anchor),box=tooltip.getElement()?.getBoundingClientRect(),w=box?.width||80,h=box?.height||22;
        const options=[[0,-14],[0,16],[-70,0],[70,0],[-70,-28],[70,28],[0,-46],[0,46],[-110,-48],[110,48],[0,-78],[0,78]];
        for(const [dx,dy] of options){
          const x=Math.max(w/2+6,Math.min(size.x-w/2-6,origin.x+dx)),y=Math.max(h/2+6,Math.min(size.y-h/2-6,origin.y+dy));
          const rect={left:x-w/2-3,top:y-h/2-3,right:x+w/2+3,bottom:y+h/2+3};
          if(placed.some(p=>rect.left<p.right&&rect.right>p.left&&rect.top<p.bottom&&rect.bottom>p.top))continue;
          tooltip.options.offset=L.point(x-origin.x,y-origin.y);tooltip.update();placed.push(rect);break;
        }
      }
    }
    arrangeLabels();map.on('zoomend moveend',arrangeLabels);
    return()=>{map.off('zoomend moveend',arrangeLabels)};
  },[stations,point,result,boundaries]);
  function reset(){const map=mapRef.current;if(map)map.fitBounds(L.geoJSON(boundaries).getBounds(),{padding:[15,15]});}
  function fitHub(){if(!mapRef.current||!point)return;const positions:L.LatLngTuple[]=[[point.latitude,point.longitude],...(result?.stations.map(s=>[s.latitude,s.longitude] as L.LatLngTuple)||[])];mapRef.current.fitBounds(L.latLngBounds(positions),{padding:[55,55],maxZoom:11});}
  return <><div className="spatial-map-toolbar"><span>Clique no mapa para selecionar o ponto</span><div><button type="button" onClick={reset}>Ver São Paulo</button><button type="button" disabled={!result?.stations.length} onClick={fitHub}>Ver ligações</button><label><input type="checkbox" checked={baseEnabled} onChange={e=>setBaseEnabled(e.target.checked)}/>Mapa-base</label><button type="button" className="touch-pan-toggle" aria-pressed={touchPan} onClick={()=>setTouchPan(!touchPan)}>{touchPan?'Liberar rolagem':'Mover mapa'}</button></div></div>
    <div ref={element} className="spatial-leaflet" role="region" aria-label="Mapa interativo Leaflet para selecionar o ponto de cálculo IDW"/>
    {tileError&&baseEnabled?<p className="spatial-tile-warning" role="status">Mapa-base indisponível em parte da área. Os limites municipais, postos e cálculos continuam disponíveis. Desative e reative “Mapa-base” para tentar novamente.</p>:null}
    <div className="spatial-map-key"><span><i className="point-key"/>Ponto escolhido</span><span><i className="station-key"/>Posto IDF ativo</span><span><i className="pending-key"/>Equação indisponível</span><span><i className="hub-key"/>Espessura: peso IDW</span></div></>;
}
