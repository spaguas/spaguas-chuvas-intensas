import { readFile } from 'node:fs/promises';
import { booleanPointInPolygon } from '@turf/boolean-point-in-polygon';
import { HydrologyError } from '@chuvas/hydrology';

const [geoText, sourceText] = await Promise.all([
  readFile(new URL('../../../../data/geography/sp-municipalities.geojson', import.meta.url), 'utf8'),
  readFile(new URL('../../../../data/geography/source.json', import.meta.url), 'utf8')
]);
export const municipalBoundaries = JSON.parse(geoText);
export const geographySource = JSON.parse(sourceText);
const indexed = municipalBoundaries.features.map(feature => {
  const bbox = [Infinity, Infinity, -Infinity, -Infinity];
  const polygons = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
  for (const polygon of polygons) for (const ring of polygon) for (const [lon, lat] of ring) {
    bbox[0] = Math.min(bbox[0], lon); bbox[1] = Math.min(bbox[1], lat);
    bbox[2] = Math.max(bbox[2], lon); bbox[3] = Math.max(bbox[3], lat);
  }
  return { feature, bbox };
});
export function locateMunicipality(latitude, longitude) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) throw new HydrologyError('Coordenadas inválidas.', 'INVALID_COORDINATES');
  const found = indexed.filter(({ feature, bbox: b }) => longitude >= b[0] && longitude <= b[2] && latitude >= b[1] && latitude <= b[3] && booleanPointInPolygon([longitude, latitude], feature));
  if (!found.length) throw new HydrologyError('O ponto está fora da malha municipal paulista. Selecione um ponto no Estado de São Paulo.', 'POINT_OUTSIDE_SP');
  if (found.length > 1) throw new HydrologyError('O ponto coincide com uma divisa municipal da malha simplificada. Desloque o ponto para identificar um único município.', 'AMBIGUOUS_BOUNDARY');
  const p = found[0].feature.properties;
  return { id: String(p.codarea), name: p.name };
}
export function coordinateWarning(station) {
  if (!Number.isFinite(station.latitude) || !Number.isFinite(station.longitude)) return 'Coordenadas do posto indisponíveis.';
  const own = indexed.find(i => String(i.feature.properties.codarea) === station.municipality_id);
  return own && !booleanPointInPolygon([station.longitude, station.latitude], own.feature)
    ? 'Coordenada transcrita do estudo fora do polígono municipal simplificado; confira o georreferenciamento do posto.' : null;
}
