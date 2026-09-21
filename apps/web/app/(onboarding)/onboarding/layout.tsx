import { redirect } from 'next/navigation';
import { Logo } from '@procircuit/ui';
import { createClient } from '@/lib/supabase/server';

// The bare, no-sidebar-no-topbar shell (PRD-11 section 4.1), but wider than
// BareShell's signin/coach column: the step 1 to 4 rail and card need the
// prototype's 760px column, not signin's 400px one. Auth-gated here, the
// same single-place pattern (app)/layout.tsx uses, rather than in every
// step.
export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect('/signin');

  return (
    <main className="grid min-h-screen place-items-center p-6">
      <div className="flex w-full max-w-[47.5rem] flex-col gap-6 py-10">
        <div className="flex items-center gap-2.5 self-center">
          <Logo className="size-8" />
          <div>
            <div className="text-sm font-medium">ProCircuit</div>
            <div className="text-xs text-muted-foreground">Set up in about four minutes</div>
          </div>
        </div>
        {children}
      </div>
    </main>
  );
}
