import { test } from 'node:test';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';
dotenv.config({ path: '../../.env' });
dotenv.config();
process.env.JWT_SECRET ??= 'test-secret-that-is-long-enough-for-the-local-test';
const { buildApp } = await import('./app.js');

import { pool } from './db/index.js';

test('health endpoint reports the API process is alive', async()=>{
  const app=await buildApp();
  const response=await app.inject({method:'GET',url:'/api/health'});
  assert.equal(response.statusCode,200);assert.deepEqual(response.json(),{status:'ok'});
  await app.close();
});
test('private routes reject requests without a session',async()=>{
  const app=await buildApp();const response=await app.inject({method:'GET',url:'/api/activities'});
  assert.equal(response.statusCode,401);await app.close();
});

test.after(async () => {
  await pool.end();
});
