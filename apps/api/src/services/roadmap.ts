import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { and, asc, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  roadmapCategories,
  roadmapTechnologies,
  roadmapTopics
} from '../db/schema.js';
import {
  initialRoadmapHierarchy,
  builtInRoadmaps,
  normalizeRoadmapName,
  roadmapImportRootSchema,
  roadmapImportCategorySchema,
  roadmapImportTechnologySchema,
  roadmapImportTopicSchema,
  type RoadmapTopicStatus
} from '@ppt/shared';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function getAppsDataDir(): string | null {
  const possiblePaths = [
    path.resolve(process.cwd(), 'apps/data'),
    path.resolve(process.cwd(), '../data'),
    path.resolve(process.cwd(), '../../apps/data'),
    path.resolve(__dirname, '../../../../apps/data'),
    path.resolve(__dirname, '../../../data'),
    path.resolve(__dirname, '../../data')
  ];
  for (const p of possiblePaths) {
    try {
      if (fs.existsSync(p) && fs.statSync(p).isDirectory()) {
        return p;
      }
    } catch {}
  }
  return null;
}

export function roadmapSlugify(value: string, maxLength = 100): string {
  const slug = value
    .toLowerCase()
    .trim()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return (slug || 'item').slice(0, maxLength);
}

/**
 * Ensures initial default hierarchy is present for the user.
 * Idempotent: Never duplicates, preserves existing custom items, creates no topics.
 */
export async function ensureUserRoadmapInitialized(userId: string, tx: any = db): Promise<void> {
  const existingCategories = await tx
    .select({ id: roadmapCategories.id, slug: roadmapCategories.slug })
    .from(roadmapCategories)
    .where(eq(roadmapCategories.userId, userId));

  const existingCatMap = new Map<string, string>();
  for (const c of existingCategories) {
    existingCatMap.set(c.slug, c.id);
  }

  const missingCategories = initialRoadmapHierarchy
    .map((cat, idx) => ({
      userId,
      name: cat.name,
      slug: roadmapSlugify(cat.name, 120),
      order: idx
    }))
    .filter((cat) => !existingCatMap.has(cat.slug));

  if (missingCategories.length > 0) {
    const inserted = await tx
      .insert(roadmapCategories)
      .values(missingCategories)
      .onConflictDoNothing({ target: [roadmapCategories.userId, roadmapCategories.slug] })
      .returning({ id: roadmapCategories.id, slug: roadmapCategories.slug });

    for (const c of inserted) {
      existingCatMap.set(c.slug, c.id);
    }

    if (inserted.length < missingCategories.length) {
      const allCats = await tx
        .select({ id: roadmapCategories.id, slug: roadmapCategories.slug })
        .from(roadmapCategories)
        .where(eq(roadmapCategories.userId, userId));
      for (const c of allCats) {
        existingCatMap.set(c.slug, c.id);
      }
    }
  }

  const existingTechs = await tx
    .select({ categoryId: roadmapTechnologies.categoryId, slug: roadmapTechnologies.slug })
    .from(roadmapTechnologies)
    .where(eq(roadmapTechnologies.userId, userId));

  const existingTechSet = new Set<string>();
  for (const t of existingTechs) {
    existingTechSet.add(`${t.categoryId}:${t.slug}`);
  }

  const missingTechs: any[] = [];
  for (const defaultCat of initialRoadmapHierarchy) {
    const catSlug = roadmapSlugify(defaultCat.name, 120);
    const categoryId = existingCatMap.get(catSlug);
    if (!categoryId) continue;

    for (let techIdx = 0; techIdx < defaultCat.technologies.length; techIdx++) {
      const techName = defaultCat.technologies[techIdx];
      const techSlug = roadmapSlugify(techName, 120);
      const key = `${categoryId}:${techSlug}`;
      if (!existingTechSet.has(key)) {
        missingTechs.push({
          userId,
          categoryId,
          name: techName,
          slug: techSlug,
          order: techIdx
        });
      }
    }
  }

  if (missingTechs.length > 0) {
    await tx
      .insert(roadmapTechnologies)
      .values(missingTechs)
      .onConflictDoNothing({ target: [roadmapTechnologies.categoryId, roadmapTechnologies.slug] });
  }

  // Update order for categories to guarantee exact 0..11 order
  for (let idx = 0; idx < initialRoadmapHierarchy.length; idx++) {
    const cat = initialRoadmapHierarchy[idx];
    const slug = roadmapSlugify(cat.name, 120);
    await tx
      .update(roadmapCategories)
      .set({ order: idx, name: cat.name })
      .where(and(eq(roadmapCategories.userId, userId), eq(roadmapCategories.slug, slug)));
  }

  // Clean up any legacy categories that are not part of the 12 roadmaps
  const allowedCatSlugs = new Set(initialRoadmapHierarchy.map((c) => roadmapSlugify(c.name, 120)));
  const legacyCats = existingCategories.filter((c: { id: string; slug: string }) => !allowedCatSlugs.has(c.slug));
  if (legacyCats.length > 0) {
    for (const leg of legacyCats) {
      await tx
        .delete(roadmapCategories)
        .where(and(eq(roadmapCategories.userId, userId), eq(roadmapCategories.id, leg.id)));
    }
  }

  // Load and sync any topics provided in apps/data for the corresponding categories and technologies
  await syncAppsDataTopics(userId, tx);
}

