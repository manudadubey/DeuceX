import { Badge, Tooltip, TooltipContent, TooltipTrigger } from '@deucex/ui';
import {
  convertTensionText,
  formatTension,
  formatTemp,
  toDisplayKg,
  type Unit,
} from '@deucex/agents';
import type { ConditionsBriefView } from '@/lib/tournament/load';
import { LockedSection } from './locked-section';
import { RacquetVisual } from './racquet-visual';

function Tile({
  label,
  value,
  amber,
  sub,
}: {
  label: string;
  value: string;
  amber?: boolean;
  sub: string;
}) {
  return (
    <div className="rounded-lg bg-sidebar-accent p-3">
      <div className="text-[0.6875rem] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className={`mt-0.5 text-base font-medium ${amber ? 'text-warn' : ''}`}>{value}</div>
      <div className="text-xs text-muted-foreground">{sub}</div>
    </div>
  );
}

// PRD-08's Conditions brief inside the Tournament Agent detail (section
// 4.1): four tiles, prose, the racquet visual and the two-frame test. Free
// sees the tiles and prose live (decisions worksheet 14); only the racquet
// visual and test are dimmed (CE-20) — a narrower lock than the cost/
// outcome section above it, so this gets its own LockedSection rather than
// sharing the detail panel's.
export function ConditionsBrief({
  conditions,
  mainsKg,
  crossesKg,
  isFree,
  unit,
  onUnitChange,
  onStartTrial,
}: {
  conditions: ConditionsBriefView;
  /** The Equipment profile's own baseline (never the test value) — Frame A always reads this. */
  mainsKg: number;
  crossesKg: number;
  isFree: boolean;
  unit: Unit;
  onUnitChange: (unit: Unit) => void;
  onStartTrial: () => void;
}) {
  const c = conditions;
  const testMains = c.testMains ?? mainsKg;
  const testCrosses = c.testCrosses ?? crossesKg;

  const racquetAndTest = (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-4">
        <RacquetVisual />
        <div className="flex min-w-0 flex-1 flex-col gap-2 text-sm">
          <div className="grid grid-cols-[14px_1fr_auto] items-center gap-2.5">
            <span
              aria-hidden="true"
              className="h-[3px] w-3.5 rounded-full"
              style={{ background: 'var(--chart-2)' }}
            />
            <span>Mains</span>
            <span className="font-mono font-medium">
              {c.tension
                ? `${toDisplayKg(mainsKg, unit)} → ${toDisplayKg(testMains, unit)} ${unit}`
                : `${toDisplayKg(mainsKg, unit)} ${unit}`}
            </span>
          </div>
          <div className="grid grid-cols-[14px_1fr_auto] items-center gap-2.5">
            <span
              aria-hidden="true"
              className="h-[3px] w-3.5 rounded-full"
              style={{ background: 'var(--chart-4)' }}
            />
            <span>Crosses</span>
            <span className="font-mono font-medium">
              {c.tension
                ? `${toDisplayKg(crossesKg, unit)} → ${toDisplayKg(testCrosses, unit)} ${unit}`
                : `${toDisplayKg(crossesKg, unit)} ${unit}`}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5 max-sm:grid-cols-1">
        <div
          className={`rounded-lg p-3 ${!c.tension ? 'ring-2 ring-[var(--chart-2)]' : 'ring-1 ring-border'}`}
        >
          <div className="text-xs text-muted-foreground">Frame A · baseline · {unit}</div>
          <div className="mt-0.5 font-mono text-lg font-medium">
            {formatTension(mainsKg, crossesKg, unit)}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">What you played last with</div>
        </div>
        <div
          className={`rounded-lg p-3 ${c.tension ? 'ring-2 ring-[var(--chart-2)]' : 'ring-1 ring-border'}`}
        >
          <div className="text-xs text-muted-foreground">
            Frame B · {c.tension ? 'test' : 'not needed'} · {unit}
          </div>
          <div className="mt-0.5 font-mono text-lg font-medium">
            {c.tension
              ? formatTension(testMains, testCrosses, unit)
              : formatTension(mainsKg, crossesKg, unit)}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {convertTensionText(c.tensionNote, unit)}
          </div>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Ten minutes of serves with each in the real conditions, then choose. You and your stringer
        decide; the brief only proposes the test.
      </p>
    </div>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">
          Conditions brief{' '}
          <span className="font-normal text-muted-foreground">
            · forecast for match days, refreshed the day before you travel
          </span>
        </div>
        {!c.refreshed && <Badge variant="secondary">not refreshed · normals</Badge>}
      </div>

      <div className="grid grid-cols-4 gap-2.5 max-[700px]:grid-cols-2">
        <Tile
          label="Air"
          value={unit === 'kg' ? c.tempRange : formatTemp(c.tempMax, unit)}
          amber={c.tempMax >= 28 || c.rhMax >= 70}
          sub={`${c.rhRange} humidity · wind ${c.wind}`}
        />
        <Tile
          label="Court"
          value={c.io}
          sub={c.altitudeM != null ? `${Math.round(c.altitudeM)} m altitude` : 'altitude n/a'}
        />
        <Tile
          label="Ball"
          value={c.ball ?? 'Not published yet'}
          amber={c.ballDiff}
          sub={c.ballDiff ? 'differs from your practice ball' : 'same as practice'}
        />
        <Tile label="Frames to bring" value={String(c.frames)} sub={c.framesSubLine} />
      </div>

      {(c.diff || c.practice) && (
        <p className="text-sm">
          {c.diff} {c.practice}
        </p>
      )}

      {isFree ? (
        <LockedSection
          onStartTrial={onStartTrial}
          label="Pro shows the racquet visual and tension test"
        >
          {racquetAndTest}
        </LockedSection>
      ) : (
        <>
          <div className="flex justify-end">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="text-xs text-muted-foreground underline decoration-dotted"
                  onClick={() => onUnitChange(unit === 'kg' ? 'lb' : 'kg')}
                >
                  show in {unit === 'kg' ? 'lb' : 'kg'}
                </button>
              </TooltipTrigger>
              <TooltipContent>Synced with Preferences and the Equipment pane.</TooltipContent>
            </Tooltip>
          </div>
          {racquetAndTest}
        </>
      )}
    </div>
  );
}
