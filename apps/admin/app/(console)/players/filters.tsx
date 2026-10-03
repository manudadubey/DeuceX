'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import {
  InputGroup,
  InputGroupInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@deucex/ui';

// Radix Select has no empty-string item, so "All" is ALL here and '' in the URL.
const ALL = 'all';

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
      <Select value={tier || ALL} onValueChange={(v) => go({ tier: v === ALL ? '' : v })}>
        <SelectTrigger aria-label="Tier" className="w-auto min-w-36">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All tiers</SelectItem>
          <SelectItem value="free">Free</SelectItem>
          <SelectItem value="pro">Pro</SelectItem>
          <SelectItem value="elite">Elite</SelectItem>
        </SelectContent>
      </Select>
      <Select value={status || ALL} onValueChange={(v) => go({ status: v === ALL ? '' : v })}>
        <SelectTrigger aria-label="Status" className="w-auto min-w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All statuses</SelectItem>
          {STATUSES.map((s) => (
            <SelectItem key={s} value={s}>
              {s}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
