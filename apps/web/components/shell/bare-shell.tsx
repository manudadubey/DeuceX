import { Logo } from '@deucex/ui';

// `.bare` (Baseline §Shells and routes): "Onboarding, sign-in and the coach view drop the
// sidebar and topbar: centred column, logo, steps." No auth or interactivity here, so this
// stays a server component.
export function BareShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-screen place-items-center p-6">
      <div className="flex w-full max-w-[25rem] flex-col items-center gap-6">
        <Logo />
        <div className="w-full">{children}</div>
      </div>
    </main>
  );
}
