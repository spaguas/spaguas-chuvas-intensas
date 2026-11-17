// Rebuild the reproducible snapshot from downloaded RIGeo files (not a database write).
import { readFile,writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { parseIndex,parseItem,SGB_INDEX,PARSER_VERSION } from '../apps/api/src/services/sgb-parser.js';
import { extractSgbDocument } from '../apps/api/src/services/sgb-extraction.js';
const cache=process.argv[2];if(!cache)throw new Error('Uso: node scripts/build-sgb-catalog.mjs /caminho/cache');
const entries=parseIndex(await readFile(`${cache}/index.html`,'utf8')),documents=[];
for(const e of entries){
 const folder=`${cache}/documents/${e.external_id}`;
 const metadata=parseItem(await readFile(`${folder}/item.html`,'utf8'));
 const pdf=await readFile(`${folder}/report.pdf`),sha256=createHash('sha256').update(pdf).digest('hex');
 let text=await readFile(`${folder}/report.txt`,'utf8');if(text.length<1000)text=await readFile(`${folder}/ocr.txt`,'utf8');
 documents.push(extractSgbDocument(text,e,metadata,sha256));
}
const summary={publications:documents.length,municipalities:new Set(documents.map(d=>d.municipality.id)).size,models:documents.flatMap(d=>d.models).length,validated:documents.flatMap(d=>d.models).filter(m=>m.validated).length,review:documents.filter(d=>!d.models.length||d.models.some(m=>!m.validated)).length,reference_points:documents.flatMap(d=>d.models).reduce((n,m)=>n+m.reference_checks.length,0)};
await writeFile(new URL('../data/sgb/catalog.json',import.meta.url),JSON.stringify({source_url:SGB_INDEX,retrieved_at:new Date().toISOString(),parser_version:PARSER_VERSION,summary,documents},null,2)+'\n');
console.log(summary);
