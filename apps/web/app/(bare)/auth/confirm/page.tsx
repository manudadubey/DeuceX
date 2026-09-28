import Link from 'next/link';
import { Button, Card, CardContent } from '@deucex/ui';
import { confirmSignIn } from './actions';

// A page, not an auto-verifying route: Supabase's own guidance is explicit
// that a bare GET link is unsafe here, because enterprise/webmail link
// scanners (confirmed live against Gmail while building this) prefetch and
// burn the single-use token before the real player ever sees the email.
// Requiring an explicit click means a scanner's GET only renders this page;
// verifyOtp only runs from the server action a human click submits.
//
// Lives in the (bare) group for the sign-in page's shell and card; the URL
// is still /auth/confirm, which the Supabase email templates link to.
// type=email is the Confirm sign up template (a new address); magiclink is a
// returning player.
export default function ConfirmSignInPage({
  searchParams,
}: {
  searchParams: { token_hash?: string; type?: string };
}) {
  const tokenHash = typeof searchParams.token_hash === 'string' ? searchParams.token_hash : '';
  const type = typeof searchParams.type === 'string' ? searchParams.type : '';
  const signingUp = type === 'email' || type === 'signup';

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div>
          <p className="text-sm font-medium">DeuceX</p>
          <h1 className="text-sm text-muted-foreground">
            {signingUp ? 'Finish creating your account' : 'Sign in'}
          </h1>
        </div>

        {!tokenHash || !type ? (
          <>
            <p role="alert" className="text-sm text-danger">
              That link is invalid or has expired.
            </p>
            <Link href="/signin" className="text-sm font-medium text-foreground underline">
              Get a new link
            </Link>
          </>
        ) : (
          <form action={confirmSignIn} className="flex flex-col gap-4">
            <input type="hidden" name="token_hash" value={tokenHash} />
            <input type="hidden" name="type" value={type} />
            <p className="text-sm text-muted-foreground">
              One more tap. It stops email security scanners from using your link before you do.
            </p>
            <Button type="submit">{signingUp ? 'Continue to setup' : 'Sign in'}</Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
