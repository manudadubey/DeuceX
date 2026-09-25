import { Badge, Card, CardHeader, CardTitle, Empty } from '@deucex/ui';
import { formatPatronMoney } from '@deucex/agents';

// PRD-12 §4.9/§10, M-SHARE-1/M-SHARE-2. Server-fetched (no client bundle,
// no CORS concern — this is server-to-server, not a browser request): the
// one legitimate no-bearer-token call anywhere in this app, since a coach
// or manager visitor has no Supabase session. apps/api's GET /sharing/:token
// is the only thing that knows which fields belong to which scope; this
// page just renders whichever DTO shape comes back.
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787';

interface CoachMatchNote {
  recordedAt: string;
  result: string | null;
  opponent: string | null;
  tags: unknown;
  summary: string | null;
}

interface CoachPattern {
  statement: string;
  kind: string;
  confidence: string;
}

interface CoachViewData {
  scope: 'coach';
  playerName: string;
  matches: CoachMatchNote[];
  patterns: CoachPattern[];
}

interface ManagerExpenseLine {
  date: string;
  category: string;
  what: string;
  amountHome: number;
}

interface ManagerViewData {
  scope: 'manager';
  playerName: string;
  homeCurrency: string;
  reserves: number;
  /** null means steady (net burn zero or negative) — the API converts Infinity to null since JSON has no Infinity. */
  runwayWeeks: number | null;
  runwayColour: 'green' | 'amber' | 'red';
  netBurn: number;
  monthlyPnl: { income: number; spend: number; net: number };
  expenses: ManagerExpenseLine[];
  /** Step 4.1 (PRD-04 section 10, M-SHARE-2): patron health and payouts, never drafted notes or the open strip. */
  patrons: {
    active: number;
    byTier: Array<{ name: string; count: number }>;
    retentionPercent: number | null;
    averageTenureMonths: number | null;
    mrr: number;
    events: Array<{ kind: string; at: string; title: string }>;
    payouts: Array<{
      friday: string;
      gross: number;
      platformFee: number;
      stripeFee: number;
      net: number;
      currency: string;
      status: string;
    }>;
  };
}

type ShareViewData = CoachViewData | ManagerViewData;

