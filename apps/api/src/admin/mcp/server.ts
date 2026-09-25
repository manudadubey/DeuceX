import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { McpAuthError, authenticateMcpToken } from '../mcp-tokens';
import type { Staff } from '../staff-auth';
import { callAdminTool, listToolsFor, type AdminMcpDeps, type ToolContext } from './tools';

// The DeuceX admin MCP server (build plan step 5.0, TECH-ARCHITECTURE.md
// 3a), served by apps/api at POST /mcp over MCP's Streamable HTTP
// transport. Stateless: each POST authenticates its bearer token afresh
// (so a revoked token or role is refused from the very next call), builds
// a server scoped to that staff member's role, answers, and is dropped.
// The tools themselves, and every rule they follow, are in tools.ts.
//
// Connect a client with a token from the console (user menu, MCP access):
//   claude mcp add --transport http deucex-admin http://localhost:8787/mcp \
//     --header "Authorization: Bearer dxm_..."

export const MCP_INSTRUCTIONS = `DeuceX admin console tools, acting as the staff member who owns this token, with their role. Every call is written to the admin audit log as mcp:<their name>.
Read tools answer directly. Action tools are two-step: call without confirmationToken to get the one-sentence consequence, show it to the staff member word for word, and only if they agree call again with the same arguments plus the confirmationToken. Delete account, comp and the provider kill switch are refused without a written reason from the staff member; never invent one.
The console never shows note transcripts, audio, moods or photos, and neither do these tools.`;

export function createAdminMcpServer(ctx: ToolContext): Server {
  const server = new Server(
    { name: 'deucex-admin', version: '0.1.0' },
    { capabilities: { tools: {} }, instructions: MCP_INSTRUCTIONS },
  );
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: listToolsFor(ctx.staff.actingRole),
  }));
  server.setRequestHandler(CallToolRequestSchema, async (request) =>
    callAdminTool(ctx, request.params.name, request.params.arguments ?? {}),
  );
  return server;
}

function meta(request: FastifyRequest) {
  const ua = request.headers['user-agent'];
  return { device: typeof ua === 'string' ? ua.slice(0, 200) : null, ip: request.ip ?? null };
}

function jsonRpcError(reply: FastifyReply, status: number, message: string) {
  return reply.code(status).send({ jsonrpc: '2.0', error: { code: -32000, message }, id: null });
}

export async function registerAdminMcpRoutes(
  app: FastifyInstance,
  deps: AdminMcpDeps,
): Promise<void> {
  app.post('/mcp', async (request, reply) => {
    let staff: Staff;
    try {
      staff = await authenticateMcpToken(deps.consoleDb, request.headers.authorization);
    } catch (error) {
      if (error instanceof McpAuthError) {
        reply.header('www-authenticate', 'Bearer realm="deucex-admin"');
        return jsonRpcError(reply, 401, error.message);
      }
      throw error;
    }

    const ctx: ToolContext = { deps, staff, meta: meta(request), now: deps.now?.() ?? new Date() };
    const server = createAdminMcpServer(ctx);
    // No sessionIdGenerator: stateless mode. JSON responses, not SSE, since
    // no tool streams.
    const transport = new StreamableHTTPServerTransport({ enableJsonResponse: true });
    reply.hijack();
    reply.raw.on('close', () => {
      void transport.close();
      void server.close();
    });
    try {
      // The SDK's Transport type predates exactOptionalPropertyTypes.
      await server.connect(transport as unknown as Transport);
      await transport.handleRequest(request.raw, reply.raw, request.body);
    } catch (error) {
      request.log.error({ error }, 'admin MCP request failed');
      if (!reply.raw.headersSent) {
        reply.raw.writeHead(500, { 'content-type': 'application/json' });
        reply.raw.end(
          JSON.stringify({
            jsonrpc: '2.0',
            error: { code: -32603, message: 'Internal error' },
            id: null,
          }),
        );
      }
    }
  });

  // Stateless: no server-to-client stream and no session to end.
  const notAllowed = async (_request: FastifyRequest, reply: FastifyReply) =>
    reply
      .code(405)
      .header('allow', 'POST')
      .send({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Method not allowed. This server is stateless: POST only.',
        },
        id: null,
      });
  app.get('/mcp', notAllowed);
  app.delete('/mcp', notAllowed);
}
