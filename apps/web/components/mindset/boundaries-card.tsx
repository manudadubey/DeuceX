'use client';

import { useState } from 'react';
import { Button, Card, CardDescription, CardHeader, CardTitle, Switch } from '@deucex/ui';
import { pauseOneWeekFrom, updateMindsetBoundaries, type MindsetBoundaries } from '@deucex/db';
import { createClient } from '@/lib/supabase/client';

// "Your boundaries" (PRD-06 §4.1): the three player-set switches, plus the
// fixed care block naming the ATP Player Assistance line and Lifeline —
// M-PRIV-3 makes the someone-to-call card itself undismissable, but this
// static paragraph explaining that promise is always visible regardless.
export function BoundariesCard({
  playerId,
  localDate,
  boundaries,
  locked,
  onToast,
}: {
  playerId: string;
  localDate: string;
  boundaries: MindsetBoundaries;
  locked: boolean;
  onToast: (title: string) => void;
}) {
  const supabase = createClient();
  const [current, setCurrent] = useState(boundaries);

  const paused = Boolean(current.paused_until && current.paused_until >= localDate);
  const resumeDate = current.paused_until
    ? new Date(`${current.paused_until}T00:00:00`).toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'long',
      })
    : null;

  const toggle = async (patch: Parameters<typeof updateMindsetBoundaries>[2]) => {
    const updated = await updateMindsetBoundaries(supabase, playerId, patch);
    setCurrent(updated);
    onToast('On');
  };

  return (
    <Card className={locked ? 'opacity-50' : undefined}>
      <CardHeader>
        <CardTitle>Your boundaries</CardTitle>
        <CardDescription>You decide when it speaks and who sees what.</CardDescription>
      </CardHeader>

      <div className="flex flex-col gap-4 px-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-medium">Quiet on match mornings</div>
            <div className="text-[0.8125rem] text-muted-foreground">
              No insight before a match. It waits until the evening note.
            </div>
          </div>
          <Switch
            disabled={locked}
            checked={current.quiet_match_mornings}
            onCheckedChange={(checked) => void toggle({ quietMatchMornings: checked })}
          />
        </div>

        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-medium">Coach sees patterns, not notes</div>
            <div className="text-[0.8125rem] text-muted-foreground">
              Your coach link shows &quot;rushing the second serve, 3 of 4&quot;, never the
              transcript.
            </div>
          </div>
          <Switch
            disabled={locked}
            checked={current.coach_sees_patterns}
            onCheckedChange={(checked) => void toggle({ coachSeesPatterns: checked })}
          />
        </div>

        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-medium">Pause for a week</div>
            <div className="text-[0.8125rem] text-muted-foreground">
              {paused
                ? `Paused until ${resumeDate}.`
                : 'Sometimes you just want to play. Resumes automatically.'}
            </div>
          </div>
          {paused ? (
            <Button
              size="sm"
              variant="outline"
              disabled={locked}
              onClick={() => void toggle({ pausedUntil: null })}
            >
              Resume now
            </Button>
          ) : (
            <Switch
              disabled={locked}
              checked={false}
              onCheckedChange={(checked) =>
                void toggle({ pausedUntil: checked ? pauseOneWeekFrom(localDate) : null })
              }
            />
          )}
        </div>
      </div>

      <div className="mx-6 mb-2 flex gap-3 rounded-lg bg-secondary/50 p-3.5 text-[0.8125rem]">
        <div>
          <b>If a run of notes reads like more than a bad week</b>, the coach stops coaching and
          points you to real people: the ATP Player Assistance line, Lifeline (13 11 14), or whoever
          you&apos;ve named in Settings. It won&apos;t pretend to be them.
        </div>
      </div>
    </Card>
  );
}
