'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { InputGroup, InputGroupInput, cn } from '@deucex/ui';

const SELECT = cn(
  'h-9 rounded-md border border-input bg-field px-2.5 text-sm text-foreground',
  'shadow-[0_1px_2px_rgba(0,0,0,.05)] outline-none focus:border-ring max-[900px]:min-h-11',
);

const STATUSES = ['Active', 'Trial', 'Past due', 'Unverified', 'Minor', 'Dormant', 'Deleting'];

// AD-7: searchable by name, email, country and ATP or ITF number, filterable
// by tier and status. The query lives in the URL, so ⌘K lands here with it.
export function PlayerFilters({ q, tier, status }: { q: string; tier: string; status: string }) {
  const router = useRouter();
  const [query, setQuery] = useState(q);

  function go(next: { q?: string; tier?: string; status?: string }) {
    const params = new URLSearchParams();
    const merged = { q: query, tier, status, ...next };
    for (const [k, v] of Object.entries(merged)) if (v) params.set(k, v);
    router.push(`/players${params.size ? `?${params}` : ''}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2 max-[900px]:flex-col max-[900px]:items-stretch">
      <InputGroup className="min-w-64 flex-1">
        <Search aria-hidden="true" className="size-4 text-muted-foreground" />
        <InputGroupInput
          aria-label="Search players"
          placeholder="Search name, email, country or ranking number"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && go({ q: query })}
        />
      </InputGroup>
      <select
        aria-label="Tier"
        className={SELECT}
        value={tier}
        onChange={(e) => go({ tier: e.target.value })}
      >
        <option value="">All tiers</option>
        <option value="free">Free</option>
        <option value="pro">Pro</option>
        <option value="elite">Elite</option>
      </select>
      <select
        aria-label="Status"
        className={SELECT}
        value={status}
        onChange={(e) => go({ status: e.target.value })}
      >
        <option value="">All statuses</option>
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
    </div>
  );
}