/**
 * Returns overall roadmap summary with categories, technologies, topic counts and progress percentages.
 */
export async function getRoadmapOverview(userId: string) {
  await ensureUserRoadmapInitialized(userId);

  const [categoriesList, technologiesList, topicsList] = await Promise.all([
    db
      .select()
      .from(roadmapCategories)
      .where(eq(roadmapCategories.userId, userId))
      .orderBy(asc(roadmapCategories.order), asc(roadmapCategories.name)),
    db
      .select()
      .from(roadmapTechnologies)
      .where(eq(roadmapTechnologies.userId, userId))
      .orderBy(asc(roadmapTechnologies.order), asc(roadmapTechnologies.name)),
    db
      .select({
        id: roadmapTopics.id,
        technologyId: roadmapTopics.technologyId,
        status: roadmapTopics.status
      })
      .from(roadmapTopics)
      .where(eq(roadmapTopics.userId, userId))
  ]);

  // Aggregate topics per technology
  const techMap = new Map<string, { total: number; completed: number; remaining: number }>();
  for (const t of topicsList) {
    const cur = techMap.get(t.technologyId) || { total: 0, completed: 0, remaining: 0 };
    cur.total++;
    if (t.status === 'Completed') {
      cur.completed++;
    } else {
      cur.remaining++;
    }
    techMap.set(t.technologyId, cur);
  }

  const enrichedTechnologies = technologiesList.map(tech => {
    const stats = techMap.get(tech.id) || { total: 0, completed: 0, remaining: 0 };
    const progressPercent = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : null;
    return {
      ...tech,
      totalTopics: stats.total,
      completedTopics: stats.completed,
      remainingTopics: stats.remaining,
      progressPercentage: progressPercent,
      hasTopics: stats.total > 0
    };
  });

  // Aggregate per category
  let overallTotal = 0;
  let overallCompleted = 0;

  const enrichedCategories = categoriesList.map(cat => {
    const techsInCat = enrichedTechnologies.filter(t => t.categoryId === cat.id);
    const catTotal = techsInCat.reduce((acc, t) => acc + t.totalTopics, 0);
    const catCompleted = techsInCat.reduce((acc, t) => acc + t.completedTopics, 0);
    const catRemaining = catTotal - catCompleted;
    const catProgress = catTotal > 0 ? Math.round((catCompleted / catTotal) * 100) : null;

    overallTotal += catTotal;
    overallCompleted += catCompleted;

    const hierarchyItem = initialRoadmapHierarchy.find(
      h => h.name.toLowerCase() === cat.name.toLowerCase()
    );

    return {
      ...cat,
      description: hierarchyItem?.description || '',
      technologies: techsInCat,
      totalTopics: catTotal,
      completedTopics: catCompleted,
      remainingTopics: catRemaining,
      progressPercentage: catProgress,
      hasTopics: catTotal > 0
    };
  });

  const overallRemaining = overallTotal - overallCompleted;
  const overallProgress = overallTotal > 0 ? Math.round((overallCompleted / overallTotal) * 100) : null;

  return {
    categories: enrichedCategories,
    stats: {
      totalCategories: categoriesList.length,
      totalTechnologies: technologiesList.length,
      totalTopics: overallTotal,
      completedTopics: overallCompleted,
      remainingTopics: overallRemaining,
      progressPercentage: overallProgress,
      hasTopics: overallTotal > 0
    }
  };
}

