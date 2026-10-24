import { pgTable, pgEnum, uuid, varchar, text, timestamp, date, integer, primaryKey, unique, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const activityTypeEnum = pgEnum('activity_type', ['Learned','Practiced','Built','Fixed','Revised','Researched','Other']);
export const activityStatusEnum = pgEnum('activity_status', ['Completed','In Progress','Needs Revision']);
export const difficultyEnum = pgEnum('difficulty', ['Easy','Medium','Hard']);

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(), email: varchar('email',{length:254}).notNull().unique(), passwordHash: text('password_hash').notNull(),
  createdAt: timestamp('created_at',{withTimezone:true}).defaultNow().notNull(), updatedAt: timestamp('updated_at',{withTimezone:true}).defaultNow().notNull()
});
export const categories = pgTable('categories', {
  id: uuid('id').defaultRandom().primaryKey(), userId: uuid('user_id').notNull().references(()=>users.id,{onDelete:'cascade'}),
  name: varchar('name',{length:60}).notNull(), slug: varchar('slug',{length:80}).notNull(),
  createdAt: timestamp('created_at',{withTimezone:true}).defaultNow().notNull(), updatedAt: timestamp('updated_at',{withTimezone:true}).defaultNow().notNull()
}, t=>[unique('categories_user_slug_unique').on(t.userId,t.slug), index('categories_user_idx').on(t.userId)]);
export const tags = pgTable('tags', {
  id: uuid('id').defaultRandom().primaryKey(), userId: uuid('user_id').notNull().references(()=>users.id,{onDelete:'cascade'}),
  name: varchar('name',{length:40}).notNull(), slug: varchar('slug',{length:60}).notNull(), createdAt: timestamp('created_at',{withTimezone:true}).defaultNow().notNull()
}, t=>[unique('tags_user_slug_unique').on(t.userId,t.slug), index('tags_user_idx').on(t.userId)]);
export const activities = pgTable('activities', {
  id: uuid('id').defaultRandom().primaryKey(), userId: uuid('user_id').notNull().references(()=>users.id,{onDelete:'cascade'}),
  categoryId: uuid('category_id').references(()=>categories.id,{onDelete:'set null'}), title: varchar('title',{length:180}).notNull(), description: text('description'),
  activityType: activityTypeEnum('activity_type').notNull().default('Learned'), status: activityStatusEnum('status').notNull().default('Completed'),
  referenceUrl: varchar('reference_url',{length:2048}), durationMinutes: integer('duration_minutes'), difficulty: difficultyEnum('difficulty'),
  activityDate: date('activity_date').notNull().defaultNow(), startedAt: timestamp('started_at',{withTimezone:true}), completedAt: timestamp('completed_at',{withTimezone:true}),
  createdAt: timestamp('created_at',{withTimezone:true}).defaultNow().notNull(), updatedAt: timestamp('updated_at',{withTimezone:true}).defaultNow().notNull()
}, t=>[index('activities_user_date_idx').on(t.userId,t.activityDate),index('activities_user_category_idx').on(t.userId,t.categoryId),index('activities_created_idx').on(t.userId,t.createdAt)]);
export const activityTags = pgTable('activity_tags', {
  activityId: uuid('activity_id').notNull().references(()=>activities.id,{onDelete:'cascade'}), tagId: uuid('tag_id').notNull().references(()=>tags.id,{onDelete:'cascade'}),
}, t=>[primaryKey({columns:[t.activityId,t.tagId]})]);
export const userRelations = relations(users,({many})=>({
  categories:many(categories),
  tags:many(tags),
  activities:many(activities),
  roadmapCategories:many(roadmapCategories),
  roadmapTechnologies:many(roadmapTechnologies),
  roadmapTopics:many(roadmapTopics)
}));
export const activityRelations = relations(activities,({one,many})=>({user:one(users,{fields:[activities.userId],references:[users.id]}),category:one(categories,{fields:[activities.categoryId],references:[categories.id]}),activityTags:many(activityTags)}));
export const activityTagRelations = relations(activityTags,({one})=>({activity:one(activities,{fields:[activityTags.activityId],references:[activities.id]}),tag:one(tags,{fields:[activityTags.tagId],references:[tags.id]})}));

