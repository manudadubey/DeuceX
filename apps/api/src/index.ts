import Fastify from 'fastify';

// This service owns anything with an external side effect or a scheduled
// job (webhooks, the queue worker, structured-output calls). Simple CRUD
// against the database is handled by Next.js server actions in apps/web
// instead. See TECH-ARCHITECTURE.md section 1.

export function buildServer() {
  const app = Fastify({ logger: true });

  app.get('/health', async () => ({ status: 'ok' }));

  return app;
}

async function main() {
  const app = buildServer();
  const port = Number(process.env.PORT ?? 8787);
  await app.listen({ port, host: '0.0.0.0' });
}

if (process.env.NODE_ENV !== 'test') {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
