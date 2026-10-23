import type { FastifyReply } from 'fastify';
export function sendError(reply: FastifyReply, statusCode: number, code: string, message: string){ return reply.code(statusCode).send({ error: { code, message } }); }
export function slugify(value:string){ return value.toLowerCase().trim().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,80); }