export const dailySummaries = pgTable('daily_summaries', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(()=>users.id,{onDelete:'cascade'}),
  summaryDate: date('summary_date').notNull(),
  summary: text('summary').notNull().default(''),
  createdAt: timestamp('created_at',{withTimezone:true}).defaultNow().notNull(),
  updatedAt: timestamp('updated_at',{withTimezone:true}).defaultNow().notNull()
}, t=>[unique('daily_summaries_user_date_unique').on(t.userId,t.summaryDate),index('daily_summaries_user_date_idx').on(t.userId,t.summaryDate)]);

export const roadmapTopicStatusEnum = pgEnum('roadmap_topic_status', ['Not Started', 'In Progress', 'Completed', 'Needs Revision']);

export const roadmapCategories = pgTable('roadmap_categories', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(()=>users.id,{onDelete:'cascade'}),
  name: varchar('name',{length:100}).notNull(),
  slug: varchar('slug',{length:120}).notNull(),
  order: integer('order').notNull().default(0),
  createdAt: timestamp('created_at',{withTimezone:true}).defaultNow().notNull(),
  updatedAt: timestamp('updated_at',{withTimezone:true}).defaultNow().notNull()
}, t=>[
  unique('roadmap_categories_user_slug_unique').on(t.userId, t.slug),
  index('roadmap_categories_user_idx').on(t.userId)
]);

export const roadmapTechnologies = pgTable('roadmap_technologies', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(()=>users.id,{onDelete:'cascade'}),
  categoryId: uuid('category_id').notNull().references(()=>roadmapCategories.id,{onDelete:'cascade'}),
  name: varchar('name',{length:100}).notNull(),
  slug: varchar('slug',{length:120}).notNull(),
  order: integer('order').notNull().default(0),
  createdAt: timestamp('created_at',{withTimezone:true}).defaultNow().notNull(),
  updatedAt: timestamp('updated_at',{withTimezone:true}).defaultNow().notNull()
}, t=>[
  unique('roadmap_technologies_category_slug_unique').on(t.categoryId, t.slug),
  index('roadmap_technologies_user_idx').on(t.userId),
  index('roadmap_technologies_category_idx').on(t.categoryId)
]);

export const roadmapTopics = pgTable('roadmap_topics', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(()=>users.id,{onDelete:'cascade'}),
  technologyId: uuid('technology_id').notNull().references(()=>roadmapTechnologies.id,{onDelete:'cascade'}),
  title: varchar('title',{length:255}).notNull(),
  slug: varchar('slug',{length:280}).notNull(),
  description: text('description'),
  status: roadmapTopicStatusEnum('status').notNull().default('Not Started'),
  order: integer('order').notNull().default(0),
  notesShort: text('notes_short'),
  notesDetailed: text('notes_detailed'),
  notesCode: text('notes_code'),
  referenceUrl: varchar('reference_url',{length:2048}),
  lastRevisedAt: timestamp('last_revised_at',{withTimezone:true}),
  completedAt: timestamp('completed_at',{withTimezone:true}),
  createdAt: timestamp('created_at',{withTimezone:true}).defaultNow().notNull(),
  updatedAt: timestamp('updated_at',{withTimezone:true}).defaultNow().notNull()
}, t=>[
  unique('roadmap_topics_tech_slug_unique').on(t.technologyId, t.slug),
  index('roadmap_topics_user_idx').on(t.userId),
  index('roadmap_topics_tech_idx').on(t.technologyId),
  index('roadmap_topics_user_tech_order_idx').on(t.userId, t.technologyId, t.order)
]);

export const roadmapCategoryRelations = relations(roadmapCategories, ({ one, many }) => ({
  user: one(users, { fields: [roadmapCategories.userId], references: [users.id] }),
  technologies: many(roadmapTechnologies)
}));

export const roadmapTechnologyRelations = relations(roadmapTechnologies, ({ one, many }) => ({
  user: one(users, { fields: [roadmapTechnologies.userId], references: [users.id] }),
  category: one(roadmapCategories, { fields: [roadmapTechnologies.categoryId], references: [roadmapCategories.id] }),
  topics: many(roadmapTopics)
}));

export const roadmapTopicRelations = relations(roadmapTopics, ({ one }) => ({
  user: one(users, { fields: [roadmapTopics.userId], references: [users.id] }),
  technology: one(roadmapTechnologies, { fields: [roadmapTopics.technologyId], references: [roadmapTechnologies.id] })
}));
