import { test } from 'node:test';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';
dotenv.config({ path: '../../.env' });
dotenv.config();

process.env.JWT_SECRET ??= 'test-secret-that-is-long-enough-for-the-local-test-jwt';
const { buildApp } = await import('./app.js');

async function createAuthenticatedSession(app: any, emailSuffix: string) {
  const email = `test-user-${Date.now()}-${emailSuffix}@example.com`;
  const password = 'Password123!@#LongSecure';
  const regRes = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { email, password }
  });
  assert.equal(regRes.statusCode, 201, `Failed to register ${email}: ${regRes.body}`);
  const cookies = regRes.headers['set-cookie'];
  const cookieHeader = Array.isArray(cookies) ? cookies.map((c: string) => c.split(';')[0]).join('; ') : cookies?.split(';')[0];
  const user = JSON.parse(regRes.body).user;
  return { user, cookieHeader };
}

test('Roadmap: Exactly 12 roadmaps in order with 69 technologies and empty topics', async () => {
  const app = await buildApp();
  const { cookieHeader } = await createAuthenticatedSession(app, 'init');

  const res = await app.inject({
    method: 'GET',
    url: '/api/roadmap/overview',
    headers: { cookie: cookieHeader }
  });

  assert.equal(res.statusCode, 200);
  const data = JSON.parse(res.body);

  const expectedRoadmaps = [
    { name: 'Programming Languages', techs: ['JavaScript', 'TypeScript'] },
    { name: 'Web Fundamentals', techs: ['HTML', 'CSS', 'Browser Basics', 'Web Architecture'] },
    { name: 'Frontend Development', techs: ['React', 'Redux Toolkit', 'Next.js', 'Tailwind CSS'] },
    { name: 'Backend Development', techs: ['Node.js', 'Express.js', 'Fastify'] },
    { name: 'API & Security', techs: ['REST APIs', 'Authentication', 'Authorization', 'JWT', 'OAuth', 'Webhooks', 'API Security'] },
    { name: 'Databases & Caching', techs: ['SQL', 'PostgreSQL', 'MongoDB', 'Mongoose', 'Redis', 'Indexing', 'Transactions'] },
    { name: 'Real-Time & Messaging', techs: ['WebSockets', 'Socket.IO', 'WebRTC', 'STUN/TURN', 'BullMQ', 'RabbitMQ', 'Kafka'] },
    { name: 'Computer Science & DSA', techs: ['DSA', 'OOP', 'DBMS', 'Operating Systems', 'Computer Networks'] },
    { name: 'System Design & Architecture', techs: ['HLD', 'LLD', 'Monolith', 'Microservices', 'Caching Strategies', 'Load Balancing', 'Distributed Systems'] },
    { name: 'Testing & Performance', techs: ['Unit Testing', 'Integration Testing', 'Vitest/Jest', 'Supertest', 'k6', 'Autocannon'] },
    { name: 'DevOps, Cloud & Observability', techs: ['Git', 'GitHub', 'Linux', 'Bash', 'Docker', 'CI/CD', 'AWS Basics', 'Nginx', 'Prometheus', 'Grafana', 'OpenTelemetry'] },
    { name: 'Projects & Interview Preparation', techs: ['Projects', 'Resume', 'Project Deep Dives', 'Coding Interviews', 'System Design Interviews', 'HR/Behavioral Questions'] }
  ];

  assert.equal(data.categories.length, 12, 'Must have exactly 12 categories');
  assert.equal(data.stats.totalCategories, 12);
  assert.equal(data.stats.totalTechnologies, 69, 'Must have exactly 69 technologies total');
  assert.equal(data.stats.totalTopics, 1683, 'Seeded topics loaded from apps/data');
  assert.equal(data.stats.completedTopics, 0);
  assert.equal(data.stats.progressPercentage, 0);
  assert.equal(data.stats.hasTopics, true);

  for (let i = 0; i < expectedRoadmaps.length; i++) {
    const expected = expectedRoadmaps[i];
    const cat = data.categories[i];
    assert.equal(cat.name, expected.name, `Category ${i + 1} must be "${expected.name}" in exact order`);
    assert.ok(cat.description, `Category "${cat.name}" must have a useful description`);

    const actualTechNames = cat.technologies.map((t: any) => t.name);
    assert.deepEqual(actualTechNames, expected.techs, `Technologies for "${cat.name}" must match exact order`);
  }

  // Categories 1-5 have topics from apps/data
  assert.equal(data.categories[0].totalTopics, 189); // Programming Languages
  assert.equal(data.categories[1].totalTopics, 319); // Web Fundamentals
  assert.equal(data.categories[2].totalTopics, 332); // Frontend Development
  assert.equal(data.categories[3].totalTopics, 269); // Backend Development
  assert.equal(data.categories[4].totalTopics, 574); // API & Security
  // Categories 6-12 have 0 topics
  for (let i = 5; i < 12; i++) {
    assert.equal(data.categories[i].totalTopics, 0, `Category ${data.categories[i].name} has 0 topics`);
  }

  // Verify GET /api/roadmap/categories/:id detail endpoint
  const firstCat = data.categories[0];
  const catDetailRes = await app.inject({
    method: 'GET',
    url: `/api/roadmap/categories/${firstCat.id}`,
    headers: { cookie: cookieHeader }
  });
  assert.equal(catDetailRes.statusCode, 200);
  const catDetail = JSON.parse(catDetailRes.body).category;
  assert.equal(catDetail.name, 'Programming Languages');
  assert.equal(catDetail.technologies.length, 2);
  assert.equal(catDetail.totalTopics, 189);
  assert.equal(catDetail.technologies[0].name, 'JavaScript');
  assert.equal(catDetail.technologies[0].totalTopics, 98);
  assert.equal(catDetail.technologies[1].name, 'TypeScript');
  assert.equal(catDetail.technologies[1].totalTopics, 91);
  assert.ok(catDetail.description);

  // Verify topics are returned in order
  const jsTopicsRes = await app.inject({
    method: 'GET',
    url: `/api/roadmap/technologies/${catDetail.technologies[0].id}/topics?sortBy=order&sortDir=asc`,
    headers: { cookie: cookieHeader }
  });
  assert.equal(jsTopicsRes.statusCode, 200);
  const jsTopics = JSON.parse(jsTopicsRes.body).items;
  assert.equal(jsTopics.length, 98);
  assert.equal(jsTopics[0].order, 1);
  assert.equal(jsTopics[0].title, 'JavaScript Setup, Runtime and Strict Mode');
  assert.equal(jsTopics[1].order, 2);
  assert.equal(jsTopics[1].title, 'Variables: var, let and const');

  // Idempotent seeding verification
  const reinitRes = await app.inject({
    method: 'POST',
    url: '/api/roadmap/initialize',
    headers: { cookie: cookieHeader }
  });
  assert.equal(reinitRes.statusCode, 200);

  const res2 = await app.inject({
    method: 'GET',
    url: '/api/roadmap/overview',
    headers: { cookie: cookieHeader }
  });
  const data2 = JSON.parse(res2.body);
  assert.equal(data2.categories.length, 12, 'Re-init must not duplicate categories');
  assert.equal(data2.stats.totalTechnologies, 69, 'Re-init must not duplicate technologies');

  await app.close();
});

