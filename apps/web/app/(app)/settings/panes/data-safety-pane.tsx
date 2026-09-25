'use client';

import { useState } from 'react';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  CardTitle,
  Confirm,
  Field,
  FieldDescription,
  FieldLabel,
  Input,
} from '@deucex/ui';
import { updateEmergencyContact, type Player } from '@deucex/db';
import { createClient } from '@/lib/supabase/client';
import { AuditLogSection } from './audit-log-section';
import { confirmApproval } from '@/lib/approvals/confirm-approval';
import {
  cancelAccountDeletion,
  deleteAllAudio,
  requestAccountDeletion,
  requestDataExport,
} from '@/lib/account/api';

const PROVIDERS = ['OpenAI (structured output, transcription)'];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

// PRD-12 §4.10, ST-17 to ST-20; decisions worksheet 3 (audio: confirmed
// transcript or 7 days, whichever is first) and worksheet 4 (the 14-day
// cooling-off). Export and Delete are the two gated writes on this pane
// (a real Resend send behind each); audio deletion and the emergency
// contact are plain writes.
export function DataSafetyPane({
  player,
  onPlayerChange,
  onToast,
}: {
  player: Player;
  onPlayerChange: (patch: Partial<Player>) => void;
  onToast: (title: string) => void;
}) {
  const [emergencyContact, setEmergencyContact] = useState(player.emergency_contact ?? '');
  const [savingContact, setSavingContact] = useState(false);
  const [deletingAudio, setDeletingAudio] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [requestingDelete, setRequestingDelete] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const pendingDeletion = Boolean(player.deletion_effective_at) && !player.deletion_cancelled_at;

  async function handleSaveContact() {
    setSavingContact(true);
    try {
      const supabase = createClient();
      await updateEmergencyContact(supabase, {
        playerId: player.id,
        emergencyContact: emergencyContact.trim() || null,
      });
      onPlayerChange({ emergency_contact: emergencyContact.trim() || null });
      onToast('Saved');
    } finally {
      setSavingContact(false);
    }
  }

  async function handleDeleteAudio() {
    setDeletingAudio(true);
    try {
      const supabase = createClient();
      const result = await deleteAllAudio(supabase);
      onToast(
        result.deletedCount > 0
          ? `Deleted ${result.deletedCount} audio file(s)`
          : 'No audio to delete',
      );
    } finally {
      setDeletingAudio(false);
    }
  }

  async function handleExport() {
    setExporting(true);
    try {
      const approval = await confirmApproval({
        playerId: player.id,
        actionType: 'data_export_request',
        payload: {},
      });
      const supabase = createClient();
      await requestDataExport(supabase, approval.id);
      onToast('Export requested — it will arrive by email in a few minutes');
    } finally {
      setExporting(false);
    }
  }

  async function handleRequestDelete() {
    setRequestingDelete(true);
    try {
      const approval = await confirmApproval({
        playerId: player.id,
        actionType: 'account_deletion_request',
        payload: {},
      });
      const supabase = createClient();
      await requestAccountDeletion(supabase, approval.id);
      setConfirmingDelete(false);
      onToast('Confirmation link emailed — nothing happens until you click it');
    } finally {
      setRequestingDelete(false);
    }
  }

  async function handleCancelDeletion() {
    setCancelling(true);
    try {
      const supabase = createClient();
      await cancelAccountDeletion(supabase);
      onPlayerChange({
        deletion_effective_at: null,
        deletion_cancelled_at: new Date().toISOString(),
      });
      onToast('Account deletion cancelled');
    } finally {
      setCancelling(false);
    }
  }

  return (
    <Card className="gap-6 p-6">
      <CardHeader className="p-0">
        <CardTitle>Data &amp; safety</CardTitle>
      </CardHeader>

      <div className="rounded-lg bg-secondary/50 p-4">
        <div className="font-medium">Match Scribe audio</div>
        <p className="mt-1 text-sm text-muted-foreground">
          Kept until you confirm the transcript, or 7 days, whichever is first. Transcripts are kept
          until you delete them.
        </p>
        <Button
          variant="outline"
          size="sm"
          className="mt-2"
          disabled={deletingAudio}
          onClick={handleDeleteAudio}
        >
          Delete all audio now
        </Button>
      </div>

      <div className="rounded-lg bg-secondary/50 p-4">
        <div className="font-medium">Export everything</div>
        <p className="mt-1 text-sm text-muted-foreground">
          Notes, transcripts, expenses and check-ins as JSON and CSV, emailed when ready.
        </p>
        <Button size="sm" className="mt-2" disabled={exporting} onClick={handleExport}>
          Export
        </Button>
      </div>

      <Field>
        <FieldLabel htmlFor="ds-emergency">Someone to call</FieldLabel>
        <Input
          id="ds-emergency"
          value={emergencyContact}
          onChange={(e) => setEmergencyContact(e.target.value)}
          placeholder="Name and number"
        />
        <FieldDescription>
          Shown alongside the ATP Player Assistance line and Lifeline on the Mindset Coach&apos;s
          escalation card.
        </FieldDescription>
        <div>
          <Button variant="outline" size="sm" disabled={savingContact} onClick={handleSaveContact}>
            Save
          </Button>
        </div>
      </Field>

      <div>
        <div className="font-medium">Model providers</div>
        <ul className="mt-1 list-inside list-disc text-sm text-muted-foreground">
          {PROVIDERS.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
        <p className="mt-1 text-xs text-muted-foreground">None of these train on your data.</p>
      </div>

      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
        <div className="flex items-center gap-2">
          <span className="font-medium text-destructive">Delete account</span>
          {pendingDeletion && <Badge variant="danger">Scheduled</Badge>}
        </div>

        {pendingDeletion ? (
          <>
            <p className="mt-1 text-sm text-muted-foreground">
              Deletion is scheduled for {formatDate(player.deletion_effective_at!)}. Cancel any time
              before then.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              disabled={cancelling}
              onClick={handleCancelDeletion}
            >
              Cancel deletion
            </Button>
          </>
        ) : confirmingDelete ? (
          <div className="mt-2">
            <Confirm
              title="Email a deletion confirmation link?"
              description="Cancels the plan, deletes notes, transcripts, audio and expenses. Patron subscriptions end and payouts stop after the final one. Your public page shows a 'moved on' note for 30 days. Nothing happens until you click the emailed link, and you get 14 days after that to change your mind."
              actions={
                <>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={requestingDelete}
                    onClick={handleRequestDelete}
                  >
                    Email me the link
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirmingDelete(false)}>
                    Cancel
                  </Button>
                </>
              }
            />
          </div>
        ) : (
          <Button
            variant="destructive"
            size="sm"
            className="mt-2"
            onClick={() => setConfirmingDelete(true)}
          >
            Delete account
          </Button>
        )}
      </div>

      <AuditLogSection playerId={player.id} />
    </Card>
  );
}
