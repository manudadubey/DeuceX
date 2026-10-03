import Link from 'next/link';
import { Button, Card, CardContent } from '@deucex/ui';
import { confirmAccountDeletionAction } from './actions';

// GET renders this page only — see actions.ts for why the actual
// confirmation only ever runs from the form's server action, never a bare
// GET handler. In the (bare) group for the sign-in card, like /auth/confirm;
// the URL the deletion email links to is unchanged.
export default function ConfirmAccountDeletionPage({
  searchParams,
}: {
  searchParams: { token?: string; error?: string };
}) {
  const token = typeof searchParams.token === 'string' ? searchParams.token : '';

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div>
          <p className="text-sm font-medium">DeuceX</p>
          <h1 className="text-sm text-muted-foreground">Confirm account deletion</h1>
        </div>

        {!token || searchParams.error ? (
          <>
            <p role="alert" className="text-sm text-danger">
              That link is invalid or has expired.
            </p>
            <Link
              href="/settings?pane=data"
              className="text-sm font-medium text-foreground underline"
            >
              Request a new one in Settings
            </Link>
          </>
        ) : (
          <form action={confirmAccountDeletionAction} className="flex flex-col gap-4">
            <input type="hidden" name="token" value={token} />
            <p className="text-sm text-muted-foreground">
              Confirming starts a 14-day cooling-off period. Everything keeps working until then,
              and you can cancel any time before day 14 from Settings &gt; Data &amp; safety. On day
              14 your account and all its data are deleted for good, every patron membership ends
              and each patron gets one email saying so. After that it can&apos;t be undone.
            </p>
            <Button type="submit" variant="destructive">
              Confirm account deletion
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
