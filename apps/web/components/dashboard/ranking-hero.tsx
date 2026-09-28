import Link from 'next/link';
import { ArrowDown, ArrowUp, Clock } from 'lucide-react';
import { Badge, Card, FLAG_CODES, Flag, HelpMark, type FlagCode } from '@deucex/ui';
import { showDoublesChip, type Player, type RankingSnapshot } from '@deucex/db';
import { countryCode } from '@/lib/country';
import { RankChart, type RankChartDefence } from './rank-chart';

const STAGE_LABEL: Record<string, string> = {
  '1': 'Building',
  '2': 'Emerging',
  '3': 'Established',
};

const STAGE_TIP: Record<string, string> = {
  '1': 'Career stage, detected from your verified ranking. Stage 1 means your ITF ranking and WTN lead while the tour number builds. Change it in your profile.',
  '2': 'Career stage, detected from your verified ranking. Stage 2 (ATP ~450–800) means your tour number leads and ITF shows as a chip. Change it in your profile.',
  '3': 'Career stage, detected from your verified ranking. Stage 3 means your tour ranking leads everything. Change it in your profile.',
};

const FLAGGED = new Set<string>(FLAG_CODES);

const HANDED: Record<string, string> = { right: 'Right-handed', left: 'Left-handed' };

function ageFrom(dob: string, today: Date): number | null {
  const born = new Date(dob);
  if (Number.isNaN(born.getTime())) return null;
  let age = today.getUTCFullYear() - born.getUTCFullYear();
  const m = today.getUTCMonth() - born.getUTCMonth();
  if (m < 0 || (m === 0 && today.getUTCDate() < born.getUTCDate())) age -= 1;
  return age;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return (
    (
      (parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '')
    ).toUpperCase() || '?'
  );
}

