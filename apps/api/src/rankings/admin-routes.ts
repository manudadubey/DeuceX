import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@deucex/db';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { InvalidRankingCsvError, parseRankingCsv } from './csv';
import {
  DeadlineError,
  deadlineConsequence,
  listMissingDeadlines,
  setEntryDeadline,
} from './deadlines';
import {
  applyRankingImport,
  DuplicateRankingImportError,
  previewRankingImport,
} from './import-service';

export interface AdminAuditInput {
  playerId: string | null;
  actionType: string;
  target?: Record<string, unknown>;
  consequence: string;
  reason?: string | null;
}

export interface AdminRankingsRoutesDeps {
  db: SupabaseClient<Database>;
  /**
   * Step 5.1: staff sign-in and the ops role for every route here, and an
   * admin_actions row for every change. Optional only so this module's own
   * step 3.1 tests keep exercising the routes without a staff session;
   * index.ts always passes both.
   */
  guard?: (request: FastifyRequest) => Promise<AdminRouteContext>;
  audit?: (context: AdminRouteContext, input: AdminAuditInput) => Promise<void>;
  /** AD-20, AD-21: re-run the Tournament Agent for every player who shortlisted this event. */
  rerunShortlists?: (tournamentId: string) => Promise<number>;
}

export interface AdminRouteContext {
  staffName: string;
  /** Opaque to this module: whatever the guard needs to hand back to `audit`. */
  staff?: unknown;
}

declare module 'fastify' {
  interface FastifyRequest {
    adminContext?: AdminRouteContext;
  }
}

const CORRECTABLE_FIELDS = ['ball', 'entry_deadline', 'altitude_m', 'surface'] as const;
type CorrectableField = (typeof CORRECTABLE_FIELDS)[number];

