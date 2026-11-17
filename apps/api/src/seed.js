import { readFile } from 'node:fs/promises';
import { db } from './db.js';
const catalog=JSON.parse(await readFile(new URL('../../../data/catalog.json',import.meta.url),'utf8'));
try {
 await db.transaction(async trx=>{
  await trx('source_documents').insert({sha256:catalog.source.sha256,title:catalog.source.title,metadata:catalog.source}).onConflict('sha256').ignore();
  for (const m of catalog.municipalities) await trx('municipalities').insert(m).onConflict('id').ignore();
  for(const e of catalog.equations){
   // Never overwrite a revised equation on a subsequent deployment.
   if(await trx('idf_equations').where({municipality_id:e.municipality_id}).first())continue;
   const {segments,...row}=e;
   const municipality=catalog.municipalities.find(m=>m.id===e.municipality_id);
   await trx('idf_equations').insert({...row,managed_by:'daee_seed',publication_year:2018,station_latitude:municipality.latitude,station_longitude:municipality.longitude,reference_checks:JSON.stringify(row.reference_checks)});
   await trx('idf_segments').insert(segments.map((s,ordinal)=>({...s,equation_id:e.id,ordinal})));
  }
 });
 console.log('Catálogo importado:',catalog.equations.length,'localidades.');
} finally {await db.destroy();}