// The prototype's ranking band (docs/deucex-dashboard.html `#ranking`): the
// player, the rank as the one big number, this week's move, the ITF and
// points-to-defend chips, and the 52-week trajectory beside it. Every figure
// comes from players and the player's own ranking_snapshots; the prototype's
// projected end-of-year line is left out because nothing computes one.
export function RankingHero({
  player,
  snapshots,
  defences,
  today,
}: {
  player: Player;
  /** The player's own snapshots for the last 52 weeks, oldest first. */
  snapshots: RankingSnapshot[];
  /** Singles points dropping off in the next eight weeks, soonest first. */
  defences: RankChartDefence[];
  today: Date;
}) {
  const stage = player.stage ?? '1';
  const verified = player.verification === 'verified';
  const tourLabel = player.tour.toUpperCase();
  const code = countryCode(player.country);
  const age = ageFrom(player.dob, today);
  const meta = [
    code ?? player.country,
    age != null ? String(age) : null,
    player.handed ? HANDED[player.handed] : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const withRank = snapshots.filter((s) => s.tour_singles_rank != null);
  const latest = withRank[withRank.length - 1] ?? null;
  const previous = withRank[withRank.length - 2] ?? null;
  const rank = latest?.tour_singles_rank ?? player.tour_rank;
  const points = latest?.tour_singles_points ?? player.tour_points;
  const move = latest && previous ? previous.tour_singles_rank! - latest.tour_singles_rank! : null;
  const doublesRank = latest?.tour_doubles_rank ?? null;
  const defendTotal = defences.reduce((sum, d) => sum + d.points, 0);

  // Unverified players get no line: the snapshots may belong to someone else's matched row.
  const chartPoints = verified
    ? withRank.map((s) => ({ week: s.week_start, rank: s.tour_singles_rank! }))
    : [];
  if (chartPoints.length === 0 && verified && rank != null) {
    chartPoints.push({ week: today.toISOString().slice(0, 10), rank });
  }

  return (
    <Card id="ranking" className="gap-0 py-6">
      {/* The prototype's .hero is 300px of content; this column also carries
          px-6 on both sides, so it is 300px + 2 x 24px. */}
      <div className="grid grid-cols-[21.75rem_1fr] max-[1100px]:grid-cols-1">
        <div className="flex flex-col gap-4 border-r border-border px-6 max-[1100px]:border-r-0 max-[1100px]:border-b max-[1100px]:pb-5">
          <div className="flex items-center gap-3">
            <div
              aria-hidden="true"
              className="grid size-14 shrink-0 place-items-center rounded-lg bg-chart-2 text-lg font-semibold text-[oklch(0.2_0.05_131)] shadow-[0_0_0_1px_var(--border)]"
            >
              {initials(player.name)}
            </div>
            <div className="min-w-0">
              <div className="truncate text-base leading-tight font-medium">{player.name}</div>
              <div className="flex items-center text-xs text-muted-foreground">
                {code && FLAGGED.has(code) ? <Flag code={code as FlagCode} /> : null}
                {meta}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-[0.8125rem] text-muted-foreground">
            {tourLabel} singles ranking
            <Badge variant="secondary" title={STAGE_TIP[stage]}>
              Stage {stage} · {STAGE_LABEL[stage] ?? 'Building'}
            </Badge>
          </div>

          {verified && rank != null ? (
            <>
              <div className="flex items-baseline gap-1.5 text-[4rem] leading-none font-medium tracking-[-0.03em] tabular-nums max-sm:text-[3.5rem]">
                <small className="text-xl font-medium tracking-normal text-muted-foreground">
                  #
                </small>
                {rank}
              </div>
              {move != null && move !== 0 ? (
                <div
                  className={
                    move > 0
                      ? 'flex items-center gap-1.5 text-sm font-medium text-ok tabular-nums'
                      : 'flex items-center gap-1.5 text-sm font-medium text-danger tabular-nums'
                  }
                >
                  {move > 0 ? (
                    <ArrowUp aria-hidden="true" className="size-4" />
                  ) : (
                    <ArrowDown aria-hidden="true" className="size-4" />
                  )}
                  {move > 0 ? `+${move}` : move}
                  <span className="font-normal text-muted-foreground">
                    this week{points != null ? ` · ${points} pts` : ''}
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground tabular-nums">
                  <Clock aria-hidden="true" className="size-4" />
                  {previous ? 'No change this week' : 'Verified'}
                  <span className="font-normal">{points != null ? `· ${points} pts` : ''}</span>
                </div>
              )}
              <div className="flex flex-wrap gap-1.5">
                {player.itf_rank != null ? <Badge>ITF #{player.itf_rank}</Badge> : null}
                {showDoublesChip(doublesRank) ? <Badge>Doubles #{doublesRank}</Badge> : null}
                {defendTotal > 0 ? (
                  <Badge
                    className="tabular-nums"
                    title="Tour points are a rolling 52-week total. Results from a year ago drop off each Monday, so these points disappear unless you match them."
                  >
                    {defendTotal} pts to defend · 8 wks
                  </Badge>
                ) : null}
              </div>
            </>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="flex items-baseline gap-1.5 text-[4rem] leading-none font-medium tracking-[-0.03em] text-muted-foreground">
                <small className="text-xl font-medium tracking-normal">#</small>–
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">Unverified</Badge>
                <Link href="/onboarding" className="text-sm font-medium text-foreground underline">
                  Verify your ranking
                </Link>
              </div>
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-3 px-6 max-[1100px]:pt-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-base leading-6 font-medium">52-week trajectory</div>
            <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <i className="inline-block size-2.5 rounded-[2px] bg-chart-2" />
                Ranking
              </span>
              <span className="inline-flex items-center gap-1.5">
                <i className="inline-block size-2.5 rounded-full bg-warn" />
                Points defence
                <HelpMark label="Weeks where last year's points expire. Match or beat the result there, or the ranking slips even if you play well elsewhere." />
              </span>
            </div>
          </div>
          {chartPoints.length > 0 ? (
            <RankChart
              points={chartPoints}
              defences={defences}
              today={today.toISOString().slice(0, 10)}
            />
          ) : (
            <div className="grid h-[16.25rem] place-items-center max-sm:h-40 rounded-lg bg-muted/40 px-6 text-center text-sm text-muted-foreground">
              The line starts once your ranking is verified.
            </div>
          )}
          {verified && chartPoints.length === 1 ? (
            <p className="text-[0.8125rem] text-muted-foreground">
              The line builds from here, one point for each weekly ranking refresh.
            </p>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
