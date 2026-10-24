import { useState, useEffect } from 'react';
import { X, ExternalLink, Check, Pencil, Clock, Code2, FileText, CheckCircle2 } from 'lucide-react';
import { api } from '../../lib/api';
import type { RoadmapTopic, RoadmapTopicStatus } from './types';

interface TopicDetailModalProps {
  topic: RoadmapTopic;
  technologyName: string;
  onClose: () => void;
  onUpdate: (updatedTopic: RoadmapTopic) => void;
  onDelete?: (topicId: string) => void;
}

export function TopicDetailModal({
  topic,
  technologyName,
  onClose,
  onUpdate,
  onDelete: _onDelete
}: TopicDetailModalProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(topic.title);
  const [status, setStatus] = useState<RoadmapTopicStatus>(topic.status);
  const [description, setDescription] = useState(topic.description || '');
  const [notesShort, setNotesShort] = useState(topic.notesShort || '');
  const [notesDetailed, setNotesDetailed] = useState(topic.notesDetailed || '');
  const [notesCode, setNotesCode] = useState(topic.notesCode || '');
  const [referenceUrl, setReferenceUrl] = useState(topic.referenceUrl || '');
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setTitle(topic.title);
    setStatus(topic.status);
    setDescription(topic.description || '');
    setNotesShort(topic.notesShort || '');
    setNotesDetailed(topic.notesDetailed || '');
    setNotesCode(topic.notesCode || '');
    setReferenceUrl(topic.referenceUrl || '');
  }, [topic]);

  async function handleSave() {
    if (!title.trim()) {
      setError('Topic title cannot be empty.');
      return;
    }
    setSaving(true);
    setError('');
    setSaveSuccess(false);
    try {
      const res = await api<{ topic: RoadmapTopic }>(`/api/roadmap/topics/${topic.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: title.trim(),
          status,
          description: description.trim() || null,
          notesShort: notesShort.trim() || null,
          notesDetailed: notesDetailed.trim() || null,
          notesCode: notesCode.trim() || null,
          referenceUrl: referenceUrl.trim() || null
        })
      });
      onUpdate(res.topic);
      setSaveSuccess(true);
      setIsEditing(false);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save topic notes.');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleStatus() {
    try {
      const res = await api<{ topic: RoadmapTopic }>(`/api/roadmap/topics/${topic.id}/toggle`, {
        method: 'PATCH'
      });
      onUpdate(res.topic);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to toggle status.');
    }
  }

  function formatDate(val: string | null) {
    if (!val) return null;
    return new Date(val).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="activity-modal topic-detail-modal" role="dialog" aria-modal="true" aria-labelledby="topic-title">
        <div className="modal-header">
          <div>
            <span className="overline">{technologyName.toUpperCase()} · TOPIC DETAILS</span>
            <h2 id="topic-title">{topic.title}</h2>
            <div className="topic-header-meta">
              <span className={`status-pill status-${topic.status.toLowerCase().replace(/\s+/g, '-')}`}>
                {topic.status}
              </span>
              {topic.lastRevisedAt && (
                <span className="meta-item">
                  <Clock size={12} /> Revised {formatDate(topic.lastRevisedAt)}
                </span>
              )}
              {topic.completedAt && (
                <span className="meta-item">
                  <CheckCircle2 size={12} /> Completed {formatDate(topic.completedAt)}
                </span>
              )}
            </div>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close modal">
            <X size={20} />
          </button>
        </div>

        <div className="form-scroll topic-detail-body">
          {error && <div className="global-error">{error}</div>}
          {saveSuccess && (
            <div className="toast-inline">
              <Check size={14} /> Notes saved successfully!
            </div>
          )}

          {!isEditing ? (
            <div className="topic-view-content">
              {/* Quick Status toggle button */}
              <div className="quick-toggle-bar">
                <span>Current Status: <b>{topic.status}</b></span>
                <button
                  type="button"
                  className={topic.status === 'Completed' ? 'secondary-btn' : 'primary-btn'}
                  onClick={handleToggleStatus}
                >
                  <Check size={14} /> {topic.status === 'Completed' ? 'Mark Incomplete' : 'Mark Completed'}
                </button>
              </div>

              {/* Description */}
              {topic.description ? (
                <section className="detail-section">
                  <h3>Overview / Description</h3>
                  <p className="detail-text">{topic.description}</p>
                </section>
              ) : null}

              {/* Short Note */}
              <section className="detail-section">
                <div className="section-title">
                  <FileText size={15} />
                  <h3>Key Takeaway / Short Note</h3>
                </div>
                {topic.notesShort ? (
                  <p className="detail-text key-note">{topic.notesShort}</p>
                ) : (
                  <p className="empty-note">No short notes saved yet.</p>
                )}
              </section>

              {/* Detailed Notes */}
              <section className="detail-section">
                <div className="section-title">
                  <FileText size={15} />
                  <h3>Detailed Notes</h3>
                </div>
                {topic.notesDetailed ? (
                  <div className="detail-text detailed-notes-box">{topic.notesDetailed}</div>
                ) : (
                  <p className="empty-note">No detailed notes saved yet.</p>
                )}
              </section>

              {/* Code Snippet */}
              <section className="detail-section">
                <div className="section-title">
                  <Code2 size={15} />
                  <h3>Code Snippet or Example</h3>
                </div>
                {topic.notesCode ? (
                  <pre className="code-snippet-box">
                    <code>{topic.notesCode}</code>
                  </pre>
                ) : (
                  <p className="empty-note">No code snippets saved yet.</p>
                )}
              </section>

              {/* Reference URL */}
              {topic.referenceUrl ? (
                <section className="detail-section">
                  <h3>Reference Link</h3>
                  <a
                    href={topic.referenceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="reference-link"
                  >
                    <ExternalLink size={14} /> {topic.referenceUrl}
                  </a>
                </section>
              ) : null}
            </div>
          ) : (
            <div className="topic-edit-content">
              <label className="field full-field">
                Topic Title
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={255}
                />
              </label>

              <div className="form-grid">
                <label className="field">
                  Status
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as RoadmapTopicStatus)}
                  >
                    <option value="Not Started">Not Started</option>
                    <option value="In Progress">In Progress</option>
                    <option value="Completed">Completed</option>
                    <option value="Needs Revision">Needs Revision</option>
                  </select>
                </label>

                <label className="field">
                  Reference Link <span className="optional">optional</span>
                  <input
                    type="url"
                    value={referenceUrl}
                    onChange={(e) => setReferenceUrl(e.target.value)}
                    placeholder="https://..."
                  />
                </label>
              </div>

              <label className="field full-field">
                Brief Description <span className="optional">optional</span>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Short explanation of what this topic covers..."
                />
              </label>

              <label className="field full-field">
                Short Note / Key Takeaway <span className="optional">optional</span>
                <textarea
                  rows={2}
                  value={notesShort}
                  onChange={(e) => setNotesShort(e.target.value)}
                  placeholder="Quick summary or main rule to remember..."
                />
              </label>

              <label className="field full-field">
                Detailed Notes <span className="optional">optional</span>
                <textarea
                  rows={5}
                  value={notesDetailed}
                  onChange={(e) => setNotesDetailed(e.target.value)}
                  placeholder="In-depth explanation, gotchas, edge cases..."
                />
              </label>

              <label className="field full-field">
                Code Example or Snippet <span className="optional">optional</span>
                <textarea
                  rows={4}
                  className="font-mono text-xs"
                  value={notesCode}
                  onChange={(e) => setNotesCode(e.target.value)}
                  placeholder="// Paste working code snippet here..."
                />
              </label>
            </div>
          )}
        </div>

        <div className="modal-footer">
          {!isEditing ? (
            <div style={{ display: 'flex', gap: '8px', width: '100%', justifyContent: 'flex-end' }}>
              <button type="button" className="secondary-btn" onClick={onClose}>
                Close
              </button>
              <button type="button" className="primary-btn" onClick={() => setIsEditing(true)}>
                <Pencil size={14} /> Edit Notes & Info
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '8px', width: '100%', justifyContent: 'flex-end' }}>
              <button type="button" className="secondary-btn" onClick={() => setIsEditing(false)}>
                Cancel
              </button>
              <button type="button" className="primary-btn" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
