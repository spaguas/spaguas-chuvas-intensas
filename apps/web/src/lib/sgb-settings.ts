export interface SgbSettings {
 enabled:boolean;poll_seconds:number;failure_retry_seconds:number;timeout_ms:number;
 max_pdf_mb:number;max_html_mb:number;retry_attempts:number;retry_delay_ms:number;request_delay_ms:number;
 max_catalog_shrink_percent:number;conditional_requests:boolean;ocr_enabled:boolean;ocr_max_pages:number;extraction_timeout_seconds:number;
 adoption_mode:'review'|'fill_missing'|'newer';protect_manual:boolean;allow_same_year_revision:boolean;
 min_reference_points:number;absolute_tolerance:number;relative_tolerance_percent:number;
}
export interface SgbConfiguration {
 settings:SgbSettings;defaults:SgbSettings;revision:number;updated_at:string;enabled:boolean;poll_seconds:number;
 next_check_at:string|null;worker_online:boolean;worker_heartbeat_at:string|null;worker_settings_revision:number|null;running:boolean;
}
export const adoptionLabels={review:'Exigir revisão antes de adotar',fill_missing:'Adotar apenas onde não há equação ativa',newer:'Adotar publicações mais recentes'};
