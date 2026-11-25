'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  brief,
  eligibility,
  methods,
  type Artifact,
  type Candidate,
  type Method,
} from '@/src/lib/recruitment/contract';

const missing = 'Unavailable';
const methodKeys = Object.keys(methods) as Method[];
const descriptions: Record<Method, string> = {
  quickscout: 'Composite ranking across the supplied recruitment features.',
  production:
    'Attacking production measured by goals plus assists per 90 league minutes.',
  similarity:
    'Closeness to Salah on the statistical features used in the supplied ranking.',
};
const rate = (value: number | null) =>
  value === null ? missing : value.toFixed(2);
const money = (value: number | null) =>
  value === null || value <= 0
    ? missing
    : new Intl.NumberFormat('en', {
        style: 'currency',
        currency: 'EUR',
        notation: 'compact',
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      }).format(value);
const rank = (value: number | null) =>
  value === null ? 'Unranked' : '#' + value;
const compareRows: [string, (c: Candidate) => string | number][] = [
  ['Eligibility', eligibility],
  ['Age', (c) => c.age ?? missing],
  ['League minutes', (c) => c.minutes ?? missing],
  ['Estimated value', (c) => money(c.valueEur)],
  ['Valuation date', (c) => c.valuationDate ?? missing],
  ['Goals / 90', (c) => rate(c.goalsPer90)],
  ['Assists / 90', (c) => rate(c.assistsPer90)],
  ['RW evidence', (c) => c.rwEvidence ?? missing],
  ...methodKeys.map((m): [string, (c: Candidate) => string] => [
    methods[m],
    (c) => rank(c.ranks[m]),
  ]),
  ['Evidence gap', (c) => c.limitation],
];

