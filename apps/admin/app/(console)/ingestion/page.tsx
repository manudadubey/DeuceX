import { PageHeader } from '@/components/page';
import { requireArea } from '@/lib/server-api';
import { IngestionClient } from './ingestion-client';

// PRD-13 section 4.5. Ops and owner only (AD-2); step 3.1's routes now
// require the staff session and write an audit row per change.
export default async function IngestionPage() {
  await requireArea('ingestion');
  return (
    <>
      <PageHeader
        title="Data ingestion and overrides"
        description="The feeds every agent reads, and the manual paths that keep the product working before a licensed feed is signed or when a feed is wrong."
      />
      <IngestionClient />
    </>
  );
}