/**
 * Returns detail for a single category with its child technologies and aggregated stats.
 */
export async function getRoadmapCategoryDetail(userId: string, categoryId: string) {
  const [category] = await db
    .select()
    .from(roadmapCategories)
    .where(and(eq(roadmapCategories.id, categoryId), eq(roadmapCategories.userId, userId)))
    .limit(1);

  if (!category) return null;

  const [techList, topicsList] = await Promise.all([
    db
      .select()
      .from(roadmapTechnologies)
      .where(and(eq(roadmapTechnologies.categoryId, categoryId), eq(roadmapTechnologies.userId, userId)))
      .orderBy(asc(roadmapTechnologies.order), asc(roadmapTechnologies.name)),
    db
      .select({
        id: roadmapTopics.id,
        technologyId: roadmapTopics.technologyId,
        status: roadmapTopics.status
      })
      .from(roadmapTopics)
      .where(eq(roadmapTopics.userId, userId))
  ]);

  const techMap = new Map<string, { total: number; completed: number; remaining: number }>();
  for (const t of topicsList) {
    const cur = techMap.get(t.technologyId) || { total: 0, completed: 0, remaining: 0 };
    cur.total++;
    if (t.status === 'Completed') {
      cur.completed++;
    } else {
      cur.remaining++;
    }
    techMap.set(t.technologyId, cur);
  }

  let catTotal = 0;
  let catCompleted = 0;

  const enrichedTechs = techList.map(tech => {
    const stats = techMap.get(tech.id) || { total: 0, completed: 0, remaining: 0 };
    const progressPercent = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : null;
    catTotal += stats.total;
    catCompleted += stats.completed;
    return {
      ...tech,
      totalTopics: stats.total,
      completedTopics: stats.completed,
      remainingTopics: stats.remaining,
      progressPercentage: progressPercent,
      hasTopics: stats.total > 0
    };
  });

  const hierarchyItem = initialRoadmapHierarchy.find(
    h => h.name.toLowerCase() === category.name.toLowerCase()
  );

  return {
    ...category,
    description: hierarchyItem?.description || '',
    technologies: enrichedTechs,
    totalTopics: catTotal,
    completedTopics: catCompleted,
    remainingTopics: catTotal - catCompleted,
    progressPercentage: catTotal > 0 ? Math.round((catCompleted / catTotal) * 100) : null,
    hasTopics: catTotal > 0
  };
}

/**
 * Normalized representation of parsed import content
 */
export interface NormalizedImportData {
  categories: {
    name: string;
    technologies: {
      name: string;
      topics: {
        title: string;
        description?: string | null;
        status?: RoadmapTopicStatus;
        notesShort?: string | null;
        notesDetailed?: string | null;
        notesCode?: string | null;
        referenceUrl?: string | null;
        order?: number;
      }[];
    }[];
  }[];
}

function extractNotes(notes: any) {
  if (!notes) return { short: null, detailed: null, code: null, referenceUrl: null };
  if (typeof notes === 'string') return { short: null, detailed: notes, code: null, referenceUrl: null };
  return {
    short: typeof notes.short === 'string' ? notes.short : null,
    detailed: typeof notes.detailed === 'string' ? notes.detailed : null,
    code: typeof notes.code === 'string' ? notes.code : null,
    referenceUrl: typeof notes.referenceUrl === 'string' ? notes.referenceUrl : null
  };
}

/**
 * Reads all JSON files in apps/data and inserts topics for the corresponding categories and technologies
 * for the given user, in the exact given order. Idempotent: does not overwrite existing topics or change
 * user progress.
 */