export function CandidateComparison({ players }: { players: Candidate[] }) {
  if (!players.length)
    return (
      <p>
        Select up to two players from the shortlist to compare their profiles.
      </p>
    );
  return (
    <div className="rc-scroll">
      <table className="rc-compare">
        <caption className="sr-only">Selected candidate comparison</caption>
        <thead>
          <tr>
            <th>Measure</th>
            {players.map((c) => (
              <th key={c.id}>{c.name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {compareRows.map(([label, get]) => (
            <tr key={label}>
              <th scope="row">{label}</th>
              {players.map((c) => (
                <td key={c.id}>{get(c)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Evidence({ c }: { c: Candidate }) {
  return (
    <details className="rc-evidence">
      <summary>Scouting notes for {c.name}</summary>
      <div className="rc-notes">
        <div>
          <h4>Evidence for review</h4>
          <p>{c.rwEvidence ?? 'Right-wing evidence unavailable.'}</p>
          <p>
            {c.ranks.quickscout === null
              ? 'No composite rank supplied.'
              : 'Composite rank ' +
                rank(c.ranks.quickscout) +
                ' in the supplied shortlist.'}
          </p>
          {c.breakdown.length ? (
            <ul>
              {c.breakdown.map((item) => (
                <li key={item.label}>
                  {item.label} · {item.score}/100
                </li>
              ))}
            </ul>
          ) : (
            <p>Score breakdown unavailable.</p>
          )}
        </div>
        <div>
          <h4>Trade-offs &amp; gaps</h4>
          <p>{c.limitation}</p>
        </div>
        <div>
          <h4>Ask the scout</h4>
          <p>{c.scoutingQuestion}</p>
        </div>
      </div>
    </details>
  );
}

export function DecisionBoard({ artifact }: { artifact: Artifact }) {
  const [method, setMethod] = useState<Method>('quickscout');
  const [ids, setIds] = useState<string[]>([]);
  const ordered = [...artifact.candidates].sort(
    (a, b) =>
      (a.ranks[method] ?? Infinity) - (b.ranks[method] ?? Infinity) ||
      a.id.localeCompare(b.id),
  );
  const selected = ids.flatMap((id) =>
    artifact.candidates.filter((c) => c.id === id),
  );
  const mode =
    artifact.mode === 'synthetic' ? 'Synthetic demo' : 'Retrospective artifact';
  return (
    <main className="recruit">
      <nav className="rc-nav">
        <Link href="/dashboard">← Scouting dashboard</Link>
        <span>{mode}</span>
      </nav>
      <header className="rc-brief">
        <div className="rc-heading">
          <div>
            <p>Recruitment brief · {brief.season}</p>
            <h1>Replacing Mohamed Salah</h1>
            <p>Right-wing recruitment review as of 30 June 2025.</p>
          </div>
          <div className="rc-pitch" aria-hidden="true">
            <span>RW</span>
          </div>
        </div>
        <dl className="rc-constraints">
          {[
            ['Target role', 'Right winger'],
            ['Budget ceiling', '€45M'],
            ['Maximum age', '25 years'],
            ['League minutes', '1,200+'],
          ].map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      </header>
      <section className="rc-section">
        <h2>Candidate shortlist</h2>
        <div className="rc-methods" aria-label="Ranking method">
          {methodKeys.map((m) => (
            <button
              type="button"
              key={m}
              aria-pressed={method === m}
              onClick={() => setMethod(m)}
            >
              {methods[m]}
            </button>
          ))}
        </div>
        <p>
          {descriptions[method]}{' '}
          {artifact.mode === 'synthetic' &&
            'All candidate profiles and ranks in this view are fictional.'}
        </p>
        {ordered.length ? (
          <ol className="rc-list">
            {ordered.map((c) => (
              <li key={c.id}>
                <article>
                  <div className="rc-row">
                    <div>
                      <strong className="rc-rank">
                        {rank(c.ranks[method])}
                      </strong>
                      <h3>{c.name}</h3>
                      <p>
                        {c.team ?? 'Team unavailable'} · Age {c.age ?? missing}
                      </p>
                    </div>
                    <div>
                      <small>Estimated value</small>
                      <b>{money(c.valueEur)}</b>
                      <small>{c.valuationDate ?? 'Date unavailable'}</small>
                    </div>
                    <div>
                      <small>Goals / 90 · Assists / 90</small>
                      <b>
                        {rate(c.goalsPer90)} · {rate(c.assistsPer90)}
                      </b>
                      <small>
                        {c.minutes?.toLocaleString('en') ?? missing} league
                        minutes
                      </small>
                    </div>
                    <div>
                      <small>{eligibility(c)}</small>
                      <label>
                        <input
                          type="checkbox"
                          checked={ids.includes(c.id)}
                          disabled={!ids.includes(c.id) && ids.length >= 2}
                          onChange={(e) =>
                            setIds(
                              e.target.checked
                                ? [...ids, c.id]
                                : ids.filter((id) => id !== c.id),
                            )
                          }
                        />{' '}
                        Compare <span className="sr-only">{c.name}</span>
                      </label>
                    </div>
                  </div>
                  <Evidence c={c} />
                </article>
              </li>
            ))}
          </ol>
        ) : (
          <p>No candidates were supplied for this recruitment brief.</p>
        )}
        <p>
          Market values are dated estimates. A negotiated transfer fee may
          differ.
        </p>
      </section>
      <section className="rc-section">
        <h2>Side-by-side comparison</h2>
        <CandidateComparison players={selected} />
      </section>
      <section className="rc-section">
        <h2>Ranking comparison</h2>
        <div
          className="rc-scroll"
          tabIndex={0}
          role="region"
          aria-label="All supplied rankings"
        >
          <table>
            <thead>
              <tr>
                <th>Candidate</th>
                {methodKeys.map((m) => (
                  <th key={m}>{methods[m]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ordered.map((c) => (
                <tr key={c.id}>
                  <th scope="row">{c.name}</th>
                  {methodKeys.map((m) => (
                    <td key={m}>{rank(c.ranks[m])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          A productive finisher can lead on goals and assists while a different
          player leads on a composite score. Rank differences alone do not
          establish relevance.
        </p>
      </section>
      <section className="rc-section">
        <h2>Evidence &amp; provenance</h2>
        <dl className="rc-meta">
          {[
            ['Data mode', mode],
            ['Source', artifact.source],
            ['Release', artifact.release],
            ['Scoring version', artifact.scoringVersion],
            ['Human evaluation', 'Postponed'],
            ['Production validation', 'Unverified'],
          ].map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>

      </section>
    </main>
  );
}
