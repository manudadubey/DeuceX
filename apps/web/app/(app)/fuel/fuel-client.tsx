'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Badge, Button, Toast, ToastProvider, ToastTitle, ToastViewport } from '@deucex/ui';
import {
  SIBIU_MENU_FIXTURE,
  dietaryChip,
  preferencesSummary,
  rankMenu,
  type DietaryProfile,
  type FuelPick,
} from '@deucex/agents';
import {
  latestRateBetween,
  logFuelPick,
  saveFuelProfile,
  setMealOutcome,
  setNextMatch,
  unlogFuelMeal,
} from '@deucex/db';
import { createClient } from '@/lib/supabase/client';
import { requestFinancialRecompute } from '@/lib/financial/api';
import { MenuUnreadableError, scanMenu, type ScanResult } from '@/lib/fuel/api';
import { loadFuelSnapshot, localDate, type FuelSnapshot } from '@/lib/fuel/load';
import { formatHome } from '@/lib/fuel/format';
import { ContextStrip } from '@/components/fuel/context-strip';
import { ScanCard, type ScanState } from '@/components/fuel/scan-card';
import { HistoryCard } from '@/components/fuel/history-card';
import { WontDoCard } from '@/components/fuel/wont-do-card';
import { PreferencesSheet } from '@/components/fuel/preferences-sheet';

export interface FuelClientProps {
  playerId: string;
  timezone: string;
  homeCurrency: string;
  dailyFoodAllowance: number | null;
  nextMatchAt: string | null;
  nextMatchLabel: string | null;
  isFree: boolean;
  focusTake: boolean;
}

// The locked page's dimmed sample (FU-18) uses PRD-07's own player, not the
// viewer's profile: it demonstrates the page, it isn't a reading for them.
const SAMPLE_PROFILE: DietaryProfile = {
  exclusions: ['pork'],
  allergies: [],
  preferences: ['fish', 'chicken'],
};

function localTime(timezone: string, at = new Date()) {
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(at);
  return { time, hour: Number(time.slice(0, 2)) };
}

