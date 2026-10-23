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
export const userRelations = relations(users,({many})=>({categories:many(categories),tags:many(tags),activities:many(activities)}));
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
