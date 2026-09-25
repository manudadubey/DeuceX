'use client';

import { useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
  Switch,
  ToggleGroup,
  ToggleGroupItem,
} from '@deucex/ui';
import {
  DEFAULT_AGENT_TOGGLES,
  type AgentToggles,
  type Player,
  type PlayerBillingCycle,
  type PlayerHanded,
  type PlayerPlan,
  type PlayerSurface,
  type PlayerTour,
  detectStage,
  isMinor,
} from '@deucex/db';
import {
  lookupRanking as defaultLookupRanking,
  type RankingCandidate,
  type RankingLookupInput,
  type RankingLookupResult,
} from '@/lib/onboarding/rankings-api';
import { createClient } from '@/lib/supabase/client';
import type { FinishOnboardingFormInput } from '@/app/(onboarding)/onboarding/actions';

const COUNTRIES = [
  'Austria',
  'Australia',
  'Germany',
  'Italy',
  'Spain',
  'China',
  'United States',
  'Other',
] as const;

const SURFACES: { value: PlayerSurface; label: string }[] = [
  { value: 'clay', label: 'Clay' },
  { value: 'hard', label: 'Hard' },
  { value: 'indoor_hard', label: 'Indoor hard' },
  { value: 'grass', label: 'Grass' },
];

const STEPS = [
  { n: 1, title: 'You and your ranking', sub: 'Verified from ATP and ITF' },
  { n: 2, title: 'This season', sub: 'Goals, surfaces, budget' },
  { n: 3, title: 'Plan', sub: 'Free, Pro or Elite' },
  { n: 4, title: 'First agent', sub: 'Your first shortlist Sunday' },
] as const;

interface ResolvedVerification {
  verification: 'verified' | 'unverified';
  source: string | null;
  tourRank: number | null;
  tourPoints: number | null;
  itfRank: number | null;
  wtn: number | null;
}

const UNVERIFIED: ResolvedVerification = {
  verification: 'unverified',
  source: null,
  tourRank: null,
  tourPoints: null,
  itfRank: null,
  wtn: null,
};

function rankGapSentence(currentRank: number | null, target: number): string {
  if (currentRank === null) return 'Your ranking target and how far it is are shown once verified.';
  const gap = currentRank - target;
  if (gap <= 0) return "That's at or below where you are. Aim a little higher?";
  if (gap >= 60)
    return `From #${currentRank}. Roughly ${gap} more points; a Challenger semi and a couple of quarters.`;
  if (gap >= 25)
    return `From #${currentRank}. Roughly ${gap} more points; two Challenger quarter-finals.`;
  return `From #${currentRank}. Roughly ${gap} more points; one good Challenger week.`;
}

function budgetSentence(value: number): string {
  if (value < 800) {
    return `At A$${value.toLocaleString()} a week, expect ITF M25s within a short flight and Challengers only by train. Prize cheques will matter more than points.`;
  }
  if (value < 1600) {
    return `At A$${value.toLocaleString()} a week, most Challenger 75s in Europe are in reach; two-flight trips and paid coach blocks will be flagged.`;
  }
  return `At A$${value.toLocaleString()} a week, Challenger 100s with a coach block are realistic. The agent will still rank by cost-to-prize.`;
}

const PLAN_PRICES: Record<PlayerPlan, { monthly: number; annual: number }> = {
  free: { monthly: 0, annual: 0 },
  pro: { monthly: 49, annual: 39 },
  elite: { monthly: 149, annual: 119 },
};

export interface OnboardingWizardProps {
  email: string;
  existingPlayer: Player | null;
  onFinish: (input: FinishOnboardingFormInput) => Promise<void>;
  /** Injectable for tests; defaults to the real apps/api call. */
  lookupRankingFn?: (input: RankingLookupInput) => Promise<RankingLookupResult>;
}