test('Roadmap: Custom Category and Technology CRUD', async () => {
  const app = await buildApp();
  const { cookieHeader } = await createAuthenticatedSession(app, 'cat-crud');

  // Create custom category
  const createCatRes = await app.inject({
    method: 'POST',
    url: '/api/roadmap/categories',
    headers: { cookie: cookieHeader },
    payload: { name: 'Mobile Development' }
  });
  assert.equal(createCatRes.statusCode, 201);
  const createdCat = JSON.parse(createCatRes.body).category;
  assert.equal(createdCat.name, 'Mobile Development');

  // Prevent duplicate category name
  const dupCatRes = await app.inject({
    method: 'POST',
    url: '/api/roadmap/categories',
    headers: { cookie: cookieHeader },
    payload: { name: 'mobile development' }
  });
  assert.equal(dupCatRes.statusCode, 409);

  // Update category
  const updateCatRes = await app.inject({
    method: 'PATCH',
    url: `/api/roadmap/categories/${createdCat.id}`,
    headers: { cookie: cookieHeader },
    payload: { name: 'Mobile Architecture' }
  });
  assert.equal(updateCatRes.statusCode, 200);
  assert.equal(JSON.parse(updateCatRes.body).category.name, 'Mobile Architecture');

  // Create custom technology under this category
  const createTechRes = await app.inject({
    method: 'POST',
    url: '/api/roadmap/technologies',
    headers: { cookie: cookieHeader },
    payload: { categoryId: createdCat.id, name: 'Message Queues' }
  });
  assert.equal(createTechRes.statusCode, 201);
  const createdTech = JSON.parse(createTechRes.body).technology;
  assert.equal(createdTech.name, 'Message Queues');

  // Update technology
  const updateTechRes = await app.inject({
    method: 'PATCH',
    url: `/api/roadmap/technologies/${createdTech.id}`,
    headers: { cookie: cookieHeader },
    payload: { name: 'Event Streaming' }
  });
  assert.equal(updateTechRes.statusCode, 200);
  assert.equal(JSON.parse(updateTechRes.body).technology.name, 'Event Streaming');

  // Delete category (cascades to technology)
  const delCatRes = await app.inject({
    method: 'DELETE',
    url: `/api/roadmap/categories/${createdCat.id}`,
    headers: { cookie: cookieHeader }
  });
  assert.equal(delCatRes.statusCode, 204);

  // Verify technology is gone
  const getTechRes = await app.inject({
    method: 'GET',
    url: `/api/roadmap/technologies/${createdTech.id}`,
    headers: { cookie: cookieHeader }
  });
  assert.equal(getTechRes.statusCode, 404);

  await app.close();
});

