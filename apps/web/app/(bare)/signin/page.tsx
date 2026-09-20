import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  Button,
  Card,
  CardContent,
  Field,
  FieldDescription,
  FieldLabel,
  Input,
} from '@procircuit/ui';
import { createClient } from '@/lib/supabase/server';
import { requestMagicLink } from './actions';
import { PasskeySignIn } from './passkey-sign-in';

// Bare shell matching the prototype's #/signin (docs/procircuit-dashboard.html)
// and PRD-12 section 4.11 / ST-21: email field, magic link, optional passkey,
// no password field anywhere (M-ID-1, decisions worksheet 11).
export default async function SignInPage({
  searchParams,
}: {
  searchParams: { sent?: string; error?: string };
}) {
  const supabase = createClient();
  const { data } = await supabase.auth.getClaims();
  if (data?.claims) {
    redirect('/');
  }

  const sent = typeof searchParams.sent === 'string' ? searchParams.sent : undefined;
  const error = typeof searchParams.error === 'string' ? searchParams.error : undefined;

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div>
          <p className="text-sm font-medium">ProCircuit</p>
          <h1 className="text-sm text-muted-foreground">Sign in</h1>
        </div>

        {sent ? (
          <p className="text-sm text-muted-foreground">
            Check {sent} for a link that signs you in.
          </p>
        ) : (
          <form action={requestMagicLink} className="flex flex-col gap-4">
            <Field>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input id="email" name="email" type="email" autoComplete="username" required />
              <FieldDescription>
                We email you a link that signs you in. No password to remember, none stored.{' '}
                <PasskeySignIn />
              </FieldDescription>
              {error ? (
                <p role="alert" className="text-sm text-danger">
                  {error}
                </p>
              ) : null}
            </Field>
            <Button type="submit">Email me a sign-in link</Button>
          </form>
        )}

        <p className="text-center text-sm text-muted-foreground">
          New here?{' '}
          <Link href="/onboarding" className="font-medium text-foreground underline">
            Create an account
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
