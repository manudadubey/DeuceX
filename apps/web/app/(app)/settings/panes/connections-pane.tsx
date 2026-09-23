import {
  Badge,
  Card,
  CardHeader,
  CardTitle,
  Item,
  ItemDescription,
  ItemTitle,
} from '@procircuit/ui';

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
    name: 'Stripe Connect Express',
    description: 'Patron payments and payouts. Arrives with Fans.',
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

// PRD-12 §4.8, ST-13. None of these are genuinely wired to a per-player
// connection yet — every named integration here belongs to a later build
// step, so this pane states that plainly rather than faking a green badge.
// Bank is the one deliberate "not offered," not a gap (the explicit
// decision behind M-CUR/reserve entries: no bank connection, ever).
export function ConnectionsPane() {
  return (
    <Card className="gap-6 p-6">
      <CardHeader className="p-0">
        <CardTitle>Connections</CardTitle>
      </CardHeader>
      <div className="flex flex-col gap-2">
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
              Not offered. Balances are entered by you; receipts are scanned. ProCircuit never holds
              bank logins.
            </ItemDescription>
          </div>
          <Badge variant="secondary">Not offered</Badge>
        </Item>
      </div>
    </Card>
  );
}
