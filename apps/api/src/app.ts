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
import { registerSchema, loginSchema, categoryInputSchema, tagInputSchema, activityInputSchema, activityTypes, activityStatuses, difficulties } from '@ppt/shared';
import { db, pool } from './db/index.js';
import { users, categories, tags, activities, activityTags, dailySummaries } from './db/schema.js';
import { sendError, slugify } from './utils/errors.js';

declare module 'fastify' { interface FastifyRequest { userId: string } }
const cookieName = process.env.COOKIE_NAME || 'ppt_session';
const webOrigin = process.env.WEB_ORIGIN || 'http://localhost:5173';
const allowedOrigins = new Set([webOrigin, 'http://localhost:5173', 'http://localhost:5174', 'http://127.0.0.1:5173', 'http://127.0.0.1:5174']);
const isAllowedOrigin = (origin?: string) => !origin || allowedOrigins.has(origin) || (process.env.NODE_ENV !== 'production' && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin));
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret.length < 32) throw new Error('JWT_SECRET must be set to at least 32 characters');
const activeJwtSecret: string = jwtSecret;

export async function buildApp(){
  const app = Fastify({ logger: { redact: ['req.headers.cookie','req.headers.authorization','*.password','*.passwordHash','*.token'], level: process.env.NODE_ENV==='production'?'info':'debug' }, bodyLimit: 1024*1024, trustProxy: process.env.NODE_ENV==='production' });
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
  const cookieSameSite = (process.env.NODE_ENV === 'production' ? 'strict' : 'lax') as 'strict' | 'lax';
  const setSession=async(reply:any,userId:string)=>{ const token=app.jwt.sign({sub:userId}); reply.setCookie(cookieName,token,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:cookieSameSite,path:'/',maxAge:7*24*60*60}); };
  const clearSession=(reply:any)=>reply.clearCookie(cookieName,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:cookieSameSite,path:'/'});

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
  return app;
}