test('Roadmap: Topic CRUD, ordering, notes persistence, and completion toggle', async () => {
  const app = await buildApp();
  const { cookieHeader } = await createAuthenticatedSession(app, 'topic-crud');

  // Fetch overview to get SQL technology ID
  const overviewRes = await app.inject({
    method: 'GET',
    url: '/api/roadmap/overview',
    headers: { cookie: cookieHeader }
  });
  const overview = JSON.parse(overviewRes.body);
  const dbCat = overview.categories.find((c: any) => c.name === 'Databases & Caching');
  const sqlTech = dbCat.technologies.find((t: any) => t.name === 'SQL');
  assert.ok(sqlTech, 'SQL technology must exist');

  // 1. Create Topic with full notes
  const topic1Res = await app.inject({
    method: 'POST',
    url: `/api/roadmap/technologies/${sqlTech.id}/topics`,
    headers: { cookie: cookieHeader },
    payload: {
      title: 'Relational Schemas & Foreign Keys',
      description: 'Understanding relational tables, constraints and foreign key actions',
      status: 'In Progress',
      notesShort: 'Foreign keys enforce referential integrity.',
      notesDetailed: 'ON DELETE CASCADE and ON DELETE SET NULL caveats.',
      notesCode: 'ALTER TABLE orders ADD CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(id);',
      referenceUrl: 'https://www.postgresql.org/docs/current/ddl-constraints.html'
    }
  });
  assert.equal(topic1Res.statusCode, 201);
  const topic1 = JSON.parse(topic1Res.body).topic;
  assert.equal(topic1.title, 'Relational Schemas & Foreign Keys');
  assert.equal(topic1.status, 'In Progress');
  assert.equal(topic1.notesShort, 'Foreign keys enforce referential integrity.');
  assert.equal(topic1.notesCode, 'ALTER TABLE orders ADD CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(id);');
  assert.ok(topic1.lastRevisedAt, 'lastRevisedAt should be set when notes are present');

  // 2. Prevent duplicate topic title in same technology
  const dupTopicRes = await app.inject({
    method: 'POST',
    url: `/api/roadmap/technologies/${sqlTech.id}/topics`,
    headers: { cookie: cookieHeader },
    payload: { title: 'relational schemas & foreign keys' }
  });
  assert.equal(dupTopicRes.statusCode, 409);

  // 3. Create second topic
  const topic2Res = await app.inject({
    method: 'POST',
    url: `/api/roadmap/technologies/${sqlTech.id}/topics`,
    headers: { cookie: cookieHeader },
    payload: {
      title: 'Indexes & Query Optimization',
      status: 'Not Started'
    }
  });
  assert.equal(topic2Res.statusCode, 201);
  const topic2 = JSON.parse(topic2Res.body).topic;

  // 4. Toggle completion on topic1
  const toggleRes1 = await app.inject({
    method: 'PATCH',
    url: `/api/roadmap/topics/${topic1.id}/toggle`,
    headers: { cookie: cookieHeader }
  });
  assert.equal(toggleRes1.statusCode, 200);
  const toggled1 = JSON.parse(toggleRes1.body).topic;
  assert.equal(toggled1.status, 'Completed');
  assert.ok(toggled1.completedAt, 'completedAt must be set');
  // Check notes preserved
  assert.equal(toggled1.notesShort, 'Foreign keys enforce referential integrity.');

  // Toggle again to uncomplete
  const toggleRes2 = await app.inject({
    method: 'PATCH',
    url: `/api/roadmap/topics/${topic1.id}/toggle`,
    headers: { cookie: cookieHeader }
  });
  assert.equal(toggleRes2.statusCode, 200);
  const toggled2 = JSON.parse(toggleRes2.body).topic;
  assert.equal(toggled2.status, 'In Progress');
  assert.equal(toggled2.completedAt, null);

  // Mark topic2 completed explicitly via PATCH
  const updateRes = await app.inject({
    method: 'PATCH',
    url: `/api/roadmap/topics/${topic2.id}`,
    headers: { cookie: cookieHeader },
    payload: { status: 'Completed' }
  });
  assert.equal(updateRes.statusCode, 200);
  assert.equal(JSON.parse(updateRes.body).topic.status, 'Completed');

  // Check progress calculation
  const techDetailRes = await app.inject({
    method: 'GET',
    url: `/api/roadmap/technologies/${sqlTech.id}`,
    headers: { cookie: cookieHeader }
  });
  assert.equal(techDetailRes.statusCode, 200);
  const techDetail = JSON.parse(techDetailRes.body).technology;
  assert.equal(techDetail.totalTopics, 2);
  assert.equal(techDetail.completedTopics, 1);
  assert.equal(techDetail.remainingTopics, 1);
  assert.equal(techDetail.progressPercentage, 50);

  // 5. Reorder topics
  const reorderRes = await app.inject({
    method: 'POST',
    url: '/api/roadmap/topics/reorder',
    headers: { cookie: cookieHeader },
    payload: { orderedIds: [topic2.id, topic1.id] }
  });
  assert.equal(reorderRes.statusCode, 200);

  const listRes = await app.inject({
    method: 'GET',
    url: `/api/roadmap/technologies/${sqlTech.id}/topics?sortBy=order&sortDir=asc`,
    headers: { cookie: cookieHeader }
  });
  const topicsList = JSON.parse(listRes.body).items;
  assert.equal(topicsList[0].id, topic2.id);
  assert.equal(topicsList[1].id, topic1.id);

  // 6. Delete topic
  const delRes = await app.inject({
    method: 'DELETE',
    url: `/api/roadmap/topics/${topic2.id}`,
    headers: { cookie: cookieHeader }
  });
  assert.equal(delRes.statusCode, 204);

  await app.close();
});

