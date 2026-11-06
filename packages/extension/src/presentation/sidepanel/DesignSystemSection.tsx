import { useRef, useState, type ReactNode } from 'react';
import type { DesignSystemLibraryView, DesignSystemView } from '@hew/core/design-system/application';
import { ChevronIcon, DownloadIcon } from '../shared/Icons';

export interface DesignSystemSectionProps {
  readonly library: DesignSystemLibraryView | null;
  /** The site's host, shown next to the title; null on pages without a web origin. */
  readonly host: string | null;
  readonly busy: boolean;
  /** A confirmation or error for this section, rendered under the picker. */
  readonly message: ReactNode;
  readonly onExtract: () => void;
  readonly onImport: (file: File) => void;
  readonly onExport: (id: string) => void;
  readonly onActivate: (id: string | null) => void;
  readonly onDelete: (id: string) => void;
}

/** Only a value the browser parses as a color is used as a swatch background (never a url()). */
const isColor = (value: string) => !/url\(|image/i.test(value) && typeof CSS !== 'undefined' && CSS.supports('color', value);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const GROUP_ORDER = ['color', 'spacing', 'radius', 'font', 'shadow', 'size'];

/** The design system active for this site: pick, extract, import, export or delete one. */
export function DesignSystemSection({ library, host, busy, message, onExtract, onImport, onExport, onActivate, onDelete }: DesignSystemSectionProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const active: DesignSystemView | undefined = library?.systems.find((s) => s.id === library.activeId);

  return (
    <section className="sec" aria-label="Design system">
      <div className="sech-row">
        <div className="sech">
          <span className="n">03</span>
          <h2>Design system</h2>
        </div>
        {host && <span className="eyebrow">{host}</span>}
      </div>
      {!host ? (
        <div className="empty">Design systems work on regular web pages.</div>
      ) : (
        <>
          <div className="vstack">
            <label htmlFor="ds-active" className="field-label">
              Active for this site
            </label>
            <select
              id="ds-active"
              className="sel-in"
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
          </div>

          {message}

          {confirmDelete && active ? (
            <div className="confirm" role="alert">
              <span>
                Delete “{active.name}”? Its {plural(active.tokens.length, 'token')} leave this site’s previews. Applied changes stay as
                they are.
              </span>
              <div className="hstack">
                <button
                  className="btn sm dangerfill"
                  disabled={busy}
                  onClick={() => {
                    setConfirmDelete(false);
                    onDelete(active.id);
                  }}
                >
                  Confirm delete
                </button>
                <button className="btn sm ghost" onClick={() => setConfirmDelete(false)}>
                  Keep it
                </button>
              </div>
            </div>
          ) : (
            <div className="hstack">
              <button className="btn sm" disabled={busy} onClick={onExtract}>
                Extract from page
              </button>
              <button className="btn sm" disabled={busy} onClick={() => fileInput.current?.click()}>
                Import tokens…
              </button>
              {active && (
                <>
                  <button className="btn sm" disabled={busy} onClick={() => onExport(active.id)}>
                    <DownloadIcon size={13} />
                    Export
                  </button>
                  <button className="btn sm ghost danger" disabled={busy} onClick={() => setConfirmDelete(true)}>
                    Delete
                  </button>
                </>
              )}
            </div>
          )}
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

          {active && <Summary system={active} />}
        </>
      )}
    </section>
  );
}

function Summary({ system }: { system: DesignSystemView }) {
  const colors = system.tokens.filter((t) => t.group === 'color' && isColor(t.value)).slice(0, 9);
  const groups = [...new Set([...GROUP_ORDER, ...system.tokens.map((t) => t.group)])]
    .map((group) => ({ group, tokens: system.tokens.filter((t) => t.group === group) }))
    .filter((g) => g.tokens.length > 0);
  return (
    <details className="card">
      <summary data-testid="design-system-summary">
        <span>Summary</span>
        <span className="mono muted hstack" style={{ fontSize: 11 }}>
          {plural(system.tokens.length, 'token')} · {plural(system.components.length, 'component')}
          <ChevronIcon className="chev" />
        </span>
      </summary>
      <div className="card-body">
        {colors.length > 0 && (
          <div className="swatches" aria-hidden="true">
            {colors.map((t) => (
              <span key={t.cssVar} className="sw" style={{ background: t.value }} title={`${t.cssVar} ${t.value}`} />
            ))}
          </div>
        )}
        {groups.length > 0 && (
          <div className="vstack">
            <span className="eyebrow">Tokens</span>
            <dl className="tg">
              {groups.map(({ group, tokens }) => (
                <Pair key={group} term={group} value={`${tokens.length} · ${tokens[0]!.cssVar} ${tokens[0]!.value}`} />
              ))}
            </dl>
          </div>
        )}
        {system.components.length > 0 && (
          <div className="vstack">
            <span className="eyebrow">Components</span>
            <dl className="tg">
              {system.components.map((c) => (
                <Pair key={`${c.kind}-${c.name}`} term={c.kind} value={c.classes.map((cls) => `.${cls}`).join(' ')} />
              ))}
            </dl>
          </div>
        )}
        <details>
          <summary className="eyebrow" style={{ cursor: 'pointer' }}>
            All {plural(system.tokens.length, 'token')}
          </summary>
          <dl className="tg" style={{ marginTop: 8 }}>
            {system.tokens.slice(0, 200).map((t) => (
              <div key={t.cssVar} data-testid="design-token" style={{ display: 'contents' }}>
                <dt style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span
                    aria-hidden
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      flex: 'none',
                      boxShadow: 'inset 0 0 0 1px var(--rule2)',
                      background: t.group === 'color' && isColor(t.value) ? t.value : 'transparent',
                    }}
                  />
                  {t.group}
                </dt>
                <dd title={`${t.cssVar}: ${t.value}`}>
                  {t.cssVar} {t.value}
                </dd>
              </div>
            ))}
          </dl>
        </details>
        <p style={{ margin: 0, fontSize: 11.5, color: 'var(--ink3)' }}>
          Tokens the page doesn’t define are added to it so previews render correctly. Switch to None to remove them.
        </p>
      </div>
    </details>
  );
}

function Pair({ term, value }: { term: string; value: string }) {
  return (
    <>
      <dt>{term}</dt>
      <dd title={value}>{value}</dd>
    </>
  );
}
