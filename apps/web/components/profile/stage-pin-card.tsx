'use client';

import { useState } from 'react';
import { Badge, Button, Card, CardHeader, CardTitle, Switch } from '@procircuit/ui';
import { setStagePinned, type Player } from '@procircuit/db';
import { createClient } from '@/lib/supabase/client';

const STAGE_LABELS: Record<'1' | '2' | '3', string> = {
  '1': 'Building',
  '2': 'Emerging',
  '3': 'Established',
};
const STAGES: ('1' | '2' | '3')[] = ['1', '2', '3'];

// M-STG-2: "The player can pin a stage manually in Profile; a pinned stage
// is not changed by detection and shows a 'pinned' indicator." This is the
// smallest slice of the eventual public-profile editor (bio, goals, media
// kit, social links, still the placeholder below) that this step actually
// owns — the rest stays PlaceholderPage's job.
export function StagePinCard({
  player,
  onToast,
}: {
  player: Player;
  onToast: (title: string) => void;
}) {
  const [stage, setStage] = useState<'1' | '2' | '3'>((player.stage as '1' | '2' | '3') ?? '1');
  const [pinned, setPinned] = useState(player.stage_pinned);
  const [saving, setSaving] = useState(false);

  async function handleToggle(next: boolean) {
    setPinned(next);
    setSaving(true);
    try {
      const supabase = createClient();
      await setStagePinned(supabase, player.id, { pinned: next, stage });
      onToast(next ? 'Stage pinned' : 'Stage pin removed');
    } finally {
      setSaving(false);
    }
  }

  async function handleStageChange(next: '1' | '2' | '3') {
    setStage(next);
    if (!pinned) return; // not pinned yet: picking a stage alone doesn't write anything
    setSaving(true);
    try {
      const supabase = createClient();
      await setStagePinned(supabase, player.id, { pinned: true, stage: next });
      onToast('Pinned stage updated');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="p-6">
      <CardHeader className="px-0 pt-0">
        <CardTitle>Ranking stage</CardTitle>
      </CardHeader>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          {STAGES.map((s) => (
            <Button
              key={s}
              variant={stage === s ? 'primary' : 'outline'}
              size="sm"
              onClick={() => handleStageChange(s)}
              disabled={saving}
            >
              Stage {s} · {STAGE_LABELS[s]}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <Switch
            checked={pinned}
            onCheckedChange={handleToggle}
            disabled={saving}
            aria-label="Pin stage"
          />
          <span className="text-sm">Pin this stage</span>
          {pinned && <Badge variant="secondary">Pinned</Badge>}
        </div>
        <p className="text-sm text-muted-foreground">
          {pinned
            ? 'Detection from your verified ranking is paused. Unpin to let it resume.'
            : 'Detected automatically from your verified ranking on every refresh.'}
        </p>
      </div>
    </Card>
  );
}