test('Roadmap: JSON Import Validation, Preview, Modes, and Transaction Rollback', async () => {
  const app = await buildApp();
  const { cookieHeader } = await createAuthenticatedSession(app, 'json-import');

  // 1. Invalid JSON syntax rejection
  const invalidJsonRes = await app.inject({
    method: 'POST',
    url: '/api/roadmap/import/preview',
    headers: { cookie: cookieHeader },
    payload: { jsonContent: '{ broken json: true' }
  });
  assert.equal(invalidJsonRes.statusCode, 400);
  assert.equal(JSON.parse(invalidJsonRes.body).error.code, 'INVALID_JSON');

  // 2. Valid hierarchy JSON preview
  const sampleImportJson = JSON.stringify({
    version: 1,
    categories: [
      {
        name: 'Databases & Caching',
        technologies: [
          {
            name: 'SQL',
            topics: [
              {
                title: 'PostgreSQL Architecture',
                description: 'Processes, shared buffers, WAL and storage engines',
                status: 'Completed',
                notes: {
                  short: 'Client -> Postmaster -> Backend process',
                  detailed: 'Shared memory structure and WAL buffers.'
                }
              },
              {
                title: 'ACID Transactions & Isolation',
                status: 'Not Started'
              }
            ]
          }
        ]
      }
    ]
  });

  const previewRes = await app.inject({
    method: 'POST',
    url: '/api/roadmap/import/preview',
    headers: { cookie: cookieHeader },
    payload: { jsonContent: sampleImportJson, mode: 'addNew' }
  });
  assert.equal(previewRes.statusCode, 200);
  const preview = JSON.parse(previewRes.body);
  assert.equal(preview.valid, true);
  assert.equal(preview.summary.topicsToCreate, 2);
  assert.equal(preview.summary.topicsToUpdate, 0);

  // 3. Commit Add New
  const commitRes = await app.inject({
    method: 'POST',
    url: '/api/roadmap/import/commit',
    headers: { cookie: cookieHeader },
    payload: { jsonContent: sampleImportJson, mode: 'addNew' }
  });
  assert.equal(commitRes.statusCode, 200);
  const commitData = JSON.parse(commitRes.body);
  assert.equal(commitData.imported.topicsCreated, 2);

  // 4. Preview importing same file in Add New mode: existing topics should be preserved/skipped
  const secondPreviewRes = await app.inject({
    method: 'POST',
    url: '/api/roadmap/import/preview',
    headers: { cookie: cookieHeader },
    payload: { jsonContent: sampleImportJson, mode: 'addNew' }
  });
  const secondPreview = JSON.parse(secondPreviewRes.body);
  assert.equal(secondPreview.summary.topicsToCreate, 0);
  assert.equal(secondPreview.summary.topicsPreserved, 2);

  // 5. Preview in updateExisting mode: topics to update should be 2
  const updatePreviewRes = await app.inject({
    method: 'POST',
    url: '/api/roadmap/import/preview',
    headers: { cookie: cookieHeader },
    payload: { jsonContent: sampleImportJson, mode: 'updateExisting' }
  });
  const updatePreview = JSON.parse(updatePreviewRes.body);
  assert.equal(updatePreview.summary.topicsToUpdate, 2);

  // 6. Test direct topic array import into specific technology
  const overviewRes = await app.inject({
    method: 'GET',
    url: '/api/roadmap/overview',
    headers: { cookie: cookieHeader }
  });
  const overview = JSON.parse(overviewRes.body);
  const targetTech = overview.categories.find((c: any) => c.name === 'Databases & Caching').technologies.find((t: any) => t.name === 'SQL');

  const topicArrayJson = JSON.stringify([
    { title: 'B-Tree and Hash Indexes', status: 'In Progress' },
    { title: 'Query Plan Analysis with EXPLAIN ANALYZE', status: 'Not Started' }
  ]);

  const arrayCommitRes = await app.inject({
    method: 'POST',
    url: '/api/roadmap/import/commit',
    headers: { cookie: cookieHeader },
    payload: {
      jsonContent: topicArrayJson,
      currentTechnologyId: targetTech.id,
      mode: 'addNew'
    }
  });
  assert.equal(arrayCommitRes.statusCode, 200);
  assert.equal(JSON.parse(arrayCommitRes.body).imported.topicsCreated, 2);

  await app.close();
});

