import dotenv from 'dotenv';
dotenv.config({ path: '../../.env' });
dotenv.config();
import Fastify, { type FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import argon2 from 'argon2';
import { and, asc, desc, eq, gte, ilike, inArray, lte, or, sql } from 'drizzle-orm';
import { z, ZodError } from 'zod';
import { registerSchema, loginSchema, categoryInputSchema, tagInputSchema, activityInputSchema, activityTypes, activityStatuses, difficulties, roadmapCategoryInputSchema, roadmapTechnologyInputSchema, roadmapTopicInputSchema, roadmapTopicStatuses, roadmapReorderSchema, normalizeRoadmapName, type RoadmapTopicStatus } from '@ppt/shared';
import { db, pool } from './db/index.js';
import { users, categories, tags, activities, activityTags, dailySummaries, roadmapCategories, roadmapTechnologies, roadmapTopics } from './db/schema.js';
import { sendError, slugify } from './utils/errors.js';
import { getRoadmapOverview, getRoadmapCategoryDetail, ensureUserRoadmapInitialized, normalizeImportJson, roadmapSlugify, type NormalizedImportData } from './services/roadmap.js';

declare module 'fastify' { interface FastifyRequest { userId: string } }
const cookieName = process.env.COOKIE_NAME || 'ppt_session';
const rawOrigins = [process.env.WEB_ORIGIN, process.env.CORS_ORIGIN].filter(Boolean).join(',');
const configuredOrigins = rawOrigins ? rawOrigins.split(',').map(s => s.trim().replace(/\/+$/, '')).filter(Boolean) : ['http://localhost:5173'];
const allowedOrigins = new Set([
  ...configuredOrigins,
  'http://localhost:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
]);
const isAllowedOrigin = (origin?: string) => {
  if (!origin) return true;
  const cleanOrigin = origin.replace(/\/+$/, '');
  return (
    allowedOrigins.has(cleanOrigin) ||
    /\.vercel\.app$/.test(cleanOrigin) ||
    (process.env.NODE_ENV !== 'production' && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin))
  );
};
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret.length < 32) throw new Error('JWT_SECRET must be set to at least 32 characters');
const activeJwtSecret: string = jwtSecret;

