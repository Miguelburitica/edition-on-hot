import { useState } from 'react';
import type { ChangesetView } from '@hew/core/editing/application';
import { ChevronIcon, WarnIcon } from '../shared/Icons';

export interface HistoryProps {
  /** Oldest first: changeset i is version i + 1. */
  readonly changesets: readonly ChangesetView[];
  readonly currentVersion: number;
  readonly disabled: boolean;
  /** A change is being generated: shown as the next, pending version. */
  readonly pending: boolean;
  readonly onGoTo: (version: number) => void;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Timeline of versions: Original, then each change. Choosing one shows the page at that version. */
export function History({ changesets, currentVersion, disabled, pending, onGoTo }: HistoryProps) {
  const kept = changesets.slice(0, currentVersion);
  const later = changesets.slice(currentVersion);
  return (
    <ol className="tl">
      <li data-testid="version-original" data-current={currentVersion === 0} className={currentVersion === 0 && changesets.length > 0 ? 'current' : undefined}>
        <button
          className="vrow"
          style={{ padding: '8px 0' }}
          aria-label="Show the original page"
          aria-current={currentVersion === 0 ? 'step' : undefined}
          disabled={disabled || currentVersion === 0}
          onClick={() => onGoTo(0)}
        >
          <span className="origin-dot">
            <span />
          </span>
          <span className="spread" style={{ flex: 1, alignItems: 'baseline' }}>
            <span style={{ color: 'var(--ink2)' }}>Original</span>
            {currentVersion === 0 && changesets.length > 0 ? (
              <span className="badge b-view">viewing</span>
            ) : (
              <span className="vmeta">{changesets.length ? 'page as loaded' : 'no changes yet'}</span>
            )}
          </span>
        </button>
      </li>

      {kept.map((c, i) => (
        <Version key={c.id} changeset={c} version={i + 1} current={currentVersion === i + 1} disabled={disabled} onGoTo={onGoTo} />
      ))}

      {pending && (
        <li style={{ borderTop: '1px dashed var(--rule2)' }}>
          <div className="vrow" style={{ cursor: 'default' }}>
            <span className="ver">v{currentVersion + 1}</span>
            <span className="muted pulse" style={{ fontSize: 12.5 }}>
              Generating…
            </span>
          </div>
        </li>
      )}

      {later.length > 0 && !pending && (
        <li className="later">
          <span className="eyebrow">Replaced if you apply</span>
          {later.map((c, i) => (
            <Version key={c.id} changeset={c} version={currentVersion + i + 1} current={false} disabled={disabled} onGoTo={onGoTo} undone />
          ))}
        </li>
      )}
    </ol>
  );
}

interface VersionProps {
  readonly changeset: ChangesetView;
  readonly version: number;
  readonly current: boolean;
  readonly disabled: boolean;
  readonly undone?: boolean;
  readonly onGoTo: (version: number) => void;
}

function Version({ changeset: c, version, current, disabled, undone, onGoTo }: VersionProps) {
  const [open, setOpen] = useState(false);
  const warned = c.warnings.length > 0;
  const badge = undone ? (
    <span className="badge b-ghost">undone</span>
  ) : warned ? (
    <span className="badge b-warn">applied · warnings</span>
  ) : (
    <span className="badge b-ok">applied</span>
  );
  const row = (
    <button
      className="vrow"
      aria-label={`Show version ${version}`}
      aria-current={current ? 'step' : undefined}
      disabled={disabled || current}
      onClick={() => onGoTo(version)}
    >
      <span className="ver">v{version}</span>
      <span className="vbody">
        <span className="hstack">
          {badge}
          {current && <span className="badge b-view">viewing</span>}
        </span>
        <span className="prompt-text" style={{ color: 'var(--ink)' }}>
          {c.prompt}
        </span>
        {!undone && c.summary && <span style={{ fontSize: 12, color: 'var(--ink2)' }}>{c.summary}</span>}
      </span>
    </button>
  );
  const details = !undone && (
    <div className="vbody" style={{ padding: '0 0 12px 34px', marginTop: -6, gap: 8 }}>
      <button className="ops-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        {plural(c.opCount, 'op')} · {plural(c.warnings.length, 'warning')}
        <ChevronIcon size={11} />
      </button>
      {open && (
          <ul className="ops">
            {c.ops.map((op, opIndex) => (
              <li key={opIndex} className={c.warnings.some((w) => w.opIndex === opIndex) ? 'bad' : undefined}>
                {op.type}
                {op.target ? ` → ${op.target}` : ''}
              </li>
            ))}
          </ul>
      )}
      {c.warnings.map((w, k) => (
        <div key={k} className="warnline">
          <WarnIcon />
          <span>
            {w.kind === 'no-match' ? 'No visible effect: ' : 'Hidden target: '}
            {w.detail}
          </span>
        </div>
      ))}
    </div>
  );
  if (undone) {
    return (
      <div data-testid="changeset" data-status={c.status} data-current={false}>
        {row}
      </div>
    );
  }
  return (
    <li data-testid="changeset" data-status={c.status} data-current={current} className={current ? 'current' : undefined}>
      {row}
      {details}
    </li>
  );
}
