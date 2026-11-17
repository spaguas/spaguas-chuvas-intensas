import { createInterface } from 'node:readline/promises';
import { stdin,stdout } from 'node:process';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { db } from './db.js';
// Accept JSON through stdin for automation; no password in shell arguments or repository.
try {
 let data;
 if(!stdin.isTTY){let raw='';for await(const chunk of stdin)raw+=chunk;data=JSON.parse(raw);}
 else {const rl=createInterface({input:stdin,output:stdout});const name=await rl.question('Nome: ');const email=await rl.question('E-mail: ');rl.close();
 stdout.write('Senha (oculta): ');stdin.setRawMode(true);stdin.resume();let password='';
 for await(const chunk of stdin){for(const char of chunk.toString()){if(char==='\u0003')process.exit(130);if(char==='\r'||char==='\n'){stdin.setRawMode(false);stdin.pause();break;} if(char==='\u007f')password=password.slice(0,-1);else password+=char;}if(!stdin.isRaw)break;}
 stdout.write('\n');data={name,email,password};}
 data=z.object({name:z.string().min(2).max(100),email:z.email().transform(v=>v.toLowerCase()),password:z.string().min(14).max(72).refine(v=>Buffer.byteLength(v,'utf8')<=72,'A senha deve ter no máximo 72 bytes em UTF-8.')}).parse(data);
 await db('users').insert({name:data.name,email:data.email,password_hash:await bcrypt.hash(data.password,12),role:'admin'});
 console.log('Administrador criado.');
}finally{await db.destroy();}
