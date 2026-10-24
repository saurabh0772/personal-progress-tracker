import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ChevronLeft,
  Plus,
  Search,
  ArrowUp,
  ArrowDown,
  Check,
  FileText,
  Clock,
  Pencil,
  BookOpen
} from 'lucide-react';
import { api } from '../../lib/api';
import type { RoadmapTechnology, RoadmapTopic, RoadmapTopicStatus } from './types';
import { TopicDetailModal } from './TopicDetailModal';
import { TopicFormModal } from './TopicFormModal';

interface TechnologyTopicsViewProps {
  technologyId: string;
  onBack: () => void;
  onBackToCategory?: () => void;
  onRefreshOverview: () => void;
}

export function TechnologyTopicsView({
  technologyId,
  onBack,
  onBackToCategory,
  onRefreshOverview
}: TechnologyTopicsViewProps) {
  const [technology, setTechnology] = useState<RoadmapTechnology | null>(null);
  const [topics, setTopics] = useState<RoadmapTopic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | RoadmapTopicStatus>('All');
  const [selectedTopic, setSelectedTopic] = useState<RoadmapTopic | null>(null);
  const [editingTopic, setEditingTopic] = useState<RoadmapTopic | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [reordering, setReordering] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [techRes, topicsRes] = await Promise.all([
        api<{ technology: RoadmapTechnology }>(`/api/roadmap/technologies/${technologyId}`),
        api<{ items: RoadmapTopic[] }>(`/api/roadmap/technologies/${technologyId}/topics?sortBy=order&sortDir=asc`)
      ]);
      setTechnology(techRes.technology);
      setTopics(topicsRes.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load technology topics.');
    } finally {
      setLoading(false);
    }
  }, [technologyId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Quick toggle completion checkbox
  async function handleToggleTopic(topic: RoadmapTopic, e: React.MouseEvent) {
    e.stopPropagation();
    const nextStatus: RoadmapTopicStatus = topic.status === 'Completed' ? 'In Progress' : 'Completed';
    const updatedTopic: RoadmapTopic = { ...topic, status: nextStatus };
    setTopics((prev) => prev.map((t) => (t.id === topic.id ? updatedTopic : t)));
    setTechnology((prev) => {
      if (!prev) return prev;
      const wasCompleted = topic.status === 'Completed';
      const nowCompleted = nextStatus === 'Completed';
      if (wasCompleted === nowCompleted) return prev;
      const newCompleted = nowCompleted ? prev.completedTopics + 1 : Math.max(0, prev.completedTopics - 1);
      const total = prev.totalTopics;
      return {
        ...prev,
        completedTopics: newCompleted,
        remainingTopics: Math.max(0, total - newCompleted),
        progressPercentage: total > 0 ? Math.round((newCompleted / total) * 100) : null
      };
    });

    try {
      const res = await api<{ topic: RoadmapTopic }>(`/api/roadmap/topics/${topic.id}/toggle`, {
        method: 'PATCH'
      });
      setTopics((prev) => prev.map((t) => (t.id === topic.id ? res.topic : t)));
      void onRefreshOverview();
    } catch (err) {
      setTopics((prev) => prev.map((t) => (t.id === topic.id ? topic : t)));
      setError(err instanceof Error ? err.message : 'Failed to update topic status.');
    }
  }



  // Move topic order up or down
  async function handleMoveOrder(index: number, direction: 'up' | 'down', e: React.MouseEvent) {
    e.stopPropagation();
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= topics.length) return;

    const newTopics = [...topics];
    const temp = newTopics[index];
    newTopics[index] = newTopics[targetIndex];
    newTopics[targetIndex] = temp;
    setTopics(newTopics);

    setReordering(true);
    try {
      await api('/api/roadmap/topics/reorder', {
        method: 'POST',
        body: JSON.stringify({ orderedIds: newTopics.map((t) => t.id) })
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update topic order.');
      void loadData();
    } finally {
      setReordering(false);
    }
  }

  // Filtered topics
  const filteredTopics = useMemo(() => {
    return topics.filter((t) => {
      const matchesStatus = statusFilter === 'All' || t.status === statusFilter;
      const matchesSearch =
        !search.trim() ||
        t.title.toLowerCase().includes(search.toLowerCase()) ||
        (t.description && t.description.toLowerCase().includes(search.toLowerCase())) ||
        (t.notesShort && t.notesShort.toLowerCase().includes(search.toLowerCase())) ||
        (t.notesDetailed && t.notesDetailed.toLowerCase().includes(search.toLowerCase()));
      return matchesStatus && matchesSearch;
    });
  }, [topics, statusFilter, search]);

  const stats = useMemo(() => {
    const total = topics.length;
    const completed = topics.filter((t) => t.status === 'Completed').length;
    const remaining = total - completed;
    const percentage = total > 0 ? Math.round((completed / total) * 100) : null;
    return { total, completed, remaining, percentage };
  }, [topics]);

  function formatShortDate(val: string | null) {
    if (!val) return null;
    const d = new Date(val);
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  }

  return (
    <div className="technology-topics-container">
      {loading && <div className="top-ambient-loader" role="progressbar" aria-label="Loading topics" />}
      {/* Top Breadcrumb & Navigation */}
      <div className="roadmap-nav-header">
        <button type="button" className="roadmap-back-btn" onClick={onBack} aria-label="Back to Learning Roadmap">
          <ChevronLeft size={16} />
          <span>Learning Roadmap</span>
        </button>
        <span className="breadcrumb-divider">/</span>
        <button
          type="button"
          className="roadmap-crumb-link"
          onClick={onBackToCategory || onBack}
          aria-label={`Back to ${technology?.category?.name || 'Roadmap'}`}
        >
          {technology?.category?.name || 'Category'}
        </button>
        <span className="breadcrumb-divider">/</span>
        <strong className="breadcrumb-active">{technology?.name || 'Technology'}</strong>
      </div>

      {/* Main Technology Header */}
      <section className="tech-header-card">
        <div className="tech-header-main">
          <div className="tech-title-group">
            <span className="overline">{technology?.category?.name?.toUpperCase() || 'CATEGORY'}</span>
            <h2>{technology?.name}</h2>
          </div>

          <div className="tech-header-actions">
            <button
              type="button"
              className="primary-btn"
              onClick={() => setCreateModalOpen(true)}
            >
              <Plus size={15} /> <span>Add Topic</span>
            </button>
          </div>
        </div>

        {/* Progress & Stats Strip */}
        <div className="tech-stats-strip">
          <div className="stat-pill">
            <span className="stat-num">{stats.total}</span>
            <span className="stat-desc">Total Topics</span>
          </div>
          <div className="stat-pill positive">
            <span className="stat-num">{stats.completed}</span>
            <span className="stat-desc">Completed</span>
          </div>
          <div className="stat-pill">
            <span className="stat-num">{stats.remaining}</span>
            <span className="stat-desc">Remaining</span>
          </div>

          <div className="stat-progress-box">
            {stats.total > 0 ? (
              <>
                <div className="progress-label-row">
                  <span>Progress</span>
                  <strong>{stats.percentage}%</strong>
                </div>
                <div className="progress-bar-track">
                  <div
                    className="progress-bar-fill"
                    style={{ width: `${stats.percentage}%` }}
                  />
                </div>
              </>
            ) : (
              <span className="no-topics-notice">No topics imported yet</span>
            )}
          </div>
        </div>
      </section>

      {/* Filter and Search Bar */}
      <div className="topics-control-bar">
        <div className="search-field" style={{ maxWidth: '380px', flex: 1 }}>
          <Search size={16} />
          <input
            type="text"
            placeholder="Search topics, notes, or descriptions…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button type="button" className="icon-btn" onClick={() => setSearch('')} aria-label="Clear search">
              <span style={{ fontSize: '12px' }}>×</span>
            </button>
          )}
        </div>

        {/* Status Filter Tabs */}
        <div className="status-filter-tabs">
          {(['All', 'Not Started', 'In Progress', 'Completed', 'Needs Revision'] as const).map((st) => {
            const count =
              st === 'All'
                ? topics.length
                : topics.filter((t) => t.status === st).length;
            return (
              <button
                key={st}
                type="button"
                className={`filter-tab ${statusFilter === st ? 'active' : ''}`}
                onClick={() => setStatusFilter(st)}
              >
                <span>{st}</span>
                <small>{count}</small>
              </button>
            );
          })}
        </div>
      </div>

      {error && <div className="global-error">{error}</div>}

      {/* Topic List */}
      <section className="topics-list-panel">
        {loading && topics.length === 0 ? (
          <div className="soothing-skeleton-list" aria-label="Loading topics">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="soothing-skeleton-row">
                <div className="skeleton-avatar" />
                <div className="skeleton-content">
                  <div
                    className="skeleton-line skeleton-title"
                    style={{ width: i % 2 === 0 ? '58%' : '44%' }}
                  />
                  <div
                    className="skeleton-line skeleton-meta"
                    style={{ width: '28%' }}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : topics.length === 0 ? (
          <div className="empty-state">
            <div className="empty-illustration">
              <BookOpen size={24} />
            </div>
            <h3>No topics added yet</h3>
            <p>
              No topics added yet. Add your first topic to get started.
            </p>
            <div style={{ display: 'flex', gap: '9px', marginTop: '14px', flexWrap: 'wrap', justifyContent: 'center' }}>
              <button
                type="button"
                className="primary-btn"
                onClick={() => setCreateModalOpen(true)}
              >
                <Plus size={15} /> <span>Add Topic</span>
              </button>
            </div>
          </div>
        ) : filteredTopics.length === 0 ? (
          <div className="empty-state" style={{ padding: '30px 20px' }}>
            <p className="empty-note">No topics matching your search or status filter.</p>
            <button
              type="button"
              className="text-action"
              onClick={() => {
                setSearch('');
                setStatusFilter('All');
              }}
            >
              Reset filters
            </button>
          </div>
        ) : (
          <div className={`compact-topic-list ${loading ? 'content-refreshing' : ''}`}>
            {filteredTopics.map((topic, index) => {
              const isFirst = index === 0;
              const isLast = index === filteredTopics.length - 1;
              const hasNotes = Boolean(
                topic.notesShort?.trim() ||
                topic.notesDetailed?.trim() ||
                topic.notesCode?.trim() ||
                topic.referenceUrl?.trim()
              );

              return (
                <div
                  key={topic.id}
                  className={`topic-row ${topic.status === 'Completed' ? 'is-completed' : ''}`}
                  onClick={() => setSelectedTopic(topic)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedTopic(topic);
                    }
                  }}
                >
                  {/* Reordering Controls */}
                  <div className="topic-order-actions" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      className="icon-btn order-btn"
                      disabled={isFirst || reordering}
                      onClick={(e) => handleMoveOrder(index, 'up', e)}
                      title="Move Up"
                    >
                      <ArrowUp size={13} />
                    </button>
                    <button
                      type="button"
                      className="icon-btn order-btn"
                      disabled={isLast || reordering}
                      onClick={(e) => handleMoveOrder(index, 'down', e)}
                      title="Move Down"
                    >
                      <ArrowDown size={13} />
                    </button>
                  </div>

                  {/* Completion Checkbox */}
                  <button
                    type="button"
                    className={`topic-checkbox ${topic.status === 'Completed' ? 'checked' : ''}`}
                    onClick={(e) => handleToggleTopic(topic, e)}
                    title={topic.status === 'Completed' ? 'Mark incomplete' : 'Mark completed'}
                    aria-label={`Mark ${topic.title} ${topic.status === 'Completed' ? 'incomplete' : 'completed'}`}
                  >
                    {topic.status === 'Completed' ? <Check size={14} /> : null}
                  </button>

                  {/* Topic Title */}
                  <div className="topic-title-cell">
                    <span className="topic-order-index">
                      {typeof topic.order === 'number'
                        ? `${String(topic.order).padStart(2, '0')}.`
                        : `${String(index + 1).padStart(2, '0')}.`}
                    </span>
                    <span className="topic-title-text">{topic.title}</span>
                  </div>

                  {/* Compact Metadata Badges */}
                  <div className="topic-meta-strip">
                    {/* Notes indicator icon */}
                    {hasNotes && (
                      <span className="notes-indicator" title="Notes attached">
                        <FileText size={13} />
                        <small>Notes</small>
                      </span>
                    )}

                    {/* Status Pill */}
                    <span className={`status-pill status-${topic.status.toLowerCase().replace(/\s+/g, '-')}`}>
                      {topic.status}
                    </span>

                    {/* Last Revised date */}
                    {topic.lastRevisedAt && (
                      <span className="revised-date" title={`Last revised: ${topic.lastRevisedAt}`}>
                        <Clock size={11} /> {formatShortDate(topic.lastRevisedAt)}
                      </span>
                    )}
                  </div>

                  {/* Row Actions */}
                  <div className="topic-row-actions" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      className="icon-btn"
                      title="View Notes & Details"
                      onClick={() => setSelectedTopic(topic)}
                    >
                      <FileText size={15} />
                    </button>
                    <button
                      type="button"
                      className="icon-btn"
                      title="Edit Topic"
                      onClick={() => setEditingTopic(topic)}
                    >
                      <Pencil size={15} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Detail / Notes Modal */}
      {selectedTopic && (
        <TopicDetailModal
          topic={selectedTopic}
          technologyName={technology?.name || ''}
          onClose={() => setSelectedTopic(null)}
          onUpdate={(updated) => {
            setSelectedTopic(updated);
            setTopics((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
            onRefreshOverview();
          }}
          onDelete={(id) => {
            setTopics((prev) => prev.filter((t) => t.id !== id));
            onRefreshOverview();
          }}
        />
      )}

      {/* Create Topic Modal */}
      {createModalOpen && (
        <TopicFormModal
          technologyId={technologyId}
          technologyName={technology?.name || ''}
          onClose={() => setCreateModalOpen(false)}
          onSuccess={(newTopic) => {
            setTopics((prev) => [...prev, newTopic]);
            onRefreshOverview();
          }}
        />
      )}

      {/* Edit Topic Modal */}
      {editingTopic && (
        <TopicFormModal
          technologyId={technologyId}
          technologyName={technology?.name || ''}
          editingTopic={editingTopic}
          onClose={() => setEditingTopic(null)}
          onSuccess={(updated) => {
            setTopics((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
            onRefreshOverview();
          }}
        />
      )}



    </div>
  );
}
