import { createAnonClient, createServiceRoleClient } from '@procircuit/db';
import cors from '@fastify/cors';
import Fastify from 'fastify';
import { registerNotesRoutes, type NotesRoutesDeps } from './notes/routes';
import { createNotesBoss, enqueueTranscription, registerNotesWorkers } from './notes/queue';
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

  const boss = await createNotesBoss(dbConnectionString);
  const notesDeps: NotesRoutesDeps = {
    db,
    anonClient,
    storage,
    transcription,
    enqueueTranscription: (noteId) => enqueueTranscription(boss, noteId),
  };

  await registerNotesWorkers(boss, {
    transcribeNote: (noteId) => transcribeNote(notesDeps, noteId),
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
