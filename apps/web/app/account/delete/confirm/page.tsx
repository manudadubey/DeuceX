import { confirmAccountDeletionAction } from './actions';

// GET renders this page only — see actions.ts for why the actual
// confirmation only ever runs from the form's server action, never a bare
// GET handler.
export default function ConfirmAccountDeletionPage({
  searchParams,
}: {
  searchParams: { token?: string; error?: string };
}) {
  const token = typeof searchParams.token === 'string' ? searchParams.token : '';

  if (!token) {
    return (
      <main>
        <p>That link is invalid or has expired.</p>
      </main>
    );
  }

  return (
    <main>
      <p>ProCircuit</p>
      <h1>Confirm account deletion</h1>
      <p>
        Clicking below starts a 14-day cooling-off period. Your plan, patron billing and agents
        pause immediately; nothing is deleted until the 14 days pass, and you can cancel any time
        before then from Settings &gt; Data &amp; safety.
      </p>
      {searchParams.error && <p role="alert">That link is invalid or has expired.</p>}
      <form action={confirmAccountDeletionAction}>
        <input type="hidden" name="token" value={token} />
        <button type="submit">Confirm account deletion</button>
      </form>
    </main>
  );
}
