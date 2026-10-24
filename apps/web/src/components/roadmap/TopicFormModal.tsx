import { useState, type FormEvent } from 'react';
import { X } from 'lucide-react';
import { api } from '../../lib/api';
import type { RoadmapTopic, RoadmapTopicStatus } from './types';

interface TopicFormModalProps {
  technologyId: string;
  technologyName: string;
  editingTopic?: RoadmapTopic | null;
  onClose: () => void;
  onSuccess: (topic: RoadmapTopic) => void;
}

export function TopicFormModal({
  technologyId,
  technologyName,
  editingTopic,
  onClose,
  onSuccess
}: TopicFormModalProps) {
  const [title, setTitle] = useState(editingTopic?.title || '');
  const [status, setStatus] = useState<RoadmapTopicStatus>(editingTopic?.status || 'Not Started');
  const [description, setDescription] = useState(editingTopic?.description || '');
  const [referenceUrl, setReferenceUrl] = useState(editingTopic?.referenceUrl || '');
  const [notesShort, setNotesShort] = useState(editingTopic?.notesShort || '');
  const [notesDetailed, setNotesDetailed] = useState(editingTopic?.notesDetailed || '');
  const [notesCode, setNotesCode] = useState(editingTopic?.notesCode || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError('Topic title is required.');
      return;
    }
    setSaving(true);
    setError('');

    const payload = {
      title: title.trim(),
      status,
      description: description.trim() || null,
      referenceUrl: referenceUrl.trim() || null,
      notesShort: notesShort.trim() || null,
      notesDetailed: notesDetailed.trim() || null,
      notesCode: notesCode.trim() || null
    };

    try {
      if (editingTopic) {
        const res = await api<{ topic: RoadmapTopic }>(`/api/roadmap/topics/${editingTopic.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload)
        });
        onSuccess(res.topic);
      } else {
        const res = await api<{ topic: RoadmapTopic }>(`/api/roadmap/technologies/${technologyId}/topics`, {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        onSuccess(res.topic);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save topic.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="activity-modal topic-form-modal" onSubmit={handleSubmit}>
        <div className="modal-header">
          <div>
            <span className="overline">{technologyName.toUpperCase()} · TOPIC</span>
            <h2>{editingTopic ? 'Edit Topic' : 'Add New Topic'}</h2>
            <p>Define what you want to learn or master in {technologyName}.</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close modal">
            <X size={20} />
          </button>
        </div>

        <div className="form-scroll">
          {error && <div className="global-error">{error}</div>}

          <label className="field full-field">
            Topic Title <span className="required">*</span>
            <input
              type="text"
              autoFocus
              required
              maxLength={255}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Higher-Order Functions & Currying"
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
            Description <span className="optional">optional</span>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief summary of what this topic entails..."
            />
          </label>

          <label className="field full-field">
            Short Note / Rule of Thumb <span className="optional">optional</span>
            <textarea
              rows={2}
              value={notesShort}
              onChange={(e) => setNotesShort(e.target.value)}
              placeholder="Quick takeaway to remember..."
            />
          </label>

          <label className="field full-field">
            Detailed Notes <span className="optional">optional</span>
            <textarea
              rows={2}
              value={notesDetailed}
              onChange={(e) => setNotesDetailed(e.target.value)}
              placeholder="Deep dive notes, gotchas, explanations..."
            />
          </label>

          <label className="field full-field">
            Code Example or Snippet <span className="optional">optional</span>
            <textarea
              rows={2}
              className="font-mono text-xs"
              value={notesCode}
              onChange={(e) => setNotesCode(e.target.value)}
              placeholder="// Code snippet..."
            />
          </label>
        </div>

        <div className="modal-footer">
          <button type="button" className="secondary-btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary-btn" disabled={saving}>
            {saving ? 'Saving…' : editingTopic ? 'Update Topic' : 'Create Topic'}
          </button>
        </div>
      </form>
    </div>
  );
}
