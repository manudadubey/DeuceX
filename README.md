# DeuceX

Agentic SaaS for ATP and WTA players ranked roughly #150 to #1500. See `CLAUDE.md` for the
working rules and `docs/` for the requirements pack (PRD-00 to PRD-13), the technical
architecture, the build plan, and the decisions already settled.

## Layout

- `apps/web` — the player app (Next.js).
- `apps/admin` — the staff console (Next.js, separate deployment and auth).
- `apps/api` — the Fastify service: agent orchestration, webhooks, scheduled jobs.
- `packages/ui` — the Baseline design system port.
- `packages/db` — Supabase client and migrations.
- `packages/agents` — schema-validated agent functions (no vendor imports).
- `packages/actions` — the only package allowed to call Stripe, Resend, ICS, or entry clients.
- `packages/shared` — cross-cutting types and constants.
- `docs/` — the requirements pack and the two clickable prototypes it was written against.

## Getting started

```bash
pnpm install
pnpm -r typecheck
pnpm test
```

Copy `.env.example` to `.env` and fill in the Supabase keys before running `apps/api` or
either Next.js app against the real database.

## Where to pick up next

One step of `docs/BUILD-PLAN-CLAUDE-CODE.md` per session, starting at step 0.2 (database,
migrations, row-level security).
