'use client';

import { useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Confirm, Textarea, type ButtonProps } from '@deucex/ui';
import { post } from '@/lib/browser-api';

// The console's two-step (PRD-13 AD-3): the control, then a confirmation
// that states in one sentence what will happen, beside the confirming
// button (Baseline's `.confirm`, M-GATE-2). For AD-5's actions the reason
// field must be filled before Confirm enables; the reason is stored
// verbatim and shown in the player's own log. A failure keeps the control
// where it was with the error inline, never a false success.
export function ConfirmAction({
  label,
  title,
  previewPath,
  path,
  body,
  consequence: staticConsequence,
  reasonRequired = false,
  reasonOptional = false,
  confirmLabel = 'Confirm',
  variant = 'outline',
  destructive = false,
  size = 'sm',
  icon,
  onDone,
  className,
}: {
  label: string;
  title?: string;
  /** Server-built consequence (player actions). */
  previewPath?: string;
  path: string;
  body?: Record<string, unknown>;
  /** Fixed consequence sentence, for actions whose wording doesn't depend on player state. */
  consequence?: string;
  reasonRequired?: boolean;
  reasonOptional?: boolean;
  confirmLabel?: string;
  variant?: ButtonProps['variant'];
  destructive?: boolean;
  size?: ButtonProps['size'];
  icon?: ReactNode;
  onDone?: (result: unknown) => void;
  className?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [consequence, setConsequence] = useState<string | null>(staticConsequence ?? null);
  const [needsReason, setNeedsReason] = useState(reasonRequired);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function start() {
    setError(null);
    setDone(null);
    if (previewPath) {
      setBusy(true);
      try {
        const preview = await post<{ consequence: string; reasonRequired: boolean }>(
          previewPath,
          body,
        );
        setConsequence(preview.consequence);
        setNeedsReason(reasonRequired || preview.reasonRequired);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setBusy(false);
        return;
      }
      setBusy(false);
    }
    setOpen(true);
  }

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      const result = await post<{ consequence?: string }>(path, {
        ...body,
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      });
      setOpen(false);
      setReason('');
      setDone('Done. Logged to the audit trail.');
      onDone?.(result);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const showReason = needsReason || reasonOptional;
  const reasonMissing = needsReason && !reason.trim();

  if (!open) {
    return (
      <div className={className}>
        <Button
          variant={variant}
          size={size}
          onClick={start}
          disabled={busy}
          className="w-full justify-start"
        >
          {icon}
          {label}
        </Button>
        {error ? (
          <p role="alert" className="mt-1 text-xs text-danger">
            {error}
          </p>
        ) : null}
        {done ? (
          <p role="status" className="mt-1 text-xs text-muted-foreground">
            {done}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className={className}>
      <Confirm
        title={title ?? label}
        description={
          <span className="flex flex-col gap-2">
            <span>{consequence}</span>
            {showReason ? (
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-foreground">
                  Reason{needsReason ? '' : ' (optional)'}
                </span>
                <Textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={2}
                  className="min-h-16"
                  placeholder="Stored verbatim and shown in the player's audit log"
                />
                {reasonMissing ? (
                  <span className="text-xs text-muted-foreground">
                    Write a reason to enable {confirmLabel}.
                  </span>
                ) : null}
              </label>
            ) : null}
            {error ? (
              <span role="alert" className="text-xs text-danger">
                {error}
              </span>
            ) : null}
          </span>
        }
        actions={
          <>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant={destructive ? 'destructive' : 'primary'}
              onClick={confirm}
              disabled={busy || reasonMissing}
            >
              {confirmLabel}
            </Button>
          </>
        }
      />
    </div>
  );
}
