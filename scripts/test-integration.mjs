import { spawnSync } from 'node:child_process';
// Intentionally requires an explicit, isolated database. Tests never target DATABASE_URL.
if(!process.env.TEST_DATABASE_URL)throw new Error('Defina TEST_DATABASE_URL com um banco cujo nome termina em _test.');
const result=spawnSync(process.execPath,['--test','apps/api/test/*.test.js'],{env:process.env,stdio:'inherit'});process.exit(result.status??1);