export async function buildApp(){
  const app = Fastify({ logger: { redact: ['req.headers.cookie','req.headers.authorization','*.password','*.passwordHash','*.token'], level: process.env.NODE_ENV==='production'?'info':'debug' }, bodyLimit: 1024*1024, trustProxy: process.env.NODE_ENV==='production' });
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    if (!body || (typeof body === 'string' && body.trim().length === 0)) {
      done(null, undefined);
      return;
    }
    try {
      done(null, JSON.parse(body as string));
    } catch (err) {
      done(err as Error);
    }
  });
  await app.register(helmet, { crossOriginResourcePolicy: false });
  await app.register(cors, {
    origin: (origin, callback) => {
      if (!origin || isAllowedOrigin(origin)) {
        callback(null, origin || true);
      } else {
        callback(null, false);
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Cookie'],
    maxAge: 86400,
    optionsSuccessStatus: 204,
  });
  await app.register(cookie);
  await app.register(jwt,{secret:activeJwtSecret, sign:{expiresIn:'7d'}});
  await app.register(rateLimit,{global:false});
  app.decorateRequest('userId','');
  app.addHook('onRequest',async(req,reply)=>{
    if(['POST','PATCH','DELETE','PUT'].includes(req.method)){
      const origin=req.headers.origin;
      if(origin && !isAllowedOrigin(origin)) return sendError(reply,403,'ORIGIN_NOT_ALLOWED','Request origin is not allowed');
    }
  });
  app.setErrorHandler((error,req,reply)=>{
    req.log.error({err:error},'Request failed');
    if(error instanceof ZodError) return sendError(reply,400,'VALIDATION_ERROR','Please check the submitted fields');
    if((error as {code?:string}).code==='23505') return sendError(reply,409,'DUPLICATE_RESOURCE','A record with that name already exists');
    const err = error as { statusCode?: number; message?: string };
    if(err.statusCode && err.statusCode<500) return sendError(reply,err.statusCode,'REQUEST_ERROR',err.message ?? 'Request failed');
    return sendError(reply,500,'INTERNAL_ERROR','Something went wrong');
  });
  const auth=async(req:FastifyRequest,reply:any)=>{
    try { const token=req.cookies[cookieName]; if(!token) throw new Error('missing'); const payload=await app.jwt.verify<{sub:string}>(token); if(!payload.sub) throw new Error('missing subject'); req.userId=payload.sub; }
    catch { return sendError(reply,401,'UNAUTHENTICATED','Please log in to continue'); }
  };
  const rawSameSite = (process.env.COOKIE_SAMESITE || '').toLowerCase();
  const cookieSameSite = (rawSameSite === 'none' || rawSameSite === 'lax' || rawSameSite === 'strict')
    ? (rawSameSite as 'none' | 'lax' | 'strict')
    : (process.env.NODE_ENV === 'production' ? 'lax' : 'lax');
  const cookieSecure = process.env.NODE_ENV === 'production' || cookieSameSite === 'none';
  const setSession=async(reply:any,userId:string)=>{ const token=app.jwt.sign({sub:userId}); reply.setCookie(cookieName,token,{httpOnly:true,secure:cookieSecure,sameSite:cookieSameSite,path:'/',maxAge:7*24*60*60}); };
  const clearSession=(reply:any)=>reply.clearCookie(cookieName,{httpOnly:true,secure:cookieSecure,sameSite:cookieSameSite,path:'/'});

  app.get('/api/analytics',{preHandler:auth},async(req)=>{
    const [totals,weekly,byCategory]=await Promise.all([
      pool.query(`SELECT count(*)::int AS total, COALESCE(sum(duration_minutes),0)::int AS minutes, count(*) FILTER (WHERE status='Completed')::int AS completed FROM activities WHERE user_id=$1`,[req.userId]),
      pool.query(`SELECT activity_date::text AS date, count(*)::int AS count, COALESCE(sum(duration_minutes),0)::int AS minutes FROM activities WHERE user_id=$1 AND activity_date >= CURRENT_DATE - INTERVAL '6 days' GROUP BY activity_date ORDER BY activity_date`,[req.userId]),
      pool.query(`SELECT c.id AS "categoryId", c.name, count(a.id)::int AS count, COALESCE(sum(a.duration_minutes),0)::int AS minutes FROM categories c LEFT JOIN activities a ON a.category_id=c.id AND a.user_id=$1 WHERE c.user_id=$1 GROUP BY c.id,c.name ORDER BY count DESC,c.name`,[req.userId])
    ]);
    const total=totals.rows[0]??{total:0,minutes:0,completed:0};
    return {totalActivities:total.total,totalMinutes:total.minutes,completedActivities:total.completed,weekly:weekly.rows,byCategory:byCategory.rows};
  });

  app.get('/api/health',async()=>({status:'ok'}));
  app.get('/api/ready',async(_req,reply)=>{ try{await pool.query('SELECT 1');return {status:'ready',database:'ok'};}catch{return sendError(reply,503,'DEPENDENCY_UNAVAILABLE','A required service is unavailable');} });
  app.post('/api/auth/register',{config:{rateLimit:{max:5,timeWindow:'1 minute'}}},async(req,reply)=>{
    const input=registerSchema.parse(req.body); const passwordHash=await argon2.hash(input.password,{type:argon2.argon2id});
    const created=await db.transaction(async tx=>{
      const [user]=await tx.insert(users).values({email:input.email,passwordHash}).returning({id:users.id,email:users.email,createdAt:users.createdAt});
      const defaults=['DSA','Development','System Design','Database','DevOps','Learning','Bug Fixing','Other'];
      await tx.insert(categories).values(defaults.map(name=>({userId:user.id,name,slug:slugify(name)})));
      return user;
    });
    await setSession(reply,created.id); return reply.code(201).send({user:created});
  });
  app.post('/api/auth/login',{config:{rateLimit:{max:10,timeWindow:'1 minute'}}},async(req,reply)=>{
    const input=loginSchema.parse(req.body); const [user]=await db.select().from(users).where(eq(users.email,input.email)).limit(1);
    const valid=user ? await argon2.verify(user.passwordHash,input.password).catch(()=>false) : false;
    if(!user||!valid) return sendError(reply,401,'INVALID_CREDENTIALS','Email or password is incorrect');
    await setSession(reply,user.id); return {user:{id:user.id,email:user.email,createdAt:user.createdAt}};
  });
  app.post('/api/auth/logout',async(_req,reply)=>{clearSession(reply);return reply.code(204).send();});
  app.get('/api/auth/me',{preHandler:auth},async(req)=>{const [user]=await db.select({id:users.id,email:users.email,createdAt:users.createdAt}).from(users).where(eq(users.id,req.userId)).limit(1);return {user};});

  app.get('/api/daily-summary',{preHandler:auth},async(req,reply)=>{const q=z.object({date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/)}).parse(req.query);const [row]=await db.select().from(dailySummaries).where(and(eq(dailySummaries.userId,req.userId),eq(dailySummaries.summaryDate,q.date))).limit(1);return {summary:row?.summary??'',date:q.date};});
  app.put('/api/daily-summary',{preHandler:auth},async(req)=>{const input=z.object({date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),summary:z.string().max(10000)}).parse(req.body);const [row]=await db.insert(dailySummaries).values({userId:req.userId,summaryDate:input.date,summary:input.summary,updatedAt:new Date()}).onConflictDoUpdate({target:[dailySummaries.userId,dailySummaries.summaryDate],set:{summary:input.summary,updatedAt:new Date()}}).returning();return {summary:row.summary,date:row.summaryDate,updatedAt:row.updatedAt};});

  app.get('/api/categories',{preHandler:auth},async req=>({categories:await db.select().from(categories).where(eq(categories.userId,req.userId)).orderBy(asc(categories.name))}));
  app.post('/api/categories',{preHandler:auth},async(req,reply)=>{const {name}=categoryInputSchema.parse(req.body);const [row]=await db.insert(categories).values({userId:req.userId,name,slug:slugify(name)}).returning();return reply.code(201).send({category:row});});
  app.patch('/api/categories/:id',{preHandler:auth},async(req,reply)=>{const {id}=z.object({id:z.string().uuid()}).parse(req.params);const {name}=categoryInputSchema.parse(req.body);const [row]=await db.update(categories).set({name,slug:slugify(name),updatedAt:new Date()}).where(and(eq(categories.id,id),eq(categories.userId,req.userId))).returning();if(!row)return sendError(reply,404,'NOT_FOUND','Category not found');return {category:row};});
  app.delete('/api/categories/:id',{preHandler:auth},async(req,reply)=>{const {id}=z.object({id:z.string().uuid()}).parse(req.params);const [row]=await db.delete(categories).where(and(eq(categories.id,id),eq(categories.userId,req.userId))).returning({id:categories.id});if(!row)return sendError(reply,404,'NOT_FOUND','Category not found');return reply.code(204).send();});

  app.get('/api/tags',{preHandler:auth},async req=>({tags:await db.select().from(tags).where(eq(tags.userId,req.userId)).orderBy(asc(tags.name))}));
  app.post('/api/tags',{preHandler:auth},async(req,reply)=>{const {name}=tagInputSchema.parse(req.body);const [row]=await db.insert(tags).values({userId:req.userId,name,slug:slugify(name).slice(0,60)}).returning();return reply.code(201).send({tag:row});});
  app.patch('/api/tags/:id',{preHandler:auth},async(req,reply)=>{const {id}=z.object({id:z.string().uuid()}).parse(req.params);const {name}=tagInputSchema.parse(req.body);const [row]=await db.update(tags).set({name,slug:slugify(name).slice(0,60)}).where(and(eq(tags.id,id),eq(tags.userId,req.userId))).returning();if(!row)return sendError(reply,404,'NOT_FOUND','Tag not found');return {tag:row};});
  app.delete('/api/tags/:id',{preHandler:auth},async(req,reply)=>{const {id}=z.object({id:z.string().uuid()}).parse(req.params);const [row]=await db.delete(tags).where(and(eq(tags.id,id),eq(tags.userId,req.userId))).returning({id:tags.id});if(!row)return sendError(reply,404,'NOT_FOUND','Tag not found');return reply.code(204).send();});

  app.post('/api/activities',{preHandler:auth},async(req,reply)=>{
    const input=activityInputSchema.parse(req.body); const result=await db.transaction(async tx=>{
      if(input.categoryId){const [cat]=await tx.select({id:categories.id}).from(categories).where(and(eq(categories.id,input.categoryId),eq(categories.userId,req.userId))).limit(1);if(!cat)throw Object.assign(new Error('Category not found'),{statusCode:400});}
      if(input.tagIds.length){const owned=await tx.select({id:tags.id}).from(tags).where(and(eq(tags.userId,req.userId),inArray(tags.id,input.tagIds)));if(owned.length!==new Set(input.tagIds).size)throw Object.assign(new Error('Invalid tag'),{statusCode:400});}
      const [activity]=await tx.insert(activities).values({userId:req.userId,title:input.title,description:input.description??null,categoryId:input.categoryId??null,activityType:input.activityType,status:input.status,referenceUrl:input.referenceUrl??null,durationMinutes:input.durationMinutes??null,difficulty:input.difficulty??null,activityDate:input.activityDate??new Date().toISOString().slice(0,10),completedAt:input.status==='Completed'?new Date():null}).returning();
      if(input.tagIds.length) await tx.insert(activityTags).values([...new Set(input.tagIds)].map(tagId=>({activityId:activity.id,tagId}))); return activity;
    }); return reply.code(201).send({activity:result});
  });
  app.get('/api/activities',{preHandler:auth},async req=>{
    const q=z.object({page:z.coerce.number().int().min(1).default(1),limit:z.coerce.number().int().min(1).max(100).default(20),categoryId:z.string().uuid().optional(),activityType:z.enum(activityTypes).optional(),status:z.enum(activityStatuses).optional(),difficulty:z.enum(difficulties).optional(),startDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),endDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),tagId:z.string().uuid().optional(),search:z.string().max(200).optional(),sortBy:z.enum(['activityDate','createdAt','updatedAt','title']).default('activityDate'),sortDir:z.enum(['asc','desc']).default('desc')}).parse(req.query);
    const conditions:any[]=[eq(activities.userId,req.userId)];if(q.categoryId)conditions.push(eq(activities.categoryId,q.categoryId));if(q.activityType)conditions.push(eq(activities.activityType,q.activityType));if(q.status)conditions.push(eq(activities.status,q.status));if(q.difficulty)conditions.push(eq(activities.difficulty,q.difficulty));if(q.startDate)conditions.push(gte(activities.activityDate,q.startDate));if(q.endDate)conditions.push(lte(activities.activityDate,q.endDate));if(q.search)conditions.push(or(ilike(activities.title,`%${q.search}%`),sql`${activities.description} ILIKE ${`%${q.search}%`}`)!);
    if(q.tagId){const match=await db.select({activityId:activityTags.activityId}).from(activityTags).innerJoin(tags,eq(tags.id,activityTags.tagId)).where(and(eq(tags.userId,req.userId),eq(activityTags.tagId,q.tagId)));conditions.push(inArray(activities.id,match.map(x=>x.activityId).length?match.map(x=>x.activityId):['00000000-0000-0000-0000-000000000000']));}
    const where=and(...conditions);const sortColumn={activityDate:activities.activityDate,createdAt:activities.createdAt,updatedAt:activities.updatedAt,title:activities.title}[q.sortBy];
    const [rows,countRows]=await Promise.all([db.select().from(activities).where(where).orderBy(q.sortDir==='asc'?asc(sortColumn):desc(sortColumn)).limit(q.limit).offset((q.page-1)*q.limit),db.select({count:sql<number>`count(*)::int`}).from(activities).where(where)]);
    const tagRows=rows.length?await db.select({activityId:activityTags.activityId,id:tags.id,name:tags.name,slug:tags.slug}).from(activityTags).innerJoin(tags,eq(tags.id,activityTags.tagId)).where(and(eq(tags.userId,req.userId),inArray(activityTags.activityId,rows.map(r=>r.id)))):[];
    const items=rows.map(row=>({...row,tags:tagRows.filter(t=>t.activityId===row.id).map(({activityId,...tag})=>tag)}));
    return {items,pagination:{page:q.page,limit:q.limit,total:countRows[0]?.count??0,totalPages:Math.ceil((countRows[0]?.count??0)/q.limit)}};
  });
  app.get('/api/activities/:id',{preHandler:auth},async(req,reply)=>{const {id}=z.object({id:z.string().uuid()}).parse(req.params);const [activity]=await db.select().from(activities).where(and(eq(activities.id,id),eq(activities.userId,req.userId))).limit(1);if(!activity)return sendError(reply,404,'NOT_FOUND','Activity not found');const [category]=activity.categoryId?await db.select().from(categories).where(eq(categories.id,activity.categoryId)).limit(1):[undefined];const assigned=await db.select({id:tags.id,name:tags.name,slug:tags.slug}).from(activityTags).innerJoin(tags,eq(tags.id,activityTags.tagId)).where(eq(activityTags.activityId,id));return {activity:{...activity,category:category??null,tags:assigned}};});
  app.patch('/api/activities/:id',{preHandler:auth},async(req,reply)=>{const {id}=z.object({id:z.string().uuid()}).parse(req.params);const input=activityInputSchema.partial().parse(req.body);const result=await db.transaction(async tx=>{
    const [existing]=await tx.select({id:activities.id}).from(activities).where(and(eq(activities.id,id),eq(activities.userId,req.userId))).limit(1);if(!existing)return null;
    if(input.categoryId){const [cat]=await tx.select({id:categories.id}).from(categories).where(and(eq(categories.id,input.categoryId),eq(categories.userId,req.userId))).limit(1);if(!cat)throw Object.assign(new Error('Category not found'),{statusCode:400});}
    if(input.tagIds){const ids=[...new Set(input.tagIds)];const owned=ids.length?await tx.select({id:tags.id}).from(tags).where(and(eq(tags.userId,req.userId),inArray(tags.id,ids))):[];if(owned.length!==ids.length)throw Object.assign(new Error('Invalid tag'),{statusCode:400});await tx.delete(activityTags).where(eq(activityTags.activityId,id));if(ids.length)await tx.insert(activityTags).values(ids.map(tagId=>({activityId:id,tagId})));}
    const {tagIds,...fields}=input;const update:any={...fields,updatedAt:new Date()};if(fields.status==='Completed')update.completedAt=new Date();const [row]=await tx.update(activities).set(update).where(and(eq(activities.id,id),eq(activities.userId,req.userId))).returning();return row;
  });if(!result)return sendError(reply,404,'NOT_FOUND','Activity not found');return {activity:result};});
  app.delete('/api/activities/:id',{preHandler:auth},async(req,reply)=>{const {id}=z.object({id:z.string().uuid()}).parse(req.params);const [row]=await db.delete(activities).where(and(eq(activities.id,id),eq(activities.userId,req.userId))).returning({id:activities.id});if(!row)return sendError(reply,404,'NOT_FOUND','Activity not found');return reply.code(204).send();});

  // ==========================================
  // LEARNING ROADMAP ROUTES
  // ==========================================

  app.get('/api/roadmap/overview', { preHandler: auth }, async (req) => {
    return await getRoadmapOverview(req.userId);
  });
  app.get('/api/roadmap/summary', { preHandler: auth }, async (req) => {
    return await getRoadmapOverview(req.userId);
  });

  app.post('/api/roadmap/initialize', { preHandler: auth }, async (req, reply) => {
    await ensureUserRoadmapInitialized(req.userId);
    return reply.send({ success: true });
  });

  // Roadmap Categories
  app.get('/api/roadmap/categories', { preHandler: auth }, async (req) => {
    await ensureUserRoadmapInitialized(req.userId);
    const rows = await db
      .select()
      .from(roadmapCategories)
      .where(eq(roadmapCategories.userId, req.userId))
      .orderBy(asc(roadmapCategories.order), asc(roadmapCategories.name));
    return { categories: rows };
  });

  app.post('/api/roadmap/categories', { preHandler: auth }, async (req, reply) => {
    const input = roadmapCategoryInputSchema.parse(req.body);
    const slug = roadmapSlugify(input.name, 120);
    const [existing] = await db
      .select({ id: roadmapCategories.id })
      .from(roadmapCategories)
      .where(and(eq(roadmapCategories.userId, req.userId), eq(roadmapCategories.slug, slug)))
      .limit(1);
    if (existing) {
      return sendError(reply, 409, 'DUPLICATE_RESOURCE', 'A category with that name already exists');
    }
    let order = input.order;
    if (order === undefined) {
      const [maxRow] = await db
        .select({ max: sql<number>`COALESCE(MAX("order"), -1)` })
        .from(roadmapCategories)
        .where(eq(roadmapCategories.userId, req.userId));
      order = (maxRow?.max ?? -1) + 1;
    }
    const [row] = await db
      .insert(roadmapCategories)
      .values({
        userId: req.userId,
        name: input.name,
        slug,
        order
      })
      .returning();
    return reply.code(201).send({ category: row });
  });

  app.get('/api/roadmap/categories/:id', { preHandler: auth }, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const category = await getRoadmapCategoryDetail(req.userId, id);
    if (!category) return sendError(reply, 404, 'NOT_FOUND', 'Category not found');
    return { category };
  });

  app.patch('/api/roadmap/categories/:id', { preHandler: auth }, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const input = roadmapCategoryInputSchema.partial().parse(req.body);
    const updateData: any = { updatedAt: new Date() };
    if (input.name !== undefined) {
      updateData.name = input.name;
      updateData.slug = roadmapSlugify(input.name, 120);
      const [duplicate] = await db
        .select({ id: roadmapCategories.id })
        .from(roadmapCategories)
        .where(
          and(
            eq(roadmapCategories.userId, req.userId),
            eq(roadmapCategories.slug, updateData.slug),
            sql`${roadmapCategories.id} != ${id}`
          )
        )
        .limit(1);
      if (duplicate) return sendError(reply, 409, 'DUPLICATE_RESOURCE', 'A category with that name already exists');
    }
    if (input.order !== undefined) updateData.order = input.order;

    const [row] = await db
      .update(roadmapCategories)
      .set(updateData)
      .where(and(eq(roadmapCategories.id, id), eq(roadmapCategories.userId, req.userId)))
      .returning();
    if (!row) return sendError(reply, 404, 'NOT_FOUND', 'Category not found');
    return { category: row };
  });

  app.delete('/api/roadmap/categories/:id', { preHandler: auth }, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const [row] = await db
      .delete(roadmapCategories)
      .where(and(eq(roadmapCategories.id, id), eq(roadmapCategories.userId, req.userId)))
      .returning({ id: roadmapCategories.id });
    if (!row) return sendError(reply, 404, 'NOT_FOUND', 'Category not found');
    return reply.code(204).send();
  });

  // Roadmap Technologies
  app.get('/api/roadmap/technologies', { preHandler: auth }, async (req) => {
    const q = z.object({ categoryId: z.string().uuid().optional() }).parse(req.query);
    const conditions = [eq(roadmapTechnologies.userId, req.userId)];
    if (q.categoryId) conditions.push(eq(roadmapTechnologies.categoryId, q.categoryId));
    const rows = await db
      .select()
      .from(roadmapTechnologies)
      .where(and(...conditions))
      .orderBy(asc(roadmapTechnologies.order), asc(roadmapTechnologies.name));
    return { technologies: rows };
  });

  app.get('/api/roadmap/technologies/:id', { preHandler: auth }, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const [tech] = await db
      .select()
      .from(roadmapTechnologies)
      .where(and(eq(roadmapTechnologies.id, id), eq(roadmapTechnologies.userId, req.userId)))
      .limit(1);
    if (!tech) return sendError(reply, 404, 'NOT_FOUND', 'Technology not found');
    const [[category], [counts]] = await Promise.all([
      db
        .select()
        .from(roadmapCategories)
        .where(eq(roadmapCategories.id, tech.categoryId))
        .limit(1),
      db
        .select({
          total: sql<number>`count(*)::int`,
          completed: sql<number>`count(*) FILTER (WHERE status = 'Completed')::int`
        })
        .from(roadmapTopics)
        .where(and(eq(roadmapTopics.technologyId, id), eq(roadmapTopics.userId, req.userId)))
    ]);
    const total = counts?.total ?? 0;
    const completed = counts?.completed ?? 0;
    return {
      technology: {
        ...tech,
        category: category ?? null,
        totalTopics: total,
        completedTopics: completed,
        remainingTopics: total - completed,
        progressPercentage: total > 0 ? Math.round((completed / total) * 100) : null,
        hasTopics: total > 0
      }
    };
  });

  app.post('/api/roadmap/technologies', { preHandler: auth }, async (req, reply) => {
    const input = roadmapTechnologyInputSchema.parse(req.body);
    if (!input.categoryId) {
      return sendError(reply, 400, 'VALIDATION_ERROR', 'Category ID is required');
    }
    const [cat] = await db
      .select({ id: roadmapCategories.id })
      .from(roadmapCategories)
      .where(and(eq(roadmapCategories.id, input.categoryId), eq(roadmapCategories.userId, req.userId)))
      .limit(1);
    if (!cat) return sendError(reply, 404, 'NOT_FOUND', 'Category not found');

    const slug = roadmapSlugify(input.name, 120);
    const [existing] = await db
      .select({ id: roadmapTechnologies.id })
      .from(roadmapTechnologies)
      .where(and(eq(roadmapTechnologies.categoryId, input.categoryId), eq(roadmapTechnologies.slug, slug)))
      .limit(1);
    if (existing) {
      return sendError(reply, 409, 'DUPLICATE_RESOURCE', 'Technology with that name already exists in this category');
    }

    let order = input.order;
    if (order === undefined) {
      const [maxRow] = await db
        .select({ max: sql<number>`COALESCE(MAX("order"), -1)` })
        .from(roadmapTechnologies)
        .where(eq(roadmapTechnologies.categoryId, input.categoryId));
      order = (maxRow?.max ?? -1) + 1;
    }

    const [row] = await db
      .insert(roadmapTechnologies)
      .values({
        userId: req.userId,
        categoryId: input.categoryId,
        name: input.name,
        slug,
        order
      })
      .returning();
    return reply.code(201).send({ technology: row });
  });

  app.patch('/api/roadmap/technologies/:id', { preHandler: auth }, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const input = roadmapTechnologyInputSchema.partial().parse(req.body);
    const updateData: any = { updatedAt: new Date() };

    const [existing] = await db
      .select()
      .from(roadmapTechnologies)
      .where(and(eq(roadmapTechnologies.id, id), eq(roadmapTechnologies.userId, req.userId)))
      .limit(1);
    if (!existing) return sendError(reply, 404, 'NOT_FOUND', 'Technology not found');

    const targetCatId = input.categoryId || existing.categoryId;
    if (input.categoryId && input.categoryId !== existing.categoryId) {
      const [cat] = await db
        .select({ id: roadmapCategories.id })
        .from(roadmapCategories)
        .where(and(eq(roadmapCategories.id, input.categoryId), eq(roadmapCategories.userId, req.userId)))
        .limit(1);
      if (!cat) return sendError(reply, 404, 'NOT_FOUND', 'Target category not found');
      updateData.categoryId = input.categoryId;
    }

    if (input.name !== undefined) {
      updateData.name = input.name;
      updateData.slug = roadmapSlugify(input.name, 120);
      const [duplicate] = await db
        .select({ id: roadmapTechnologies.id })
        .from(roadmapTechnologies)
        .where(
          and(
            eq(roadmapTechnologies.categoryId, targetCatId),
            eq(roadmapTechnologies.slug, updateData.slug),
            sql`${roadmapTechnologies.id} != ${id}`
          )
        )
        .limit(1);
      if (duplicate) return sendError(reply, 409, 'DUPLICATE_RESOURCE', 'Technology with that name already exists in this category');
    }
    if (input.order !== undefined) updateData.order = input.order;

    const [row] = await db
      .update(roadmapTechnologies)
      .set(updateData)
      .where(and(eq(roadmapTechnologies.id, id), eq(roadmapTechnologies.userId, req.userId)))
      .returning();
    return { technology: row };
  });

  app.delete('/api/roadmap/technologies/:id', { preHandler: auth }, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const [row] = await db
      .delete(roadmapTechnologies)
      .where(and(eq(roadmapTechnologies.id, id), eq(roadmapTechnologies.userId, req.userId)))
      .returning({ id: roadmapTechnologies.id });
    if (!row) return sendError(reply, 404, 'NOT_FOUND', 'Technology not found');
    return reply.code(204).send();
  });

  app.post('/api/roadmap/technologies/reorder', { preHandler: auth }, async (req) => {
    const { orderedIds } = roadmapReorderSchema.parse(req.body);
    await db.transaction(async tx => {
      for (let i = 0; i < orderedIds.length; i++) {
        await tx
          .update(roadmapTechnologies)
          .set({ order: i, updatedAt: new Date() })
          .where(and(eq(roadmapTechnologies.id, orderedIds[i]), eq(roadmapTechnologies.userId, req.userId)));
      }
    });
    return { success: true };
  });

  // Roadmap Topics
  app.get('/api/roadmap/technologies/:id/topics', { preHandler: auth }, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const q = z.object({
      search: z.string().max(200).optional(),
      status: z.enum(['All', ...roadmapTopicStatuses]).default('All'),
      sortBy: z.enum(['order', 'title', 'status', 'updatedAt', 'lastRevisedAt']).default('order'),
      sortDir: z.enum(['asc', 'desc']).default('asc')
    }).parse(req.query);

    const [tech] = await db
      .select({ id: roadmapTechnologies.id })
      .from(roadmapTechnologies)
      .where(and(eq(roadmapTechnologies.id, id), eq(roadmapTechnologies.userId, req.userId)))
      .limit(1);
    if (!tech) return sendError(reply, 404, 'NOT_FOUND', 'Technology not found');

    const conditions = [
      eq(roadmapTopics.technologyId, id),
      eq(roadmapTopics.userId, req.userId)
    ];
    if (q.status !== 'All') {
      conditions.push(eq(roadmapTopics.status, q.status as RoadmapTopicStatus));
    }
    if (q.search && q.search.trim()) {
      const term = `%${q.search.trim()}%`;
      conditions.push(
        or(
          ilike(roadmapTopics.title, term),
          ilike(roadmapTopics.description, term),
          ilike(roadmapTopics.notesShort, term),
          ilike(roadmapTopics.notesDetailed, term)
        )!
      );
    }

    const sortColumn = {
      order: roadmapTopics.order,
      title: roadmapTopics.title,
      status: roadmapTopics.status,
      updatedAt: roadmapTopics.updatedAt,
      lastRevisedAt: roadmapTopics.lastRevisedAt
    }[q.sortBy];

    const rows = await db
      .select()
      .from(roadmapTopics)
      .where(and(...conditions))
      .orderBy(q.sortDir === 'asc' ? asc(sortColumn) : desc(sortColumn), asc(roadmapTopics.createdAt));

    return { items: rows };
  });

  app.post('/api/roadmap/technologies/:id/topics', { preHandler: auth }, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const input = roadmapTopicInputSchema.parse(req.body);

    const [tech] = await db
      .select({ id: roadmapTechnologies.id })
      .from(roadmapTechnologies)
      .where(and(eq(roadmapTechnologies.id, id), eq(roadmapTechnologies.userId, req.userId)))
      .limit(1);
    if (!tech) return sendError(reply, 404, 'NOT_FOUND', 'Technology not found');

    const slug = roadmapSlugify(input.title, 280);
    const [existing] = await db
      .select({ id: roadmapTopics.id })
      .from(roadmapTopics)
      .where(and(eq(roadmapTopics.technologyId, id), eq(roadmapTopics.slug, slug)))
      .limit(1);
    if (existing) {
      return sendError(reply, 409, 'DUPLICATE_RESOURCE', 'A topic with this title already exists in this technology');
    }

    let order = input.order;
    if (order === undefined) {
      const [maxRow] = await db
        .select({ max: sql<number>`COALESCE(MAX("order"), -1)` })
        .from(roadmapTopics)
        .where(eq(roadmapTopics.technologyId, id));
      order = (maxRow?.max ?? -1) + 1;
    }

    const now = new Date();
    const hasNotes = Boolean(input.notesShort?.trim() || input.notesDetailed?.trim() || input.notesCode?.trim() || input.referenceUrl?.trim());

    const [row] = await db
      .insert(roadmapTopics)
      .values({
        userId: req.userId,
        technologyId: id,
        title: input.title,
        slug,
        description: input.description ?? null,
        status: input.status,
        order,
        notesShort: input.notesShort ?? null,
        notesDetailed: input.notesDetailed ?? null,
        notesCode: input.notesCode ?? null,
        referenceUrl: input.referenceUrl ?? null,
        completedAt: input.status === 'Completed' ? now : null,
        lastRevisedAt: hasNotes ? now : null
      })
      .returning();
    return reply.code(201).send({ topic: row });
  });

  app.get('/api/roadmap/topics/:id', { preHandler: auth }, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const [topic] = await db
      .select()
      .from(roadmapTopics)
      .where(and(eq(roadmapTopics.id, id), eq(roadmapTopics.userId, req.userId)))
      .limit(1);
    if (!topic) return sendError(reply, 404, 'NOT_FOUND', 'Topic not found');
    return { topic };
  });

  app.patch('/api/roadmap/topics/:id', { preHandler: auth }, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const input = roadmapTopicInputSchema.partial().parse(req.body);

    const [existing] = await db
      .select()
      .from(roadmapTopics)
      .where(and(eq(roadmapTopics.id, id), eq(roadmapTopics.userId, req.userId)))
      .limit(1);
    if (!existing) return sendError(reply, 404, 'NOT_FOUND', 'Topic not found');

    const now = new Date();
    const updateData: any = { updatedAt: now };

    if (input.title !== undefined) {
      updateData.title = input.title;
      updateData.slug = roadmapSlugify(input.title, 280);
      const [duplicate] = await db
        .select({ id: roadmapTopics.id })
        .from(roadmapTopics)
        .where(
          and(
            eq(roadmapTopics.technologyId, existing.technologyId),
            eq(roadmapTopics.slug, updateData.slug),
            sql`${roadmapTopics.id} != ${id}`
          )
        )
        .limit(1);
      if (duplicate) {
        return sendError(reply, 409, 'DUPLICATE_RESOURCE', 'Another topic in this technology already has that title');
      }
    }

    if (input.description !== undefined) updateData.description = input.description;
    if (input.order !== undefined) updateData.order = input.order;

    if (input.status !== undefined) {
      updateData.status = input.status;
      if (input.status === 'Completed') {
        updateData.completedAt = existing.completedAt || now;
      } else {
        updateData.completedAt = null;
      }
    }

    const notesUpdated =
      input.notesShort !== undefined ||
      input.notesDetailed !== undefined ||
      input.notesCode !== undefined ||
      input.referenceUrl !== undefined;

    if (input.notesShort !== undefined) updateData.notesShort = input.notesShort;
    if (input.notesDetailed !== undefined) updateData.notesDetailed = input.notesDetailed;
    if (input.notesCode !== undefined) updateData.notesCode = input.notesCode;
    if (input.referenceUrl !== undefined) updateData.referenceUrl = input.referenceUrl;

    if (notesUpdated) {
      updateData.lastRevisedAt = now;
    } else if (input.lastRevisedAt !== undefined) {
      updateData.lastRevisedAt = input.lastRevisedAt ? new Date(input.lastRevisedAt) : null;
    }

    const [row] = await db
      .update(roadmapTopics)
      .set(updateData)
      .where(and(eq(roadmapTopics.id, id), eq(roadmapTopics.userId, req.userId)))
      .returning();

    return { topic: row };
  });

  app.patch('/api/roadmap/topics/:id/toggle', { preHandler: auth }, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const [existing] = await db
      .select()
      .from(roadmapTopics)
      .where(and(eq(roadmapTopics.id, id), eq(roadmapTopics.userId, req.userId)))
      .limit(1);
    if (!existing) return sendError(reply, 404, 'NOT_FOUND', 'Topic not found');

    const now = new Date();
    const nextStatus: RoadmapTopicStatus = existing.status === 'Completed' ? 'In Progress' : 'Completed';
    const nextCompletedAt = nextStatus === 'Completed' ? now : null;

    const [row] = await db
      .update(roadmapTopics)
      .set({
        status: nextStatus,
        completedAt: nextCompletedAt,
        updatedAt: now
      })
      .where(and(eq(roadmapTopics.id, id), eq(roadmapTopics.userId, req.userId)))
      .returning();

    return { topic: row };
  });

  app.delete('/api/roadmap/topics/:id', { preHandler: auth }, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const [row] = await db
      .delete(roadmapTopics)
      .where(and(eq(roadmapTopics.id, id), eq(roadmapTopics.userId, req.userId)))
      .returning({ id: roadmapTopics.id });
    if (!row) return sendError(reply, 404, 'NOT_FOUND', 'Topic not found');
    return reply.code(204).send();
  });

  app.post('/api/roadmap/topics/reorder', { preHandler: auth }, async (req) => {
    const { orderedIds } = roadmapReorderSchema.parse(req.body);
    await db.transaction(async tx => {
      for (let i = 0; i < orderedIds.length; i++) {
        await tx
          .update(roadmapTopics)
          .set({ order: i, updatedAt: new Date() })
          .where(and(eq(roadmapTopics.id, orderedIds[i]), eq(roadmapTopics.userId, req.userId)));
      }
    });
    return { success: true };
  });

  // JSON Import Preview and Commit
  app.post('/api/roadmap/import/preview', { preHandler: auth }, async (req, reply) => {
    const input = z.object({
      jsonContent: z.string().min(2, 'JSON content is required').max(2 * 1024 * 1024, 'File exceeds 2MB limit'),
      currentTechnologyId: z.string().uuid().optional(),
      mode: z.enum(['addNew', 'updateExisting']).default('addNew'),
      overwrite: z.boolean().default(false)
    }).parse(req.body);

    let parsedJson: any;
    try {
      parsedJson = JSON.parse(input.jsonContent);
    } catch (err: any) {
      return sendError(reply, 400, 'INVALID_JSON', `Invalid JSON syntax: ${err.message}`);
    }

    let currentTechInfo: { techName: string; categoryName: string } | undefined;
    if (input.currentTechnologyId) {
      const [tech] = await db
        .select({ id: roadmapTechnologies.id, name: roadmapTechnologies.name, categoryId: roadmapTechnologies.categoryId })
        .from(roadmapTechnologies)
        .where(and(eq(roadmapTechnologies.id, input.currentTechnologyId), eq(roadmapTechnologies.userId, req.userId)))
        .limit(1);
      if (tech) {
        const [cat] = await db
          .select({ name: roadmapCategories.name })
          .from(roadmapCategories)
          .where(eq(roadmapCategories.id, tech.categoryId))
          .limit(1);
        currentTechInfo = {
          techName: tech.name,
          categoryName: cat?.name || 'Development'
        };
      }
    }

    let normalized: NormalizedImportData;
    try {
      normalized = normalizeImportJson(parsedJson, currentTechInfo);
    } catch (err: any) {
      return sendError(reply, 400, 'VALIDATION_ERROR', err.message || 'JSON structure validation failed');
    }

    await ensureUserRoadmapInitialized(req.userId);

    const [userCats, userTechs, userTopics] = await Promise.all([
      db.select().from(roadmapCategories).where(eq(roadmapCategories.userId, req.userId)),
      db.select().from(roadmapTechnologies).where(eq(roadmapTechnologies.userId, req.userId)),
      db.select().from(roadmapTopics).where(eq(roadmapTopics.userId, req.userId))
    ]);

    const catMap = new Map(userCats.map(c => [normalizeRoadmapName(c.name), c]));
    const techMap = new Map(userTechs.map(t => [`${t.categoryId}:${normalizeRoadmapName(t.name)}`, t]));
    const topicMap = new Map(userTopics.map(tp => [`${tp.technologyId}:${normalizeRoadmapName(tp.title)}`, tp]));

    let categoriesToCreate = 0;
    let categoriesMatched = 0;
    let technologiesToCreate = 0;
    let technologiesMatched = 0;
    let topicsToCreate = 0;
    let topicsToUpdate = 0;
    let topicsPreserved = 0;
    let totalTopicsInFile = 0;
    const warnings: string[] = [];

    const details: any[] = [];

    for (const cat of normalized.categories) {
      const normCatName = normalizeRoadmapName(cat.name);
      const existingCat = catMap.get(normCatName);
      if (existingCat) {
        categoriesMatched++;
      } else {
        categoriesToCreate++;
      }

      const catDetails: any = {
        name: cat.name,
        action: existingCat ? 'match' : 'create',
        technologies: []
      };

      for (const tech of cat.technologies) {
        const normTechName = normalizeRoadmapName(tech.name);
        const existingTech = existingCat ? techMap.get(`${existingCat.id}:${normTechName}`) : undefined;
        if (existingTech) {
          technologiesMatched++;
        } else {
          technologiesToCreate++;
        }

        if (currentTechInfo && normalizeRoadmapName(currentTechInfo.techName) !== normTechName) {
          const warningMsg = `File targets technology "${tech.name}", but your current view is "${currentTechInfo.techName}".`;
          if (!warnings.includes(warningMsg)) warnings.push(warningMsg);
        }

        const topicsToAddList: string[] = [];
        const topicsToUpdateList: string[] = [];
        const topicsPreservedList: string[] = [];

        for (const topic of tech.topics) {
          totalTopicsInFile++;
          const normTopicTitle = normalizeRoadmapName(topic.title);
          const existingTopic = existingTech ? topicMap.get(`${existingTech.id}:${normTopicTitle}`) : undefined;

          if (!existingTopic) {
            topicsToCreate++;
            topicsToAddList.push(topic.title);
          } else {
            if (input.mode === 'updateExisting' || input.overwrite) {
              topicsToUpdate++;
              topicsToUpdateList.push(topic.title);
            } else {
              topicsPreserved++;
              topicsPreservedList.push(topic.title);
            }
          }
        }

        catDetails.technologies.push({
          name: tech.name,
          action: existingTech ? 'match' : 'create',
          topicsToCreate: topicsToAddList,
          topicsToUpdate: topicsToUpdateList,
          topicsPreserved: topicsPreservedList,
          totalTopics: tech.topics.length
        });
      }

      details.push(catDetails);
    }

    return {
      valid: true,
      mode: input.mode,
      overwrite: input.overwrite,
      summary: {
        categoriesToCreate,
        categoriesMatched,
        technologiesToCreate,
        technologiesMatched,
        topicsToCreate,
        topicsToUpdate,
        topicsPreserved,
        totalTopicsInFile
      },
      details,
      warnings
    };
  });

  app.post('/api/roadmap/import/commit', { preHandler: auth }, async (req, reply) => {
    const input = z.object({
      jsonContent: z.string().min(2, 'JSON content is required').max(2 * 1024 * 1024, 'File exceeds 2MB limit'),
      currentTechnologyId: z.string().uuid().optional(),
      mode: z.enum(['addNew', 'updateExisting']).default('addNew'),
      overwrite: z.boolean().default(false)
    }).parse(req.body);

    let parsedJson: any;
    try {
      parsedJson = JSON.parse(input.jsonContent);
    } catch (err: any) {
      return sendError(reply, 400, 'INVALID_JSON', `Invalid JSON syntax: ${err.message}`);
    }

    let currentTechInfo: { techName: string; categoryName: string } | undefined;
    if (input.currentTechnologyId) {
      const [tech] = await db
        .select({ id: roadmapTechnologies.id, name: roadmapTechnologies.name, categoryId: roadmapTechnologies.categoryId })
        .from(roadmapTechnologies)
        .where(and(eq(roadmapTechnologies.id, input.currentTechnologyId), eq(roadmapTechnologies.userId, req.userId)))
        .limit(1);
      if (tech) {
        const [cat] = await db
          .select({ name: roadmapCategories.name })
          .from(roadmapCategories)
          .where(eq(roadmapCategories.id, tech.categoryId))
          .limit(1);
        currentTechInfo = {
          techName: tech.name,
          categoryName: cat?.name || 'Development'
        };
      }
    }

    const normalized = normalizeImportJson(parsedJson, currentTechInfo);

    let categoriesCreated = 0;
    let technologiesCreated = 0;
    let topicsCreated = 0;
    let topicsUpdated = 0;
    let topicsPreserved = 0;

    await db.transaction(async tx => {
      for (const cat of normalized.categories) {
        const catSlug = roadmapSlugify(cat.name, 120);
        let [category] = await tx
          .select()
          .from(roadmapCategories)
          .where(and(eq(roadmapCategories.userId, req.userId), eq(roadmapCategories.slug, catSlug)))
          .limit(1);

        if (!category) {
          const [maxOrderRow] = await tx
            .select({ max: sql<number>`COALESCE(MAX("order"), -1)` })
            .from(roadmapCategories)
            .where(eq(roadmapCategories.userId, req.userId));
          const nextOrder = (maxOrderRow?.max ?? -1) + 1;

          [category] = await tx
            .insert(roadmapCategories)
            .values({
              userId: req.userId,
              name: cat.name,
              slug: catSlug,
              order: nextOrder
            })
            .returning();
          categoriesCreated++;
        }

        for (const tech of cat.technologies) {
          const techSlug = roadmapSlugify(tech.name, 120);
          let [technology] = await tx
            .select()
            .from(roadmapTechnologies)
            .where(and(eq(roadmapTechnologies.categoryId, category.id), eq(roadmapTechnologies.slug, techSlug)))
            .limit(1);

          if (!technology) {
            const [maxOrderRow] = await tx
              .select({ max: sql<number>`COALESCE(MAX("order"), -1)` })
              .from(roadmapTechnologies)
              .where(eq(roadmapTechnologies.categoryId, category.id));
            const nextOrder = (maxOrderRow?.max ?? -1) + 1;

            [technology] = await tx
              .insert(roadmapTechnologies)
              .values({
                userId: req.userId,
                categoryId: category.id,
                name: tech.name,
                slug: techSlug,
                order: nextOrder
              })
              .returning();
            technologiesCreated++;
          }

          const [maxTopicRow] = await tx
            .select({ max: sql<number>`COALESCE(MAX("order"), -1)` })
            .from(roadmapTopics)
            .where(eq(roadmapTopics.technologyId, technology.id));
          let currentMaxOrder = maxTopicRow?.max ?? -1;

          for (const topic of tech.topics) {
            const topicSlug = roadmapSlugify(topic.title, 280);
            const [existingTopic] = await tx
              .select()
              .from(roadmapTopics)
              .where(and(eq(roadmapTopics.technologyId, technology.id), eq(roadmapTopics.slug, topicSlug)))
              .limit(1);

            const now = new Date();
            const hasNotes = Boolean(topic.notesShort || topic.notesDetailed || topic.notesCode || topic.referenceUrl);

            if (!existingTopic) {
              currentMaxOrder++;
              const topicOrder = topic.order ?? currentMaxOrder;

              await tx.insert(roadmapTopics).values({
                userId: req.userId,
                technologyId: technology.id,
                title: topic.title,
                slug: topicSlug,
                description: topic.description ?? null,
                status: topic.status ?? 'Not Started',
                order: topicOrder,
                notesShort: topic.notesShort ?? null,
                notesDetailed: topic.notesDetailed ?? null,
                notesCode: topic.notesCode ?? null,
                referenceUrl: topic.referenceUrl ?? null,
                completedAt: topic.status === 'Completed' ? now : null,
                lastRevisedAt: hasNotes ? now : null
              });
              topicsCreated++;
            } else {
              if (input.mode === 'updateExisting' || input.overwrite) {
                const updateData: any = { updatedAt: now };
                if (topic.description !== undefined) updateData.description = topic.description;
                if (topic.status !== undefined) {
                  updateData.status = topic.status;
                  updateData.completedAt = topic.status === 'Completed' ? now : null;
                }
                if (topic.order !== undefined) updateData.order = topic.order;
                if (topic.notesShort !== undefined) updateData.notesShort = topic.notesShort;
                if (topic.notesDetailed !== undefined) updateData.notesDetailed = topic.notesDetailed;
                if (topic.notesCode !== undefined) updateData.notesCode = topic.notesCode;
                if (topic.referenceUrl !== undefined) updateData.referenceUrl = topic.referenceUrl;
                if (hasNotes) updateData.lastRevisedAt = now;

                await tx
                  .update(roadmapTopics)
                  .set(updateData)
                  .where(eq(roadmapTopics.id, existingTopic.id));
                topicsUpdated++;
              } else {
                topicsPreserved++;
              }
            }
          }
        }
      }
    });

    return {
      success: true,
      imported: {
        categoriesCreated,
        technologiesCreated,
        topicsCreated,
        topicsUpdated,
        topicsPreserved
      }
    };
  });

  return app;
}
