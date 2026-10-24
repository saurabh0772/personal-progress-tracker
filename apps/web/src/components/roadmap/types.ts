export type RoadmapTopicStatus = 'Not Started' | 'In Progress' | 'Completed' | 'Needs Revision';

export interface RoadmapTopic {
  id: string;
  userId: string;
  technologyId: string;
  title: string;
  slug: string;
  description: string | null;
  status: RoadmapTopicStatus;
  order: number;
  notesShort: string | null;
  notesDetailed: string | null;
  notesCode: string | null;
  referenceUrl: string | null;
  lastRevisedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RoadmapTechnology {
  id: string;
  userId: string;
  categoryId: string;
  name: string;
  slug: string;
  order: number;
  createdAt: string;
  updatedAt: string;
  totalTopics: number;
  completedTopics: number;
  remainingTopics: number;
  progressPercentage: number | null;
  hasTopics: boolean;
  category?: { id: string; name: string } | null;
}

export interface RoadmapCategory {
  id: string;
  userId: string;
  name: string;
  slug: string;
  description?: string;
  order: number;
  createdAt: string;
  updatedAt: string;
  technologies: RoadmapTechnology[];
  totalTopics: number;
  completedTopics: number;
  remainingTopics: number;
  progressPercentage: number | null;
  hasTopics: boolean;
}

export interface RoadmapOverviewStats {
  totalCategories: number;
  totalTechnologies: number;
  totalTopics: number;
  completedTopics: number;
  remainingTopics: number;
  progressPercentage: number | null;
  hasTopics: boolean;
}

export interface RoadmapOverviewResponse {
  categories: RoadmapCategory[];
  stats: RoadmapOverviewStats;
}

export interface ImportPreviewResponse {
  valid: boolean;
  mode: 'addNew' | 'updateExisting';
  overwrite: boolean;
  summary: {
    categoriesToCreate: number;
    categoriesMatched: number;
    technologiesToCreate: number;
    technologiesMatched: number;
    topicsToCreate: number;
    topicsToUpdate: number;
    topicsPreserved: number;
    totalTopicsInFile: number;
  };
  details: {
    name: string;
    action: 'create' | 'match';
    technologies: {
      name: string;
      action: 'create' | 'match';
      topicsToCreate: string[];
      topicsToUpdate: string[];
      topicsPreserved: string[];
      totalTopics: number;
    }[];
  }[];
  warnings: string[];
}
