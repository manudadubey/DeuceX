import { PageHeader } from '@/components/page';
import { API_URL, type McpToken } from '@/lib/api';
import { requireArea, serverApi } from '@/lib/server-api';
import { McpTokens } from './mcp-tokens';

// Step 5.0: personal tokens for the admin MCP server (owner decision 26
// September 2026). Every role can hold one; what it can do is the holder's
// own current role, read live on every call.
export default async function McpPage() {
  const [me, tokens] = await Promise.all([
    requireArea('overview'),
    serverApi<McpToken[]>('/admin/mcp-tokens'),
  ]);
  return (
    <>
      <PageHeader
        title="MCP access"
        description="Use the console from an assistant such as Claude Code. A token acts as you, with your current role, and every call it makes is written to the admin audit log as mcp:your name."
        note="Actions stay two-step: the assistant must show you the consequence and get your agreement before it confirms. Delete, comp and kill switches still need your written reason."
      />
      <McpTokens tokens={tokens} endpoint={`${API_URL}/mcp`} name={me.name} />
    </>
  );
}
