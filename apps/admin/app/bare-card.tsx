import type { ReactNode } from 'react';
import { Card, CardContent, Logo } from '@deucex/ui';

// The player app's bare shell (sign-in, confirm): one centred card.
export function BareCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="grid min-h-screen place-items-center p-4">
      <Card className="w-full max-w-sm">
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center gap-2.5">
            <Logo />
            <div className="leading-tight">
              <p className="text-sm font-medium">DeuceX Admin</p>
              <h1 className="text-sm text-muted-foreground">{title}</h1>
            </div>
          </div>
          {children}
        </CardContent>
      </Card>
    </main>
  );
}
