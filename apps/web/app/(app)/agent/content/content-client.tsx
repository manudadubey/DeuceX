'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Spinner,
  Toast,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from '@deucex/ui';
import {
  recipientCount,
  runChecks,
  type CheckKind,
  type RewriteVariant,
  type SendTimeOption,
} from '@deucex/agents';
import { contentPublishPayload } from '@deucex/shared';
import { createClient } from '@/lib/supabase/client';
import { confirmApproval } from '@/lib/approvals/confirm-approval';
import * as api from '@/lib/content/api';
import { patrons, SAMPLE_UPDATE, whenPhrase } from '@/lib/content/copy';
import { EditorCard } from '@/components/content/editor-card';
import { ChecksCard, RecipientsCard } from '@/components/content/side-cards';
import { HistoryCard } from '@/components/content/history-card';

const DESCRIPTION =
  'Drafts a patron update within thirty minutes of every Match Scribe note, in your voice. Nothing goes out until you approve it.';

const WINDOW_LINE: Record<api.ContentPageData['window'], string> = {
  thirty_minutes:
    'The next draft arrives about 30 minutes after you save a match note with a result.',
  next_morning:
    'The next draft arrives at 06:30 the morning after you save a match note with a result.',
  manual: 'Drafts only start when you ask. Change this in Settings > Agents.',
};

