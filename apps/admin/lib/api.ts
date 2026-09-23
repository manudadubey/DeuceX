// Unauthenticated on purpose for this step — see
// apps/api/src/rankings/admin-routes.ts's own design note for why, and what
// step 5.1 needs to add before this is real staff-only access.
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787';

export interface FeedStatusView {
  feed: string;
  cadence: string;
  last_run_at: string | null;
  last_result: string | null;
  next_expected_at: string;
  row_count: number | null;
  overdue: boolean;
}

export interface MatchedPlayerChange {
  playerId: string;
  name: string;
  tour: 'atp' | 'wta';
  beforeTourSinglesRank: number | null;
  afterTourSinglesRank: number | null;
  beforeStage: string | null;
  afterStage: string;
  stageChanged: boolean;
}

export interface UnmatchedRow {
  tour: 'atp' | 'wta';
  tourPlayerId: string | null;
  itfId: string | null;
  name: string;
  country: string;
}

export interface ImportPreview {
  rows: number;
  matched: MatchedPlayerChange[];
  unmatchedCount: number;
  unmatched: UnmatchedRow[];
  stageChangeCount: number;
}

export interface ImportResult {
  importId: string;
  rowsProcessed: number;
  matchedCount: number;
  unmatchedCount: number;
  stageChangeCount: number;
}

export interface MissingDeadlineTournament {
  id: string;
  tour: string;
  name: string;
  start_date: string;
  city: string | null;
  country: string | null;
  shortlistedCount: number;
}

export interface FactCorrection {
  id: string;
  tournament_id: string;
  field: string;
  before: string | null;
  after: string;
  source: string;
  state: 'proposed' | 'applied' | 'rejected';
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers },
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? `Request to ${path} failed (${res.status})`);
  return body as T;
}

export function getFeeds(): Promise<{ feeds: FeedStatusView[] }> {
  return request('/admin/rankings/feeds');
}

export function previewImport(csv: string): Promise<ImportPreview> {
  return request('/admin/rankings/import/preview', {
    method: 'POST',
    body: JSON.stringify({ csv }),
  });
}

export function applyImport(csv: string, appliedBy: string): Promise<ImportResult> {
  return request('/admin/rankings/import/apply', {
    method: 'POST',
    body: JSON.stringify({ csv, appliedBy }),
  });
}

export function getMissingDeadlineTournaments(): Promise<{
  tournaments: MissingDeadlineTournament[];
}> {
  return request('/admin/tournaments/missing-deadline');
}

export function setDeadline(tournamentId: string, entryDeadline: string): Promise<{ ok: true }> {
  return request(`/admin/tournaments/${tournamentId}/deadline`, {
    method: 'POST',
    body: JSON.stringify({ entryDeadline }),
  });
}

export function getCorrections(): Promise<{ corrections: FactCorrection[] }> {
  return request('/admin/corrections');
}

export function proposeCorrection(input: {
  tournamentId: string;
  field: string;
  after: string;
  source: string;
}): Promise<{ correction: FactCorrection }> {
  return request('/admin/corrections', { method: 'POST', body: JSON.stringify(input) });
}

export function applyCorrection(id: string): Promise<{ ok: true }> {
  return request(`/admin/corrections/${id}/apply`, { method: 'POST' });
}

export function rejectCorrection(id: string): Promise<{ ok: true }> {
  return request(`/admin/corrections/${id}/reject`, { method: 'POST' });
}
