import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Button, Card, CardContent, Field, FieldDescription, FieldLabel, Input } from '@deucex/ui';
import { createClient } from '@/lib/supabase/server';
import { requestMagicLink } from './actions';
import { PasskeySignIn } from './passkey-sign-in';

// Bare shell matching the prototype's #/signin (docs/deucex-dashboard.html)
// and PRD-12 section 4.11 / ST-21: email field, magic link, optional passkey,
// no password field anywhere (M-ID-1, decisions worksheet 11).
//
// "Create an account" can't go straight to /onboarding the way the
// prototype's does: onboarding needs a session, so it bounced a signed-out
// visitor straight back here. It opens this page in create mode instead: the
// same email link (Supabase creates the user on first use), worded for a new
// player, and confirming the link lands them in onboarding.
export default async function SignInPage({
  searchParams,
}: {
  searchParams: { sent?: string; error?: string; new?: string };
}) {
  const supabase = createClient();
  const { data } = await supabase.auth.getClaims();
  if (data?.claims) {
    redirect('/');
  }

  const sent = typeof searchParams.sent === 'string' ? searchParams.sent : undefined;
  const error = typeof searchParams.error === 'string' ? searchParams.error : undefined;
  const creating = searchParams.new === '1';

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div>
          <p className="text-sm font-medium">DeuceX</p>
          <h1 className="text-sm text-muted-foreground">
            {creating ? 'Create an account' : 'Sign in'}
          </h1>
        </div>

        {sent ? (
          <p className="text-sm text-muted-foreground">
            {creating
              ? `Check ${sent} for a link. It opens setup, which takes about four minutes.`
              : `Check ${sent} for a link that signs you in.`}
          </p>
        ) : (
          <form action={requestMagicLink} className="flex flex-col gap-4">
            {creating ? <input type="hidden" name="mode" value="new" /> : null}
            <Field>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input id="email" name="email" type="email" autoComplete="username" required />
              <FieldDescription>
                {creating ? (
                  'We email you a link to start setup. No password to remember, none stored.'
                ) : (
                  <>
                    We email you a link that signs you in. No password to remember, none stored.{' '}
                    <PasskeySignIn />
                  </>
                )}
              </FieldDescription>
              {error ? (
                <p role="alert" className="text-sm text-danger">
                  {error}
                </p>
              ) : null}
            </Field>
            <Button type="submit">
              {creating ? 'Email me a link to get started' : 'Email me a sign-in link'}
            </Button>
          </form>
        )}

        <p className="text-center text-sm text-muted-foreground">
          {creating ? (
            <>
              Already have an account?{' '}
              <Link href="/signin" className="font-medium text-foreground underline">
                Sign in
              </Link>
            </>
          ) : (
            <>
              New here?{' '}
              <Link href="/signin?new=1" className="font-medium text-foreground underline">
                Create an account
              </Link>
            </>
          )}
        </p>
      </CardContent>
    </Card>
  );
}
