import { useState } from 'react';
import type { ExportFormat } from '@hew/core/handoff/application';

export interface ExportSectionProps {
  readonly enabled: boolean;
  readonly busy: boolean;
  readonly onDownload: (format: ExportFormat) => void;
  readonly onCopy: () => void;
}

const FORMATS: readonly { id: ExportFormat; label: string }[] = [
  { id: 'markdown', label: 'Markdown spec (.md)' },
  { id: 'openspec', label: 'OpenSpec change (.zip)' },
  { id: 'json', label: 'JSON (.json)' },
];

/** Turns the applied changes into a spec a developer or a coding agent can implement. */
export function ExportSection({ enabled, busy, onDownload, onCopy }: ExportSectionProps) {
  const [format, setFormat] = useState<ExportFormat>('markdown');
  return (
    <section className="stack" aria-label="Export">
      <h2>Export spec</h2>
      {!enabled ? (
        <span className="muted">Apply a change to export the session as a spec.</span>
      ) : (
        <>
          <select aria-label="Export format" value={format} disabled={busy} onChange={(e) => setFormat(e.target.value as ExportFormat)}>
            {FORMATS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
          <div className="row">
            <button className="primary" disabled={busy} onClick={() => onDownload(format)}>
              Download
            </button>
            <button disabled={busy} onClick={onCopy}>
              Copy Markdown
            </button>
          </div>
          <span className="muted">Includes the changes currently applied, their prompts, targets and design tokens.</span>
        </>
      )}
    </section>
  );
}
