import { Empty } from '@procircuit/ui';
import { PasskeyRegister } from './passkey-register';

// Billing, notifications, agent scheduling and API connections all belong to PRD-12, not
// yet built. The passkey control lives here (not on the dashboard, where step 0.3 put it
// only because there was nowhere else) since this is now that "somewhere else".
export default function SettingsPage() {
  return (
    <>
      <div className="rounded-xl bg-card p-6 shadow-[0_0_0_1px_var(--border),0_1px_2px_rgba(0,0,0,.05)]">
        <h2 className="text-base font-medium">Passkeys</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Register a passkey to sign in without a magic-link email.
        </p>
        <div className="mt-4">
          <PasskeyRegister />
        </div>
      </div>
      <Empty title="Nothing else here yet">
        Billing, notifications, agent scheduling and API connections arrive with PRD-12.
      </Empty>
    </>
  );
}
