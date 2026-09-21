'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Badge,
  Button,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  Empty,
  buttonVariants,
} from '@procircuit/ui';
import { setPatternDismissed, type Pattern } from '@procircuit/db';
import { createClient } from '@/lib/supabase/client';

function EvidenceDots({ evidence }: { evidence: { noteId: string; hit: boolean }[] }) {
  const hits = evidence.filter((e) => e.hit).length;
  return (
    <div className="flex items-center gap-1.5" aria-label="Evidence">
      <div className="flex gap-1">
        {evidence.map((e, i) => (
          <span
            key={i}
            className={
              e.hit
                ? 'grid size-4 place-items-center rounded-full bg-primary text-[10px] text-primary-foreground'
                : 'size-4 rounded-full bg-muted'
            }
          >
            {e.hit ? '✓' : ''}
          </span>
        ))}
      </div>
      <span className="text-xs text-muted-foreground">
        {hits} of {evidence.length} notes
      </span>
    </div>
  );
}

function PatternRow({ pattern, onToast }: { pattern: Pattern; onToast: (title: string) => void }) {
  const supabase = createClient();
  const [current, setCurrent] = useState(pattern);
  const evidence = Array.isArray(current.evidence)
    ? (current.evidence as { noteId: string; hit: boolean }[])
    : [];

  const handleDismissToggle = async () => {
    const next = !current.dismissed;
    const updated = await setPatternDismissed(supabase, current.id, next);
    setCurrent(updated);
    onToast(next ? 'Okay. Dismissed, and the coach heard you.' : 'Restored');
  };

  return (
    <div className="flex flex-col gap-2 rounded-lg bg-secondary/50 p-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">{current.statement}</span>
        <Badge variant={current.confidence === 'strong' ? 'warn' : 'secondary'}>
          {current.confidence === 'strong' ? 'Strong' : 'Emerging'}
        </Badge>
        {current.kind === 'physical' && (
          <Badge
            variant="lime"
            title="A physical pattern, built from the condition stamps on your notes rather than what you said."
          >
            Conditions
          </Badge>
        )}
      </div>
      <p className="text-[0.8125rem] text-muted-foreground">
        {current.dismissed
          ? "Dismissed. The coach won't bring this up again unless it happens twice more."
          : current.explanation}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {current.kind === 'physical' && (
          <Link
            href="/agent/tournament"
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            See the tension test
          </Link>
        )}
        <Link href="/match-scribe" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
          Show the notes
        </Link>
        <Button size="sm" variant="ghost" onClick={handleDismissToggle}>
          {current.dismissed ? 'Undo' : 'Not a pattern'}
        </Button>
      </div>
      <EvidenceDots evidence={evidence} />
    </div>
  );
}

// "Patterns it's noticed" (PRD-06 §4.1, MC-7 to MC-11).
export function PatternsCard({
  patterns,
  locked,
  onToast,
}: {
  patterns: Pattern[];
  locked: boolean;
  onToast: (title: string) => void;
}) {
  return (
    <Card className={locked ? 'opacity-50' : undefined}>
      <CardHeader>
        <CardTitle>Patterns it&apos;s noticed</CardTitle>
        <CardDescription>
          Each one needs at least three notes to count. You can tell it when it&apos;s wrong.
        </CardDescription>
      </CardHeader>
      <div className="flex flex-col gap-3 px-6">
        {patterns.length === 0 ? (
          <Empty title="Nothing yet">
            Patterns need three or more supporting notes within 90 days.
          </Empty>
        ) : (
          patterns.map((p) => <PatternRow key={p.id} pattern={p} onToast={onToast} />)
        )}
      </div>
    </Card>
  );
}
