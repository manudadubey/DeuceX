'use client';

import { useEffect, useState } from 'react';
import {
  applyCorrection,
  applyImport,
  getCorrections,
  getFeeds,
  getMissingDeadlineTournaments,
  previewImport,
  proposeCorrection,
  rejectCorrection,
  setDeadline,
  type FactCorrection,
  type FeedStatusView,
  type ImportPreview,
  type MissingDeadlineTournament,
} from '@/lib/api';

const CORRECTABLE_FIELDS = ['ball', 'entry_deadline', 'altitude_m', 'surface'] as const;

export default function IngestionPage() {
  return (
    <main>
      <h1>Ingestion</h1>
      <p className="subtle">
        PRD-13 §4.5. Staff sign-in and roles land in step 5.1 — this page currently has no auth of
        its own beyond Vercel&rsquo;s account-level protection on the deployment.
      </p>
      <FeedStatusSection />
      <CsvImportSection />
      <MissingDeadlineSection />
      <FactCorrectionsSection />
    </main>
  );
}

function FeedStatusSection() {
  const [feeds, setFeeds] = useState<FeedStatusView[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getFeeds()
      .then((r) => setFeeds(r.feeds))
      .catch((e) => setError(String(e.message ?? e)));
  }, []);

  return (
    <section>
      <h2>Feeds</h2>
      {error && <p className="error">{error}</p>}
      {!feeds && !error && <p className="subtle">Loading…</p>}
      {feeds && (
        <div className="feed-grid">
          {feeds.map((f) => (
            <div className="feed-card" key={f.feed}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <strong>{f.feed}</strong>
                {f.overdue && <span className="badge attention">Attention</span>}
              </div>
              <p className="subtle">Cadence: {f.cadence}</p>
              <p className="subtle">Last run: {f.last_run_at ?? 'never'}</p>
              <p className="subtle">
                Next expected: {new Date(f.next_expected_at).toLocaleString()}
              </p>
              {f.row_count !== null && <p className="subtle">Rows last import: {f.row_count}</p>}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function CsvImportSection() {
  const [csv, setCsv] = useState('');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [applied, setApplied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handlePreview() {
    setError(null);
    setApplied(null);
    setBusy(true);
    try {
      setPreview(await previewImport(csv));
    } catch (e) {
      setError(String((e as Error).message ?? e));
      setPreview(null);
    } finally {
      setBusy(false);
    }
  }

  async function handleApply() {
    setBusy(true);
    setError(null);
    try {
      const result = await applyImport(csv, 'ops');
      setApplied(
        `Applied: ${result.matchedCount} players updated, ${result.stageChangeCount} stage changes, ${result.unmatchedCount} unmatched rows.`,
      );
      setPreview(null);
    } catch (e) {
      setError(String((e as Error).message ?? e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <h2>Ranking CSV import</h2>
      <p className="subtle">
        Columns: tour, tour_player_id, itf_id, name, country, week_start, tour_singles_rank,
        tour_singles_points, tour_doubles_rank, tour_doubles_points, itf_rank, itf_points.
      </p>
      <textarea value={csv} onChange={(e) => setCsv(e.target.value)} placeholder="Paste CSV here" />
      <div className="row" style={{ marginTop: 12 }}>
        <button onClick={handlePreview} disabled={busy || !csv}>
          Preview
        </button>
        {preview && (
          <button className="secondary" onClick={handleApply} disabled={busy}>
            Apply ({preview.stageChangeCount} stage change
            {preview.stageChangeCount === 1 ? '' : 's'})
          </button>
        )}
      </div>
      {error && <p className="error">{error}</p>}
      {applied && <p>{applied}</p>}
      {preview && (
        <div style={{ marginTop: 16 }}>
          <p>
            {preview.rows} rows: {preview.matched.length} matched to existing players,{' '}
            {preview.unmatchedCount} unmatched, {preview.stageChangeCount} stage changes.
          </p>
          {preview.matched.length > 0 && (
            <table>
              <thead>
                <tr>
                  <th>Player</th>
                  <th>Rank before</th>
                  <th>Rank after</th>
                  <th>Stage before</th>
                  <th>Stage after</th>
                </tr>
              </thead>
              <tbody>
                {preview.matched.map((m) => (
                  <tr key={m.playerId}>
                    <td>{m.name}</td>
                    <td>{m.beforeTourSinglesRank ?? '—'}</td>
                    <td>{m.afterTourSinglesRank ?? '—'}</td>
                    <td>{m.beforeStage ?? '—'}</td>
                    <td>
                      {m.afterStage} {m.stageChanged && <span className="badge">changed</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {preview.unmatched.length > 0 && (
            <>
              <p className="subtle" style={{ marginTop: 12 }}>
                Unmatched rows (kept as directory entries for a future onboarding lookup, not linked
                to any player):
              </p>
              <ul>
                {preview.unmatched.map((u, i) => (
                  <li key={i}>
                    {u.name} ({u.country}) — {u.tourPlayerId ?? u.itfId}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </section>
  );
}

function MissingDeadlineSection() {
  const [tournaments, setTournaments] = useState<MissingDeadlineTournament[] | null>(null);
  const [dates, setDates] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  function load() {
    getMissingDeadlineTournaments()
      .then((r) => setTournaments(r.tournaments))
      .catch((e) => setError(String(e.message ?? e)));
  }

  useEffect(load, []);

  async function handleSet(id: string) {
    const date = dates[id];
    if (!date) return;
    try {
      await setDeadline(id, date);
      load();
    } catch (e) {
      setError(String((e as Error).message ?? e));
    }
  }

  return (
    <section>
      <h2>Calendar events with no published deadline</h2>
      <p className="subtle">
        Shortlisted-count is always 0 until step 3.2&rsquo;s Tournament Agent exists to shortlist
        anything against these rows.
      </p>
      {error && <p className="error">{error}</p>}
      {tournaments && tournaments.length === 0 && <p className="subtle">None right now.</p>}
      {tournaments && tournaments.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Tournament</th>
              <th>Starts</th>
              <th>Shortlisted by</th>
              <th>Set deadline</th>
            </tr>
          </thead>
          <tbody>
            {tournaments.map((t) => (
              <tr key={t.id}>
                <td>
                  {t.name} ({t.tour})
                </td>
                <td>{t.start_date}</td>
                <td>{t.shortlistedCount}</td>
                <td>
                  <div className="row">
                    <input
                      type="date"
                      value={dates[t.id] ?? ''}
                      onChange={(e) => setDates((d) => ({ ...d, [t.id]: e.target.value }))}
                    />
                    <button onClick={() => handleSet(t.id)} disabled={!dates[t.id]}>
                      Set
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function FactCorrectionsSection() {
  const [corrections, setCorrections] = useState<FactCorrection[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tournamentId, setTournamentId] = useState('');
  const [field, setField] = useState<(typeof CORRECTABLE_FIELDS)[number]>('ball');
  const [after, setAfter] = useState('');
  const [source, setSource] = useState('');

  function load() {
    getCorrections()
      .then((r) => setCorrections(r.corrections))
      .catch((e) => setError(String(e.message ?? e)));
  }

  useEffect(load, []);

  async function handlePropose() {
    try {
      await proposeCorrection({ tournamentId, field, after, source });
      setAfter('');
      setSource('');
      load();
    } catch (e) {
      setError(String((e as Error).message ?? e));
    }
  }

  async function handleApply(id: string) {
    try {
      await applyCorrection(id);
      load();
    } catch (e) {
      setError(String((e as Error).message ?? e));
    }
  }

  async function handleReject(id: string) {
    try {
      await rejectCorrection(id);
      load();
    } catch (e) {
      setError(String((e as Error).message ?? e));
    }
  }

  return (
    <section>
      <h2>Fact-sheet corrections</h2>
      <p className="subtle">
        PRD-13 AD-20: ball, deadline, altitude and surface, proposed with a source, shown as a
        before/after diff. Applying a deadline change re-running shortlists is step 3.2&rsquo;s job
        once shortlists exist.
      </p>
      <div className="row" style={{ marginBottom: 16 }}>
        <input
          type="text"
          placeholder="Tournament id"
          value={tournamentId}
          onChange={(e) => setTournamentId(e.target.value)}
        />
        <select value={field} onChange={(e) => setField(e.target.value as typeof field)}>
          {CORRECTABLE_FIELDS.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
        <input
          type="text"
          placeholder="New value"
          value={after}
          onChange={(e) => setAfter(e.target.value)}
        />
        <input
          type="text"
          placeholder="Source"
          value={source}
          onChange={(e) => setSource(e.target.value)}
        />
        <button onClick={handlePropose} disabled={!tournamentId || !after || !source}>
          Propose
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      {corrections && corrections.length === 0 && (
        <p className="subtle">No proposed corrections.</p>
      )}
      {corrections && corrections.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Field</th>
              <th>Before</th>
              <th>After</th>
              <th>Source</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {corrections.map((c) => (
              <tr key={c.id}>
                <td>{c.field}</td>
                <td>{c.before ?? '—'}</td>
                <td>{c.after}</td>
                <td>{c.source}</td>
                <td>
                  <div className="row">
                    <button onClick={() => handleApply(c.id)}>Apply</button>
                    <button className="secondary" onClick={() => handleReject(c.id)}>
                      Reject
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
