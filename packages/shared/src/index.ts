import { z } from 'zod';

export const activityTypes = ['Learned','Practiced','Built','Fixed','Revised','Researched','Other'] as const;
export const activityStatuses = ['Completed','In Progress','Needs Revision'] as const;
export const difficulties = ['Easy','Medium','Hard'] as const;

export const registerSchema = z.object({
  email: z.string().trim().email().max(254).transform(v => v.toLowerCase()),
  password: z.string().min(12).max(128)
});
export const loginSchema = z.object({ email: z.string().trim().email().max(254).transform(v => v.toLowerCase()), password: z.string().min(1).max(128) });
export const categoryInputSchema = z.object({ name: z.string().trim().min(1).max(60) });
export const tagInputSchema = z.object({ name: z.string().trim().min(1).max(40) });
export const activityInputSchema = z.object({
  title: z.string().trim().min(1).max(180),
  description: z.string().max(20000).optional().nullable(),
  categoryId: z.string().uuid().optional().nullable(),
  activityType: z.enum(activityTypes).default('Learned'),
  status: z.enum(activityStatuses).default('Completed'),
  referenceUrl: z.string().url().max(2048).optional().nullable(),
  durationMinutes: z.number().int().min(0).max(100000).optional().nullable(),
  difficulty: z.enum(difficulties).optional().nullable(),
  activityDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  tagIds: z.array(z.string().uuid()).max(30).default([])
});
export type ActivityInput = z.infer<typeof activityInputSchema>;