export function FuelClient(props: FuelClientProps) {
  const { playerId, timezone, homeCurrency, isFree } = props;
  const supabase = useMemo(() => createClient(), []);
  const takeRef = useRef<HTMLButtonElement>(null);

  const [snapshot, setSnapshot] = useState<FuelSnapshot | null>(null);
  const [nextMatch, setNextMatchState] = useState({
    at: props.nextMatchAt,
    label: props.nextMatchLabel,
  });
  const [state, setState] = useState<ScanState>('scan');
  const [result, setResult] = useState<ScanResult | null>(null);
  const [sample, setSample] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logged, setLogged] = useState<{ rank: number; mealId: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [toastOpen, setToastOpen] = useState(false);

  const showToast = useCallback((title: string) => {
    setToast(title);
    setToastOpen(true);
  }, []);

  const reload = useCallback(async () => {
    setSnapshot(
      await loadFuelSnapshot(supabase, {
        playerId,
        timezone,
        homeCurrency,
        dailyFoodAllowance: props.dailyFoodAllowance,
      }),
    );
  }, [supabase, playerId, timezone, homeCurrency, props.dailyFoodAllowance]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // FU-AC-2: arriving from the quick-actions sheet focuses Take photo.
  useEffect(() => {
    if (props.focusTake && !isFree) takeRef.current?.focus();
  }, [props.focusTake, isFree]);

  const { time: nowText, hour: localHour } = localTime(timezone);
  const today = localDate(timezone);
  const matchTime =
    nextMatch.at && new Date(nextMatch.at) > new Date()
      ? localTime(timezone, new Date(nextMatch.at)).time
      : null;

  // "Try the hotel menu in Sibiu": the fixture ranked in the browser with the
  // player's own rules and food money. No model call, nothing uploaded, and
  // nothing can be logged from it.
  const buildSample = useCallback(
    async (profile: DietaryProfile, withMoney: boolean): Promise<ScanResult> => {
      const rate = await latestRateBetween(
        supabase,
        'RON',
        homeCurrency,
        new Date().toISOString().slice(0, 10),
      );
      // The sample is PRD-07's own scenario (a 10:00 match tomorrow): its
      // why sentences are written for that night, so it always reads as
      // Pre-match rather than the player's current mode. Their rules and
      // food money still apply.
      const mode = 'pre-match' as const;
      const moneyLeft = withMoney ? (snapshot?.foodMoneyLeft ?? null) : null;
      const ranked = rankMenu({
        extraction: SIBIU_MENU_FIXTURE,
        mode,
        profile,
        localHour,
        city: 'Sibiu',
        history: [],
        rateMenuToHome: rate?.rate ?? null,
        foodMoneyLeft: moneyLeft,
      });
      return {
        id: 'sample',
        venueName: SIBIU_MENU_FIXTURE.venueName,
        venueType: SIBIU_MENU_FIXTURE.venueType,
        languages: SIBIU_MENU_FIXTURE.languages,
        dishesRead: ranked.dishesRead,
        menuCurrency: SIBIU_MENU_FIXTURE.menuCurrency,
        homeCurrency,
        rate: rate?.rate ?? null,
        rateDate: rate?.date ?? null,
        mode,
        picks: ranked.picks,
        avoid: ranked.avoid,
        fewerThanTwo: ranked.fewerThanTwo,
        secondVisit: null,
        city: 'Sibiu',
        foodMoneyLeft: moneyLeft,
      };
    },
    [supabase, homeCurrency, localHour, snapshot?.foodMoneyLeft],
  );

  const [lockedSample, setLockedSample] = useState<ScanResult | null>(null);
  useEffect(() => {
    if (isFree) void buildSample(SAMPLE_PROFILE, false).then(setLockedSample);
  }, [isFree, buildSample]);

  const handleFiles = async (files: File[]) => {
    setError(null);
    setState('proc');
    setSample(false);
    setLogged(null);
    try {
      setResult(await scanMenu(supabase, files));
      setState('result');
    } catch (err) {
      setState('scan');
      setError(
        err instanceof MenuUnreadableError
          ? err.message
          : "That didn't go through. Check your connection and try again.",
      );
    }
  };

  const handleSample = async () => {
    setError(null);
    setLogged(null);
    setSample(true);
    setResult(await buildSample(snapshot?.profile ?? SAMPLE_PROFILE, true));
    setState('result');
  };

  const handleLog = async (pick: FuelPick) => {
    if (!result) return;
    if (sample) {
      showToast('This is the sample menu, so nothing was logged.');
      return;
    }
    setBusy(true);
    try {
      const { mealId } = await logFuelPick(supabase, result.id, pick.rank, 'web');
      setLogged({ rank: pick.rank, mealId });
      showToast(
        `Logged ${pick.priceHome !== null ? formatHome(pick.priceHome, homeCurrency) : 'it'} to food · tomorrow's check-in will ask how it went`,
      );
      void requestFinancialRecompute(supabase);
      await reload();
    } catch {
      showToast("Couldn't log that. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const handleUndo = async () => {
    if (!logged) return;
    setBusy(true);
    try {
      await unlogFuelMeal(supabase, logged.mealId);
      setLogged(null);
      showToast("Removed from today's food.");
      void requestFinancialRecompute(supabase);
      await reload();
    } catch {
      showToast('A meal can only be undone until midnight.');
    } finally {
      setBusy(false);
    }
  };

  const handleOutcome = async (mealId: string, outcome: 'worked' | 'flat') => {
    setBusy(true);
    try {
      await setMealOutcome(supabase, mealId, outcome, 'tap-history');
      await reload();
    } finally {
      setBusy(false);
    }
  };

  const handleSaveProfile = async (profile: DietaryProfile) => {
    await saveFuelProfile(supabase, { playerId, ...profile });
    showToast(`Preferences · ${preferencesSummary(profile)}`);
    await reload();
  };

  const handleSaveNextMatch = async (next: { at: string; label: string | null } | null) => {
    await setNextMatch(supabase, playerId, next);
    setNextMatchState({ at: next?.at ?? null, label: next?.label ?? null });
  };

  const profile = snapshot?.profile ?? SAMPLE_PROFILE;
  const dietaryText = snapshot
    ? snapshot.hasProfile
      ? dietaryChip(snapshot.profile)
      : 'No food rules set'
    : '';

  return (
    <ToastProvider>
      <header className="flex flex-col gap-2 pb-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Fuel</h1>
          <p className="max-w-[42rem] text-sm text-muted-foreground">
            Photograph any menu and get two or three things to order, for where you are in the week.
            Translated, priced, with what to ask the kitchen.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="lime">Pro</Badge>
          {!isFree && (
            <Button size="sm" variant="outline" onClick={() => setPrefsOpen(true)}>
              Preferences
            </Button>
          )}
        </div>
      </header>

      {isFree ? (
        <div className="relative">
          <div className="pointer-events-none opacity-40 blur-[1px]" aria-hidden="true">
            {lockedSample && (
              <ScanCard
                state="result"
                result={lockedSample}
                sample
                error={null}
                localHour={21}
                matchTime="10:00"
                loggedRank={null}
                busy
                locked
                onFiles={() => undefined}
                onSample={() => undefined}
                onAgain={() => undefined}
                onLog={() => undefined}
                onUndo={() => undefined}
              />
            )}
          </div>
          <div className="absolute inset-x-0 top-24 flex flex-col items-center gap-3 px-4 text-center">
            <p className="max-w-[28rem] rounded-lg bg-card px-4 py-3 text-sm shadow">
              Pro reads any menu and picks two or three dishes for tomorrow&apos;s match, your rules
              and your food money.
            </p>
            <Button onClick={() => showToast('The Pro trial is coming soon.')}>
              Start Pro trial
            </Button>
          </div>
        </div>
      ) : (
        <>
          <ContextStrip
            nowText={nowText}
            city={snapshot?.city ?? null}
            timezone={timezone}
            nextMatchAt={nextMatch.at}
            nextMatchLabel={nextMatch.label}
            dietaryText={dietaryText}
            foodMoneyLeft={snapshot?.foodMoneyLeft ?? null}
            foodMoneyStale={snapshot?.foodMoneyStale ?? false}
            homeCurrency={homeCurrency}
            onSaveNextMatch={handleSaveNextMatch}
          />
          <section className="grid grid-cols-[7fr_5fr] items-start gap-4 max-[1100px]:grid-cols-1">
            <ScanCard
              ref={takeRef}
              state={state}
              result={result}
              sample={sample}
              error={error}
              localHour={localHour}
              matchTime={sample ? '10:00' : matchTime}
              loggedRank={logged?.rank ?? null}
              busy={busy}
              onFiles={(files) => void handleFiles(files)}
              onSample={() => void handleSample()}
              onAgain={() => {
                setState('scan');
                setResult(null);
                setLogged(null);
              }}
              onLog={(pick) => void handleLog(pick)}
              onUndo={() => void handleUndo()}
            />
            <div className="flex flex-col gap-4">
              <HistoryCard
                rows={snapshot?.history ?? []}
                today={today}
                homeCurrency={homeCurrency}
                busy={busy}
                onOutcome={(id, o) => void handleOutcome(id, o)}
              />
              <WontDoCard />
            </div>
          </section>
          <PreferencesSheet
            open={prefsOpen}
            onOpenChange={setPrefsOpen}
            profile={profile}
            onSave={handleSaveProfile}
          />
        </>
      )}

      <Toast open={toastOpen} onOpenChange={setToastOpen}>
        <ToastTitle>{toast}</ToastTitle>
      </Toast>
      <ToastViewport />
    </ToastProvider>
  );
}
