export interface FamilyVariable {name:string;label:string;unit:string;default_value:number;min_value:number;max_value:number}
export interface ExpressionDefinition {expression:string;variables:FamilyVariable[];default_unit:'mm_min'|'mm_h'}
export interface FamilyDefinition extends ExpressionDefinition {id:string;family_code:string;version:number;name:string;description:string;change_notes:string;created_at?:string;usage_count?:number}
export interface EquationFamily {code:string;active:boolean;is_builtin:boolean;latest:FamilyDefinition;versions:FamilyDefinition[];usage_count:number}
export interface Segment { family:string;family_version_id?:string;family_definition?:FamilyDefinition;unit:'mm_min'|'mm_h'; duration_min:number;duration_max:number;parameters:Record<string,number> }
export const BUILTIN_FAMILIES:FamilyDefinition[];
export class ExpressionError extends Error {code:string;status:number}
export function compileExpression(expression:string,variables:string[]):{source:string;evaluate:(values:Record<string,number>)=>number};
export function validateVariables(variables:FamilyVariable[]):FamilyVariable[];
export function validateFamilyDefinition<T extends ExpressionDefinition>(definition:T):T;
export function validateFamilyParameters(definition:ExpressionDefinition,parameters:Record<string,number>):void;
export function evaluateExpressionFamily(definition:ExpressionDefinition,parameters:Record<string,number>,t:number,T:number):number;
export interface Equation {source_url?:string|null;publication_year?:number|null;source_agency?:string;station_latitude?:number|null;station_longitude?:number|null;id:string;municipality_id:string;status:'active'|'pending'|'retired';version:number;return_min:number;return_max:number;segments:Segment[];source_page:number;source_pdf_page:number;source_author:string;source_formula:string;review_notes:string;station_name:string;station_prefix:string;reference_checks?:ReferenceCheck[]}
export interface ReferenceCheck {duration:number;return_period:number;intensity_mm_h:number}
export interface Calculation {duration:number;return_period:number;intensity_mm_h:number;depth_mm:number;annual_exceedance_probability:number;equation_id:string;version:number}
export class HydrologyError extends Error {code:string;status:number}
export const RETURN_PERIODS:number[];
export const SIBH_WINDOWS:readonly number[];
export function validateSibhHours(hours:number):number;
export const DURATIONS:number[];
export function calculate(e:Equation,t:number,T:number):Calculation;
export function validateEquation(e:Equation):Equation;
export function evaluateSegment(s:Segment,t:number,T:number):number;
export function estimateReturnPeriod(e:Equation,t:number,depth:number):{return_period:number|null;bound:string;limit:number|null;classification:string};
export function buildCurves(e:Equation,mode?:string,fixedDuration?:number):{series:number[];rows:Record<string,number>[]};
export interface GeoPoint {latitude:number;longitude:number}
export interface SpatialInput extends GeoPoint {duration:number;depth_mm:number;neighbors?:number;power?:number;radius_km?:number}
export interface SpatialReference extends GeoPoint {municipality_id:string;municipality_name:string;equation:Equation;coordinate_warning?:string|null}
export interface SpatialStation extends GeoPoint {source_url?:string|null;publication_year?:number|null;source_agency?:string;station_name:string;station_prefix:string;source_pdf_page:number;municipality_id:string;municipality_name:string;equation_id:string;equation_version:number;distance_km:number;return_period:number|null;bound:string;limit:number|null;classification:string;coordinate_warning:string|null;weight:number|null;contribution_years:number|null}
export interface SpatialEstimate {return_period:number|null;lower_bound:number;upper_bound:number|null;bound:'within'|'below'|'above'|'interval';censored:boolean}
export interface SpatialResult {status:'estimated'|'bounded'|'insufficient_neighbors';parameters:{neighbors:number;power:number;radius_km:number;minimum_neighbors:number;distance_method:string;target:string};estimate:SpatialEstimate|null;stations:SpatialStation[];excluded_stations:Array<{municipality_id:string;municipality_name:string;distance_km:number|null;reason:string}>;effective_neighbors:number|null;warning:string}
export function distanceKm(a:GeoPoint,b:GeoPoint):number;
export function spatialReturnPeriod(references:SpatialReference[],input:SpatialInput):SpatialResult;
