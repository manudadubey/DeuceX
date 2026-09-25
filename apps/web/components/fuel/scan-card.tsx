'use client';

import { forwardRef, useRef } from 'react';
import { Camera, Images, UtensilsCrossed } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardActions,
  CardDescription,
  CardHeader,
  CardTitle,
  Spinner,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
} from '@deucex/ui';
import {
  ALLERGEN_CONFIRM_LINE,
  FALLBACK_LINE,
  MODE_LABEL,
  MODE_RULE,
  SAFETY_FOOTER,
  type FuelMode,
  type FuelPick,
} from '@deucex/agents';
import type { ScanResult } from '@/lib/fuel/api';
import {
  formatHome,
  formatMenu,
  homeSymbol,
  languageList,
  menuCurrencyName,
  rateTitle,
} from '@/lib/fuel/format';

export type ScanState = 'scan' | 'proc' | 'result';

const MODE_BADGE: Record<FuelMode, 'warn' | 'ok' | 'secondary'> = {
  'pre-match': 'warn',
  'post-match': 'secondary',
  travel: 'warn',
  rest: 'ok',
  practice: 'secondary',
};

const COUNT_WORD = ['None', 'One', 'Two', 'Three'];

function PickRow({
  pick,
  result,
  logged,
  otherLogged,
  busy,
  onLog,
  onUndo,
}: {
  pick: FuelPick;
  result: ScanResult;
  logged: boolean;
  otherLogged: boolean;
  busy: boolean;
  onLog: () => void;
  onUndo: () => void;
}) {
  const over = pick.flags.includes('over-budget');
  const title = rateTitle(result.rate, result.rateDate, result.menuCurrency, result.homeCurrency);
  return (
    <li
      className={cn(
        'grid grid-cols-[1.75rem_1fr_auto] gap-x-3 gap-y-2 rounded-lg border border-border p-4',
        logged && 'border-primary',
      )}
    >
      <span className="flex size-7 items-center justify-center rounded-full bg-secondary font-mono text-sm">
        {pick.rank}
      </span>
      <div className="min-w-0">
        <div className="font-medium">{pick.dishOriginal}</div>
        <div className="text-[0.8125rem] text-muted-foreground">{pick.dishEnglish}</div>
      </div>
      <div className="text-right" title={title}>
        {pick.priceHome !== null ? (
          <div className={cn('font-mono text-lg font-medium', over && 'text-warn')}>
            {formatHome(pick.priceHome, result.homeCurrency)}
          </div>
        ) : null}
        {pick.priceMenu !== null && result.menuCurrency ? (
          <div className="text-xs text-muted-foreground">
            {formatMenu(pick.priceMenu, result.menuCurrency)}
          </div>
        ) : null}
      </div>
      <div className="col-span-2 col-start-2 flex flex-col gap-2 text-sm max-[600px]:col-span-3 max-[600px]:col-start-1">
        <p>{pick.why}</p>
        {pick.asks.length > 0 && (
          <div className="flex flex-wrap gap-1.5" aria-label="What to ask the kitchen">
            {pick.asks.map((a) => (
              <span key={a} className="rounded-md bg-secondary px-2 py-0.5 text-[0.8125rem]">
                {a}
              </span>
            ))}
          </div>
        )}
        {over && pick.overBy !== null && (
          <p className="text-[0.8125rem] text-warn">
            Over today&apos;s food money by {formatHome(pick.overBy, result.homeCurrency)}
          </p>
        )}
        <p className="text-xs text-muted-foreground">{ALLERGEN_CONFIRM_LINE}</p>
      </div>
      <div className="col-start-3 row-start-2 flex flex-col items-end justify-end gap-1 max-[600px]:col-span-3 max-[600px]:col-start-1 max-[600px]:row-start-auto max-[600px]:items-stretch">
        <Button
          size="sm"
          variant={logged ? 'primary' : 'outline'}
          disabled={busy || otherLogged || pick.priceMenu === null}
          onClick={logged ? undefined : onLog}
          aria-pressed={logged}
        >
          {logged ? 'Logged' : "I'm having this"}
        </Button>
        {logged && (
          <button
            type="button"
            className="min-h-8 text-xs text-muted-foreground underline max-[900px]:min-h-11"
            onClick={onUndo}
            disabled={busy}
          >
            Undo
          </button>
        )}
      </div>
    </li>
  );
}

export interface ScanCardProps {
  state: ScanState;
  result: ScanResult | null;
  sample: boolean;
  error: string | null;
  localHour: number;
  matchTime: string | null;
  loggedRank: number | null;
  busy: boolean;
  locked?: boolean;
  onFiles: (files: File[]) => void;
  onSample: () => void;
  onAgain: () => void;
  onLog: (pick: FuelPick) => void;
  onUndo: () => void;
}

