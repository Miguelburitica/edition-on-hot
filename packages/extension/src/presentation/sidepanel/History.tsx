import type { ChangesetView } from '@hew/core/editing/application';

const time = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });

export function History({ changesets }: { changesets: readonly ChangesetView[] }) {
  if (changesets.length === 0) return <p className="muted">No changes yet.</p>;
  return (
    <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {changesets.map((c) => (
        <li
          key={c.id}
          data-testid="changeset"
          data-status={c.status}
          style={{
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            padding: '8px 10px',
            opacity: c.status === 'undone' ? 0.6 : 1,
          }}
        >
          <div className="row spread">
            <strong style={{ fontSize: 13 }}>{c.summary}</strong>
            <span
              style={{
                fontSize: 11,
                borderRadius: 999,
                padding: '1px 8px',
                background: c.status === 'applied' ? 'var(--badge-applied)' : 'var(--badge-undone)',
              }}
            >
              {c.status}
            </span>
          </div>
          <div className="muted">
            “{c.prompt}” · {time.format(new Date(c.createdAt))} · {c.opCount} op{c.opCount === 1 ? '' : 's'}
          </div>
        </li>
      ))}
    </ol>
  );
}
