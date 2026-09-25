import { Button } from '@deucex/ui';
import { BareCard } from '../../bare-card';
import { confirmSignIn } from './actions';

// A page, not an auto-verifying route, for the same reason as the player
// app's (apps/web/app/auth/confirm): mail scanners prefetch links and would
// burn the single-use token. Only a human click runs verifyOtp.
export default function ConfirmPage({
  searchParams,
}: {
  searchParams: { token_hash?: string; type?: string };
}) {
  const tokenHash = typeof searchParams.token_hash === 'string' ? searchParams.token_hash : '';
  const type = typeof searchParams.type === 'string' ? searchParams.type : '';

  return (
    <BareCard title="Staff sign-in">
      {!tokenHash || !type ? (
        <p className="text-sm text-muted-foreground">
          That sign-in link is invalid or has expired.
        </p>
      ) : (
        <form action={confirmSignIn} className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            Continue to confirm it is you with your passkey.
          </p>
          <input type="hidden" name="token_hash" value={tokenHash} />
          <input type="hidden" name="type" value={type} />
          <Button type="submit">Continue</Button>
        </form>
      )}
    </BareCard>
  );
}