async function fetchShareView(token: string): Promise<ShareViewData | null> {
  try {
    const res = await fetch(`${API_URL}/sharing/${encodeURIComponent(token)}`, {
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as ShareViewData;
  } catch {
    return null;
  }
}

function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

function CoachView({ data }: { data: CoachViewData }) {
  return (
    <div className="flex w-full max-w-lg flex-col gap-4">
      <div>
        <h1 className="text-base font-medium">{data.playerName}</h1>
        <p className="text-sm text-muted-foreground">
          Match data, Match Scribe summaries (not transcripts), Mindset patterns. Never money, never
          mood-by-date.
        </p>
      </div>

      <Card className="gap-3 p-4">
        <CardHeader className="p-0">
          <CardTitle>Recent matches</CardTitle>
        </CardHeader>
        {data.matches.length === 0 ? (
          <Empty title="Nothing shared yet">Match results appear here once shared.</Empty>
        ) : (
          <div className="flex flex-col gap-2">
            {data.matches.map((m) => (
              <div key={m.recordedAt} className="rounded-lg bg-secondary/50 p-3 text-sm">
                <div className="font-medium">
                  {m.result ?? 'Result pending'}
                  {m.opponent ? ` vs ${m.opponent}` : ''}
                </div>
                {m.summary && <div className="text-muted-foreground">{m.summary}</div>}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="gap-3 p-4">
        <CardHeader className="p-0">
          <CardTitle>Patterns from the notes</CardTitle>
        </CardHeader>
        {data.patterns.length === 0 ? (
          <Empty title="No patterns yet" />
        ) : (
          <div className="flex flex-col gap-2">
            {data.patterns.map((p) => (
              <div key={p.statement} className="rounded-lg bg-secondary/50 p-3 text-sm">
                {p.statement}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="gap-3 p-4 opacity-60">
        <CardHeader className="p-0">
          <CardTitle>Tournament shortlist &amp; Conditions</CardTitle>
        </CardHeader>
        <Empty title="Not available yet">Arrives with the Tournament Agent and Conditions.</Empty>
      </Card>
    </div>
  );
}

function ManagerView({ data }: { data: ManagerViewData }) {
  return (
    <div className="flex w-full max-w-lg flex-col gap-4">
      <div>
        <h1 className="text-base font-medium">{data.playerName}</h1>
        <p className="text-sm text-muted-foreground">
          Runway, reserves, P&amp;L, expenses and patron health. No agent outputs, no notes.
        </p>
      </div>

      <Card className="gap-3 p-4">
        <CardHeader className="p-0">
          <CardTitle>Runway</CardTitle>
        </CardHeader>
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-2xl font-medium">
            {data.runwayWeeks === null ? 'Steady' : `${data.runwayWeeks.toFixed(1)} wks`}
          </span>
          <Badge
            variant={
              data.runwayColour === 'green'
                ? 'ok'
                : data.runwayColour === 'amber'
                  ? 'warn'
                  : 'danger'
            }
          >
            {data.runwayColour}
          </Badge>
        </div>
        <div className="text-sm text-muted-foreground">
          Reserves {formatMoney(data.reserves, data.homeCurrency)} · net burn{' '}
          {formatMoney(data.netBurn, data.homeCurrency)}/wk
        </div>
      </Card>

      <Card className="gap-3 p-4">
        <CardHeader className="p-0">
          <CardTitle>This month&apos;s P&amp;L</CardTitle>
        </CardHeader>
        <div className="text-sm">
          In {formatMoney(data.monthlyPnl.income, data.homeCurrency)} · out{' '}
          {formatMoney(data.monthlyPnl.spend, data.homeCurrency)} · net{' '}
          {formatMoney(data.monthlyPnl.net, data.homeCurrency)}
        </div>
      </Card>

      <Card className="gap-3 p-4">
        <CardHeader className="p-0">
          <CardTitle>Expenses</CardTitle>
        </CardHeader>
        {data.expenses.length === 0 ? (
          <Empty title="No expenses yet" />
        ) : (
          <div className="flex flex-col gap-1.5 text-sm">
            {data.expenses.map((e) => (
              <div key={`${e.date}-${e.what}`} className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">
                  {e.date} · {e.what}
                </span>
                <span className="font-mono">{formatMoney(e.amountHome, data.homeCurrency)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="gap-3 p-4">
        <CardHeader className="p-0">
          <CardTitle>Patrons</CardTitle>
        </CardHeader>
        <div className="text-sm">
          {data.patrons.active} active
          {data.patrons.byTier.length
            ? ` · ${data.patrons.byTier.map((t) => `${t.name} ${t.count}`).join(' · ')}`
            : ''}
        </div>
        <div className="text-sm text-muted-foreground">
          Kept over 12 months{' '}
          {data.patrons.retentionPercent === null ? '–' : `${data.patrons.retentionPercent}%`} ·
          average{' '}
          {data.patrons.averageTenureMonths === null
            ? '–'
            : data.patrons.averageTenureMonths.toFixed(1)}{' '}
          months · MRR {formatPatronMoney(data.patrons.mrr, data.homeCurrency)} gross
        </div>
        {data.patrons.events.length ? (
          <div className="flex flex-col gap-1 text-sm">
            {data.patrons.events.map((e) => (
              <div key={`${e.at}-${e.title}`} className="flex justify-between gap-2">
                <span>{e.title}</span>
                <span className="font-mono text-muted-foreground">{e.at.slice(0, 10)}</span>
              </div>
            ))}
          </div>
        ) : null}
      </Card>

      <Card className="gap-3 p-4">
        <CardHeader className="p-0">
          <CardTitle>Payouts</CardTitle>
        </CardHeader>
        {data.patrons.payouts.length === 0 ? (
          <Empty title="No payouts yet" />
        ) : (
          <div className="flex flex-col gap-1.5 text-sm">
            {data.patrons.payouts.map((p) => (
              <div key={p.friday} className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">
                  {p.friday} · {formatPatronMoney(p.gross, p.currency)} gross, −
                  {formatPatronMoney(p.platformFee, p.currency)} fee, −
                  {formatPatronMoney(p.stripeFee, p.currency)} Stripe
                </span>
                <span className="font-mono">
                  {formatPatronMoney(p.net, p.currency)} · {p.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

export default async function CoachViewPage({ params }: { params: { token: string } }) {
  const data = await fetchShareView(params.token);

  if (!data) {
    return (
      <div className="text-center">
        <h1 className="text-base font-medium">Coach view</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          This link isn&apos;t valid or has expired.
        </p>
      </div>
    );
  }

  return data.scope === 'coach' ? <CoachView data={data} /> : <ManagerView data={data} />;
}
