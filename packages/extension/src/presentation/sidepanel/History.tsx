import type { ChangesetView } from '@hew/core/editing/application';
import type { ReactNode } from 'react';

const time = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });

export interface HistoryProps {
  /** Oldest first: changeset i is version i + 1. */
  readonly changesets: readonly ChangesetView[];
  readonly currentVersion: number;
  readonly disabled: boolean;
  readonly onGoTo: (version: number) => void;
}

/** Timeline of versions: Original, then each changeset. Choosing one shows the page at that version. */
export function History({ changesets, currentVersion, disabled, onGoTo }: HistoryProps) {
  return (
    <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <VersionRow
        testId="version-original"
        version={0}
        current={currentVersion === 0}
        later={false}
        disabled={disabled}
        onGoTo={onGoTo}
        title="Original"
        subtitle={changesets.length ? 'The page before any change' : 'No changes yet'}
      />
      {changesets.map((c, i) => {
        const version = i + 1;
        const status = c.status === 'applied' && c.warnings.length > 0 ? 'applied with warnings' : c.status;
        return (
          <VersionRow
            key={c.id}
            testId="changeset"
            status={c.status}
            version={version}
            current={currentVersion === version}
            later={version > currentVersion}
            disabled={disabled}
            onGoTo={onGoTo}
            title={c.summary}
            badge={status}
            warn={c.warnings.length > 0}
            subtitle={`“${c.prompt}” · ${time.format(new Date(c.createdAt))}`}
          >
            <details style={{ marginTop: 4 }}>
              <summary className="muted" style={{ cursor: 'pointer' }}>
                {c.opCount} op{c.opCount === 1 ? '' : 's'}
                {c.warnings.length ? ` · ${c.warnings.length} warning${c.warnings.length === 1 ? '' : 's'}` : ''}
              </summary>
              <ul style={{ margin: '4px 0 0', paddingLeft: 16, fontSize: 12 }}>
                {c.ops.map((op, opIndex) => (
                  <li key={opIndex} style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                    {op.type}
                    {op.target ? ` → ${op.target}` : ''}
                    {c.warnings
                      .filter((w) => w.opIndex === opIndex)
                      .map((w, k) => (
                        <div key={k} className="error" style={{ padding: '2px 6px', marginTop: 2, fontFamily: 'inherit' }}>
                          {w.kind === 'no-match' ? 'No visible effect: ' : 'Hidden target: '}
                          {w.detail}
                        </div>
                      ))}
                  </li>
                ))}
              </ul>
            </details>
          </VersionRow>
        );
      })}
    </ol>
  );
}

interface VersionRowProps {
  readonly testId: string;
  readonly version: number;
  readonly current: boolean;
  readonly later: boolean;
  readonly disabled: boolean;
  readonly onGoTo: (version: number) => void;
  readonly title: string;
  readonly subtitle: string;
  readonly status?: string;
  readonly badge?: string;
  readonly warn?: boolean;
  readonly children?: ReactNode;
}

function VersionRow(props: VersionRowProps) {
  const { current, later } = props;
  return (
    <li
      data-testid={props.testId}
      data-status={props.status}
      data-current={current}
      style={{
        border: `1px solid ${current ? 'var(--accent)' : 'var(--border)'}`,
        borderRadius: 'var(--radius)',
        padding: '8px 10px',
        opacity: later ? 0.55 : 1,
      }}
    >
      <button
        className="link"
        aria-label={props.version === 0 ? 'Show the original page' : `Show version ${props.version}`}
        aria-current={current ? 'step' : undefined}
        disabled={props.disabled || current}
        onClick={() => props.onGoTo(props.version)}
        style={{ display: 'block', width: '100%', textAlign: 'left', color: 'inherit', opacity: 1 }}
      >
        <span className="row spread" style={{ alignItems: 'flex-start' }}>
          <strong style={{ fontSize: 13 }}>
            {props.version === 0 ? props.title : `${props.version}. ${props.title}`}
          </strong>
          <span className="row" style={{ gap: 4, flexShrink: 0 }}>
            {current && <Badge tone="current">viewing</Badge>}
            {props.badge && <Badge tone={props.warn ? 'warn' : props.badge === 'applied' ? 'ok' : 'muted'}>{props.badge}</Badge>}
          </span>
        </span>
        <span className="muted" style={{ display: 'block' }}>
          {props.subtitle}
        </span>
      </button>
      {props.children}
    </li>
  );
}

const TONES = {
  current: { background: 'var(--accent)', color: 'var(--accent-text)' },
  ok: { background: 'var(--badge-applied)', color: 'var(--text)' },
  warn: { background: 'var(--danger-bg)', color: 'var(--danger-text)' },
  muted: { background: 'var(--badge-undone)', color: 'var(--text)' },
} as const;

function Badge({ tone, children }: { tone: keyof typeof TONES; children: ReactNode }) {
  return <span style={{ fontSize: 11, borderRadius: 999, padding: '1px 8px', whiteSpace: 'nowrap', ...TONES[tone] }}>{children}</span>;
}
