import { useState, type ReactNode } from 'react';
import type { ExportFormat } from '@hew/core/handoff/application';
import { CopyIcon, DownloadIcon } from '../shared/Icons';

export interface ExportStats {
  readonly changes: number;
  readonly ops: number;
  readonly tokens: number;
}

export interface ExportSectionProps {
  /** What the export holds; null when no change is applied yet. */
  readonly stats: ExportStats | null;
  readonly busy: boolean;
  /** A confirmation or error for this section. */
  readonly message: ReactNode;
  readonly onDownload: (format: ExportFormat) => void;
  readonly onCopy: () => void;
}

const FORMATS: readonly { id: ExportFormat; label: string }[] = [
  { id: 'markdown', label: 'Markdown spec (.md)' },
  { id: 'openspec', label: 'OpenSpec change (.zip)' },
  { id: 'json', label: 'JSON (.json)' },
];

/** Turns the applied changes into a spec a developer or a coding agent can implement. */
export function ExportSection({ stats, busy, message, onDownload, onCopy }: ExportSectionProps) {
  const [format, setFormat] = useState<ExportFormat>('markdown');
  return (
    <section className="sec" aria-label="Export">
      <div className="sech">
        <span className="n">05</span>
        <h2>Export spec</h2>
      </div>
      {!stats ? (
        <div className="empty">Apply a change to export the session as a spec.</div>
      ) : (
        <>
          <div className="vstack">
            <label htmlFor="export-format" className="field-label">
              Format
            </label>
            <select id="export-format" className="sel-in" value={format} disabled={busy} onChange={(e) => setFormat(e.target.value as ExportFormat)}>
              {FORMATS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn primary" style={{ flex: 1 }} disabled={busy} onClick={() => onDownload(format)}>
              <DownloadIcon />
              Download
            </button>
            <button className="btn" style={{ flex: 1 }} disabled={busy} onClick={onCopy}>
              <CopyIcon />
              Copy Markdown
            </button>
          </div>
          {message}
          <div className="card" style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span className="eyebrow">This export</span>
            <div className="stats">
              <Stat value={stats.changes} label={stats.changes === 1 ? 'change' : 'changes'} />
              <Stat value={stats.ops} label={stats.ops === 1 ? 'operation' : 'operations'} />
              <Stat value={stats.tokens} label={stats.tokens === 1 ? 'token' : 'tokens'} />
            </div>
          </div>
          <p style={{ margin: 0, fontSize: 11.5, lineHeight: 1.5, color: 'var(--ink3)' }}>
            Includes the changes currently applied, their prompts, targets and design tokens. Each change gets acceptance scenarios and
            tasks. Undone changes are left out.
          </p>
        </>
      )}
    </section>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <span className="num">{value}</span>
      <span className="lbl">{label}</span>
    </div>
  );
}
