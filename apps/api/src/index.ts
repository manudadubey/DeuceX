import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createAnonClient, createServiceRoleClient } from '@deucex/db';
import { SupabaseAgentRunsDb, SupabaseApprovalGateDb } from '@deucex/actions';
import { createBoss } from '@deucex/actions/queue';
import {
  EXTRACTION_MODEL,
  FINANCIAL_ACTION_MODEL,
  INSIGHT_MODEL,
  PROSE_MODEL,
  RECEIPT_EXTRACTION_MODEL,
  createMockExtractionClient,
  createMockFinancialActionClient,
  createMockInsightClient,
  createMockProseClient,
  createMockReceiptExtractionClient,
  createOpenAIExtractionClient,
  createOpenAIFinancialActionClient,
  createOpenAIInsightClient,
  createOpenAIProseClient,
  createOpenAIReceiptExtractionClient,
  PATRON_NOTE_MODEL,
  createMockPatronNoteClient,
  createOpenAIPatronNoteClient,
  createMockContentDraftClient,
  createMockContentRewriteClient,
  createOpenAIContentDraftClient,
  createOpenAIContentRewriteClient,
  MENU_EXTRACTION_MODEL,
  createMockMenuExtractionClient,
  createOpenAIMenuExtractionClient,
} from '@deucex/agents';
import cors from '@fastify/cors';
import { config as loadEnv } from 'dotenv';
import Fastify from 'fastify';
import { registerNotesRoutes, type NotesRoutesDeps } from './notes/routes';
import {
  createNotesBoss,
  enqueueExtraction,
  enqueueTranscription,
  registerNotesWorkers,
} from './notes/queue';
import { runExtraction } from './notes/extraction';
import { transcribeNote } from './notes/service';
import { sweepExpiredAudio } from './notes/audio-lifecycle';
import { registerMindsetCoach } from './mindset-coach/worker';
import { registerFinancialRoutes, type FinancialRoutesDeps } from './financial/routes';
import { registerFinancialAgent, enqueueFinancialRecompute } from './financial/worker';
import { registerTournamentRoutes, type TournamentRoutesDeps } from './tournament/routes';
import { registerTournamentAgent } from './tournament/worker';
import { registerRankingsRoutes, type RankingsRoutesDeps } from './rankings/routes';
import { createDirectoryRankingAdapter } from './rankings/directory-adapter';
import { registerAdminRankingsRoutes, type AdminRankingsRoutesDeps } from './rankings/admin-routes';
import { registerFeedWindowScheduler } from './rankings/feed-monitor';
import { createMemoryStorageAdapter } from './storage/memory-adapter';
import { createR2Adapter } from './storage/r2-adapter';
import { createMoneyBoss } from './money/queue';
import { registerFxScheduler } from './fx/scheduler';
import { createEcbAdapter } from './fx/ecb-adapter';
import { registerReserveReminderScheduler } from './reserves/scheduler';
import { createMockTranscriptionAdapter } from './transcription/mock-adapter';
import { createWhisperAdapter } from './transcription/whisper-adapter';
import { registerAccountRoutes, type AccountRoutesDeps } from './account/routes';
import {
  registerAccountDeletionScheduler,
  SupabaseAccountDeletionSweepDb,
} from './account/scheduler';
import { registerSharingRoutes, type SharingRoutesDeps } from './sharing/routes';
import { SupabaseSharingDb } from './sharing/service';
import {
  createResendEmailClient,
  createResendEmailStatusClient,
  type EmailClient,
} from '@deucex/actions/account';
import { registerConditionsRoutes, type ConditionsRoutesDeps } from './conditions/routes';
import { createOpenMeteoAdapter } from './conditions/openmeteo-adapter';
import { registerConditionsRefreshScheduler } from './conditions/refresh-scheduler';
import { registerConditionsStampBackfillScheduler } from './conditions/stamp-backfill-scheduler';
import { createStripeFansClient } from '@deucex/actions/fans';
import { registerFansRoutes, type FansRoutesDeps } from './fans/routes';
import { registerFansAttentionScheduler } from './fans/scheduler';
import { SupabaseFansStore } from './fans/store';
import { SupabaseContentActionsDb } from '@deucex/actions/content';
import { registerContentRoutes, type ContentRoutesDeps } from './content/routes';
import { registerContentScheduler } from './content/scheduler';
import { latestTeaser, onNoteSaved } from './content/service';
import { SupabaseContentStore } from './content/store';
import { registerFuelRoutes, type FuelRoutesDeps } from './fuel/routes';
import { registerFuelOutcomeScheduler } from './fuel/scheduler';
import { SupabaseFuelStore } from './fuel/store';

