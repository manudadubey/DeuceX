'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { cn, InputGroup, InputGroupInput } from '@deucex/ui';

// The global player search (PRD-13 AD-7): ⌘K focuses it, Enter lands on
// Players with the query applied, Escape leaves it.
export function PlayerSearch({ className }: { className?: string }) {
  const router = useRouter();
  const ref = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState('');

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        ref.current?.focus();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <InputGroup className={cn('text-sm shadow-[0_1px_2px_rgba(0,0,0,.05)]', className)}>
      <Search aria-hidden="true" className="size-4 shrink-0" />
      <InputGroupInput
        ref={ref}
        aria-label="Find a player"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            router.push(`/players?q=${encodeURIComponent(value.trim())}`);
            ref.current?.blur();
          }
          if (e.key === 'Escape') ref.current?.blur();
        }}
        placeholder="Find a player by name, email or ranking number"
        autoComplete="off"
      />
      <kbd className="rounded border border-border px-1 font-mono text-[0.6875rem] text-muted-foreground max-[900px]:hidden">
        ⌘K
      </kbd>
    </InputGroup>
  );
}
