'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { daysUntil, loadTournamentSnapshot } from '@/lib/tournament/load';

export interface NavBadges {
  /** Active patrons (the prototype's Fans "12"). */
  fans: number | null;
  /** Days to the nearest undecided entry deadline (Tournament "6d"). */
  tournamentDays: number | null;
  /** Drafts waiting for approval (Content "1"). */
  contentDrafts: number | null;
}

export interface NavBadgePlayer {
  id: string;
  homeCurrency: string;
  weeklyBudget: number | null;
}

const EMPTY: NavBadges = { fans: null, tournamentDays: null, contentDrafts: null };

// One read per page load, shared by every sidebar render, not one per navigation.
let cached: { key: string; promise: Promise<NavBadges> } | null = null;

async function loadNavBadges(player: NavBadgePlayer): Promise<NavBadges> {
  const supabase = createClient();
  const now = new Date();
  const [patrons, drafts, tournament] = await Promise.allSettled([
    supabase
      .from('patrons')
      .select('id', { count: 'exact', head: true })
      .eq('player_id', player.id)
      .eq('status', 'active'),
    supabase
      .from('patron_updates')
      .select('id', { count: 'exact', head: true })
      .eq('player_id', player.id)
      .eq('status', 'draft')
      .eq('draft_failed', false),
    loadTournamentSnapshot(supabase, player.id, player.homeCurrency, player.weeklyBudget, now),
  ]);

  const fans = patrons.status === 'fulfilled' ? (patrons.value.count ?? null) : null;
  const contentDrafts = drafts.status === 'fulfilled' ? (drafts.value.count ?? null) : null;
  let tournamentDays: number | null = null;
  if (tournament.status === 'fulfilled') {
    const days = tournament.value.candidates
      .filter((c) => c.status === 'none' && c.entryDeadline)
      .map((c) => daysUntil(c.entryDeadline, now))
      .filter((d): d is number => d != null && d >= 0)
      .sort((a, b) => a - b);
    tournamentDays = days[0] ?? null;
  }
  return { fans, tournamentDays, contentDrafts };
}

// The prototype's sidebar counts (docs/deucex-dashboard.html): patrons on
// Fans, days to the next entry deadline on Tournament, drafts to approve on
// Content. Each stays hidden when it's zero or couldn't be read.
export function useNavBadges(player: NavBadgePlayer | null): NavBadges {
  const [badges, setBadges] = useState<NavBadges>(EMPTY);

  useEffect(() => {
    if (!player) return;
    const key = `${player.id}:${player.homeCurrency}:${player.weeklyBudget}`;
    if (!cached || cached.key !== key) {
      cached = { key, promise: loadNavBadges(player) };
      setTimeout(() => {
        if (cached?.key === key) cached = null;
      }, 60_000);
    }
    let cancelled = false;
    void cached.promise.then((b) => {
      if (!cancelled) setBadges(b);
    });
    return () => {
      cancelled = true;
    };
  }, [player]);

  return badges;
}