export function OnboardingWizard({
  email,
  existingPlayer,
  onFinish,
  lookupRankingFn,
}: OnboardingWizardProps) {
  const supabase = useMemo(() => createClient(), []);
  const onboardingStartedAt = useMemo(() => new Date().toISOString(), []);

  const [step, setStep] = useState(1);
  const [maxStepReached, setMaxStepReached] = useState(1);

  // Step 1
  const [name, setName] = useState(existingPlayer?.name ?? '');
  const [country, setCountry] = useState(existingPlayer?.country ?? 'Australia');
  const [dob, setDob] = useState(existingPlayer?.dob ?? '');
  const [handed, setHanded] = useState<PlayerHanded>(
    (existingPlayer?.handed as PlayerHanded) ?? 'right',
  );
  const [tour, setTour] = useState<PlayerTour>((existingPlayer?.tour as PlayerTour) ?? 'atp');
  const [tourPlayerId, setTourPlayerId] = useState(existingPlayer?.tour_player_id ?? '');
  const [itfId, setItfId] = useState(existingPlayer?.itf_id ?? '');
  const [guardianEmail, setGuardianEmail] = useState(existingPlayer?.guardian_email ?? '');
  const [lookupPhase, setLookupPhase] = useState<'idle' | 'loading' | 'ambiguous' | 'resolved'>(
    existingPlayer ? 'resolved' : 'idle',
  );
  const [candidates, setCandidates] = useState<RankingCandidate[]>([]);
  const [resolved, setResolved] = useState<ResolvedVerification>(
    existingPlayer
      ? {
          verification: existingPlayer.verification === 'verified' ? 'verified' : 'unverified',
          source: existingPlayer.verification_source,
          tourRank: existingPlayer.tour_rank,
          tourPoints: existingPlayer.tour_points,
          itfRank: existingPlayer.itf_rank,
          wtn: existingPlayer.wtn,
        }
      : UNVERIFIED,
  );
  const [stageOverride, setStageOverride] = useState<'auto' | '1' | '2' | '3'>(
    existingPlayer?.stage_pinned ? ((existingPlayer.stage as '1' | '2' | '3') ?? 'auto') : 'auto',
  );

  const minor = dob ? isMinor(dob) : false;
  const detectedStage = detectStage(resolved.tourRank);
  const finalStage = stageOverride === 'auto' ? detectedStage : stageOverride;
  const stagePinned = stageOverride !== 'auto';

  // Step 2
  const [targetRank, setTargetRank] = useState(existingPlayer?.target_rank ?? 400);
  const [keyTournaments, setKeyTournaments] = useState(
    (existingPlayer?.key_tournaments ?? []).join(', ') ||
      'Challenger Poznań, Challenger Bratislava',
  );
  const [surfaces, setSurfaces] = useState<PlayerSurface[]>(
    existingPlayer?.surfaces?.length
      ? (existingPlayer.surfaces as PlayerSurface[])
      : ['clay', 'hard'],
  );
  const [weeklyBudget, setWeeklyBudget] = useState(existingPlayer?.weekly_budget ?? 1200);
  const [blockedDates, setBlockedDates] = useState(existingPlayer?.blocked_dates ?? '');

  // Step 3
  const [billingCycle, setBillingCycle] = useState<PlayerBillingCycle>(
    (existingPlayer?.billing_cycle as PlayerBillingCycle) ?? 'monthly',
  );
  const [plan, setPlan] = useState<PlayerPlan>((existingPlayer?.tier as PlayerPlan) ?? 'pro');

  // Step 4
  const [agents, setAgents] = useState<AgentToggles>(DEFAULT_AGENT_TOGGLES);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const goTo = (n: number) => {
    setStep(n);
    setMaxStepReached((m) => Math.max(m, n));
  };

  const runLookup = async () => {
    setLookupPhase('loading');
    setError(null);
    try {
      const fn =
        lookupRankingFn ?? ((input: RankingLookupInput) => defaultLookupRanking(supabase, input));
      const result = await fn({
        tour,
        tourPlayerId: tourPlayerId || null,
        itfId: itfId || null,
        name,
        country,
      });
      if (result.status === 'ambiguous') {
        setCandidates(result.candidates);
        setLookupPhase('ambiguous');
        return;
      }
      if (result.status === 'verified') {
        setResolved({
          verification: 'verified',
          source: result.source,
          tourRank: result.tourRank,
          tourPoints: result.tourPoints,
          itfRank: result.itfRank,
          wtn: result.wtn,
        });
      } else {
        setResolved(UNVERIFIED);
      }
      setLookupPhase('resolved');
    } catch {
      setError('Ranking lookup failed. You can continue unverified and try again from Settings.');
      setResolved(UNVERIFIED);
      setLookupPhase('resolved');
    }
  };

  const chooseCandidate = (candidate: RankingCandidate | null) => {
    setResolved(
      candidate
        ? {
            verification: 'verified',
            source: 'Chosen from candidates',
            tourRank: candidate.tourRank,
            tourPoints: null,
            itfRank: candidate.itfRank,
            wtn: null,
          }
        : UNVERIFIED,
    );
    setLookupPhase('resolved');
  };

  const step1Ready = Boolean(name && country && dob && (tourPlayerId || itfId));
  const guardianOk = !minor || Boolean(guardianEmail);

  const continueStep1 = async () => {
    if (!step1Ready) return;
    if (lookupPhase === 'idle') {
      await runLookup();
      return;
    }
    if (lookupPhase !== 'resolved') return;
    if (!guardianOk) return;
    goTo(2);
  };

  const finish = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await onFinish({
        name,
        country,
        dob,
        handed,
        tour,
        tourPlayerId: tourPlayerId || null,
        itfId: itfId || null,
        verification: resolved.verification,
        verificationSource: resolved.source,
        tourRank: resolved.tourRank,
        tourPoints: resolved.tourPoints,
        itfRank: resolved.itfRank,
        wtn: resolved.wtn,
        stage: finalStage,
        stagePinned,
        targetRank,
        keyTournaments: keyTournaments
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        surfaces,
        weeklyBudget,
        blockedDates: blockedDates || null,
        plan,
        billingCycle,
        agents,
        guardianEmail: guardianEmail || null,
        onboardingStartedAt,
      });
      // onFinish redirects on success; nothing else to do here.
    } catch (err) {
      setSubmitting(false);
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <nav
        aria-label="Onboarding steps"
        className="flex flex-wrap items-center justify-center gap-1"
      >
        {STEPS.map((s) => {
          const done = s.n < step;
          const now = s.n === step;
          const reachable = s.n <= maxStepReached;
          return (
            <button
              key={s.n}
              type="button"
              disabled={!reachable}
              onClick={() => reachable && goTo(s.n)}
              className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-left ${now ? 'bg-sidebar-accent' : ''} disabled:cursor-default`}
            >
              <span
                className={`flex size-7 items-center justify-center rounded-full text-xs font-medium ${
                  done
                    ? 'bg-chart-2 text-background'
                    : now
                      ? 'bg-foreground text-background'
                      : 'bg-muted text-muted-foreground'
                }`}
              >
                {done ? '✓' : s.n}
              </span>
              <span className="text-[0.8125rem] font-medium whitespace-nowrap">{s.title}</span>
            </button>
          );
        })}
      </nav>
      <p className="max-w-[56ch] self-center text-center text-[0.8125rem] leading-relaxed text-muted-foreground">
        Your email is verified ({email}). Everything here can be changed later in Settings; nothing
        is shown publicly until you build your profile page.
      </p>

      {error && (
        <p role="alert" className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      {step === 1 && (
        <Card className="gap-6 p-6">
          <div className="flex flex-col gap-1">
            <h1 className="text-lg font-medium tracking-tight text-balance">Who&apos;s playing?</h1>
            <p className="max-w-[60ch] text-sm text-muted-foreground">
              Your ranking comes from the official feeds, so the agents work from real numbers.
              Enter either ID and we&apos;ll find the rest.
            </p>
          </div>

          <FieldGroup>
            <div className="grid grid-cols-2 gap-4 max-sm:grid-cols-1">
              <Field>
                <FieldLabel htmlFor="ob-name">Full name</FieldLabel>
                <Input id="ob-name" value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
              <Field>
                <FieldLabel htmlFor="ob-country">Country</FieldLabel>
                <Select value={country} onValueChange={setCountry}>
                  <SelectTrigger id="ob-country">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COUNTRIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="ob-dob">Date of birth</FieldLabel>
                <Input
                  id="ob-dob"
                  type="date"
                  value={dob}
                  onChange={(e) => setDob(e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel>Plays</FieldLabel>
                <ToggleGroup
                  type="single"
                  value={handed}
                  onValueChange={(v) => v && setHanded(v as PlayerHanded)}
                  aria-label="Playing hand"
                >
                  <ToggleGroupItem value="right">Right-handed</ToggleGroupItem>
                  <ToggleGroupItem value="left">Left-handed</ToggleGroupItem>
                </ToggleGroup>
              </Field>
            </div>

            {minor && (
              <Field>
                <FieldLabel htmlFor="ob-guardian">
                  Guardian email <small>· required for players under 18</small>
                </FieldLabel>
                <Input
                  id="ob-guardian"
                  type="email"
                  value={guardianEmail}
                  onChange={(e) => setGuardianEmail(e.target.value)}
                  placeholder="guardian@example.com"
                />
                <FieldDescription>
                  Your guardian will receive the manager link by default, and your public profile
                  stays off until they confirm.
                </FieldDescription>
              </Field>
            )}

            <Field>
              <FieldLabel>Tour</FieldLabel>
              <ToggleGroup
                type="single"
                value={tour}
                onValueChange={(v) => v && setTour(v as PlayerTour)}
                aria-label="Tour"
              >
                <ToggleGroupItem value="atp">ATP</ToggleGroupItem>
                <ToggleGroupItem value="wta">WTA</ToggleGroupItem>
              </ToggleGroup>
            </Field>

            <div className="grid grid-cols-2 gap-4 max-sm:grid-cols-1">
              <Field>
                <FieldLabel htmlFor="ob-tour-id">
                  {tour === 'atp' ? 'ATP' : 'WTA'} player ID <small>· optional</small>
                </FieldLabel>
                <div className="flex gap-2">
                  <Input
                    id="ob-tour-id"
                    value={tourPlayerId}
                    onChange={(e) => {
                      setTourPlayerId(e.target.value);
                      setLookupPhase('idle');
                    }}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={(!tourPlayerId && !itfId) || lookupPhase === 'loading'}
                    onClick={runLookup}
                  >
                    {lookupPhase === 'loading' ? <Spinner className="size-3.5" /> : 'Look up'}
                  </Button>
                </div>
              </Field>
              <Field>
                <FieldLabel htmlFor="ob-itf-id">
                  ITF player ID <small>· optional</small>
                </FieldLabel>
                <Input
                  id="ob-itf-id"
                  value={itfId}
                  onChange={(e) => {
                    setItfId(e.target.value);
                    setLookupPhase('idle');
                  }}
                />
              </Field>
            </div>

            {lookupPhase === 'ambiguous' && (
              <div className="flex flex-col gap-2 rounded-lg bg-surface p-3 shadow-[0_0_0_1px_var(--border)]">
                <p className="text-sm font-medium">More than one match. Which one is you?</p>
                {candidates.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => chooseCandidate(c)}
                    className="flex items-center justify-between rounded-md bg-card px-3 py-2 text-left text-sm shadow-[0_0_0_1px_var(--border)] hover:bg-accent"
                  >
                    <span>
                      {c.name} <span className="text-muted-foreground">· {c.country}</span>
                    </span>
                    <span className="text-muted-foreground">
                      {c.tourRank ? `#${c.tourRank}` : c.itfRank ? `ITF #${c.itfRank}` : ''}
                    </span>
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => chooseCandidate(null)}
                  className="text-left text-sm text-muted-foreground underline"
                >
                  None of these — continue unverified
                </button>
              </div>
            )}

            {lookupPhase === 'resolved' && resolved.verification === 'verified' && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-3 rounded-lg bg-surface px-3.5 py-3 text-sm shadow-[0_0_0_1px_var(--border)]">
                  <span className="text-ok">✓</span>
                  <div className="flex-1">
                    <div className="font-medium">
                      {tour.toUpperCase()} #{resolved.tourRank}
                      {resolved.tourPoints ? ` · ${resolved.tourPoints} points` : ''}
                    </div>
                    {resolved.itfRank && (
                      <div className="text-xs text-muted-foreground">ITF #{resolved.itfRank}</div>
                    )}
                    {resolved.source && (
                      <div className="text-xs text-muted-foreground">{resolved.source}</div>
                    )}
                  </div>
                  <Badge variant="ok">Verified</Badge>
                </div>
                <div className="flex items-center justify-between gap-4 rounded-lg bg-chart-2/8 px-4 py-3.5 shadow-[0_0_0_1px_oklch(from_var(--chart-2)_l_c_h_/_35%)]">
                  <div>
                    <div className="font-medium">
                      Stage {finalStage} ·{' '}
                      {finalStage === '1'
                        ? 'Building'
                        : finalStage === '2'
                          ? 'Emerging'
                          : 'Established'}
                    </div>
                    <div className="text-[0.8125rem] text-muted-foreground">
                      Detected from your {tour.toUpperCase()} ranking. Change it if that looks
                      wrong.
                    </div>
                  </div>
                  <Select
                    value={stageOverride}
                    onValueChange={(v) => setStageOverride(v as typeof stageOverride)}
                  >
                    <SelectTrigger aria-label="Career stage" className="w-44">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">Auto · Stage {detectedStage}</SelectItem>
                      <SelectItem value="1">Stage 1 · Building</SelectItem>
                      <SelectItem value="2">Stage 2 · Emerging</SelectItem>
                      <SelectItem value="3">Stage 3 · Established</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {lookupPhase === 'resolved' && resolved.verification === 'unverified' && (
              <div className="flex items-center gap-3 rounded-lg bg-surface px-3.5 py-3 text-sm shadow-[0_0_0_1px_var(--border)]">
                <Badge variant="secondary">Unverified</Badge>
                <span className="text-muted-foreground">
                  We couldn&apos;t match a ranking yet. You can continue — your dashboard and public
                  profile stay unverified until support or a later lookup confirms it.
                </span>
              </div>
            )}
          </FieldGroup>

          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-6">
            <Button
              disabled={
                !step1Ready ||
                lookupPhase === 'loading' ||
                (lookupPhase === 'resolved' && !guardianOk)
              }
              onClick={continueStep1}
            >
              {lookupPhase === 'idle' || lookupPhase === 'loading'
                ? 'Look up and continue'
                : 'Continue'}
            </Button>
            <span className="ml-auto text-[0.8125rem] text-muted-foreground">
              {!guardianOk
                ? 'A guardian email is required for players under 18.'
                : lookupPhase === 'idle'
                  ? "We'll look up your ranking from the IDs above."
                  : lookupPhase === 'ambiguous'
                    ? 'Choose a match above to continue.'
                    : 'Stage detected. Continue when it looks right.'}
            </span>
          </div>
        </Card>
      )}

      {step === 2 && (
        <Card className="gap-6 p-6">
          <div className="flex flex-col gap-1">
            <h1 className="text-lg font-medium tracking-tight text-balance">
              What does this season look like?
            </h1>
            <p className="max-w-[60ch] text-sm text-muted-foreground">
              The Tournament Agent builds every shortlist from these four things. Rough is fine; you
              can tune them any Sunday.
            </p>
          </div>

          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="ob-target">Ranking target · end of season</FieldLabel>
              <Input
                id="ob-target"
                type="number"
                value={targetRank}
                onChange={(e) => setTargetRank(Number(e.target.value) || 0)}
              />
              <FieldDescription>{rankGapSentence(resolved.tourRank, targetRank)}</FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="ob-tournaments">
                Key tournaments <small>· optional</small>
              </FieldLabel>
              <Input
                id="ob-tournaments"
                value={keyTournaments}
                onChange={(e) => setKeyTournaments(e.target.value)}
              />
              <FieldDescription>
                The agent protects these weeks and plans travel around them.
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel>Surfaces you&apos;ll enter</FieldLabel>
              <ToggleGroup
                type="multiple"
                value={surfaces}
                onValueChange={(v) => setSurfaces(v as PlayerSurface[])}
                aria-label="Surfaces"
              >
                {SURFACES.map((s) => (
                  <ToggleGroupItem key={s.value} value={s.value}>
                    {s.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </Field>

            <Field>
              <FieldLabel htmlFor="ob-budget">
                Weekly budget <small>· travel, stay, coaching, entries</small>
              </FieldLabel>
              <div className="flex items-center gap-4">
                <input
                  id="ob-budget"
                  type="range"
                  min={400}
                  max={3000}
                  step={50}
                  value={weeklyBudget}
                  onChange={(e) => setWeeklyBudget(Number(e.target.value))}
                  className="w-full accent-foreground"
                />
                <span className="font-mono text-lg font-medium whitespace-nowrap">
                  A${weeklyBudget.toLocaleString()}
                </span>
              </div>
              <FieldDescription>{budgetSentence(weeklyBudget)}</FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="ob-blocked">
                Blocked dates <small>· optional</small>
              </FieldLabel>
              <Input
                id="ob-blocked"
                value={blockedDates}
                onChange={(e) => setBlockedDates(e.target.value)}
              />
            </Field>
          </FieldGroup>

          <div className="flex items-center gap-2 border-t border-border pt-6">
            <Button variant="outline" onClick={() => goTo(1)}>
              Back
            </Button>
            <Button onClick={() => goTo(3)}>Continue</Button>
          </div>
        </Card>
      )}

      {step === 3 && (
        <Card className="gap-6 p-6">
          <div className="flex flex-col gap-1">
            <h1 className="text-lg font-medium tracking-tight text-balance">Pick a plan</h1>
            <p className="max-w-[60ch] text-sm text-muted-foreground">
              Start free and upgrade when an agent earns it. Paid plans go through Stripe; cancel
              any time.
            </p>
          </div>

          <div className="flex justify-end">
            <ToggleGroup
              type="single"
              value={billingCycle}
              onValueChange={(v) => v && setBillingCycle(v as PlayerBillingCycle)}
              aria-label="Billing cycle"
            >
              <ToggleGroupItem value="monthly">Monthly</ToggleGroupItem>
              <ToggleGroupItem value="annual">Yearly · 2 months free</ToggleGroupItem>
            </ToggleGroup>
          </div>

          <div className="grid grid-cols-3 gap-3 max-sm:grid-cols-1">
            {(['free', 'pro', 'elite'] as const).map((p) => {
              const price = PLAN_PRICES[p][billingCycle === 'monthly' ? 'monthly' : 'annual'];
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPlan(p)}
                  className={`flex flex-col gap-2.5 rounded-lg bg-card p-4 text-left shadow-[0_0_0_1px_var(--border)] ${
                    plan === p ? 'shadow-[0_0_0_2px_var(--foreground)]' : ''
                  }`}
                >
                  <div className="flex items-center justify-between text-sm font-medium capitalize">
                    {p}
                    {p === 'pro' && <Badge variant="lime">Stage 1 and 2</Badge>}
                  </div>
                  <div className="text-2xl font-medium tracking-tight">
                    A${price}
                    {p !== 'free' && (
                      <small className="text-[0.8125rem] font-normal text-muted-foreground">
                        {' '}
                        / month
                      </small>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          <p className="text-[0.8125rem] text-muted-foreground">
            {plan === 'free'
              ? 'Free is a real plan, not a trial. Upgrade when you want the patron programme, the Financial Agent or the Mindset Coach.'
              : "Pro and Elite start a 14-day trial. We'll ask for a card on day 12, on Stripe's page, never here."}
          </p>

          <div className="flex items-center gap-2 border-t border-border pt-6">
            <Button variant="outline" onClick={() => goTo(2)}>
              Back
            </Button>
            <Button onClick={() => goTo(4)}>
              {plan === 'free' ? 'Continue' : 'Start 14-day trial · no card'}
            </Button>
          </div>
        </Card>
      )}

      {step === 4 && (
        <Card className="gap-6 p-6">
          <div className="flex flex-col gap-1">
            <h1 className="text-lg font-medium tracking-tight text-balance">
              Start your first agent
            </h1>
            <p className="max-w-[60ch] text-sm text-muted-foreground">
              The Tournament Agent runs every Sunday at 20:00 UTC. Turn it on and your first
              shortlist is waiting tomorrow morning.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            {(
              [
                {
                  key: 'tournament',
                  label: 'Tournament Agent',
                  desc: 'Scans the calendar against your budget and blocked weeks. Five picks, ranked by cost-to-prize.',
                },
                {
                  key: 'content',
                  label: 'Content Agent',
                  desc: 'Drafts a patron update within 30 minutes of each Match Scribe note. You approve every one.',
                },
                {
                  key: 'financial',
                  label: 'Financial Agent',
                  desc: "Runs daily at 07:00 UTC once you enter a starting balance. We'll ask on the dashboard.",
                },
                {
                  key: 'mindset',
                  label: 'Mindset Coach',
                  desc: 'Starts after your third Match Scribe note. It needs something to read first.',
                },
              ] as const
            ).map((a) => (
              <div
                key={a.key}
                className="flex items-center gap-3.5 rounded-lg bg-secondary/50 px-4 py-3.5"
              >
                <div className="flex-1">
                  <div className="font-medium">{a.label}</div>
                  <div className="text-[0.8125rem] text-muted-foreground">{a.desc}</div>
                </div>
                <Switch
                  checked={agents[a.key]}
                  onCheckedChange={(v) => setAgents((prev) => ({ ...prev, [a.key]: v }))}
                  aria-label={a.label}
                />
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2 border-t border-border pt-6">
            <Button variant="outline" onClick={() => goTo(3)} disabled={submitting}>
              Back
            </Button>
            <Button onClick={finish} disabled={submitting}>
              {submitting ? <Spinner className="size-3.5" /> : 'Open my dashboard'}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