// This service owns anything with an external side effect or a scheduled
// job (webhooks, the queue worker, structured-output calls). Simple CRUD
// against the database is handled by Next.js server actions in apps/web
// instead. See TECH-ARCHITECTURE.md section 1.

// Local-dev convenience only: Fly.io/Render (TECH-ARCHITECTURE.md section 1)
// inject env vars directly in staging and production, where no root .env
// exists, so this is a silent no-op there. Not loaded under NODE_ENV=test —
// tests use injected fakes (apps/api/src/test-support/fake-db.ts and the
// mock adapters), never real vendor credentials.
if (process.env.NODE_ENV !== 'test') {
  loadEnv({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) });
}

export function buildServer(
  notesDeps?: NotesRoutesDeps,
  rankingsDeps?: RankingsRoutesDeps,
  financialDeps?: FinancialRoutesDeps,
  accountDeps?: AccountRoutesDeps,
  sharingDeps?: SharingRoutesDeps,
  adminRankingsDeps?: AdminRankingsRoutesDeps,
  tournamentDeps?: TournamentRoutesDeps,
  conditionsDeps?: ConditionsRoutesDeps,
  fansDeps?: FansRoutesDeps,
  contentDeps?: ContentRoutesDeps,
  fuelDeps?: FuelRoutesDeps,
) {
  const app = Fastify({ logger: true });

  app.get('/health', async () => ({ status: 'ok' }));

  if (
    notesDeps ||
    rankingsDeps ||
    financialDeps ||
    accountDeps ||
    sharingDeps ||
    adminRankingsDeps ||
    tournamentDeps ||
    conditionsDeps ||
    fansDeps ||
    contentDeps ||
    fuelDeps
  ) {
    void app.register(cors, {
      origin: (process.env.CORS_ORIGIN ?? 'http://localhost:3000').split(','),
    });
  }

  if (notesDeps) {
    void app.register(async (instance) => {
      await registerNotesRoutes(instance, notesDeps);
    });
  }

  if (rankingsDeps) {
    void app.register(async (instance) => {
      await registerRankingsRoutes(instance, rankingsDeps);
    });
  }

  // Unauthenticated for this step; see admin-routes.ts's own design note.
  if (adminRankingsDeps) {
    void app.register(async (instance) => {
      await registerAdminRankingsRoutes(instance, adminRankingsDeps);
    });
  }

  if (financialDeps) {
    void app.register(async (instance) => {
      await registerFinancialRoutes(instance, financialDeps);
    });
  }

  if (tournamentDeps) {
    void app.register(async (instance) => {
      await registerTournamentRoutes(instance, tournamentDeps);
    });
  }

  if (conditionsDeps) {
    void app.register(async (instance) => {
      await registerConditionsRoutes(instance, conditionsDeps);
    });
  }

  if (accountDeps) {
    void app.register(async (instance) => {
      await registerAccountRoutes(instance, accountDeps);
    });
  }

  // Mixed on purpose (fans/routes.ts's own comment): player routes with a
  // bearer token, the public patron page's routes with none, and Stripe's
  // signature-verified webhook.
  if (fansDeps) {
    void app.register(async (instance) => {
      await registerFansRoutes(instance, fansDeps);
    });
  }

  if (contentDeps) {
    void app.register(async (instance) => {
      await registerContentRoutes(instance, contentDeps);
    });
  }

  if (fuelDeps) {
    void app.register(async (instance) => {
      await registerFuelRoutes(instance, fuelDeps);
    });
  }

  // Unauthenticated on purpose (sharing/routes.ts's own comment): a coach
  // or manager visitor has no Supabase session, so this is registered
  // outside the bearer-token deps grouped above.
  if (sharingDeps) {
    void app.register(async (instance) => {
      await registerSharingRoutes(instance, sharingDeps);
    });
  }

  return app;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var ${name}`);
  return value;
}

async function main() {
  const supabaseUrl = requireEnv('SUPABASE_URL');
  const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = requireEnv('SUPABASE_ANON_KEY');
  const dbConnectionString = requireEnv('SUPABASE_DB_URL');

  const db = createServiceRoleClient(supabaseUrl, serviceRoleKey);
  const anonClient = createAnonClient(supabaseUrl, anonKey);

  const r2AccountId = process.env.R2_ACCOUNT_ID;
  const r2AccessKeyId = process.env.R2_ACCESS_KEY_ID;
  const r2SecretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const r2Bucket = process.env.R2_BUCKET;
  const storage =
    r2AccountId && r2AccessKeyId && r2SecretAccessKey && r2Bucket
      ? createR2Adapter({
          accountId: r2AccountId,
          accessKeyId: r2AccessKeyId,
          secretAccessKey: r2SecretAccessKey,
          bucket: r2Bucket,
        })
      : (() => {
          console.warn(
            'R2_* env vars not set: falling back to an in-memory storage adapter. Audio will not survive a restart. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET for real storage.',
          );
          return createMemoryStorageAdapter();
        })();

  const openaiApiKey = process.env.OPENAI_API_KEY;
  const transcription = openaiApiKey
    ? createWhisperAdapter({ apiKey: openaiApiKey })
    : (() => {
        console.warn(
          'OPENAI_API_KEY not set: falling back to the mock transcription adapter. Set OPENAI_API_KEY for real Whisper transcription.',
        );
        return createMockTranscriptionAdapter();
      })();

  // Same OpenAI account and key as Whisper transcription above — one vendor
  // for both, per the step 1.2 follow-up that moved extraction off Claude.
  const extraction = openaiApiKey
    ? createOpenAIExtractionClient({ apiKey: openaiApiKey, model: EXTRACTION_MODEL })
    : (() => {
        console.warn(
          'OPENAI_API_KEY not set: falling back to the mock extraction client. Set OPENAI_API_KEY for real structured extraction.',
        );
        return createMockExtractionClient();
      })();
  // Same OpenAI account again for the Mindset Coach's daily insight (step 1.3).
  const insightClient = openaiApiKey
    ? createOpenAIInsightClient({ apiKey: openaiApiKey, model: INSIGHT_MODEL })
    : (() => {
        console.warn(
          'OPENAI_API_KEY not set: falling back to the mock insight client. Set OPENAI_API_KEY for a real Mindset Coach.',
        );
        return createMockInsightClient();
      })();
  // Same OpenAI account again for the Financial Agent's "one thing" action
  // sentence (step 2.2).
  const financialActionClient = openaiApiKey
    ? createOpenAIFinancialActionClient({ apiKey: openaiApiKey, model: FINANCIAL_ACTION_MODEL })
    : (() => {
        console.warn(
          'OPENAI_API_KEY not set: falling back to the mock financial action client. Set OPENAI_API_KEY for a real Financial Agent.',
        );
        return createMockFinancialActionClient();
      })();
  // Same OpenAI account, vision-capable, for receipt scanning (step 2.2).
  const receiptExtractionClient = openaiApiKey
    ? createOpenAIReceiptExtractionClient({ apiKey: openaiApiKey, model: RECEIPT_EXTRACTION_MODEL })
    : (() => {
        console.warn(
          'OPENAI_API_KEY not set: falling back to the mock receipt extraction client. Set OPENAI_API_KEY for real receipt scanning.',
        );
        return createMockReceiptExtractionClient();
      })();
  // Open-Meteo needs no API key (like ECB, fx/ecb-adapter.ts's own comment),
  // so it is always wired in — no fixture-vs-real fallback branch here.
  const weatherAdapter = createOpenMeteoAdapter();
  // Same OpenAI account again for the Conditions brief's comparison-and-
  // practice prose (step 3.3), batched up to five briefs per call.
  const proseClient = openaiApiKey
    ? createOpenAIProseClient({ apiKey: openaiApiKey, model: PROSE_MODEL })
    : (() => {
        console.warn(
          'OPENAI_API_KEY not set: falling back to the mock Conditions prose client. Set OPENAI_API_KEY for real briefs.',
        );
        return createMockProseClient();
      })();

  const agentRuns = new SupabaseAgentRunsDb(db);

  const boss = await createNotesBoss(dbConnectionString);
  // packages/actions' own boss (step 0.6's AGENT_RUN_QUEUE, gate/pause/retry
  // infra), separate from the notes boss above for the same reason its own
  // comment gives: different job shape, different pickup rules.
  const actionsBoss = await createBoss(dbConnectionString);
  await registerMindsetCoach(actionsBoss, { db, client: insightClient, agentRuns });
  await registerFinancialAgent(actionsBoss, { db, client: financialActionClient, agentRuns });
  await registerTournamentAgent(actionsBoss, { db, agentRuns, weatherAdapter, proseClient });

  // Step 2.1's own boss (money/queue.ts): the daily ECB fetch, the Sunday
  // reserve-balance reminder and (step 2.3) the fourteen-day account-
  // deletion sweep — none of which is a scheduled agent run in the
  // AGENT_RUN_QUEUE sense above. All three share this one boss instance
  // rather than each getting its own: SUPABASE_DB_URL is the session
  // pooler, capped at 15 clients, and a separate PgBoss instance per job
  // was found live, this session, to tip that cap over (EMAXCONNSESSION on
  // startup) — see money/queue.ts's own comment.
  const moneyBoss = await createMoneyBoss(dbConnectionString);
  await registerFxScheduler(moneyBoss, { db, adapter: createEcbAdapter() });
  await registerReserveReminderScheduler(moneyBoss, { db });
  await registerAccountDeletionScheduler(moneyBoss, {
    db: new SupabaseAccountDeletionSweepDb(db),
    storage,
  });
  await registerFeedWindowScheduler(moneyBoss, { db });
  await registerConditionsRefreshScheduler(moneyBoss, {
    db,
    agentRuns,
    weatherAdapter,
    proseClient,
  });
  await registerConditionsStampBackfillScheduler(moneyBoss, { db, weatherAdapter });
  const fansStore = new SupabaseFansStore(db);

  const resendApiKey = process.env.RESEND_API_KEY;
  const resendFromAddress = process.env.RESEND_FROM_ADDRESS;
  const email: EmailClient = resendApiKey
    ? createResendEmailClient({
        apiKey: resendApiKey,
        ...(resendFromAddress ? { from: resendFromAddress } : {}),
      })
    : (() => {
        console.warn(
          'RESEND_API_KEY not set: falling back to a logging email client. Account-deletion and export emails will only be logged, never sent. Set RESEND_API_KEY for real delivery.',
        );
        return {
          async sendEmail(input) {
            console.log(
              `[email:mock] to=${input.to} subject=${input.subject} attachments=${input.attachments?.map((a) => a.filename).join(',') ?? 'none'}`,
            );
          },
        };
      })();

  const notesDeps: NotesRoutesDeps = {
    db,
    anonClient,
    storage,
    transcription,
    extraction,
    agentRuns,
    weatherAdapter,
    enqueueTranscription: (noteId) => enqueueTranscription(boss, noteId),
    enqueueExtraction: (noteId) => enqueueExtraction(boss, noteId),
  };

  await registerNotesWorkers(boss, {
    transcribeNote: (noteId) => transcribeNote(notesDeps, noteId),
    extractNote: (noteId) =>
      runExtraction(
        { db, extractionClient: extraction, agentRuns, logger: notesDeps.logger },
        noteId,
      ),
    sweepExpiredAudio: async () => {
      await sweepExpiredAudio({ db, storage }, new Date());
    },
  });

  const rankingsDeps: RankingsRoutesDeps = {
    anonClient,
    // Step 3.1's real adapter: matches against the ranking_snapshots
    // directory a CSV import builds up, rather than always returning
    // "unverified" (createUnverifiedRankingAdapter, kept in
    // rankings/unverified-adapter.ts as the pre-step-3.1 fallback and in
    // tests). See rankings/directory-adapter.ts.
    ranking: createDirectoryRankingAdapter(db),
  };

  const adminRankingsDeps: AdminRankingsRoutesDeps = { db };

  const financialDeps: FinancialRoutesDeps = {
    db,
    anonClient,
    extractionClient: receiptExtractionClient,
    agentRuns,
    enqueueRecompute: (playerId) => enqueueFinancialRecompute(actionsBoss, playerId),
  };

  const appBaseUrl = process.env.APP_BASE_URL ?? 'http://localhost:3000';
  const accountDeps: AccountRoutesDeps = { db, anonClient, email, appBaseUrl };
  const sharingDeps: SharingRoutesDeps = { db: new SupabaseSharingDb(db) };
  const tournamentDeps: TournamentRoutesDeps = { db, anonClient };
  const conditionsDeps: ConditionsRoutesDeps = {
    db,
    anonClient,
    agentRuns,
    weatherAdapter,
    proseClient,
  };

  // Step 4.1: Stripe Connect (sandbox until launch). No key means every
  // Stripe-backed Fans route answers 503, never a silent mock: a fake
  // checkout would be worse than an honest "not configured".
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    console.warn(
      'STRIPE_SECRET_KEY not set: Fans routes that reach Stripe (Connect onboarding, tiers, checkout) will answer 503. Set STRIPE_SECRET_KEY (a test-mode sk_test_ key) to enable them.',
    );
  }
  const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? null;
  if (!stripeWebhookSecret) {
    console.warn(
      'STRIPE_WEBHOOK_SECRET not set: /webhooks/stripe will answer 503. The thank-you page still records new patrons on return from Checkout.',
    );
  }
  // Same OpenAI account again for Fans' drafted patron notes (step 4.1).
  const noteClient = openaiApiKey
    ? createOpenAIPatronNoteClient({ apiKey: openaiApiKey, model: PATRON_NOTE_MODEL })
    : (() => {
        console.warn(
          'OPENAI_API_KEY not set: falling back to the mock patron-note client. Set OPENAI_API_KEY for real drafted notes.',
        );
        return createMockPatronNoteClient();
      })();
  const fansDeps: FansRoutesDeps = {
    db,
    anonClient,
    store: fansStore,
    stripe: stripeSecretKey ? createStripeFansClient({ secretKey: stripeSecretKey }) : null,
    webhookSecret: stripeWebhookSecret,
    email,
    noteClient,
    agentRuns,
    appBaseUrl,
    // Step 4.1b: the HMAC key for patrons' emailed manage links. Set
    // PATRON_LINK_SECRET in production; locally it falls back to a key
    // derived from the service-role key, which is server-only too, so links
    // still can't be forged without it.
    linkSecret:
      process.env.PATRON_LINK_SECRET ??
      createHash('sha256').update(`patron-link:${serviceRoleKey}`).digest('hex'),
  };

  // The 06:00 attention pass, plus (step 4.1b) the 90-day paused-membership
  // sweep, which needs Stripe to cancel and so only runs when a key is set.
  await registerFansAttentionScheduler(moneyBoss, {
    store: fansStore,
    expiry: fansDeps.stripe
      ? { store: fansStore, stripe: fansDeps.stripe, email, appBaseUrl }
      : null,
  });

  // Step 4.2: the Content Agent. Drafts on gpt-4o and rewrites on
  // gpt-4o-mini (owner decision), the same OpenAI account again; open rates
  // are polled back from Resend (owner decision: no public URL for a webhook
  // yet), so without a Resend key they simply stay blank.
  const contentStore = new SupabaseContentStore(db);
  const contentDeps: ContentRoutesDeps = {
    anonClient,
    store: contentStore,
    draftClient: openaiApiKey
      ? createOpenAIContentDraftClient({ apiKey: openaiApiKey })
      : (() => {
          console.warn(
            'OPENAI_API_KEY not set: falling back to the mock Content Agent clients. Set OPENAI_API_KEY for real patron-update drafts.',
          );
          return createMockContentDraftClient();
        })(),
    rewriteClient: openaiApiKey
      ? createOpenAIContentRewriteClient({ apiKey: openaiApiKey })
      : createMockContentRewriteClient(),
    agentRuns,
    email,
    statusClient: resendApiKey ? createResendEmailStatusClient({ apiKey: resendApiKey }) : null,
    gateDb: new SupabaseApprovalGateDb(db),
    actionsDb: new SupabaseContentActionsDb(db),
    appBaseUrl,
  };
  notesDeps.onNoteSaved = (input) => onNoteSaved(contentDeps, input);
  fansDeps.latestTeaser = (playerId) => latestTeaser(contentDeps, playerId);
  await registerContentScheduler(moneyBoss, contentDeps);

  // Step 4.3: Fuel's menu scan, the same OpenAI account and vision model as
  // receipts. The hourly outcome sweep shares the money boss.
  const menuExtractionClient = openaiApiKey
    ? createOpenAIMenuExtractionClient({ apiKey: openaiApiKey, model: MENU_EXTRACTION_MODEL })
    : (() => {
        console.warn(
          'OPENAI_API_KEY not set: falling back to the mock menu extraction client (the Sibiu sample menu). Set OPENAI_API_KEY for real menu scanning.',
        );
        return createMockMenuExtractionClient();
      })();
  const fuelStore = new SupabaseFuelStore(db);
  const fuelDeps: FuelRoutesDeps = {
    anonClient,
    store: fuelStore,
    extractionClient: menuExtractionClient,
    agentRuns,
    async getTier(playerId) {
      const { data, error } = await db
        .from('players')
        .select('tier')
        .eq('id', playerId)
        .maybeSingle();
      if (error) throw error;
      return data?.tier ?? null;
    },
  };
  await registerFuelOutcomeScheduler(moneyBoss, { store: fuelStore });

  const app = buildServer(
    notesDeps,
    rankingsDeps,
    financialDeps,
    accountDeps,
    sharingDeps,
    adminRankingsDeps,
    tournamentDeps,
    conditionsDeps,
    fansDeps,
    contentDeps,
    fuelDeps,
  );
  const port = Number(process.env.PORT ?? 8787);
  await app.listen({ port, host: '0.0.0.0' });
}

if (process.env.NODE_ENV !== 'test') {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