export async function syncAppsDataTopics(userId: string, tx: any = db): Promise<{ insertedCount: number }> {
  const dataDir = getAppsDataDir();
  if (!dataDir) return { insertedCount: 0 };

  let files: string[] = [];
  try {
    files = fs.readdirSync(dataDir).filter(f => f.endsWith('.json'));
  } catch (err) {
    console.error('Failed to read data directory:', err);
    return { insertedCount: 0 };
  }

  if (files.length === 0) return { insertedCount: 0 };

  const userCats = await tx
    .select({ id: roadmapCategories.id, slug: roadmapCategories.slug })
    .from(roadmapCategories)
    .where(eq(roadmapCategories.userId, userId));

  const catMap = new Map<string, string>();
  for (const c of userCats) {
    catMap.set(c.slug, c.id);
  }

  const userTechs = await tx
    .select({ id: roadmapTechnologies.id, categoryId: roadmapTechnologies.categoryId, slug: roadmapTechnologies.slug })
    .from(roadmapTechnologies)
    .where(eq(roadmapTechnologies.userId, userId));

  const techMap = new Map<string, string>();
  for (const t of userTechs) {
    techMap.set(`${t.categoryId}:${t.slug}`, t.id);
  }

  let totalInserted = 0;

  for (const file of files) {
    try {
      const fullPath = path.join(dataDir, file);
      const rawText = fs.readFileSync(fullPath, 'utf8');
      const content = JSON.parse(rawText);
      if (!content.categories || !Array.isArray(content.categories)) continue;

      for (const cat of content.categories) {
        const catSlug = roadmapSlugify(cat.name, 120);
        const categoryId = catMap.get(catSlug);
        if (!categoryId) continue;

        for (const tech of cat.technologies || []) {
          const techSlug = roadmapSlugify(tech.name, 120);
          const techId = techMap.get(`${categoryId}:${techSlug}`);
          if (!techId) continue;

          const rawTopics = Array.isArray(tech.topics) ? tech.topics : [];
          if (rawTopics.length === 0) continue;

          const now = new Date();
          const topicsToInsert: any[] = [];

          for (let idx = 0; idx < rawTopics.length; idx++) {
            const topic = rawTopics[idx];
            if (!topic.title || typeof topic.title !== 'string') continue;
            const topicSlug = roadmapSlugify(topic.title, 280);
            const topicOrder = typeof topic.order === 'number' ? topic.order : idx + 1;
            const notes = extractNotes(topic.notes);

            topicsToInsert.push({
              userId,
              technologyId: techId,
              title: topic.title.trim(),
              slug: topicSlug,
              description: topic.description ?? null,
              status: (topic.status as RoadmapTopicStatus) ?? 'Not Started',
              order: topicOrder,
              notesShort: notes.short,
              notesDetailed: notes.detailed,
              notesCode: notes.code,
              referenceUrl: notes.referenceUrl,
              createdAt: now,
              updatedAt: now
            });
          }

          if (topicsToInsert.length > 0) {
            const chunkSize = 100;
            for (let i = 0; i < topicsToInsert.length; i += chunkSize) {
              const chunk = topicsToInsert.slice(i, i + chunkSize);
              await tx
                .insert(roadmapTopics)
                .values(chunk)
                .onConflictDoNothing({ target: [roadmapTopics.technologyId, roadmapTopics.slug] });
            }
            totalInserted += topicsToInsert.length;
          }
        }
      }
    } catch (err) {
      console.error(`Error loading topics from ${file}:`, err);
    }
  }

  return { insertedCount: totalInserted };
}

/**
 * Normalizes different supported JSON formats into standard category -> tech -> topics structure
 */
