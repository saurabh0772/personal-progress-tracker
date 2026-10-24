import { useState, useMemo } from 'react';
import {
  Search,
  ChevronRight,
  BookOpen
} from 'lucide-react';
import type { RoadmapCategory, RoadmapOverviewStats } from './types';

interface RoadmapOverviewProps {
  categories: RoadmapCategory[];
  stats: RoadmapOverviewStats;
  loading?: boolean;
  onSelectCategory: (categoryId: string) => void;
  onSelectTechnology?: (techId: string) => void;
  onRefresh: () => void;
  onSetToast: (msg: string) => void;
}

export function RoadmapOverview({
  categories,
  stats,
  loading = false,
  onSelectCategory
}: RoadmapOverviewProps) {
  const [search, setSearch] = useState('');

  // Total technologies across seeded roadmaps (fallback to actual count if stats hasn't loaded yet)
  const totalTechCount = useMemo(() => {
    if (stats.totalTechnologies > 0) return stats.totalTechnologies;
    return categories.reduce((sum, c) => sum + (c.technologies?.length || 0), 0);
  }, [stats.totalTechnologies, categories]);

  // Overall progress based on actual completed topics (0% if total topics = 0)
  const overallProgressPercentage = useMemo(() => {
    if (!stats.hasTopics || stats.totalTopics === 0) return 0;
    return stats.progressPercentage ?? 0;
  }, [stats]);

  // Search filter matching roadmap category name OR included child technologies
  const filteredCategories = useMemo(() => {
    if (!search.trim()) return categories;
    const q = search.trim().toLowerCase();
    return categories.filter((cat) => {
      const matchCat = cat.name.toLowerCase().includes(q);
      const matchDesc = cat.description?.toLowerCase().includes(q);
      const matchTech = (cat.technologies || []).some((t) => t.name.toLowerCase().includes(q));
      return matchCat || matchDesc || matchTech;
    });
  }, [categories, search]);

  return (
    <div className="roadmap-overview-container">
      {/* Page Header (A) */}
      <section className="roadmap-header-hero">
        <div className="roadmap-header-top">
          <div className="roadmap-header-titles">
            <span className="overline light-overline">ENGINEERING ROADMAPS</span>
            <h2>Learning Roadmap</h2>
            <p className="roadmap-subtitle">
              Build skills, track progress, and prepare for software engineering interviews.
            </p>
          </div>

          {/* Overall progress indicator & counts */}
          <div className="roadmap-header-stat-box">
            <div className="stat-circle-group">
              <span className="stat-percentage">
                {overallProgressPercentage}%
              </span>
              <span className="stat-sub">Overall Progress</span>
            </div>

            <div className="stat-metrics-grid">
              <div className="metric-cell">
                <span className="metric-label">Roadmaps</span>
                <strong className="metric-val">12</strong>
              </div>
              <div className="metric-cell">
                <span className="metric-label">Technologies</span>
                <strong className="metric-val">{totalTechCount}</strong>
              </div>
              <div className="metric-cell">
                <span className="metric-label">Completed Topics</span>
                <strong className="metric-val">
                  {stats.completedTopics} <small className="metric-denom">/ {stats.totalTopics}</small>
                </strong>
              </div>
            </div>
          </div>
        </div>

        {/* Global Progress Bar */}
        <div className="roadmap-hero-progress-line">
          <div className="roadmap-progress-track">
            <div
              className="roadmap-progress-fill"
              style={{ width: `${overallProgressPercentage}%` }}
              role="progressbar"
              aria-valuenow={overallProgressPercentage}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>
        </div>

        {/* Search Field (finding a roadmap or technology) */}
        <div className="roadmap-search-bar">
          <div className="search-field" style={{ width: '100%', maxWidth: '520px' }}>
            <Search size={16} />
            <input
              type="text"
              placeholder="Search roadmap category or technology (e.g. React, Docker, DSA)…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search roadmaps or technologies"
            />
            {search && (
              <button
                type="button"
                className="icon-btn"
                onClick={() => setSearch('')}
                aria-label="Clear search"
              >
                <span style={{ fontSize: '13px' }}>×</span>
              </button>
            )}
          </div>
          {search && (
            <div className="search-results-hint">
              Found {filteredCategories.length} matching {filteredCategories.length === 1 ? 'roadmap' : 'roadmaps'}
            </div>
          )}
        </div>
      </section>

      {/* Roadmap Cards Grid (B) */}
      <section className="roadmap-grid-wrapper" aria-label="Roadmap Categories">
        {loading ? (
          <div className="roadmap-cards-grid">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div
                key={i}
                className="roadmap-card soothing-skeleton-row"
                style={{ minHeight: '190px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <div className="skeleton-line" style={{ width: '32px', height: '18px' }} />
                  <div className="skeleton-line" style={{ width: '60px', height: '18px' }} />
                </div>
                <div className="skeleton-line skeleton-title" style={{ width: '60%', height: '18px' }} />
                <div className="skeleton-line skeleton-meta" style={{ width: '90%', height: '12px' }} />
                <div className="skeleton-line skeleton-meta" style={{ width: '75%', height: '12px' }} />
              </div>
            ))}
          </div>
        ) : filteredCategories.length === 0 ? (
          <div className="empty-state" style={{ padding: '40px 20px' }}>
            <div className="empty-illustration">
              <BookOpen size={24} />
            </div>
            <h3>No roadmaps found</h3>
            <p>No roadmap category or technology matched "{search}".</p>
            <button
              type="button"
              className="secondary-btn"
              onClick={() => setSearch('')}
              style={{ marginTop: '12px' }}
            >
              Clear search filter
            </button>
          </div>
        ) : (
          <div className="roadmap-cards-grid">
            {filteredCategories.map((cat, index) => {
              const roadmapNumber = String((cat.order ?? index) + 1).padStart(2, '0');
              const techList = cat.technologies || [];
              const progressPct = cat.hasTopics && cat.progressPercentage !== null ? cat.progressPercentage : 0;
              const isProjectPreparation = cat.name.includes('Projects & Interview');

              return (
                <article
                  key={cat.id}
                  className="roadmap-card"
                  onClick={() => onSelectCategory(cat.id)}
                  role="button"
                  tabIndex={0}
                  aria-label={`Open Roadmap ${roadmapNumber}: ${cat.name}`}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelectCategory(cat.id);
                    }
                  }}
                >
                  {/* Card Header: Number & Category Name */}
                  <div className="card-top-row">
                    <span className="roadmap-number-pill">{roadmapNumber}</span>
                    <span className="card-tech-count-badge">
                      {techList.length} {isProjectPreparation ? 'tracks' : 'technologies'}
                    </span>
                  </div>

                  <h3 className="card-cat-title">{cat.name}</h3>

                  {/* Short Useful Description */}
                  {cat.description && (
                    <p className="card-cat-desc">{cat.description}</p>
                  )}

                  {/* Compact Preview of Included Technologies */}
                  <div className="card-tech-preview">
                    {techList.slice(0, 6).map((tech) => (
                      <span key={tech.id} className="tech-chip">
                        {tech.name}
                      </span>
                    ))}
                    {techList.length > 6 && (
                      <span className="tech-chip-more">
                        +{techList.length - 6} more
                      </span>
                    )}
                  </div>

                  {/* Progress Bar & Actual Topic Counts */}
                  <div className="card-progress-section">
                    <div className="card-progress-bar-wrap">
                      <div
                        className="card-progress-bar-fill"
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>

                    <div className="card-progress-labels">
                      <span className="progress-percent-text">
                        {progressPct}% progress
                      </span>
                      <span className="progress-fraction-text">
                        {cat.completedTopics} / {cat.totalTopics} topics
                      </span>
                    </div>

                    {!cat.hasTopics && (
                      <span className="card-empty-indicator">
                        No topics imported yet
                      </span>
                    )}
                  </div>

                  {/* Clickable Affordance */}
                  <div className="card-footer-action">
                    <span className="card-action-link">
                      <span>Explore Roadmap</span>
                      <ChevronRight size={14} />
                    </span>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