test('Roadmap: Cross-User Access Prevention', async () => {
  const app = await buildApp();
  const sessionA = await createAuthenticatedSession(app, 'user-a');
  const sessionB = await createAuthenticatedSession(app, 'user-b');

  // User A creates custom category and topic
  const catRes = await app.inject({
    method: 'POST',
    url: '/api/roadmap/categories',
    headers: { cookie: sessionA.cookieHeader },
    payload: { name: 'User A Secret Tech' }
  });
  const catA = JSON.parse(catRes.body).category;

  const techRes = await app.inject({
    method: 'POST',
    url: '/api/roadmap/technologies',
    headers: { cookie: sessionA.cookieHeader },
    payload: { categoryId: catA.id, name: 'Secret Framework' }
  });
  const techA = JSON.parse(techRes.body).technology;

  const topicRes = await app.inject({
    method: 'POST',
    url: `/api/roadmap/technologies/${techA.id}/topics`,
    headers: { cookie: sessionA.cookieHeader },
    payload: { title: 'Secret Topic', notesShort: 'Private note' }
  });
  const topicA = JSON.parse(topicRes.body).topic;

  // User B tries to view User A's category
  const bCatRes = await app.inject({
    method: 'PATCH',
    url: `/api/roadmap/categories/${catA.id}`,
    headers: { cookie: sessionB.cookieHeader },
    payload: { name: 'Hacked' }
  });
  assert.equal(bCatRes.statusCode, 404, 'User B must not be able to patch User A category');

  // User B tries to view User A's technology
  const bTechRes = await app.inject({
    method: 'GET',
    url: `/api/roadmap/technologies/${techA.id}`,
    headers: { cookie: sessionB.cookieHeader }
  });
  assert.equal(bTechRes.statusCode, 404, 'User B must not be able to view User A technology');

  // User B tries to view User A's topic
  const bTopicRes = await app.inject({
    method: 'GET',
    url: `/api/roadmap/topics/${topicA.id}`,
    headers: { cookie: sessionB.cookieHeader }
  });
  assert.equal(bTopicRes.statusCode, 404, 'User B must not be able to view User A topic');

  // User B tries to delete User A's topic
  const bDelTopicRes = await app.inject({
    method: 'DELETE',
    url: `/api/roadmap/topics/${topicA.id}`,
    headers: { cookie: sessionB.cookieHeader }
  });
  assert.equal(bDelTopicRes.statusCode, 404, 'User B must not be able to delete User A topic');

  await app.close();
});

