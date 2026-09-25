import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@deucex/db';
import { recordRun, type AgentRunsDb } from '@deucex/actions';
import {
  MAX_BRIEFS_PER_PROSE_CALL,
  PROSE_MODEL,
  generateConditionsProse,
  type ProseBriefInput,
  type ProseModelClient,
} from '@deucex/agents';
import {
  computeBriefForTournament,
  loadEquipmentProfileInput,
  loadPreviousStampedEvent,
} from './compute';
import { persistConditionsBrief } from './persist';
import type { WeatherAdapter } from './adapter';

export const CONDITIONS_AGENT_NAME = 'conditions';
export const CONDITIONS_SCHEMA_VERSION = 'v1';

function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

export interface ConditionsRunDeps {
  db: SupabaseClient<Database>;
  agentRuns: AgentRunsDb;
  weatherAdapter: WeatherAdapter;
  proseClient: ProseModelClient;
  logger?: { error(...args: unknown[]): void };
}

type TournamentRow = Database['public']['Tables']['tournaments']['Row'];

// PRD-08 section 3: "runs inside every Tournament Agent run" — called from
// tournament/run.ts right after persistShortlist, one brief per shortlisted
// candidate, batched up to MAX_BRIEFS_PER_PROSE_CALL per model call (the
// "five briefs per run" cost line). Two-phase persistence: the deterministic
// tiles (brief.ts, no model call) are written first and unconditionally, so
// a prose failure never blocks the tiles from showing (section 3's "no
// failure blocks the Tournament Agent run" — the same standard applies to
// this layer's own prose step, since it's just as skippable as a stale
// forecast); the comparison-and-practice sentence is filled in by a second
// write only if its batch's model call succeeds.
export async function runConditionsForCandidates(
  deps: ConditionsRunDeps,
  playerId: string,
  tournaments: readonly TournamentRow[],
  now: Date = new Date(),
): Promise<void> {
  if (tournaments.length === 0) return;
  const logger = deps.logger ?? console;

  const equipment = await loadEquipmentProfileInput(deps.db, playerId);
  const previousEvent = await loadPreviousStampedEvent(deps.db, playerId);

  const computed = await Promise.all(
    tournaments.map((tournament) =>
      computeBriefForTournament(deps.weatherAdapter, tournament, equipment, previousEvent, now),
    ),
  );

  for (const b of computed) {
    await persistConditionsBrief(deps.db, {
      playerId,
      tournamentId: b.tournamentId,
      runId: null,
      rules: b.rules,
      diff: '',
      practice: '',
      equipmentVersion: equipment.version,
      forecastAt: now.toISOString(),
    });
  }

  for (const batch of chunk(computed, MAX_BRIEFS_PER_PROSE_CALL)) {
    const proseInputs: ProseBriefInput[] = batch.map((b) => ({
      tournamentId: b.tournamentId,
      name: b.name,
      city: b.city,
      rules: b.rules,
      previousEvent: b.previousEvent,
    }));
    const inputsHash = createHash('sha256')
      .update(JSON.stringify({ playerId, proseInputs }))
      .digest('hex');

    try {
      const { output } = await recordRun(
        deps.agentRuns,
        {
          agentName: CONDITIONS_AGENT_NAME,
          playerId,
          triggerType: 'event',
          inputsHash,
          model: PROSE_MODEL,
          promptVersion: '1',
          schemaVersion: CONDITIONS_SCHEMA_VERSION,
        },
        async () => {
          const result = await generateConditionsProse(deps.proseClient, proseInputs);
          return { output: result.output as unknown as Json, usage: result.usage };
        },
      );

      const prose = (
        output as unknown as { briefs: { tournamentId: string; diff: string; practice: string }[] }
      ).briefs;
      const proseById = new Map(prose.map((p) => [p.tournamentId, p]));

      for (const b of batch) {
        const p = proseById.get(b.tournamentId);
        if (!p) continue;
        await persistConditionsBrief(deps.db, {
          playerId,
          tournamentId: b.tournamentId,
          runId: null,
          rules: b.rules,
          diff: p.diff,
          practice: p.practice,
          equipmentVersion: equipment.version,
          forecastAt: now.toISOString(),
        });
      }
    } catch (err) {
      logger.error(`[conditions] prose batch failed for player ${playerId}:`, err);
    }
  }
}
