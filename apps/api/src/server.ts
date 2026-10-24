import dns from 'node:dns';
try { dns.setDefaultResultOrder('ipv4first'); } catch {}
import dotenv from 'dotenv';
dotenv.config({ path: '../../.env' });
dotenv.config();
import { buildApp } from './app.js';
import { closeDatabase } from './db/index.js';
const port=Number(process.env.PORT??4000);
const app=await buildApp();
try { await app.listen({port,host:'0.0.0.0'}); }
catch(err){app.log.error(err);process.exit(1);}
const shutdown=async(signal:string)=>{app.log.info({signal},'Shutting down');try{await app.close();await closeDatabase();process.exit(0);}catch(err){app.log.error(err);process.exit(1);}};
process.on('SIGINT',()=>void shutdown('SIGINT'));process.on('SIGTERM',()=>void shutdown('SIGTERM'));