export const ScanCard = forwardRef<HTMLButtonElement, ScanCardProps>(function ScanCard(
  {
    state,
    result,
    sample,
    error,
    localHour,
    matchTime,
    loggedRank,
    busy,
    locked = false,
    onFiles,
    onSample,
    onAgain,
    onLog,
    onUndo,
  },
  takeRef,
) {
  const cameraInput = useRef<HTMLInputElement>(null);
  const pickInput = useRef<HTMLInputElement>(null);

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length > 0) onFiles(files.slice(0, 4));
  };

  const when = localHour < 16 ? 'Today' : 'Tonight';
  const title =
    state === 'result' && result
      ? result.venueName && /hotel/i.test(result.venueName)
        ? `${when}, at the hotel`
        : `${when}'s picks`
      : state === 'proc'
        ? 'One moment'
        : 'Scan a menu';

  let description =
    'Hotel restaurant, room-service card, a place round the corner, or a supermarket shelf. Several pages are fine.';
  if (state === 'proc') {
    description = "Reading, translating and checking against your rules and what's next.";
  } else if (state === 'result' && result) {
    const n = result.picks.length;
    const fit =
      result.mode === 'pre-match' && matchTime ? `a ${matchTime} match` : 'where you are this week';
    const money =
      result.foodMoneyLeft !== null && result.foodMoneyLeft > 0
        ? ` and ${formatHome(result.foodMoneyLeft, result.homeCurrency)}`
        : '';
    description = `${COUNT_WORD[n] ?? n} that fit${n === 1 ? 's' : ''} ${fit}${money}. Tap one to log it.`;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
        <CardActions>
          <Badge variant={state === 'result' ? 'lime' : 'secondary'}>
            {state === 'result'
              ? sample
                ? 'Sample'
                : 'Picks ready'
              : state === 'proc'
                ? 'Reading'
                : 'Ready'}
          </Badge>
        </CardActions>
      </CardHeader>

      {state === 'scan' && (
        <div className="flex flex-col gap-4 px-6 pb-6">
          {error && (
            <p role="alert" className="rounded-md bg-warn-bg px-3 py-2 text-sm text-warn">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button ref={takeRef} onClick={() => cameraInput.current?.click()} disabled={locked}>
              <Camera aria-hidden="true" className="size-4" />
              Take photo
            </Button>
            <Button variant="outline" onClick={() => pickInput.current?.click()} disabled={locked}>
              <Images aria-hidden="true" className="size-4" />
              Choose photos
            </Button>
            <Button variant="ghost" onClick={onSample}>
              Try the hotel menu in Sibiu
            </Button>
            <input
              ref={cameraInput}
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              hidden
              onChange={handleInput}
            />
            <input
              ref={pickInput}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={handleInput}
            />
          </div>
          <p className="text-[0.8125rem] text-muted-foreground">
            Photos are read once and deleted as soon as the dishes are read. Only the dish you
            choose is kept.
          </p>
        </div>
      )}

      {state === 'proc' && (
        <div className="flex items-center gap-3 px-6 pb-6 text-sm">
          <Spinner />
          <span>Reading the menu</span>
        </div>
      )}

      {state === 'result' && result && (
        <div className="flex flex-col gap-5 px-6 pb-6">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <UtensilsCrossed aria-hidden="true" className="size-4 text-muted-foreground" />
            <span className="font-medium">
              {[result.venueName, result.venueType].filter(Boolean).join(' · ')}
            </span>
            <span className="text-[0.8125rem] text-muted-foreground">
              {[
                languageList(result.languages),
                `${result.dishesRead} dishes read`,
                result.menuCurrency
                  ? `prices in ${menuCurrencyName(result.menuCurrency)}, shown in ${homeSymbol(result.homeCurrency)}`
                  : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant={MODE_BADGE[result.mode]} tabIndex={0}>
                  {MODE_LABEL[result.mode]}
                </Badge>
              </TooltipTrigger>
              <TooltipContent>{MODE_RULE[result.mode]}</TooltipContent>
            </Tooltip>
          </div>

          {result.secondVisit && <p className="text-sm">{result.secondVisit}</p>}
          {result.fewerThanTwo && (
            <p className="text-sm">
              {result.picks.length === 0
                ? 'Nothing here fits your rules tonight.'
                : 'Only one dish fits your rules tonight.'}{' '}
              {FALLBACK_LINE}
            </p>
          )}

          <ol className="flex flex-col gap-3">
            {result.picks.map((pick) => (
              <PickRow
                key={pick.rank}
                pick={pick}
                result={result}
                logged={loggedRank === pick.rank}
                otherLogged={loggedRank !== null && loggedRank !== pick.rank}
                busy={busy}
                onLog={() => onLog(pick)}
                onUndo={onUndo}
              />
            ))}
          </ol>

          {result.avoid.length > 0 && (
            <div>
              <div className="mb-2 text-sm font-medium">Not tonight</div>
              <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
                {result.avoid.map((a) => (
                  <li key={a.dish} className="flex items-start gap-3 px-3 py-2 text-sm">
                    <span className="flex-1">
                      <b className="font-medium">{a.dish}</b>
                      <span className="block text-[0.8125rem] text-muted-foreground">
                        {a.reason}
                        {a.modeOnly ? ' Fine on a rest day.' : ''}
                      </span>
                    </span>
                    <Badge variant="secondary">{a.tag}</Badge>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {!result.fewerThanTwo && (
            <p className="text-[0.8125rem] text-muted-foreground">{FALLBACK_LINE}</p>
          )}

          <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
            <Button variant="outline" onClick={onAgain}>
              Scan another
            </Button>
            <span className="ml-auto text-xs text-muted-foreground">{SAFETY_FOOTER}</span>
          </div>
        </div>
      )}
    </Card>
  );
});
