import { test } from 'node:test';
import assert from 'node:assert/strict';
process.env.JWT_SECRET ??= 'test-secret-that-is-long-enough-for-the-local-test';
process.env.DATABASE_URL ??= 'postgresql://ppt:ppt_local_password@127.0.0.1:5432/ppt_test';
const { buildApp } = await import('./app.js');

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
