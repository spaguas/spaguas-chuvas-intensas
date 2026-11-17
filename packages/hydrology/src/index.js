/** All evaluators use minutes and years; outputs are normalized to mm/h. No eval. */
import { evaluateExpressionFamily,validateFamilyDefinition,validateFamilyParameters } from './expression.js';
export { SIBH_WINDOWS,validateSibhHours } from './windows.js';
export { ExpressionError,compileExpression,validateVariables,validateFamilyDefinition,validateFamilyParameters,evaluateExpressionFamily } from './expression.js';
export { BUILTIN_FAMILIES } from './families.js';
export class HydrologyError extends Error {
  constructor(message, code = 'INVALID_DOMAIN') { super(message); this.code = code; this.status = 422; }
}
export const RETURN_PERIODS = [2, 5, 10, 15, 20, 25, 50, 100, 200];
export const DURATIONS = [10, 20, 30, 60, 120, 180, 360, 720, 1080, 1440];
export { distanceKm, spatialReturnPeriod } from './spatial.js';
export function evaluateSegment(segment, t, T) {
  const p = segment.parameters;
  let value;
  if (segment.family_definition) {
    value = evaluateExpressionFamily(segment.family_definition,p,t,T);
  } else if (segment.family === 'GUMBEL') {
    // log1p avoids cancellation for large T: ln(T/(T-1)) = log1p(1/(T-1)).
    value = p.A * (t + p.B) ** p.C + p.D * (t + p.E) ** p.F * (p.G + p.H * Math.log(Math.log1p(1 / (T - 1))));
  } else if (segment.family === 'GENERAL') {
    // Explicit GENERAL_V1 contract. Coefficients are not interchangeable with another formula.
    value = p.C * T ** p.m / (t + p.to) ** (p.n + p.k * T ** p.d) + p.p;
  } else throw new HydrologyError('Família de equação não suportada.');
  value *= segment.unit === 'mm_min' ? 60 : 1;
  if (!Number.isFinite(value) || value <= 0) throw new HydrologyError('A equação produziu uma intensidade inválida.');
  return value;
}
export function validateEquation(equation) {
  if (!Array.isArray(equation.segments) || !equation.segments.length) throw new HydrologyError('Informe pelo menos um trecho.');
  if (!(equation.return_min > 1 && equation.return_max > equation.return_min && equation.return_max <= 10000)) throw new HydrologyError('Domínio de retorno inválido.');
  let last;
  for (const s of equation.segments) {
    if (!(s.duration_min > 0 && s.duration_max > s.duration_min && s.duration_max <= 10080)) throw new HydrologyError('Domínio de duração inválido.');
    if (last !== undefined && s.duration_min !== last) throw new HydrologyError('Os trechos devem ser contíguos, ordenados e sem sobreposição.');
    last = s.duration_max;
    if(s.family_definition){
      validateFamilyDefinition(s.family_definition);validateFamilyParameters(s.family_definition,s.parameters);
      if(s.family_definition.family_code!==s.family||s.family_version_id&&s.family_definition.id!==s.family_version_id)throw new HydrologyError('A versão da família não corresponde ao trecho.');
    }else{
      const keys = s.family === 'GUMBEL' ? ['A','B','C','D','E','F','G','H'] : s.family === 'GENERAL' ? ['C','to','n','k','m','d','p'] : [];
      if (!keys.length || keys.some(k => typeof s.parameters?.[k] !== 'number' || !Number.isFinite(s.parameters[k]) || Math.abs(s.parameters[k]) > 1e7) || Object.keys(s.parameters).some(k => !keys.includes(k))) throw new HydrologyError('Parâmetros ausentes, desconhecidos ou inválidos.');
    }
    if (!['mm_min','mm_h'].includes(s.unit)) throw new HydrologyError('Unidade inválida.');
    for (let j = 0; j <= 24; j++) {
      const t = s.duration_min + (s.duration_max - s.duration_min) * j / 24;
      let before = 0;
      for (let k = 0; k <= 16; k++) {
        const T = equation.return_min * (equation.return_max / equation.return_min) ** (k / 16);
        const v = evaluateSegment(s, t, T);
        if (k && v <= before) throw new HydrologyError('A intensidade deve crescer com o período de retorno em todo o domínio.');
        before = v;
      }
    }
  }
  return equation;
}
export function calculate(equation, duration, returnPeriod) {
  if (equation.status !== 'active') throw new HydrologyError(equation.status === 'pending' ? 'Equação pendente de revisão técnica; cálculo indisponível.' : 'Equação retirada de uso; cálculo indisponível.', equation.status === 'pending' ? 'EQUATION_PENDING' : 'EQUATION_UNAVAILABLE');
  if (!Number.isFinite(duration) || !Number.isFinite(returnPeriod) || returnPeriod < equation.return_min || returnPeriod > equation.return_max) throw new HydrologyError(`Período de retorno entre ${equation.return_min} e ${equation.return_max} anos.`);
  const s = equation.segments.find((s, i) => (i === 0 ? duration >= s.duration_min : duration > s.duration_min) && duration <= s.duration_max);
  if (!s) throw new HydrologyError('Duração fora do domínio publicado para este município.');
  const intensity = evaluateSegment(s, duration, returnPeriod);
  return {duration, return_period: returnPeriod, intensity_mm_h: intensity, depth_mm: intensity * duration / 60, annual_exceedance_probability: 1 / returnPeriod, equation_id: equation.id, version: equation.version};
}
export function estimateReturnPeriod(equation, duration, depth) {
  if (!Number.isFinite(depth) || depth < 0) throw new HydrologyError('Altura de chuva inválida.');
  const target = depth * 60 / duration;
  const lo = calculate(equation, duration, equation.return_min).intensity_mm_h;
  const hi = calculate(equation, duration, equation.return_max).intensity_mm_h;
  const epsilon = Math.max(1e-9, Math.abs(target) * 1e-12);
  if (target < lo - epsilon) return {return_period: null, bound: 'below', limit: equation.return_min, classification: 'below_reference'};
  if (target > hi + epsilon) return {return_period: null, bound: 'above', limit: equation.return_max, classification: 'above_reference'};
  let a = equation.return_min, b = equation.return_max;
  for (let i = 0; i < 64; i++) {
    const mid = (a + b) / 2;
    if (calculate(equation, duration, mid).intensity_mm_h < target) a = mid; else b = mid;
  }
  const T = (a + b) / 2;
  return {return_period: T, bound: 'within', limit: null, classification: T >= 25 ? 'very_rare' : T >= 10 ? 'rare' : 'reference'};
}
export function buildCurves(equation, mode = 'duration', fixedDuration = 60) {
  const min = equation.segments[0].duration_min, max = equation.segments.at(-1).duration_max;
  const durations = [...new Set([min, ...DURATIONS.filter(t => t >= min && t <= max), max])];
  const series = mode === 'duration' ? RETURN_PERIODS.filter(T => T >= equation.return_min && T <= equation.return_max) : durations;
  const x = mode === 'duration' ? [...new Set([...Array.from({length:100}, (_,i) => min * (max/min) ** (i/99)), ...durations, fixedDuration].filter(t => t >= min && t <= max))].sort((a,b)=>a-b) : Array.from({length:100}, (_,i) => equation.return_min + (equation.return_max-equation.return_min)*i/99);
  return {series, rows:x.map(x => Object.fromEntries([['x',x], ...series.map(s=>[String(s),calculate(equation,mode==='duration'?x:s,mode==='duration'?s:x).intensity_mm_h])]))};
}
