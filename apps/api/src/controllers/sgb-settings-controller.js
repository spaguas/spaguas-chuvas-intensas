import { saveSgbSettings,sgbSettingsResponse } from '../services/sgb-settings-service.js';
export async function settings(req,res){res.set('Cache-Control','no-store').json(await sgbSettingsResponse());}
export async function save(req,res){await saveSgbSettings(req.body,req.user.id);res.set('Cache-Control','no-store').json(await sgbSettingsResponse());}