export function normalizeImportJson(
  rawJson: any,
  currentTechInfo?: { techName: string; categoryName: string }
): NormalizedImportData {
  if (typeof rawJson !== 'object' || rawJson === null) {
    throw new Error('Import data must be a JSON object or array');
  }

  // 1. Direct array of topics: [ { title: ... } ]
  if (Array.isArray(rawJson)) {
    if (!currentTechInfo) {
      throw new Error('A direct list of topics can only be imported while viewing a specific technology');
    }
    const validatedTopics = rawJson.map((item, idx) => {
      const parsed = roadmapImportTopicSchema.parse(item);
      const notes = extractNotes(parsed.notes);
      return {
        title: parsed.title,
        description: parsed.description ?? null,
        status: (parsed.status as RoadmapTopicStatus) ?? 'Not Started',
        notesShort: notes.short,
        notesDetailed: notes.detailed,
        notesCode: notes.code,
        referenceUrl: notes.referenceUrl,
        order: parsed.order ?? idx
      };
    });

    return {
      categories: [
        {
          name: currentTechInfo.categoryName,
          technologies: [
            {
              name: currentTechInfo.techName,
              topics: validatedTopics
            }
          ]
        }
      ]
    };
  }

  // 2. Object with "categories": [ ... ]
  if (Array.isArray(rawJson.categories)) {
    const parsedRoot = roadmapImportRootSchema.parse(rawJson);
    return {
      categories: parsedRoot.categories.map(c => ({
        name: c.name.trim(),
        technologies: c.technologies.map(t => ({
          name: t.name.trim(),
          topics: t.topics.map((item, idx) => {
            const notes = extractNotes(item.notes);
            return {
              title: item.title.trim(),
              description: item.description ?? null,
              status: (item.status as RoadmapTopicStatus) ?? 'Not Started',
              notesShort: notes.short,
              notesDetailed: notes.detailed,
              notesCode: notes.code,
              referenceUrl: notes.referenceUrl,
              order: item.order ?? idx
            };
          })
        }))
      }))
    };
  }

  // 3. Single category object: { name: "...", technologies: [ ... ] }
  if (typeof rawJson.name === 'string' && Array.isArray(rawJson.technologies)) {
    const parsedCategory = roadmapImportCategorySchema.parse(rawJson);
    return {
      categories: [
        {
          name: parsedCategory.name.trim(),
          technologies: parsedCategory.technologies.map(t => ({
            name: t.name.trim(),
            topics: t.topics.map((item, idx) => {
              const notes = extractNotes(item.notes);
              return {
                title: item.title.trim(),
                description: item.description ?? null,
                status: (item.status as RoadmapTopicStatus) ?? 'Not Started',
                notesShort: notes.short,
                notesDetailed: notes.detailed,
                notesCode: notes.code,
                referenceUrl: notes.referenceUrl,
                order: item.order ?? idx
              };
            })
          }))
        }
      ]
    };
  }

  // 4. Single technology object: { name: "...", topics: [ ... ] } or { technology: "...", topics: [ ... ] }
  const techNameField = rawJson.name || rawJson.technology;
  if (typeof techNameField === 'string' && Array.isArray(rawJson.topics)) {
    const parsedTech = roadmapImportTechnologySchema.parse({
      name: techNameField,
      topics: rawJson.topics
    });
    const categoryName = currentTechInfo?.categoryName || 'Development';
    return {
      categories: [
        {
          name: categoryName,
          technologies: [
            {
              name: parsedTech.name.trim(),
              topics: parsedTech.topics.map((item, idx) => {
                const notes = extractNotes(item.notes);
                return {
                  title: item.title.trim(),
                  description: item.description ?? null,
                  status: (item.status as RoadmapTopicStatus) ?? 'Not Started',
                  notesShort: notes.short,
                  notesDetailed: notes.detailed,
                  notesCode: notes.code,
                  referenceUrl: notes.referenceUrl,
                  order: item.order ?? idx
                };
              })
            }
          ]
        }
      ]
    };
  }

  // 5. Object with "topics": [ ... ] without technology name
  if (Array.isArray(rawJson.topics)) {
    if (!currentTechInfo) {
      throw new Error('A topic list without technology name can only be imported into a selected technology');
    }
    const validatedTopics = rawJson.topics.map((item: any, idx: number) => {
      const parsed = roadmapImportTopicSchema.parse(item);
      const notes = extractNotes(parsed.notes);
      return {
        title: parsed.title,
        description: parsed.description ?? null,
        status: (parsed.status as RoadmapTopicStatus) ?? 'Not Started',
        notesShort: notes.short,
        notesDetailed: notes.detailed,
        notesCode: notes.code,
        referenceUrl: notes.referenceUrl,
        order: parsed.order ?? idx
      };
    });

    return {
      categories: [
        {
          name: currentTechInfo.categoryName,
          technologies: [
            {
              name: currentTechInfo.techName,
              topics: validatedTopics
            }
          ]
        }
      ]
    };
  }

  throw new Error('Unrecognized JSON format. Please use the supported roadmap JSON template.');
}
