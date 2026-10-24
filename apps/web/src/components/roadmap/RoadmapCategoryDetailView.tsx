import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Search,
  BookOpen,
  Layers,
  CheckCircle2,
  ListTodo
} from 'lucide-react';
import { api } from '../../lib/api';
import type { RoadmapCategory } from './types';

interface RoadmapCategoryDetailViewProps {
  categoryId: string;
  onBack: () => void;
  onSelectTechnology: (techId: string) => void;
  onRefreshOverview: () => void;
}

export function RoadmapCategoryDetailView({
  categoryId,
  onBack,
  onSelectTechnology,
  onRefreshOverview
}: RoadmapCategoryDetailViewProps) {
  const [category, setCategory] = useState<RoadmapCategory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api<{ category: RoadmapCategory }>(`/api/roadmap/categories/${categoryId}`);
      setCategory(res.category);
      onRefreshOverview();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load roadmap category.');
    } finally {
      setLoading(false);
    }
  }, [categoryId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const filteredTechnologies = useMemo(() => {
    if (!category) return [];
    if (!search.trim()) return category.technologies;
    const q = search.trim().toLowerCase();
    return category.technologies.filter((t) => t.name.toLowerCase().includes(q));
  }, [category, search]);

  const roadmapNum = useMemo(() => {
    if (!category) return '01';
    return String(category.order + 1).padStart(2, '0');
  }, [category]);

  return (
    <div className="roadmap-category-detail-container">
      {loading && <div className="top-ambient-loader" role="progressbar" aria-label="Loading category" />}

      {/* Breadcrumb Navigation */}
      <div className="roadmap-nav-header">
        <button type="button" className="roadmap-back-btn" onClick={onBack} aria-label="Back to Learning Roadmap">
          <ChevronLeft size={16} />
          <span>Learning Roadmap</span>
        </button>
        <span className="breadcrumb-divider">/</span>
        <strong className="breadcrumb-active">{category?.name || 'Roadmap'}</strong>
      </div>

      {error && <div className="global-error">{error}</div>}

      {/* Category Hero Header */}
      <section className="roadmap-cat-hero-card">
        <div className="roadmap-cat-hero-main">
          <div className="roadmap-cat-badge">ROADMAP {roadmapNum}</div>
          <h2>{category?.name}</h2>
          {category?.description && (
            <p className="roadmap-cat-desc">{category.description}</p>
          )}
        </div>

        {/* Category Stats Strip */}
        <div className="roadmap-cat-stats-strip">
          <div className="stat-pill">
            <Layers size={14} className="stat-icon-muted" />
            <span className="stat-num">{category?.technologies.length || 0}</span>
            <span className="stat-desc">Technologies</span>
          </div>

          <div className="stat-pill">
            <ListTodo size={14} className="stat-icon-muted" />
            <span className="stat-num">{category?.totalTopics || 0}</span>
            <span className="stat-desc">Total Topics</span>
          </div>

          <div className="stat-pill positive">
            <CheckCircle2 size={14} className="stat-icon-positive" />
            <span className="stat-num">{category?.completedTopics || 0}</span>
            <span className="stat-desc">Completed</span>
          </div>

          <div className="stat-progress-box">
            <div className="progress-label-row">
              <span>Overall Roadmap Progress</span>
              <strong>{category?.hasTopics ? `${category.progressPercentage}%` : '0%'}</strong>
            </div>
            <div className="progress-bar-track">
              <div
                className="progress-bar-fill"
                style={{ width: `${category?.progressPercentage || 0}%` }}
              />
            </div>
            {!category?.hasTopics && (
              <small className="stat-subtext">0 topics added yet across child technologies</small>
            )}
          </div>
        </div>
      </section>

      {/* Search Toolbar */}
      <div className="topics-control-bar">
        <div className="search-field" style={{ maxWidth: '380px', flex: 1 }}>
          <Search size={16} />
          <input
            type="text"
            placeholder={`Search ${category?.technologies.length || 0} technologies / tracks…`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              type="button"
              className="icon-btn"
              onClick={() => setSearch('')}
              aria-label="Clear search"
            >
              <span style={{ fontSize: '12px' }}>×</span>
            </button>
          )}
        </div>
        <div className="filter-count-note">
          Showing {filteredTechnologies.length} of {category?.technologies.length || 0} tracks
        </div>
      </div>

      {/* Technologies Grid */}
      <section className="roadmap-detail-grid-section">
        {loading && !category ? (
          <div className="soothing-skeleton-list" aria-label="Loading tracks">
            {[1, 2, 3].map((i) => (
              <div key={i} className="soothing-skeleton-row">
                <div className="skeleton-avatar" />
                <div className="skeleton-content">
                  <div className="skeleton-line skeleton-title" style={{ width: '45%' }} />
                  <div className="skeleton-line skeleton-meta" style={{ width: '25%' }} />
                </div>
              </div>
            ))}
          </div>
        ) : filteredTechnologies.length === 0 ? (
          <div className="empty-state" style={{ padding: '36px 20px' }}>
            <div className="empty-illustration">
              <BookOpen size={24} />
            </div>
            <h3>No technologies found</h3>
            <p>
              {search
                ? `No tracks matching "${search}" in ${category?.name}.`
                : 'No technologies found in this category.'}
            </p>
            {search && (
              <button type="button" className="secondary-btn" onClick={() => setSearch('')}>
                Clear search filter
              </button>
            )}
          </div>
        ) : (
          <div className="roadmap-tech-cards-grid">
            {filteredTechnologies.map((tech) => {
              const progressPct = tech.progressPercentage !== null ? tech.progressPercentage : 0;
              return (
                <div
                  key={tech.id}
                  className="roadmap-tech-card"
                  onClick={() => onSelectTechnology(tech.id)}
                  role="button"
                  tabIndex={0}
                  aria-label={`Open ${tech.name} roadmap`}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelectTechnology(tech.id);
                    }
                  }}
                >
                  <div className="tech-card-header">
                    <h4>{tech.name}</h4>
                    <span className={`tech-topic-badge ${tech.hasTopics ? 'active' : 'empty'}`}>
                      {tech.totalTopics} {tech.totalTopics === 1 ? 'topic' : 'topics'}
                    </span>
                  </div>

                  <div className="tech-card-progress-zone">
                    <div className="tech-progress-bar-wrap">
                      <div
                        className="tech-progress-bar-fill"
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                    <div className="tech-progress-text">
                      <span>{progressPct}% completed</span>
                      <small>
                        {tech.hasTopics
                          ? `${tech.completedTopics}/${tech.totalTopics} done`
                          : 'Empty topic list'}
                      </small>
                    </div>
                  </div>

                  <div className="tech-card-footer">
                    <span className="open-tech-label">
                      <span>Open Technology</span>
                      <ChevronRight size={14} />
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
