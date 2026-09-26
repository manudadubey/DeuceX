'use client';

import { useState } from 'react';
import { Check, Copy, KeyRound } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Empty,
  Field,
  FieldDescription,
  FieldLabel,
  Input,
} from '@deucex/ui';
import { ConfirmAction } from '@/components/confirm-action';
import { dateTime, shortDate } from '@/components/format';
import type { McpToken } from '@/lib/api';

function CopyBlock({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium">{label}</span>
      <div className="flex items-start gap-2">
        <code className="min-w-0 flex-1 rounded-md border bg-muted px-3 py-2 font-mono text-xs break-all">
          {value}
        </code>
        <Button
          size="sm"
          variant="outline"
          aria-label={`Copy ${label.toLowerCase()}`}
          onClick={async () => {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
        >
          {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
    </div>
  );
}

function state(t: McpToken): { label: string; variant: 'ok' | 'secondary' } {
  if (t.revokedAt) return { label: 'Revoked', variant: 'secondary' };
  if (new Date(t.expiresAt).getTime() <= Date.now())
    return { label: 'Expired', variant: 'secondary' };
  return { label: 'Active', variant: 'ok' };
}

export function McpTokens({
  tokens,
  endpoint,
  name,
}: {
  tokens: McpToken[];
  endpoint: string;
  name: string;
}) {
  const [label, setLabel] = useState('Claude Code');
  const [created, setCreated] = useState<{ token: string; expiresAt: string } | null>(null);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Create a token</CardTitle>
          <CardDescription>
            Valid for 30 days. It stops working the moment you revoke it or your console access
            ends.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {created ? (
            <div className="flex flex-col gap-3 rounded-lg border p-4">
              <p className="text-sm font-medium">
                Copy it now. This is the only time the token is shown.
              </p>
              <CopyBlock label="Token" value={created.token} />
              <CopyBlock
                label="Claude Code command"
                value={`claude mcp add --transport http deucex-admin ${endpoint} --header "Authorization: Bearer ${created.token}"`}
              />
              <p className="text-xs text-muted-foreground">
                Expires {shortDate(created.expiresAt)}. Any other MCP client works the same way:
                point it at {endpoint} with the token as a bearer header.
              </p>
              <div>
                <Button size="sm" variant="ghost" onClick={() => setCreated(null)}>
                  I have copied it
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <Field className="sm:max-w-xs">
                <FieldLabel htmlFor="mcp-token-label">Name</FieldLabel>
                <Input
                  id="mcp-token-label"
                  value={label}
                  maxLength={80}
                  onChange={(e) => setLabel(e.target.value)}
                />
                <FieldDescription>So you can tell your tokens apart.</FieldDescription>
              </Field>
              <ConfirmAction
                label="Create token"
                title="Create an MCP token"
                icon={<KeyRound aria-hidden="true" />}
                path="/admin/mcp-tokens"
                body={{ label }}
                consequence={`Creates the token "${label.trim()}", valid for 30 days. Any MCP client holding it acts as ${name} with your current role, and every call is logged. You can revoke it at any time.`}
                confirmLabel="Create token"
                onDone={(result) => setCreated(result as { token: string; expiresAt: string })}
                className="self-start"
              />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your tokens</CardTitle>
          <CardDescription>Only the first characters are kept for display.</CardDescription>
        </CardHeader>
        <CardContent>
          {tokens.length === 0 ? (
            <Empty title="No tokens yet">
              Create one above to use the console from an MCP client.
            </Empty>
          ) : (
            // A stacked list rather than a table, like Agent health's failed runs:
            // Revoke's confirmation needs the full width, which a table cell can't give.
            <ul className="flex flex-col divide-y divide-border">
              {tokens.map((t) => {
                const s = state(t);
                return (
                  <li key={t.id} className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-start gap-x-6 gap-y-2">
                      <div className="min-w-40 flex-1">
                        <div className="font-medium">{t.label}</div>
                        <div className="font-mono text-xs text-muted-foreground">{t.prefix}…</div>
                      </div>
                      <div className="flex flex-col items-start gap-1">
                        <Badge variant={s.variant}>{s.label}</Badge>
                        {s.label === 'Active' ? (
                          <span className="text-xs text-muted-foreground">
                            Expires {shortDate(t.expiresAt)}
                          </span>
                        ) : null}
                      </div>
                      <dl className="grid grid-cols-[auto_auto] gap-x-3 font-mono text-xs text-muted-foreground">
                        <dt className="font-sans">Created</dt>
                        <dd className="whitespace-nowrap">{dateTime(t.createdAt)}</dd>
                        <dt className="font-sans">Last used</dt>
                        <dd className="whitespace-nowrap">
                          {t.lastUsedAt ? dateTime(t.lastUsedAt) : 'Never'}
                        </dd>
                      </dl>
                    </div>
                    {s.label === 'Active' ? (
                      <ConfirmAction
                        label="Revoke"
                        title={`Revoke "${t.label}"`}
                        path={`/admin/mcp-tokens/${t.id}/revoke`}
                        consequence={`Revokes "${t.label}" now: any client using it is refused from its next call. This cannot be undone; create a new token if you need one.`}
                        confirmLabel="Revoke token"
                        destructive
                        className="self-start"
                      />
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}
