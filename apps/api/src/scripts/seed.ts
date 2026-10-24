import { db } from '../db/index.js';
import { users, roadmapCategories, roadmapTechnologies, roadmapTopics } from '../db/schema.js';
import { ensureUserRoadmapInitialized } from '../services/roadmap.js';
import { initialRoadmapHierarchy } from '@ppt/shared';
import { eq, sql } from 'drizzle-orm';

async function main() {
  console.log('--- Initializing Roadmap Hierarchy for all users ---');
  const allUsers = await db.select().from(users);
  console.log(`Found ${allUsers.length} user(s).`);

  for (const user of allUsers) {
    console.log(`Initializing roadmap & data for user: ${user.email} (${user.id})`);
    await ensureUserRoadmapInitialized(user.id);
  }

  const [catCount] = await db.select({ count: sql<number>`count(*)::int` }).from(roadmapCategories);
  const [techCount] = await db.select({ count: sql<number>`count(*)::int` }).from(roadmapTechnologies);
  const [topicCount] = await db.select({ count: sql<number>`count(*)::int` }).from(roadmapTopics);

  console.log(`Done! Total categories in DB: ${catCount?.count}, Total technologies: ${techCount?.count}, Total topics: ${topicCount?.count}`);

  const categories = await db
    .select({ name: roadmapCategories.name, order: roadmapCategories.order })
    .from(roadmapCategories)
    .orderBy(roadmapCategories.order);
  console.log('Categories order:', categories.map(c => `${c.order}: ${c.name}`));

  process.exit(0);
}

main().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
