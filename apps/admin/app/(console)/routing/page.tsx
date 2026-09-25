import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@deucex/ui';
import { PageHeader } from '@/components/page';
import type { RoutingRow } from '@/lib/api';
import { requireArea, serverApi } from '@/lib/server-api';
import { RoutingForm } from './routing-form';

// AD-27 (Should). The routing is stored and editable now; push and email
// delivery to staff arrives with step 5.2's notification service, so until
// then every alert reaches staff in the console's Alerts sheet only.
export default async function RoutingPage() {
  const me = await requireArea('routing');
  const rows = await serverApi<RoutingRow[]>('/admin/routing');
  return (
    <>
      <PageHeader
        title="Alert routing"
        description="Which alerts reach which role, and how. A needs-action alert always reaches at least one person in the role that owns it."
        note="Push and email delivery to staff arrives with step 5.2's notification service. Until then every alert shows in the Alerts sheet only."
      />
      <RoutingForm rows={rows} />
      <Card>
        <CardHeader>
          <CardTitle>On call for distress cases</CardTitle>
          <CardDescription>
            The person who must confirm within 24 hours that the &ldquo;Someone to call&rdquo; card
            was shown (AD-25).
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm">
          The owner holds it until there is a second person
          {me.actingRole === 'owner' ? ' (you)' : ''}. A rotation is a later step.
        </CardContent>
      </Card>
    </>
  );
}
