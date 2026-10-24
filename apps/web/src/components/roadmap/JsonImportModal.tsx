import { useState, useRef, type ChangeEvent } from 'react';
import { Upload, X, Check, AlertCircle, FileText, ArrowDownToLine, RefreshCw } from 'lucide-react';
import { api } from '../../lib/api';
import type { ImportPreviewResponse } from './types';

interface JsonImportModalProps {
  currentTechnologyId?: string;
  currentTechName?: string;
  onClose: () => void;
  onImportSuccess: (result: any) => void;
}

export function JsonImportModal({
  currentTechnologyId,
  currentTechName,
  onClose,
  onImportSuccess
}: JsonImportModalProps) {
  const [jsonText, setJsonText] = useState('');
  const [fileName, setFileName] = useState('');
  const [mode, setMode] = useState<'addNew' | 'updateExisting'>('addNew');
  const [overwrite, setOverwrite] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<ImportPreviewResponse | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileSelect(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setError('File size exceeds 2MB limit.');
      return;
    }
    setFileName(file.name);
    setError('');
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setJsonText(content);
      void generatePreview(content, mode, overwrite);
    };
    reader.onerror = () => {
      setError('Failed to read the selected file.');
    };
    reader.readAsText(file);
  }

  async function generatePreview(content: string, importMode = mode, importOverwrite = overwrite) {
    if (!content.trim()) {
      setError('Please provide JSON content to import.');
      return;
    }
    setLoadingPreview(true);
    setError('');
    try {
      const res = await api<ImportPreviewResponse>('/api/roadmap/import/preview', {
        method: 'POST',
        body: JSON.stringify({
          jsonContent: content,
          currentTechnologyId,
          mode: importMode,
          overwrite: importOverwrite
        })
      });
      setPreview(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid JSON or validation failed.');
      setPreview(null);
    } finally {
      setLoadingPreview(false);
    }
  }

  async function handleCommit() {
    if (!jsonText.trim()) return;
    setCommitting(true);
    setError('');
    try {
      const res = await api<{ success: boolean; imported: any }>('/api/roadmap/import/commit', {
        method: 'POST',
        body: JSON.stringify({
          jsonContent: jsonText,
          currentTechnologyId,
          mode,
          overwrite
        })
      });
      onImportSuccess(res.imported);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed.');
    } finally {
      setCommitting(false);
    }
  }

  function downloadTemplate() {
    const template = {
      version: 1,
      categories: [
        {
          name: "Development",
          technologies: [
            {
              name: "JavaScript",
              topics: [
                {
                  title: "Closures and Lexical Scope",
                  description: "Understanding function scope and lexical environments",
                  status: "Not Started",
                  notes: {
                    short: "Functions retain access to outer variables",
                    detailed: "A closure is the combination of a function bundled together with references to its surrounding state.",
                    code: "function makeCounter() { let count = 0; return () => ++count; }",
                    referenceUrl: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Closures"
                  },
                  order: 0
                },
                {
                  title: "Event Loop and Asynchronous Programming",
                  description: "Call stack, microtasks queue, macrotasks queue",
                  status: "Not Started",
                  order: 1
                }
              ]
            }
          ]
        }
      ]
    };

    const blob = new Blob([JSON.stringify(template, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'daybook-roadmap-template.json';
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="activity-modal roadmap-import-modal" role="dialog" aria-modal="true" aria-labelledby="import-title">
        <div className="modal-header">
          <div>
            <span className="overline">IMPORT ROADMAP</span>
            <h2 id="import-title">Import JSON Roadmap</h2>
            <p>
              {currentTechName
                ? `Import topics directly into ${currentTechName} or import full categories.`
                : 'Import categories, technologies, and topics from a JSON file.'}
            </p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close modal">
            <X size={20} />
          </button>
        </div>

        <div className="form-scroll roadmap-import-body">
          {error && (
            <div className="global-error" style={{ marginBottom: '14px' }}>
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          {/* Mode Selection */}
          <div className="import-mode-selector">
            <span className="field-label">Import Mode:</span>
            <div className="mode-options">
              <label className={`mode-option ${mode === 'addNew' ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="importMode"
                  value="addNew"
                  checked={mode === 'addNew'}
                  onChange={() => {
                    setMode('addNew');
                    if (jsonText.trim()) void generatePreview(jsonText, 'addNew', overwrite);
                  }}
                />
                <div>
                  <strong>Add New Only</strong>
                  <small>Add new topics. Preserve existing notes & status.</small>
                </div>
              </label>

              <label className={`mode-option ${mode === 'updateExisting' ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="importMode"
                  value="updateExisting"
                  checked={mode === 'updateExisting'}
                  onChange={() => {
                    setMode('updateExisting');
                    if (jsonText.trim()) void generatePreview(jsonText, 'updateExisting', overwrite);
                  }}
                />
                <div>
                  <strong>Update Existing</strong>
                  <small>Update matching topics with notes & status from JSON.</small>
                </div>
              </label>
            </div>
            {mode === 'updateExisting' && (
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px', fontSize: '13px', cursor: 'pointer', color: 'var(--text-muted)' }}>
                <input
                  type="checkbox"
                  checked={overwrite}
                  onChange={(e) => {
                    setOverwrite(e.target.checked);
                    if (jsonText.trim()) void generatePreview(jsonText, mode, e.target.checked);
                  }}
                />
                <span>Explicitly overwrite existing notes and completion status</span>
              </label>
            )}
          </div>

          {/* File Picker or Drop */}
          <div className="import-file-area">
            <input
              type="file"
              ref={fileInputRef}
              accept=".json,application/json"
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />
            <div
              className="dropzone"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files[0];
                if (file) {
                  setFileName(file.name);
                  const reader = new FileReader();
                  reader.onload = (ev) => {
                    const content = ev.target?.result as string;
                    setJsonText(content);
                    void generatePreview(content, mode, overwrite);
                  };
                  reader.readAsText(file);
                }
              }}
            >
              <Upload size={24} className="dropzone-icon" />
              <strong>{fileName || 'Choose a JSON file or drag & drop'}</strong>
              <span>Supports .json files up to 2MB</span>
            </div>

            <div className="template-download-row">
              <button type="button" className="text-action" onClick={downloadTemplate}>
                <ArrowDownToLine size={14} /> Download Sample JSON Template
              </button>
            </div>
          </div>

          {/* JSON Text Input fallback */}
          <details className="paste-json-accordion">
            <summary>Or paste JSON text directly</summary>
            <textarea
              className="json-textarea"
              rows={5}
              placeholder="Paste valid JSON roadmap here..."
              value={jsonText}
              onChange={(e) => {
                setJsonText(e.target.value);
                setFileName('');
              }}
            />
            <button
              type="button"
              className="secondary-btn"
              style={{ marginTop: '8px' }}
              onClick={() => void generatePreview(jsonText, mode, overwrite)}
              disabled={loadingPreview || !jsonText.trim()}
            >
              {loadingPreview ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />} Validate & Preview
            </button>
          </details>

          {/* Preview Section */}
          {preview && (
            <div className="import-preview-section">
              <div className="preview-heading">
                <FileText size={16} />
                <strong>Import Preview</strong>
              </div>

              {preview.warnings.length > 0 && (
                <div className="preview-warnings">
                  {preview.warnings.map((w, i) => (
                    <div key={i} className="preview-warning-line">
                      <AlertCircle size={14} /> {w}
                    </div>
                  ))}
                </div>
              )}

              <div className="preview-stats-grid">
                <div className="preview-stat-card">
                  <span>Topics in File</span>
                  <strong>{preview.summary.totalTopicsInFile}</strong>
                </div>
                <div className="preview-stat-card positive">
                  <span>Topics to Add</span>
                  <strong>+{preview.summary.topicsToCreate}</strong>
                </div>
                <div className="preview-stat-card notice">
                  <span>Topics to Update</span>
                  <strong>{preview.summary.topicsToUpdate}</strong>
                </div>
                <div className="preview-stat-card muted">
                  <span>Preserved/Skipped</span>
                  <strong>{preview.summary.topicsPreserved}</strong>
                </div>
              </div>

              <div className="preview-details-list">
                {preview.details.map((cat, idx) => (
                  <div key={idx} className="preview-cat-item">
                    <div className="preview-cat-header">
                      <span className="category-dot" />
                      <strong>{cat.name}</strong>
                      <small className="badge">{cat.action === 'create' ? 'New Category' : 'Matches Existing'}</small>
                    </div>

                    <div className="preview-tech-list">
                      {cat.technologies.map((tech, tIdx) => (
                        <div key={tIdx} className="preview-tech-item">
                          <div className="preview-tech-title">
                            <span>{tech.name}</span>
                            <small>{tech.action === 'create' ? '(New Tech)' : '(Existing)'}</small>
                          </div>
                          <div className="preview-tech-counts">
                            {tech.topicsToCreate.length > 0 && (
                              <span className="count-pill create">+{tech.topicsToCreate.length} new</span>
                            )}
                            {tech.topicsToUpdate.length > 0 && (
                              <span className="count-pill update">{tech.topicsToUpdate.length} update</span>
                            )}
                            {tech.topicsPreserved.length > 0 && (
                              <span className="count-pill preserve">{tech.topicsPreserved.length} keep</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button type="button" className="secondary-btn" onClick={onClose} disabled={committing}>
            Cancel
          </button>
          <button
            type="button"
            className="primary-btn"
            disabled={!preview || committing}
            onClick={handleCommit}
          >
            {committing ? 'Importing records…' : `Import ${preview ? preview.summary.topicsToCreate + preview.summary.topicsToUpdate : ''} Topics`}
          </button>
        </div>
      </div>
    </div>
  );
}
