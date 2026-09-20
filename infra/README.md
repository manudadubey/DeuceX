# Infra

Hosting layout (TECH-ARCHITECTURE.md section 1):

- **apps/web** and **apps/admin** — Vercel, two separate deployments/hostnames. Admin never shares
  a session or database role with the player app (register decision A18).
- **apps/api** — a long-running Node process (Fastify + the pg-boss worker), which does not suit
  Vercel's serverless model. Fly.io or Render, not yet provisioned.
- **Database** — Supabase project `gpzpmrumwaqyfkyvqbgl` ("ProCircuit", org `MD Labs`,
  `ap-northeast-1`). Shared with an unrelated pre-existing schema (matches/points/stats); RLS is on
  for those tables. ProCircuit's own schema starts in build step 0.2.
- **Object storage** — Cloudflare R2 for audio and photos. Not yet provisioned.
- **GitHub** — `matsudadubey/ProCircuit`.

Nothing here is provisioned yet beyond the Supabase project and the GitHub repo. Fly/Render and R2
are picked up when the steps that need them (0.6 onward) are reached.
