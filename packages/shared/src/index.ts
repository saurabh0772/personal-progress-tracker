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

export const roadmapTopicStatuses = ['Not Started', 'In Progress', 'Completed', 'Needs Revision'] as const;
export type RoadmapTopicStatus = (typeof roadmapTopicStatuses)[number];

export interface InitialRoadmapCategory {
  name: string;
  description: string;
  technologies: readonly string[];
}

export const initialRoadmapHierarchy: readonly InitialRoadmapCategory[] = [
  {
    name: 'Programming Languages',
    description: 'Core languages for modern full-stack web and systems engineering.',
    technologies: ['JavaScript', 'TypeScript']
  },
  {
    name: 'Web Fundamentals',
    description: 'Underlying architecture of the web, rendering pipeline, and foundational standards.',
    technologies: ['HTML', 'CSS', 'Browser Basics', 'Web Architecture']
  },
  {
    name: 'Frontend Development',
    description: 'Component-driven modern client applications, state management, and SSR frameworks.',
    technologies: ['React', 'Redux Toolkit', 'Next.js', 'Tailwind CSS']
  },
  {
    name: 'Backend Development',
    description: 'Server runtimes, HTTP microframeworks, and high-performance server architectures.',
    technologies: ['Node.js', 'Express.js', 'Fastify']
  },
  {
    name: 'API & Security',
    description: 'Secure protocol design, identity access management, tokens, and distributed integration.',
    technologies: [
      'REST APIs',
      'Authentication',
      'Authorization',
      'JWT',
      'OAuth',
      'Webhooks',
      'API Security'
    ]
  },
  {
    name: 'Databases & Caching',
    description: 'Relational and document storage, in-memory caches, ACID guarantees, and query optimization.',
    technologies: [
      'SQL',
      'PostgreSQL',
      'MongoDB',
      'Mongoose',
      'Redis',
      'Indexing',
      'Transactions'
    ]
  },
  {
    name: 'Real-Time & Messaging',
    description: 'Bi-directional streaming, peer-to-peer data, job queues, and distributed event brokers.',
    technologies: [
      'WebSockets',
      'Socket.IO',
      'WebRTC',
      'STUN/TURN',
      'BullMQ',
      'RabbitMQ',
      'Kafka'
    ]
  },
  {
    name: 'Computer Science & DSA',
    description: 'Foundational data structures, algorithmic complexity, OS primitives, and network layers.',
    technologies: [
      'DSA',
      'OOP',
      'DBMS',
      'Operating Systems',
      'Computer Networks'
    ]
  },
  {
    name: 'System Design & Architecture',
    description: 'High-level architectural patterns, distributed consensus, fault-tolerance, and scale.',
    technologies: [
      'HLD',
      'LLD',
      'Monolith',
      'Microservices',
      'Caching Strategies',
      'Load Balancing',
      'Distributed Systems'
    ]
  },
  {
    name: 'Testing & Performance',
    description: 'Test-driven verification, automated assertions, load generation, and benchmarking.',
    technologies: [
      'Unit Testing',
      'Integration Testing',
      'Vitest/Jest',
      'Supertest',
      'k6',
      'Autocannon'
    ]
  },
  {
    name: 'DevOps, Cloud & Observability',
    description: 'Containerization, infrastructure automation, deployment pipelines, and metrics telemetry.',
    technologies: [
      'Git',
      'GitHub',
      'Linux',
      'Bash',
      'Docker',
      'CI/CD',
      'AWS Basics',
      'Nginx',
      'Prometheus',
      'Grafana',
      'OpenTelemetry'
    ]
  },
  {
    name: 'Projects & Interview Preparation',
    description: 'End-to-end portfolio projects, technical deep dives, coding rounds, and behavioral interview mastery.',
    technologies: [
      'Projects',
      'Resume',
      'Project Deep Dives',
      'Coding Interviews',
      'System Design Interviews',
      'HR/Behavioral Questions'
    ]
  }
] as const;

export const normalizeRoadmapName = (val: string) => val.trim().toLowerCase();

export const roadmapCategoryInputSchema = z.object({
  name: z.string().trim().min(1, 'Category name is required').max(100),
  order: z.number().int().optional()
});
export type RoadmapCategoryInput = z.infer<typeof roadmapCategoryInputSchema>;

export const roadmapTechnologyInputSchema = z.object({
  name: z.string().trim().min(1, 'Technology name is required').max(100),
  categoryId: z.string().uuid().optional(),
  order: z.number().int().optional()
});
export type RoadmapTechnologyInput = z.infer<typeof roadmapTechnologyInputSchema>;

export const roadmapTopicInputSchema = z.object({
  title: z.string().trim().min(1, 'Topic title is required').max(255),
  description: z.string().max(20000).optional().nullable(),
  status: z.enum(roadmapTopicStatuses).default('Not Started'),
  order: z.number().int().optional(),
  notesShort: z.string().max(5000).optional().nullable(),
  notesDetailed: z.string().max(50000).optional().nullable(),
  notesCode: z.string().max(50000).optional().nullable(),
  referenceUrl: z.union([z.string().url().max(2048), z.literal('')]).optional().nullable(),
  lastRevisedAt: z.string().optional().nullable()
});
export type RoadmapTopicInput = z.infer<typeof roadmapTopicInputSchema>;

export const roadmapTopicNotesSchema = z.object({
  notesShort: z.string().max(5000).optional().nullable(),
  notesDetailed: z.string().max(50000).optional().nullable(),
  notesCode: z.string().max(50000).optional().nullable(),
  referenceUrl: z.union([z.string().url().max(2048), z.literal('')]).optional().nullable()
});

export const roadmapReorderSchema = z.object({
  orderedIds: z.array(z.string().uuid()).min(1)
});

// JSON Import schemas
export const roadmapImportNotesSchema = z.union([
  z.string().transform(s => ({ detailed: s })),
  z.object({
    short: z.string().max(5000).optional().nullable(),
    detailed: z.string().max(50000).optional().nullable(),
    code: z.string().max(50000).optional().nullable(),
    referenceUrl: z.string().max(2048).optional().nullable()
  })
]);

export const roadmapImportTopicSchema = z.object({
  title: z.string().trim().min(1, 'Topic title cannot be empty').max(255),
  description: z.string().max(20000).optional().nullable(),
  status: z.enum(roadmapTopicStatuses).optional().default('Not Started'),
  notes: roadmapImportNotesSchema.optional().nullable(),
  order: z.number().int().optional()
});
export type RoadmapImportTopic = z.infer<typeof roadmapImportTopicSchema>;

export const roadmapImportTechnologySchema = z.object({
  name: z.string().trim().min(1, 'Technology name cannot be empty').max(100),
  topics: z.array(roadmapImportTopicSchema).optional().default([])
});
export type RoadmapImportTechnology = z.infer<typeof roadmapImportTechnologySchema>;

export const roadmapImportCategorySchema = z.object({
  name: z.string().trim().min(1, 'Category name cannot be empty').max(100),
  technologies: z.array(roadmapImportTechnologySchema).optional().default([])
});
export type RoadmapImportCategory = z.infer<typeof roadmapImportCategorySchema>;

export const roadmapImportRootSchema = z.object({
  version: z.number().optional().default(1),
  categories: z.array(roadmapImportCategorySchema).optional().default([])
});
export type RoadmapImportRoot = z.infer<typeof roadmapImportRootSchema>;

export * from './roadmaps/data.js';