export function ContentClient({
  playerId,
  isFree,
  privateNames: initialPrivateNames,
}: {
  playerId: string;
  isFree: boolean;
  privateNames: string[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const [page, setPage] = useState<api.ContentPageData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [toastOpen, setToastOpen] = useState(false);
  const [showVoice, setShowVoice] = useState(false);
  const [namesInput, setNamesInput] = useState(initialPrivateNames.join(', '));
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const current = page?.current ?? null;
  const editable = current?.status === 'draft' || current?.status === 'send_failed';

  const showToast = useCallback((title: string) => {
    setToast(title);
    setToastOpen(true);
  }, []);

  const load = useCallback(async () => {
    try {
      setPage(await api.loadContentPage(supabase));
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'The Content Agent could not load.');
    }
  }, [supabase]);

  useEffect(() => {
    if (!isFree) void load();
  }, [isFree, load]);

  // A queued or drafting update finishes on the server: look again shortly.
  useEffect(() => {
    if (current?.status !== 'drafting' && current?.status !== 'sending') return;
    const t = setTimeout(() => void load(), 4000);
    return () => clearTimeout(t);
  }, [current?.status, load]);

  // Reset the editor when a different update or status arrives. An autosave
  // response never resets the text (the player may have typed since it was
  // sent); operations that change the text on the server use applyText.
  const serverKey = current ? `${current.id}:${current.status}` : '';
  const currentRef = useRef(current);
  currentRef.current = current;
  useEffect(() => {
    const c = currentRef.current;
    if (!c) return;
    setSubject(c.subject);
    setBody(c.body);
  }, [serverKey]);

  const applyUpdate = useCallback((next: api.PatronUpdate) => {
    setPage((p) => (p ? { ...p, current: next } : p));
  }, []);

  const applyText = useCallback(
    (next: api.PatronUpdate) => {
      applyUpdate(next);
      setSubject(next.subject);
      setBody(next.body);
    },
    [applyUpdate],
  );

  // C-6: autosave, so edits stay if the player leaves.
  useEffect(() => {
    if (!current || !editable) return;
    if (subject === current.subject && body === current.body) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaving(true);
      try {
        applyUpdate(await api.saveDraft(supabase, current.id, { subject, body }));
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Your edit was not saved.');
      } finally {
        setSaving(false);
      }
    }, 800);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [subject, body, current, editable, supabase, applyUpdate, showToast]);

  const run = useCallback(
    async (label: string, fn: () => Promise<void>) => {
      setBusy(label);
      try {
        await fn();
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'That did not work.');
      } finally {
        setBusy(null);
      }
    },
    [showToast],
  );

  // C-10: the checks re-run on every keystroke, with the same function the server uses.
  const liveChecks = useMemo(() => {
    if (!page || !current || !body.trim()) return [];
    const fixedKinds = current.checks.filter((c) => c.fixApplied).map((c) => c.kind);
    return runChecks(body, { ...page.checkContext, fixedKinds });
  }, [page, current, body]);

  const sendTime: SendTimeOption = useMemo(() => {
    const options = page?.sendTimes ?? [];
    const match = current?.sendAt ? options.find((o) => o.sendAt === current.sendAt) : null;
    return match ?? options[0] ?? { kind: 'now', label: 'Send now', sendAt: null };
  }, [page, current]);

  const selectedCount = page && current ? recipientCount(page.tiers, current.tierIds) : 0;

  async function flush(): Promise<api.PatronUpdate> {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    const saved = await api.saveDraft(supabase, current!.id, { subject, body });
    applyUpdate(saved);
    return saved;
  }

  async function publish() {
    await run('publish', async () => {
      const row = await flush();
      const payload = contentPublishPayload({
        updateId: row.id,
        subject: row.subject,
        body: row.body,
        practiceSection: row.practiceSection,
        tierIds: row.tierIds,
        sendAt: row.sendAt,
        teaser: row.teaser,
      });
      const approval = await confirmApproval({
        playerId,
        actionType: 'content_publish',
        payload,
        agentRunId: row.agentRunId,
      });
      const result = await api.publishDraft(supabase, row.id, approval.id);
      showToast(
        result.status === 'scheduled'
          ? `Scheduled · ${whenPhrase(sendTime)}`
          : result.status === 'published'
            ? `Published to ${patrons(result.deliveredCount ?? 0)}`
            : 'Send failed. Nothing reached patrons.',
      );
      await load();
    });
  }

  async function saveNames() {
    await run('names', async () => {
      const names = namesInput
        .split(',')
        .map((n) => n.trim())
        .filter(Boolean);
      const { error } = await supabase
        .from('players')
        .update({ content_private_names: names })
        .eq('id', playerId);
      if (error) throw error;
      showToast(names.length ? `Kept out of updates: ${names.join(', ')}` : 'No names kept out');
      await load();
    });
  }

  const header = (
    <header className="flex flex-col gap-2 pb-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold">Content Agent</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">{DESCRIPTION}</p>
      </div>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => setShowVoice((v) => !v)}
          disabled={isFree}
        >
          Voice profile
        </Button>
        <Button
          size="sm"
          disabled={
            isFree || busy !== null || current?.status === 'draft' || current?.status === 'drafting'
          }
          onClick={() =>
            run('new', async () => {
              applyUpdate(await api.startNewUpdate(supabase));
              await load();
            })
          }
        >
          {busy === 'new' ? <Spinner /> : null}
          New update
        </Button>
      </div>
    </header>
  );

  if (isFree) {
    return (
      <div>
        {header}
        <div className="relative">
          <div className="pointer-events-none opacity-40 blur-[1px]" aria-hidden="true">
            <Card className="gap-4 p-6">
              <CardHeader className="p-0">
                <CardTitle>Draft · from last night&apos;s note</CardTitle>
              </CardHeader>
              <p className="text-[0.9375rem] font-medium">{SAMPLE_UPDATE.subject}</p>
              <p className="whitespace-pre-line text-sm text-muted-foreground">
                {SAMPLE_UPDATE.body}
              </p>
            </Card>
          </div>
          <div className="absolute inset-0 flex flex-col items-center justify-start gap-3 pt-24 text-center">
            <Badge variant="secondary">Pro feature</Badge>
            <p className="max-w-sm text-sm">
              Patron updates drafted from your match notes are on Pro. Nothing is drafted from your
              notes on Free.
            </p>
            <Button onClick={() => showToast('Pro trial · coming soon')}>Start Pro trial</Button>
          </div>
        </div>
        <ToastProvider>
          {toast ? (
            <Toast open={toastOpen} onOpenChange={setToastOpen}>
              <ToastTitle className="font-medium">{toast}</ToastTitle>
            </Toast>
          ) : null}
          <ToastViewport />
        </ToastProvider>
      </div>
    );
  }

  return (
    <ToastProvider>
      {header}
      {loadError ? <p className="pb-4 text-sm text-danger">{loadError}</p> : null}

      {showVoice && page ? (
        <Card className="mb-4 gap-4 p-6">
          <CardHeader className="p-0">
            <CardTitle>Voice profile</CardTitle>
            <CardDescription>{page.voice.line}</CardDescription>
          </CardHeader>
          {page.voice.examples.length ? (
            <ul className="grid gap-1 text-sm">
              {page.voice.examples.map((e) => (
                <li key={e.id}>
                  &ldquo;{e.subject}&rdquo;{' '}
                  <span className="text-muted-foreground">
                    · {e.openRate === null ? 'no opens yet' : `${e.openRate}% opened`}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="grid gap-2">
            <label className="text-sm font-medium" htmlFor="privateNames">
              Names kept out of updates
            </label>
            <p className="text-[0.8125rem] text-muted-foreground">
              Your coach or team, separated by commas. The agent warns when one appears and Fix
              changes it to &ldquo;my coach&rdquo;.
            </p>
            <div className="flex gap-2">
              <Input
                id="privateNames"
                value={namesInput}
                onChange={(e) => setNamesInput(e.target.value)}
                placeholder="Marko"
              />
              <Button variant="outline" onClick={saveNames} disabled={busy !== null}>
                Save
              </Button>
            </div>
          </div>
        </Card>
      ) : null}

      {!page ? (
        loadError ? null : (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner /> Loading…
          </div>
        )
      ) : !current ? (
        <Card className="gap-3 p-6">
          <CardHeader className="p-0">
            <CardTitle>No draft yet</CardTitle>
            <CardDescription>
              {page.paused
                ? 'The Content Agent is paused in Settings > Agents.'
                : WINDOW_LINE[page.window]}
            </CardDescription>
          </CardHeader>
          <p className="text-sm text-muted-foreground">
            Or start one now: New update drafts from your last three notes.{' '}
            <Link href="/match-scribe" className="underline underline-offset-4">
              Record a note
            </Link>
          </p>
        </Card>
      ) : (
        <section className="grid grid-cols-[1.5fr_1fr] gap-4 max-[1000px]:grid-cols-1">
          <EditorCard
            update={current}
            timezone={page.timezone}
            subject={subject}
            body={body}
            saving={saving}
            busy={busy}
            recipientCount={selectedCount}
            sendTime={sendTime}
            teaser={current.teaser}
            onSubject={setSubject}
            onBody={setBody}
            onSwapSubject={(alt) =>
              run('subject', async () => {
                const altSubjects = current.altSubjects.map((a) => (a === alt ? subject : a));
                applyText(await api.saveDraft(supabase, current.id, { subject: alt, altSubjects }));
              })
            }
            onRewrite={(variant: RewriteVariant | 'restore') =>
              run(variant, async () => {
                await flush();
                const next =
                  variant === 'restore'
                    ? await api.restoreOriginal(supabase, current.id)
                    : await api.rewriteDraft(supabase, current.id, variant);
                applyText(next);
                showToast(
                  variant === 'restore'
                    ? 'Original restored'
                    : 'Rewritten from your current text, edits included',
                );
              })
            }
            onPublish={publish}
            onPreview={() =>
              run('preview', async () => {
                await flush();
                const { to } = await api.sendPreview(supabase, current.id);
                showToast(`Preview sent to ${to}`);
              })
            }
            onSkip={(reason) =>
              run('skip', async () => {
                await api.skipDraft(supabase, current.id, reason);
                await load();
              })
            }
            onUndoSkip={() =>
              run('undo', async () => {
                await api.undoSkip(supabase, current.id);
                await load();
              })
            }
            onCancelSchedule={() =>
              run('cancel', async () => {
                await api.cancelSchedule(supabase, current.id);
                showToast('Schedule cancelled. Nothing was sent.');
                await load();
              })
            }
            onRemoveTeaser={() =>
              run('teaser', async () => {
                await api.removeTeaser(supabase, current.id);
                showToast('Teaser removed from your public profile');
                await load();
              })
            }
            onDraftNow={() =>
              run('new', async () => {
                await api.startNewUpdate(supabase);
                await load();
              })
            }
            onRebuild={() =>
              run('rebuild', async () => {
                await api.rebuildDraft(supabase, current.id);
                await load();
              })
            }
          />
          {current.status === 'queued' || current.status === 'drafting' ? (
            <Card className="gap-2 p-6">
              <CardHeader className="p-0">
                <CardTitle>Who receives it</CardTitle>
                <CardDescription>
                  The agent proposes tiers when it drafts. You choose before anything is sent.
                </CardDescription>
              </CardHeader>
            </Card>
          ) : (
            <div className="flex flex-col gap-4">
              <RecipientsCard
                tiers={page.tiers}
                selected={current.tierIds}
                reasons={current.tierReasons}
                sendTimes={page.sendTimes}
                sendKind={sendTime.kind}
                teaser={current.teaser}
                disabled={!editable || busy !== null}
                onToggleTier={(id) =>
                  run('tiers', async () => {
                    const tierIds = current.tierIds.includes(id)
                      ? current.tierIds.filter((t) => t !== id)
                      : [...current.tierIds, id];
                    applyUpdate(await api.saveDraft(supabase, current.id, { tierIds }));
                  })
                }
                onSendTime={(kind) =>
                  run('when', async () => {
                    const option = page.sendTimes.find((o) => o.kind === kind);
                    applyUpdate(
                      await api.saveDraft(supabase, current.id, { sendAt: option?.sendAt ?? null }),
                    );
                  })
                }
                onTeaser={(teaser) =>
                  run('teaser', async () => {
                    applyUpdate(await api.saveDraft(supabase, current.id, { teaser }));
                  })
                }
              />
              <ChecksCard
                checks={editable ? liveChecks : current.checks}
                disabled={!editable || busy !== null}
                busyKind={busy === 'fix' ? ('private' as CheckKind) : null}
                onFix={(kind) =>
                  run('fix', async () => {
                    await flush();
                    applyText(await api.fixCheck(supabase, current.id, kind));
                    showToast('Fixed. The check ran again.');
                  })
                }
              />
            </div>
          )}
        </section>
      )}

      {page ? (
        <div className="pt-4">
          <HistoryCard rows={page.history} timezone={page.timezone} />
        </div>
      ) : null}

      {toast ? (
        <Toast open={toastOpen} onOpenChange={setToastOpen}>
          <ToastTitle className="font-medium">{toast}</ToastTitle>
        </Toast>
      ) : null}
      <ToastViewport />
    </ToastProvider>
  );
}
