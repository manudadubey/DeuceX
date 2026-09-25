import { BareCard } from '../bare-card';
import { SignInForm } from './sign-in-form';

// Staff sign-in (PRD-13 AD-1, decisions worksheet 11): a magic link to a
// staff address, then a mandatory passkey. No password anywhere, and no
// shared accounts: the link is only sent to an address that holds a role.
export default function SignInPage({ searchParams }: { searchParams: { error?: string } }) {
  return (
    <BareCard title="Staff sign-in">
      <SignInForm
        initialError={typeof searchParams.error === 'string' ? searchParams.error : null}
      />
    </BareCard>
  );
}
