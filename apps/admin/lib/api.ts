import type { AdminArea, AdminRole } from '@deucex/shared';

// The console talks only to apps/api's /admin routes, which check the staff
// session, the passkey and the role on every call (PRD-13 section 7: the
// server enforces roles; hiding areas here is a convenience). Server
// components pass the session token through lib/server-api.ts; client
// controls use browserRequest below.
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiRequest<T>(
  path: string,
  auth: { token: string | null; rolePreview?: string | null },
  init?: RequestInit,
): Promise<T> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (auth.token) headers.authorization = `Bearer ${auth.token}`;
  if (auth.rolePreview) headers['x-role-preview'] = auth.rolePreview;
  const res = await fetch(`${API_URL}${path}`, {
    cache: 'no-store',
    ...init,
    headers: { ...headers, ...(init?.headers as Record<string, string> | undefined) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(
      res.status,
      body.error ?? `Request to ${path} failed (${res.status})`,
      body.code,
    );
  }
  return body as T;
}

// ---------------------------------------------------------------------------
// Response shapes (mirroring apps/api/src/admin/queries.ts).
// ---------------------------------------------------------------------------

export interface Me {
  id: string;
  name: string;
  email: string;
  role: AdminRole;
  actingRole: AdminRole;
  areas: AdminArea[];
  passkeyRegistered: boolean;
  passkeySession: boolean;
}

export interface AttentionItem {
  severity: 'danger' | 'warn' | 'info';
  group: 'promise' | 'money' | 'hygiene';
  title: string;
  body: string;
  href: string;
  cta: string;
}

export interface Overview {
  date: string;
  aggregatedAt: string | null;
  stats: {
    signedUp: number;
    active: number;
    newThisWeek: number;
    weeklyActiveShare: number | null;
    mrrAud: number | null;
    pro: number;
    elite: number;
    trials: number;
    trialsEndingThisWeek: number;
    morningRun: {
      total: number;
      failed: number;
      finishedAt: string | null;
      medianMs: number | null;
    };
  };
  attention: AttentionItem[];
  approvalRates: Array<{ agent: string; label: string; rate: number | null; under: boolean }>;
  signups: Array<{ week: string; signups: number }>;
  spendPerPlayer: Array<{ month: string; perPlayerAud: number | null }>;
  spendCapAud: number;
}

export type PlayerStatus =
  'Active' | 'Trial' | 'Past due' | 'Unverified' | 'Minor' | 'Dormant' | 'Deleting';

export interface PlayerListItem {
  id: string;
  name: string;
  email: string;
  country: string;
  tour: string;
  ranking: string | null;
  stage: string | null;
  tier: string;
  status: PlayerStatus;
  patrons: number;
  lastActiveAt: string | null;
}

export interface PlayersResponse {
  stats: {
    total: number;
    free: number;
    pro: number;
    elite: number;
    atp: number;
    wta: number;
    stage1: number;
    stage2: number;
    stage3: number;
    unverified: number;
    ambiguous: number;
    minors: number;
    minors_confirmed: number;
    dormant: number;
  };
  players: PlayerListItem[];
}

export interface AuditEntry {
  id: string;
  at: string;
  actor: 'admin' | 'player';
  actorName: string | null;
  role: string | null;
  action: string;
  detail: string | null;
  reason: string | null;
}

export interface PlayerDetail extends PlayerListItem {
  dob: string;
  age: number;
  minor: boolean;
  guardian: { email: string | null; confirmedAt: string | null } | null;
  stagePinned: boolean;
  tourPlayerId: string | null;
  itfId: string | null;
  verification: string;
  verificationSource: string | null;
  homeCurrency: string;
  timezone: string;
  languages: string[];
  signedUpAt: string;
  signUpChannel: string;
  billingCycle: string | null;
  trialEndsAt: string | null;
  comp: { tier: string; until: string | null } | null;
  deletionEffectiveAt: string | null;
  agentSchedule: { paused: string[]; allPaused: boolean };
  modelSpendUsd: number;
  shareLinks: Array<{
    id: string;
    scope: string;
    createdAt: string;
    expiresAt: string;
    revoked: boolean;
    lastOpenedAt: string | null;
    openCount: number;
  }>;
  auditLog: AuditEntry[];
}

export interface AgentHealth {
  stats: {
    runsToday: number;
    scheduledToday: number;
    onDemandToday: number;
    failedToday: number;
    openFailures: number;
    p50Ms: number | null;
    p95Ms: number | null;
    costTodayAud: number | null;
    costPerRunAud: number | null;
  };
  agents: Array<{
    name: string;
    label: string;
    cadence: string;
    pausable: boolean;
    paused: boolean;
    runs7d: number;
    successRate: number | null;
    p50Ms: number | null;
    costPerRunAud: number | null;
    approvalRate: number | null;
    dismissRate: number | null;
    underThreshold: boolean;
  }>;
  failures: Array<{
    id: string;
    agent: string;
    agentName: string;
    playerId: string;
    playerName: string;
    attempts: number;
    error: string;
    firstFailedAt: string;
    exhausted: boolean;
    playerToldAt: string | null;
  }>;
  queues: { transcriptionBacklog: number };
  runsPerHour: Array<{ hour: number; completed: number; failed: number }>;
  providers: Array<{
    key: string;
    label: string;
    detail: string;
    wired: boolean;
    state: 'on' | 'off';
    changedAt: string | null;
    dependents: string[];
  }> | null;
}

export interface Money {
  mrr: {
    totalAud: number;
    proAud: number;
    eliteAud: number;
    pro: number;
    elite: number;
    annual: number;
    basis: string;
  };
  platformFee: Array<{ currency: string; gross: number; fee: number; stripeFee: number }>;
  feeBasis: string;
  spend: {
    totalAud: number;
    perPayingPlayerAud: number | null;
    capAud: number;
    payingPlayers: number;
    categories: { transcription: number; drafting: number; other: number };
    rateNote: string;
  };
  pastDue: number;
  waitlists: Array<{
    playerId: string;
    name: string;
    patrons: number;
    waiting: number;
    since: string | null;
  }>;
  payouts: Array<{
    id: string;
    playerName: string;
    week: string;
    net: number;
    currency: string;
    status: string;
    paidAt: string | null;
  }>;
  reconciliation: {
    checkedAt: string;
    lines: Array<{ currency: string; stripeMinor: number; ledgerMinor: number; matched: boolean }>;
    error: string | null;
  };
}

export interface Trust {
  cases: Array<{
    id: string;
    kind: string;
    playerId: string;
    playerName: string;
    openedAt: string;
    rule: string;
    excerpt: string;
    dueAt: string | null;
    cardShownConfirmedAt: string | null;
    escalatedAt: string | null;
    overdue: boolean;
  }>;
  distressCardsThisMonth: number;
  deletions: Array<{
    playerId: string;
    name: string;
    requestedAt: string | null;
    effectiveAt: string;
    daysLeft: number;
  }>;
  exports: Array<{
    playerId: string;
    name: string;
    requestedAt: string;
    deliveredAt: string | null;
  }>;
}

export interface Alert {
  id: string;
  kind: string;
  category: 'act' | 'fyi';
  title: string;
  body: string;
  link: string | null;
  roleOwner: string | null;
  acknowledgedAt: string | null;
  createdAt: string;
}

export interface AdminAudit {
  entries: Array<{
    id: string;
    at: string;
    adminName: string | null;
    role: string;
    action: string;
    playerName: string | null;
    consequence: string;
    reason: string | null;
  }>;
  admins: Array<{ id: string; name: string; role: string }>;
}

export interface RoutingRow {
  kind: string;
  label: string;
  category: 'act' | 'fyi';
  owner: string;
  routes: Array<{ role: 'support' | 'ops' | 'owner'; push: boolean; email: boolean }>;
}

// Ingestion (step 3.1's shapes, unchanged).
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
  tournaments?: { name: string } | null;
}
