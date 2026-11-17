import { db } from './db.js';
try {const [,names]=await db.migrate.latest({directory:new URL('../../../db/migrations',import.meta.url).pathname,loadExtensions:['.js']}); console.log('Migrations aplicadas:',names);} finally {await db.destroy();}
