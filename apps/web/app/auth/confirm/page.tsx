import { confirmSignIn } from './actions';

// A page, not an auto-verifying route: Supabase's own guidance is explicit
// that a bare GET link is unsafe here, because enterprise/webmail link
// scanners (confirmed live against Gmail while building this) prefetch and
// burn the single-use token before the real player ever sees the email.
// Requiring an explicit click means a scanner's GET only renders this page;
// verifyOtp only runs from the server action a human click submits.
export default function ConfirmSignInPage({
  searchParams,
}: {
  searchParams: { token_hash?: string; type?: string };
}) {
  const tokenHash = typeof searchParams.token_hash === 'string' ? searchParams.token_hash : '';
  const type = typeof searchParams.type === 'string' ? searchParams.type : '';

  if (!tokenHash || !type) {
    return (
      <main>
        <p>That sign-in link is invalid or has expired.</p>
      </main>
    );
  }

  return (
    <main>
      <p>DeuceX</p>
      <form action={confirmSignIn}>
        <input type="hidden" name="token_hash" value={tokenHash} />
        <input type="hidden" name="type" value={type} />
        <button type="submit">Sign in</button>
      </form>
    </main>
  );
}
