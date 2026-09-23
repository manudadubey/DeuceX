import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@procircuit/db';
import type { FastifyInstance } from 'fastify';
import { InvalidRankingCsvError, parseRankingCsv } from './csv';
import {
  applyRankingImport,
  DuplicateRankingImportError,
  previewRankingImport,
} from './import-service';

export interface AdminRankingsRoutesDeps {
  db: SupabaseClient<Database>;
}

const CORRECTABLE_FIELDS = ['ball', 'entry_deadline', 'altitude_m', 'surface'] as const;
type CorrectableField = (typeof CORRECTABLE_FIELDS)[number];

// Deliberately unauthenticated for this step: staff sign-in, roles and
// admin_actions attribution are step 5.1's job (PRD-13 AD-1 to AD-5), and
// this project's build plan puts the full admin console two phases later
// than this one. Building it now anyway would mean either bolting on a
// throwaway auth scheme this step would have to un-build, or leaving the
// ingestion page unusable until step 5.1 — both worse than shipping the
// same interim posture apps/admin's whole deployment already has (Vercel's
// own account-level SSO protection, CLAUDE.md's infra notes: "both sit
// behind Vercel's default SSO protection"). Every route here does nothing
// Stripe/Resend/ICS/entry-client-shaped (TECH-ARCHITECTURE.md section 3's
// hard actions-module list), so it doesn't touch the approval gate either.
// Flagged as a known gap for step 5.1 to close (see docs/BUILD-LOG.md).
export async function registerAdminRankingsRoutes(
  app: FastifyInstance,
  deps: AdminRankingsRoutesDeps,
): Promise<void> {
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
    const body = request.body as { csv?: string; appliedBy?: string } | undefined;
    if (!body?.csv) return reply.code(400).send({ error: 'Missing csv' });
    try {
      const rows = parseRankingCsv(body.csv);
      const fileHash = createHash('sha256').update(body.csv).digest('hex');
      const result = await applyRankingImport(deps.db, rows, fileHash, body.appliedBy ?? null);
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
    const { data, error } = await deps.db
      .from('tournaments')
      .select('id, tour, name, start_date, city, country')
      .is('entry_deadline', null)
      .order('start_date', { ascending: true });
    if (error) return reply.code(500).send({ error: error.message });
    // shortlistedCount is always 0 until step 3.2's Tournament Agent exists
    // to shortlist anything against these rows.
    return reply.send({
      tournaments: (data ?? []).map((t) => ({ ...t, shortlistedCount: 0 })),
    });
  });

  app.post('/admin/tournaments/:id/deadline', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { entryDeadline?: string } | undefined;
    if (!body?.entryDeadline) return reply.code(400).send({ error: 'Missing entryDeadline' });
    const { error } = await deps.db
      .from('tournaments')
      .update({ entry_deadline: body.entryDeadline, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) return reply.code(500).send({ error: error.message });
    return reply.send({ ok: true });
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
      .update({ state: 'applied', decided_at: new Date().toISOString() })
      .eq('id', id);
    if (stateError) return reply.code(500).send({ error: stateError.message });

    return reply.send({ ok: true });
  });

  app.post('/admin/corrections/:id/reject', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { error } = await deps.db
      .from('fact_corrections')
      .update({ state: 'rejected', decided_at: new Date().toISOString() })
      .eq('id', id);
    if (error) return reply.code(500).send({ error: error.message });
    return reply.send({ ok: true });
  });
}