test('Daybook: Existing activity features remain fully functional', async () => {
  const app = await buildApp();
  const { cookieHeader } = await createAuthenticatedSession(app, 'daybook-regression');

  // 1. Create category and tag
  const catRes = await app.inject({
    method: 'POST',
    url: '/api/categories',
    headers: { cookie: cookieHeader },
    payload: { name: 'Backend Practice' }
  });
  assert.equal(catRes.statusCode, 201);
  const cat = JSON.parse(catRes.body).category;

  // 2. Create activity
  const actRes = await app.inject({
    method: 'POST',
    url: '/api/activities',
    headers: { cookie: cookieHeader },
    payload: {
      title: 'Built Fastify API endpoint',
      categoryId: cat.id,
      activityType: 'Built',
      status: 'Completed',
      durationMinutes: 45
    }
  });
  assert.equal(actRes.statusCode, 201);
  const act = JSON.parse(actRes.body).activity;
  assert.equal(act.title, 'Built Fastify API endpoint');

  // 3. List activities
  const listRes = await app.inject({
    method: 'GET',
    url: '/api/activities',
    headers: { cookie: cookieHeader }
  });
  assert.equal(listRes.statusCode, 200);
  assert.equal(JSON.parse(listRes.body).items.length, 1);

  // 4. Daily summary reflection
  const summaryRes = await app.inject({
    method: 'PUT',
    url: '/api/daily-summary',
    headers: { cookie: cookieHeader },
    payload: { date: '2026-10-24', summary: 'Learned Fastify schema plugins.' }
  });
  assert.equal(summaryRes.statusCode, 200);
  assert.equal(JSON.parse(summaryRes.body).summary, 'Learned Fastify schema plugins.');

  await app.close();
});

test.after(async () => {
  const { pool } = await import('./db/index.js');
  await pool.end();
});
