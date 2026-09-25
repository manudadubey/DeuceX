'use client';

import { useState } from 'react';
import { Card, CardDescription, CardHeader, CardTitle, Switch } from '@deucex/ui';
import { createClient } from '@/lib/supabase/client';

// PRD-05 C-13 / section 4.3: Profile's "Latest update teaser" switch. While
// on, the first paragraph of the latest published patron update shows on the
// public page as "Latest for patrons" (unless that update's own teaser was
// switched off or removed). Turning it off never touches a sent email.
export function TeaserCard({
  playerId,
  initial,
  onToast,
}: {
  playerId: string;
  initial: boolean;
  onToast: (title: string) => void;
}) {
  const [on, setOn] = useState(initial);
  const [saving, setSaving] = useState(false);

  async function change(next: boolean) {
    setSaving(true);
    const { error } = await createClient()
      .from('players')
      .update({ profile_teaser: next })
      .eq('id', playerId);
    setSaving(false);
    if (error) {
      onToast('The teaser setting was not saved');
      return;
    }
    setOn(next);
    onToast(
      next ? 'Latest update teaser is on your public page' : 'Teaser removed from your public page',
    );
  }

  return (
    <Card className="gap-4 p-6">
      <CardHeader className="p-0">
        <CardTitle>Latest update teaser</CardTitle>
        <CardDescription>
          Shows the first paragraph of your latest patron update on your public page, as
          &ldquo;Latest for patrons&rdquo;. Emails already sent are not affected.
        </CardDescription>
      </CardHeader>
      <label className="flex min-h-11 items-center gap-3 text-sm">
        <Switch checked={on} onCheckedChange={change} disabled={saving} />
        {on ? 'On' : 'Off'}
      </label>
    </Card>
  );
}
