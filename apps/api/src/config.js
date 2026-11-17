import { z } from 'zod';
const env = z.object({
 DATABASE_URL:z.string().min(1), JWT_SECRET:z.string().min(48).refine(s=>!s.startsWith('replace-'),'Gere um JWT_SECRET aleatório.'),
 NODE_ENV:z.enum(['development','production','test']).default('development'), PORT:z.coerce.number().int().min(1).max(65535).default(3108),
 SIBH_POLL_SECONDS:z.coerce.number().int().min(60).default(300), SIBH_TIMEOUT_MS:z.coerce.number().int().min(1000).max(120000).default(30000),
 SGB_POLL_SECONDS:z.coerce.number().int().min(3600).default(86400),SGB_TIMEOUT_MS:z.coerce.number().int().min(1000).max(180000).default(90000),
 SIBH_URL:z.url().default('https://apps.spaguas.sp.gov.br/sibh/api/v2/measurements/now?station_type_id=2&hours=1&show_all=false&serializer=complete&public=true')
});
export const config=env.parse(process.env);
export const BASE='/chuvas_intensas';
