import { Badge, Card, CardHeader, CardTitle, Item, ItemDescription, ItemTitle } from '@deucex/ui';
import { StripeConnectionItem } from '@/components/fans/patron-settings';

const CONNECTIONS: { name: string; description: string; status: 'not_yet' | 'not_offered' }[] = [
  {
    name: 'ATP ranking',
    description: 'Live feed, player ID, Monday 02:00 UTC. Arrives with Rankings and calendars.',
    status: 'not_yet',
  },
  {
    name: 'ITF ranking and calendar',
    description: 'Weekly refresh. Arrives with Rankings and calendars.',
    status: 'not_yet',
  },
  {
    name: 'Resend',
    description: 'Patron update email, domain verification. Arrives with the Content Agent.',
    status: 'not_yet',
  },
  {
    name: 'Calendar feed',
    description: 'A copyable .ics link of your entries. Arrives with the Tournament Agent.',
    status: 'not_yet',
  },
];

// PRD-12 §4.8, ST-13. Stripe Connect Express is real since step 4.1 (its
// own live row below); the rest belong to later build steps, so this pane
// states that plainly rather than faking a green badge.
// Bank is the one deliberate "not offered," not a gap (the explicit
// decision behind M-CUR/reserve entries: no bank connection, ever).
export function ConnectionsPane({ playerId }: { playerId: string }) {
  return (
    <Card className="gap-6 p-6">
      <CardHeader className="p-0">
        <CardTitle>Connections</CardTitle>
      </CardHeader>
      <div className="flex flex-col gap-2">
        <StripeConnectionItem playerId={playerId} />
        {CONNECTIONS.map((c) => (
          <Item key={c.name}>
            <div className="flex-1">
              <ItemTitle>{c.name}</ItemTitle>
              <ItemDescription>{c.description}</ItemDescription>
            </div>
            <Badge variant="secondary">Not connected yet</Badge>
          </Item>
        ))}
        <Item>
          <div className="flex-1">
            <ItemTitle>Bank</ItemTitle>
            <ItemDescription>
              Not offered. Balances are entered by you; receipts are scanned. DeuceX never holds
              bank logins.
            </ItemDescription>
          </div>
          <Badge variant="secondary">Not offered</Badge>
        </Item>
      </div>
    </Card>
  );
}
