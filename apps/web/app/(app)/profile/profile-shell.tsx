'use client';

import { useCallback, useState } from 'react';
import { Empty, Toast, ToastProvider, ToastTitle, ToastViewport } from '@procircuit/ui';
import type { Player } from '@procircuit/db';
import { StagePinCard } from '@/components/profile/stage-pin-card';

// Public profile editor (bio, goals, media kit, social links) stays the
// PlaceholderPage placeholder it's been since step 0.5 — that's not this
// step's job. The only real piece step 3.1 owns here is M-STG-2's stage pin.
export function ProfileShell({ player }: { player: Player }) {
  const [toast, setToast] = useState<{ title: string } | null>(null);
  const [toastOpen, setToastOpen] = useState(false);

  const showToast = useCallback((title: string) => {
    setToast({ title });
    setToastOpen(true);
  }, []);

  return (
    <ToastProvider>
      <div className="flex flex-col gap-6">
        <StagePinCard player={player} onToast={showToast} />
        <Empty title="Coming soon">
          Edit your public profile: bio, goals, media kit, social links.
        </Empty>
      </div>

      {toast && (
        <Toast open={toastOpen} onOpenChange={setToastOpen}>
          <ToastTitle className="font-medium">{toast.title}</ToastTitle>
        </Toast>
      )}
      <ToastViewport />
    </ToastProvider>
  );
}
