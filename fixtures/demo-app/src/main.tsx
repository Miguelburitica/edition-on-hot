import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const projects = [
  { name: 'Billing service', status: 'Healthy' },
  { name: 'Search indexer', status: 'Degraded' },
  { name: 'Marketing site', status: 'Healthy' },
];

function App() {
  const [submitted, setSubmitted] = useState(false);
  return (
    <>
      <div className="banner">Scheduled maintenance on Sunday, 02:00 UTC.</div>
      <header className="top">
        <strong>Acme Cloud</strong>
        <nav className="actions" style={{ marginTop: 0 }}>
          <button className="btn btn-ghost">Docs</button>
          <button className="btn btn-primary">Upgrade</button>
        </nav>
      </header>
      <main>
        <section className="card">
          <h2>Create your account</h2>
          <form
            id="signup"
            onSubmit={(e) => {
              e.preventDefault();
              setSubmitted(true);
            }}
          >
            <label htmlFor="email">Work email</label>
            <input id="email" name="email" type="email" placeholder="you@company.com" />
            <label htmlFor="team">Team name</label>
            <input id="team" name="team" placeholder="Acme" />
            <div className="actions">
              <button className="btn btn-primary" type="submit">
                Sign up
              </button>
              <button className="btn btn-ghost" type="button">
                Talk to sales
              </button>
            </div>
            {submitted && <p data-testid="submitted">Thanks! Check your inbox.</p>}
          </form>
        </section>
        <section className="card">
          <h2>Projects</h2>
          <ul className="list">
            {projects.map((p) => (
              <li key={p.name}>
                <span>{p.name}</span>
                <span className="tag">{p.status}</span>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