// Step 3.1 shipped these routes unauthenticated, flagged for step 5.1 to
// close. Step 5.1 does: index.ts passes `guard` (staff sign-in with a
// passkey, ops role or above, PRD-13 section 2) and `audit` (an
// admin_actions row for every change, AD-4), and applying a snapshot now
// needs a written reason (AD-5).
export async function registerAdminRankingsRoutes(
  app: FastifyInstance,
  deps: AdminRankingsRoutesDeps,
): Promise<void> {
  if (deps.guard) {
    const guard = deps.guard;
    app.addHook('onRequest', async (request) => {
      if (
        !request.url.startsWith('/admin/rankings') &&
        !request.url.startsWith('/admin/tournaments') &&
        !request.url.startsWith('/admin/corrections')
      )
        return;
      request.adminContext = await guard(request);
    });
  }
  const audit = async (request: FastifyRequest, input: AdminAuditInput) => {
    if (deps.audit && request.adminContext) await deps.audit(request.adminContext, input);
  };

  app.get('/admin/rankings/feeds', async (_request, reply) => {
    const { data, error } = await deps.db
      .from('feed_status')
      .select('*')
      .order('feed', { ascending: true });
    if (error) return reply.code(500).send({ error: error.message });
    const now = Date.now();
    return reply.send({
      feeds: (data ?? []).map((f) => ({
        ...f,
        overdue: new Date(f.next_expected_at).getTime() < now,
      })),
    });
  });

  app.post('/admin/rankings/import/preview', async (request, reply) => {
    const body = request.body as { csv?: string } | undefined;
    if (!body?.csv) return reply.code(400).send({ error: 'Missing csv' });
    try {
      const rows = parseRankingCsv(body.csv);
      const plan = await previewRankingImport(deps.db, rows);
      return reply.send({
        rows: rows.length,
        matched: plan.matched,
        unmatchedCount: plan.unmatched.length,
        unmatched: plan.unmatched,
        stageChangeCount: plan.stageChangeCount,
      });
    } catch (err) {
      if (err instanceof InvalidRankingCsvError) {
        return reply.code(400).send({ error: err.message });
      }
      throw err;
    }
  });

  app.post('/admin/rankings/import/apply', async (request, reply) => {
    const body = request.body as { csv?: string; appliedBy?: string; reason?: string } | undefined;
    if (!body?.csv) return reply.code(400).send({ error: 'Missing csv' });
    // AD-5: applying a snapshot needs a written reason once staff auth is on.
    if (deps.guard && !body.reason?.trim()) {
      return reply
        .code(400)
        .send({ error: 'Write a reason before applying. It is stored verbatim in the audit log.' });
    }
    try {
      const rows = parseRankingCsv(body.csv);
      const fileHash = createHash('sha256').update(body.csv).digest('hex');
      const appliedBy = request.adminContext?.staffName ?? body.appliedBy ?? null;
      const result = await applyRankingImport(deps.db, rows, fileHash, appliedBy);
      await audit(request, {
        playerId: null,
        actionType: 'snapshot_apply',
        target: { importId: result.importId, fileHash },
        consequence: `Applied a ranking snapshot to ${result.matchedCount} players with ${result.stageChangeCount} stage changes; ${result.unmatchedCount} rows unmatched. Nothing is sent to players before their next morning run.`,
        reason: body.reason ?? null,
      });
      return reply.send(result);
    } catch (err) {
      if (err instanceof InvalidRankingCsvError) {
        return reply.code(400).send({ error: err.message });
      }
      if (err instanceof DuplicateRankingImportError) {
        return reply.code(409).send({ error: err.message });
      }
      throw err;
    }
  });

  // PRD-13 AD-21: "Calendar events with no published deadline... setting a
  // deadline starts their countdowns and re-runs their shortlists." The
  // re-run half doesn't apply yet — no shortlist exists until step 3.2's
  // Tournament Agent — so this route only ever does the deadline write.
  app.get('/admin/tournaments/missing-deadline', async (_request, reply) => {
    try {
      return reply.send({ tournaments: await listMissingDeadlines(deps.db) });
    } catch (err) {
      if (err instanceof DeadlineError) return reply.code(err.status).send({ error: err.message });
      throw err;
    }
  });

  app.post('/admin/tournaments/:id/deadline', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { entryDeadline?: string } | undefined;
    if (!body?.entryDeadline) return reply.code(400).send({ error: 'Missing entryDeadline' });
    try {
      const rerun = await setEntryDeadline(deps.db, deps.rerunShortlists, id, body.entryDeadline);
      await audit(request, {
        playerId: null,
        actionType: 'deadline_set',
        target: { tournamentId: id, entryDeadline: body.entryDeadline },
        consequence: deadlineConsequence(null, body.entryDeadline, rerun),
      });
      return reply.send({ ok: true, rerun });
    } catch (err) {
      if (err instanceof DeadlineError) return reply.code(err.status).send({ error: err.message });
      throw err;
    }
  });

  // PRD-13 AD-20: fact-sheet corrections, proposed with a source, shown as
  // a before/after diff, applied or rejected by ops.
  app.get('/admin/corrections', async (_request, reply) => {
    const { data, error } = await deps.db
      .from('fact_corrections')
      .select('*, tournaments(name)')
      .eq('state', 'proposed')
      .order('created_at', { ascending: true });
    if (error) return reply.code(500).send({ error: error.message });
    return reply.send({ corrections: data ?? [] });
  });

  app.post('/admin/corrections', async (request, reply) => {
    const body = request.body as
      { tournamentId?: string; field?: string; after?: string; source?: string } | undefined;
    if (!body?.tournamentId || !body.field || !body.after || !body.source) {
      return reply.code(400).send({ error: 'Missing tournamentId, field, after or source' });
    }
    if (!CORRECTABLE_FIELDS.includes(body.field as CorrectableField)) {
      return reply
        .code(400)
        .send({ error: `field must be one of ${CORRECTABLE_FIELDS.join(', ')}` });
    }
    const field = body.field as CorrectableField;

    const { data: tournament, error: tournamentError } = await deps.db
      .from('tournaments')
      .select(field)
      .eq('id', body.tournamentId)
      .maybeSingle();
    if (tournamentError) return reply.code(500).send({ error: tournamentError.message });
    if (!tournament) return reply.code(404).send({ error: 'Tournament not found' });

    const before = tournament[field as keyof typeof tournament];
    const { data, error } = await deps.db
      .from('fact_corrections')
      .insert({
        tournament_id: body.tournamentId,
        field,
        before: before === null || before === undefined ? null : String(before),
        after: body.after,
        source: body.source,
        state: 'proposed',
      })
      .select('*')
      .single();
    if (error) return reply.code(500).send({ error: error.message });
    return reply.send({ correction: data });
  });

  app.post('/admin/corrections/:id/apply', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { data: correction, error: fetchError } = await deps.db
      .from('fact_corrections')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (fetchError) return reply.code(500).send({ error: fetchError.message });
    if (!correction) return reply.code(404).send({ error: 'Correction not found' });
    if (correction.state !== 'proposed') {
      return reply.code(409).send({ error: `Already ${correction.state}` });
    }

    const field = correction.field as CorrectableField;
    const update: Database['public']['Tables']['tournaments']['Update'] = {
      updated_at: new Date().toISOString(),
    };
    if (field === 'altitude_m') {
      update.altitude_m = Number(correction.after);
    } else {
      update[field] = correction.after;
    }
    const { error: updateError } = await deps.db
      .from('tournaments')
      .update(update)
      .eq('id', correction.tournament_id);
    if (updateError) return reply.code(500).send({ error: updateError.message });

    const { error: stateError } = await deps.db
      .from('fact_corrections')
      .update({
        state: 'applied',
        decided_at: new Date().toISOString(),
        decided_by: request.adminContext?.staffName ?? null,
      })
      .eq('id', id);
    if (stateError) return reply.code(500).send({ error: stateError.message });

    // AD-20 and AD-AC-9: a deadline change re-runs every shortlist that has the event.
    const rerun =
      field === 'entry_deadline'
        ? ((await deps.rerunShortlists?.(correction.tournament_id)) ?? 0)
        : 0;
    await audit(request, {
      playerId: null,
      actionType: 'correction_apply',
      target: { correctionId: id, tournamentId: correction.tournament_id, field },
      consequence: `Changed ${field} from ${correction.before ?? 'unset'} to ${correction.after} (source: ${correction.source})${field === 'entry_deadline' ? `; ${rerun} shortlists re-run` : ''}.`,
    });
    return reply.send({ ok: true, rerun });
  });

  app.post('/admin/corrections/:id/reject', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { error } = await deps.db
      .from('fact_corrections')
      .update({
        state: 'rejected',
        decided_at: new Date().toISOString(),
        decided_by: request.adminContext?.staffName ?? null,
      })
      .eq('id', id);
    if (error) return reply.code(500).send({ error: error.message });
    await audit(request, {
      playerId: null,
      actionType: 'correction_reject',
      target: { correctionId: id },
      consequence: 'Rejected a proposed fact-sheet correction; the tournament is unchanged.',
    });
    return reply.send({ ok: true });
  });
}
