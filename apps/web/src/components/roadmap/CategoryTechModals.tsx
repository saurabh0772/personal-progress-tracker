import { useState, type FormEvent } from 'react';
import { X } from 'lucide-react';
import { api } from '../../lib/api';
import type { RoadmapCategory, RoadmapTechnology } from './types';

interface CategoryModalProps {
  category?: RoadmapCategory | null;
  onClose: () => void;
  onSuccess: (cat: RoadmapCategory) => void;
}

export function CategoryModal({ category, onClose, onSuccess }: CategoryModalProps) {
  const [name, setName] = useState(category?.name || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError('');

    try {
      if (category) {
        const res = await api<{ category: RoadmapCategory }>(`/api/roadmap/categories/${category.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ name: name.trim() })
        });
        onSuccess(res.category);
      } else {
        const res = await api<{ category: RoadmapCategory }>('/api/roadmap/categories', {
          method: 'POST',
          body: JSON.stringify({ name: name.trim() })
        });
        onSuccess(res.category);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save category.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="activity-modal small-modal" onSubmit={handleSubmit}>
        <div className="modal-header">
          <div>
            <span className="overline">ROADMAP CATEGORY</span>
            <h2>{category ? 'Edit Category' : 'Add New Category'}</h2>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close modal">
            <X size={20} />
          </button>
        </div>

        <div className="form-scroll">
          {error && <div className="global-error">{error}</div>}
          <label className="field full-field">
            Category Name
            <input
              type="text"
              autoFocus
              required
              maxLength={100}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Cloud & Infrastructure"
            />
          </label>
        </div>

        <div className="modal-footer">
          <button type="button" className="secondary-btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary-btn" disabled={saving}>
            {saving ? 'Saving…' : category ? 'Save Changes' : 'Create Category'}
          </button>
        </div>
      </form>
    </div>
  );
}

interface TechnologyModalProps {
  categories: RoadmapCategory[];
  technology?: RoadmapTechnology | null;
  defaultCategoryId?: string;
  onClose: () => void;
  onSuccess: (tech: RoadmapTechnology) => void;
}

export function TechnologyModal({
  categories,
  technology,
  defaultCategoryId,
  onClose,
  onSuccess
}: TechnologyModalProps) {
  const [name, setName] = useState(technology?.name || '');
  const [categoryId, setCategoryId] = useState(technology?.categoryId || defaultCategoryId || categories[0]?.id || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    if (!categoryId) {
      setError('Please select a category.');
      return;
    }
    setSaving(true);
    setError('');

    try {
      if (technology) {
        const res = await api<{ technology: RoadmapTechnology }>(`/api/roadmap/technologies/${technology.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ name: name.trim(), categoryId })
        });
        onSuccess(res.technology);
      } else {
        const res = await api<{ technology: RoadmapTechnology }>('/api/roadmap/technologies', {
          method: 'POST',
          body: JSON.stringify({ name: name.trim(), categoryId })
        });
        onSuccess(res.technology);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save technology.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="activity-modal small-modal" onSubmit={handleSubmit}>
        <div className="modal-header">
          <div>
            <span className="overline">ROADMAP TECHNOLOGY</span>
            <h2>{technology ? 'Edit Technology' : 'Add New Technology'}</h2>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close modal">
            <X size={20} />
          </button>
        </div>

        <div className="form-scroll">
          {error && <div className="global-error">{error}</div>}
          <label className="field full-field">
            Category
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              required
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          <label className="field full-field">
            Technology Name
            <input
              type="text"
              autoFocus
              required
              maxLength={100}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. GraphQL, Kubernetes, Rust"
            />
          </label>
        </div>

        <div className="modal-footer">
          <button type="button" className="secondary-btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary-btn" disabled={saving}>
            {saving ? 'Saving…' : technology ? 'Save Changes' : 'Create Technology'}
          </button>
        </div>
      </form>
    </div>
  );
}
