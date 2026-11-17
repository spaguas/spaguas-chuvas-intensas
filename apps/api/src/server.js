import { app } from './app.js';
import { config } from './config.js';
import { db } from './db.js';
const server=app.listen(config.PORT,'0.0.0.0',()=>console.log(`API: http://localhost:${config.PORT}/chuvas_intensas/api`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(async()=>{await db.destroy();process.exit(0);}));
