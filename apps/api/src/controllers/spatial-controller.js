import { z } from 'zod';
import { spatialReturnPeriod } from '@chuvas/hydrology';
import { spatialReferences } from '../repositories/catalog-repository.js';
import { coordinateWarning, geographySource, locateMunicipality, municipalBoundaries } from '../services/geography-service.js';

const input = z.object({
  latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180),
  duration: z.number().positive().max(10080), depth_mm: z.number().nonnegative().max(10000),
  neighbors: z.number().int().min(3).max(12).default(5), power: z.number().min(1).max(4).default(2),
  radius_km: z.number().min(5).max(300).default(100)
}).strict();

export async function spatialEstimate(req, res) {
  const data = input.parse(req.body);
  const municipality = locateMunicipality(data.latitude, data.longitude);
  const references = (await spatialReferences()).map(s => ({ ...s, station_name:s.equation.station_name, station_prefix:s.equation.station_prefix, source_pdf_page:s.equation.source_pdf_page, coordinate_warning: coordinateWarning(s) }));
  const local = references.find(s => s.municipality_id === municipality.id);
  const result = spatialReturnPeriod(references, data);
  res.json({ ...result, point: { latitude: data.latitude, longitude: data.longitude }, municipality,
    local_equation_status: local?.equation.status || 'not_registered', duration: data.duration, depth_mm: data.depth_mm,
    intensity_mm_h: data.depth_mm * 60 / data.duration, geography_source: geographySource });
}
export async function referenceStations(req, res) {
  const references = await spatialReferences();
  res.json({ source: geographySource, stations: references.map(({ equation, ...s }) => ({ ...s,
    coordinate_warning: coordinateWarning(s), equation_id: equation.id, equation_version: equation.version,
    status: equation.status, station_name: equation.station_name, station_prefix: equation.station_prefix,
    duration_min: equation.segments[0].duration_min, duration_max: equation.segments.at(-1).duration_max
  })) });
}
export function boundaries(req, res) {
  res.set('Cache-Control', 'public, max-age=86400').json(municipalBoundaries);
}
