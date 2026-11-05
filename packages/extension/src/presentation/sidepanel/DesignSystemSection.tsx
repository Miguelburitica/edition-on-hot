import { useRef, useState } from 'react';
import type { DesignSystemLibraryView, DesignSystemView } from '@hew/core/design-system/application';

export interface DesignSystemSectionProps {
  readonly library: DesignSystemLibraryView | null;
  /** False on pages without a web origin, where design systems cannot be bound. */
  readonly available: boolean;
  readonly busy: boolean;
  readonly onExtract: () => void;
  readonly onImport: (file: File) => void;
  readonly onExport: (id: string) => void;
  readonly onActivate: (id: string | null) => void;
  readonly onDelete: (id: string) => void;
}

/** Only a value the browser parses as a color is used as a swatch background (never a url()). */
const isColor = (value: string) => !/url\(|image/i.test(value) && typeof CSS !== 'undefined' && CSS.supports('color', value);

/** The design system active for this site: pick, extract, import, export or delete one. */
export function DesignSystemSection({ library, available, busy, onExtract, onImport, onExport, onActivate, onDelete }: DesignSystemSectionProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const active: DesignSystemView | undefined = library?.systems.find((s) => s.id === library.activeId);

  return (
    <section className="stack" aria-label="Design system">
      <h2>Design system</h2>
      {!available ? (
        <span className="muted">Design systems work on regular web pages.</span>
      ) : (
        <>
          <select
            aria-label="Active design system"
            value={library?.activeId ?? ''}
            disabled={busy || !library}
            onChange={(e) => {
              setConfirmDelete(false);
              onActivate(e.target.value || null);
            }}
          >
            <option value="">None</option>
            {library?.systems.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          {active && (
            <details>
              <summary className="muted" data-testid="design-system-summary">
                {active.tokens.length} token{active.tokens.length === 1 ? '' : 's'} · {active.components.length} component
                {active.components.length === 1 ? '' : 's'} · used in every change on this site
              </summary>
              <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0', display: 'grid', gap: 4, fontSize: 12 }}>
                {active.tokens.slice(0, 60).map((t) => (
                  <li key={t.cssVar} className="row" style={{ gap: 6 }} data-testid="design-token">
                    <span
                      aria-hidden
                      style={{
                        width: 12,
                        height: 12,
                        borderRadius: 3,
                        border: '1px solid var(--border)',
                        background: t.group === 'color' && isColor(t.value) ? t.value : 'transparent',
                        flex: 'none',
                      }}
                    />
                    <code>{t.cssVar}</code>
                    <span className="muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {t.value}
                    </span>
                  </li>
                ))}
                {active.tokens.length > 60 && <li className="muted">…and {active.tokens.length - 60} more</li>}
                {active.components.map((c) => (
                  <li key={`${c.kind}-${c.name}`} className="muted">
                    {c.name}: <code>{c.classes.join(' ')}</code>
                  </li>
                ))}
              </ul>
            </details>
          )}

          <div className="row" style={{ flexWrap: 'wrap' }}>
            <button disabled={busy} onClick={onExtract}>
              Extract from page
            </button>
            <button disabled={busy} onClick={() => fileInput.current?.click()}>
              Import tokens…
            </button>
            <input
              ref={fileInput}
              type="file"
              accept=".json,application/json"
              aria-label="Token file"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) onImport(file);
              }}
            />
            {active && (
              <>
                <button disabled={busy} onClick={() => onExport(active.id)}>
                  Export
                </button>
                {confirmDelete ? (
                  <button
                    disabled={busy}
                    onClick={() => {
                      setConfirmDelete(false);
                      onDelete(active.id);
                    }}
                  >
                    Confirm delete
                  </button>
                ) : (
                  <button disabled={busy} onClick={() => setConfirmDelete(true)}>
                    Delete
                  </button>
                )}
              </>
            )}
          </div>
        </>
      )}
    </section>
  );
}
