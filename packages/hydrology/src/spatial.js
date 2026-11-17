import { calculate, estimateReturnPeriod, HydrologyError } from './index.js';

/** Great-circle distance; coordinates are geographic degrees, output is kilometres. */
export function distanceKm(a, b) {
  for (const p of [a, b]) {
    if (!Number.isFinite(p.latitude) || !Number.isFinite(p.longitude) || Math.abs(p.latitude) > 90 || Math.abs(p.longitude) > 180) {
      throw new HydrologyError('Coordenadas geográficas inválidas.', 'INVALID_COORDINATES');
    }
  }
  const radians = Math.PI / 180;
  const lat = (b.latitude - a.latitude) * radians, lon = (b.longitude - a.longitude) * radians;
  const h = Math.sin(lat / 2) ** 2 + Math.cos(a.latitude * radians) * Math.cos(b.latitude * radians) * Math.sin(lon / 2) ** 2;
  return 6371.0088 * 2 * Math.atan2(Math.sqrt(Math.min(1, h)), Math.sqrt(Math.max(0, 1 - h)));
}

/** IDW of local return periods. Censored estimates propagate bounds, never fabricated years. */
export function spatialReturnPeriod(references, input) {
  const { latitude, longitude, duration, depth_mm, neighbors = 5, power = 2, radius_km = 100 } = input;
  distanceKm(input, input);
  if (!(Number.isFinite(duration) && duration > 0 && duration <= 10080 && Number.isFinite(depth_mm) && depth_mm >= 0 && depth_mm <= 10000)) throw new HydrologyError('Chuva ou duração inválida.');
  if (!(Number.isInteger(neighbors) && neighbors >= 3 && neighbors <= 12 && Number.isFinite(power) && power >= 1 && power <= 4 && Number.isFinite(radius_km) && radius_km >= 5 && radius_km <= 300)) throw new HydrologyError('Parâmetros de vizinhança IDW inválidos.');
  const excluded = [], candidates = [];
  for (const reference of references) {
    const { equation, ...station } = reference;
    let distance;
    try { distance = distanceKm(input, station); } catch { excluded.push({ ...station, distance_km: null, reason: 'missing_coordinates' }); continue; }
    let reason;
    if (equation.status !== 'active') reason = 'inactive_equation';
    else if (distance > radius_km) reason = 'outside_radius';
    if (reason) { excluded.push({ ...station, distance_km: distance, reason }); continue; }
    try {
      // Check the actual piecewise domain before selecting neighbors.
      calculate(equation, duration, equation.return_min);
      const estimate = estimateReturnPeriod(equation, duration, depth_mm);
      candidates.push({ ...station,source_url:equation.source_url,source_pdf_page:equation.source_pdf_page,publication_year:equation.publication_year,source_agency:equation.source_agency, equation_id: equation.id, equation_version: equation.version, distance_km: distance, ...estimate });
    } catch { excluded.push({ ...station, distance_km: distance, reason: 'invalid_equation_or_duration' }); }
  }
  // Several SGB municipalities explicitly share the same physical station. A coordinate
  // must contribute once, rather than acquiring extra IDW weight through republication.
  candidates.sort((a,b)=>(b.publication_year||0)-(a.publication_year||0)||a.municipality_id.localeCompare(b.municipality_id));
  const locations=new Set();
  for(let i=0;i<candidates.length;){const s=candidates[i],key=`${s.latitude.toFixed(6)}:${s.longitude.toFixed(6)}`;
   if(locations.has(key)){excluded.push({...s,reason:'duplicate_reference_location'});candidates.splice(i,1);}else{locations.add(key);i++;}}
  candidates.sort((a, b) => a.distance_km - b.distance_km || a.municipality_id.localeCompare(b.municipality_id));
  // Coincidence tolerance is 1 mm, solely to avoid division by zero. No station relocation.
  const coincident = candidates.filter(s => s.distance_km <= 1e-6);
  const selected = coincident.length ? coincident : candidates.slice(0, neighbors);
  const selectedIds = new Set(selected.map(s => s.equation_id));
  for (const s of candidates) if (!selectedIds.has(s.equation_id)) excluded.push({ ...s, reason: 'beyond_neighbor_count' });
  const parameters = { neighbors, power, radius_km, minimum_neighbors: 3, distance_method: 'haversine', target: 'local_return_period_years' };
  if (!coincident.length && selected.length < 3) {
    return { status: 'insufficient_neighbors', parameters, estimate: null, stations: selected.map(s => ({ ...s, weight: null, contribution_years: null })), excluded_stations: excluded, effective_neighbors: null, warning: 'São necessários pelo menos três postos elegíveis no raio, ou coincidência com um posto IDF. Aumente o raio de busca.' };
  }
  // Scale by the nearest distance so very small distances never overflow the weights.
  const raw = selected.map(s => coincident.length ? 1 : (selected[0].distance_km / s.distance_km) ** power);
  const total = raw.reduce((sum, weight) => sum + weight, 0);
  let lower = 0, upper = 0, unbounded = false;
  const stations = selected.map((s, i) => {
    const weight = raw[i] / total;
    const low = s.bound === 'below' ? 1 : s.bound === 'above' ? s.limit : s.return_period;
    const high = s.bound === 'below' ? s.limit : s.bound === 'above' ? null : s.return_period;
    lower += weight * low;
    if (high === null) unbounded = true; else upper += weight * high;
    return { ...s, weight, contribution_years: s.return_period === null ? null : weight * s.return_period };
  });
  const exact = stations.every(s => s.bound === 'within');
  const allBelow = stations.every(s => s.bound === 'below'), allAbove = stations.every(s => s.bound === 'above');
  const estimate = { return_period: exact ? lower : null, lower_bound: lower, upper_bound: unbounded ? null : upper, bound: exact ? 'within' : allBelow ? 'below' : allAbove ? 'above' : 'interval', censored: !exact };
  return { status: exact ? 'estimated' : 'bounded', parameters, estimate, stations, excluded_stations: excluded, effective_neighbors: 1 / stations.reduce((sum, s) => sum + s.weight ** 2, 0), warning: 'IDW aplicado diretamente aos retornos locais é uma estimativa espacial exploratória, não uma equação IDF regional homologada. Distância não representa semelhança de relevo ou clima.' };
}
