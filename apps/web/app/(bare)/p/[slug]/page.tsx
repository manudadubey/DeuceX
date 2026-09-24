import { notFound } from 'next/navigation';
import { PatronPage, type PublicPatronPage } from './patron-page';

// PRD-04 section 4.3 / P-2, P-3, P-19, M-TIER-3: the public patron page. No
// session (a would-be patron has none), so the page is server-fetched from
// apps/api's GET /public/p/:slug, whose hand-built DTO is the only thing
// deciding what a stranger can see: tier names, prices and perks, and
// opted-in first names. PRD-11's full public profile (headline, bio, photo,
// results) is a later step; this is only the patron sign-up part PRD-04 fixes.
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787';

export default async function PublicPatronPageRoute({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: { src?: string };
}) {
  const res = await fetch(`${API_URL}/public/p/${encodeURIComponent(params.slug)}`, {
    cache: 'no-store',
  });
  if (res.status === 404) notFound();
  if (!res.ok) throw new Error(`Patron page failed to load: ${res.status}`);
  const page = (await res.json()) as PublicPatronPage;
  const source = ['profile', 'draw', 'direct'].includes(searchParams.src ?? '')
    ? searchParams.src!
    : 'unknown';
  return <PatronPage page={page} source={source} />;
}
