'use client';

import { useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@procircuit/db';
import { skipCandidate, undoSkip } from '@procircuit/db';
import { confirmApproval } from '@/lib/approvals/confirm-approval';
import {
  acceptTournamentEntry,
  withdrawTournamentEntry,
  type AcceptEntryResult,
} from '@/lib/tournament/api';

// Shared between the dashboard decision card (PRD-01 section 4.2) and the
// full agent page's detail panel (section 4.1): both need the same four
// transitions (Accept, Withdraw, Skip, Undo) over the same approval-gate
// shape, so the wiring lives once here rather than twice.
export function useEntryActions({
  supabase,
  playerId,
  onDone,
}: {
  supabase: SupabaseClient<Database>;
  playerId: string;
  onDone: () => void;
}) {
  const [pending, setPending] = useState<string | null>(null);

  async function accept(tournamentId: string): Promise<AcceptEntryResult> {
    setPending(tournamentId);
    try {
      const approval = await confirmApproval({
        playerId,
        actionType: 'entry_confirm',
        payload: { tournamentId },
      });
      const result = await acceptTournamentEntry(supabase, {
        approvalId: approval.id,
        tournamentId,
      });
      onDone();
      return result;
    } finally {
      setPending(null);
    }
  }

  async function withdraw(tournamentId: string): Promise<void> {
    setPending(tournamentId);
    try {
      const approval = await confirmApproval({
        playerId,
        actionType: 'retract',
        payload: { tournamentId },
      });
      await withdrawTournamentEntry(supabase, { approvalId: approval.id, tournamentId });
      onDone();
    } finally {
      setPending(null);
    }
  }

  async function skip(tournamentId: string): Promise<void> {
    setPending(tournamentId);
    try {
      await skipCandidate(supabase, {
        tournamentId,
        playerId,
        device: typeof navigator === 'undefined' ? null : navigator.userAgent,
      });
      onDone();
    } finally {
      setPending(null);
    }
  }

  async function undo(tournamentId: string): Promise<void> {
    setPending(tournamentId);
    try {
      await undoSkip(supabase, { tournamentId, playerId });
      onDone();
    } finally {
      setPending(null);
    }
  }

  return { pending, accept, withdraw, skip, undo };
}
