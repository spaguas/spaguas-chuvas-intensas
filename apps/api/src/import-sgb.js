import { readFile } from 'node:fs/promises';
import { getSgbSettings } from './services/sgb-settings-service.js';
import { db } from './db.js';
import { importSgbDocument } from './repositories/sgb-repository.js';
const catalog=JSON.parse(await readFile(new URL('../../../data/sgb/catalog.json',import.meta.url),'utf8'));
const totals={imported:0,duplicates:0,pending:0,unchanged:0};
try{
 const {settings}=await getSgbSettings();
 // Chronological application is deliberate; older publications never supersede newer ones.
 for(const d of catalog.documents.toSorted((a,b)=>a.metadata.issued_year-b.metadata.issued_year||a.external_id.localeCompare(b.external_id))){const r=await importSgbDocument(d,db,settings);for(const k of Object.keys(totals))totals[k]+=r[k];}
 console.log(JSON.stringify({event:'sgb.snapshot_imported',publications:catalog.documents.length,...totals}));
}finally{await db.destroy();}
