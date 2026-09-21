import { fileURLToPath } from 'node:url';
import { createAnonClient, createServiceRoleClient } from '@procircuit/db';
import { SupabaseAgentRunsDb } from '@procircuit/actions';
import {
  EXTRACTION_MODEL,
  createMockExtractionClient,
  createOpenAIExtractionClient,
} from '@procircuit/agents';
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
import { createMemoryStorageAdapter } from './storage/memory-adapter';
import { createR2Adapter } from './storage/r2-adapter';
import { createMockTranscriptionAdapter } from './transcription/mock-adapter';
import { createWhisperAdapter } from './transcription/whisper-adapter';

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

export function buildServer(notesDeps?: NotesRoutesDeps) {
  const app = Fastify({ logger: true });

  app.get('/health', async () => ({ status: 'ok' }));

  if (notesDeps) {
    void app.register(cors, {
      origin: (process.env.CORS_ORIGIN ?? 'http://localhost:3000').split(','),
    });
    void app.register(async (instance) => {
      await registerNotesRoutes(instance, notesDeps);
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
  const agentRuns = new SupabaseAgentRunsDb(db);

  const boss = await createNotesBoss(dbConnectionString);
  const notesDeps: NotesRoutesDeps = {
    db,
    anonClient,
    storage,
    transcription,
    extraction,
    agentRuns,
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

  const app = buildServer(notesDeps);
  const port = Number(process.env.PORT ?? 8787);
  await app.listen({ port, host: '0.0.0.0' });
}

if (process.env.NODE_ENV !== 'test') {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
