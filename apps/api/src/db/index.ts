import dns from 'node:dns';
try { dns.setDefaultResultOrder('ipv4first'); } catch {}
import dotenv from 'dotenv';
dotenv.config({ path: '../../.env' });
dotenv.config();
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema.js';
const { Pool } = pg;
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 120000,
  connectionTimeoutMillis: 30000,
  keepAlive: true
});
export const db = drizzle(pool,{schema});
export async function closeDatabase(){ await pool.end(); }
