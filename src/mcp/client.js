// src/mcp/client.js
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

// Keep one live client per server URL
const clients = new Map(); // Map<string, { client, transport, initialized }>

const PROTOCOL_VERSION = "2025-03-26";

/** Build a transport with optional auth headers (API key or Bearer). */
function makeTransport(serverUrl, extraHeaders) {
  const headers = {
    // Streamable HTTP expects both
    Accept: "application/json, text/event-stream",
    ...(extraHeaders || {}),
  };
  return new StreamableHTTPClientTransport(new URL(serverUrl), {
    requestInit: { headers },
  });
}

async function ensureClient(serverUrl, extraHeaders) {
  let rec = clients.get(serverUrl);
  if (rec) return rec;

  const client = new Client(
    { name: "app", version: "1.0.0" },
    { capabilities: {} }
  );
  const transport = makeTransport(serverUrl, extraHeaders);
  await client.connect(transport);

  rec = { client, transport, initialized: false };
  clients.set(serverUrl, rec);
  return rec;
}

async function initializeIfNeeded(rec, timeoutMs = 15000) {
  if (rec.initialized) return;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    await rec.client.initialize(
      { protocolVersion: PROTOCOL_VERSION, capabilities: {} },
      { signal: ctrl.signal }
    );
    rec.initialized = true;
  } finally {
    clearTimeout(t);
  }
}

function isNotInitializedErr(err) {
  const msg = String(err?.message || err);
  // Matches server's “Bad Request: Server not initialized” or similar
  return /not initialized/i.test(msg);
}

/** Retry once if the serverless hop lost the session. */
async function withInitRetry(serverUrl, extraHeaders, fn) {
  let rec = await ensureClient(serverUrl, extraHeaders);
  try {
    await initializeIfNeeded(rec);
    return await fn(rec);
  } catch (e) {
    if (isNotInitializedErr(e)) {
      // Recreate client (new transport/session), re-init, then retry once
      clients.delete(serverUrl);
      rec = await ensureClient(serverUrl, extraHeaders);
      await initializeIfNeeded(rec);
      return await fn(rec);
    }
    throw e;
  }
}

/** Public API (JS) **/

export async function connect(serverUrl, extraHeaders) {
  await withInitRetry(serverUrl, extraHeaders, async () => undefined);
}

export async function listTools(serverUrl, extraHeaders) {
  return withInitRetry(serverUrl, extraHeaders, async (rec) => {
    const { tools } = await rec.client.listTools();
    return tools; // [{ name, title, description, inputSchema }, ...]
  });
}

export async function runTool(serverUrl, toolName, args = {}, extraHeaders) {
  return withInitRetry(serverUrl, extraHeaders, async (rec) => {
    const res = await rec.client.callTool({ name: toolName, arguments: args });
    if (res && res.isError) {
      const txt = res.content?.[0]?.text || "Unknown tool error";
      throw new Error(txt);
    }
    return res; // { content: [...], isError?: false }
  });
}

export async function close(serverUrl) {
  const rec = clients.get(serverUrl);
  if (!rec) return;
  try {
    await rec.client.close();
  } finally {
    // Optional: tell server to drop the session it created
    try {
      const sid = rec.transport?.sessionId;
      if (sid) {
        await fetch(serverUrl, { method: "DELETE", headers: { "Mcp-Session-Id": sid } });
      }
      } catch {
        /* ignore */
      }
    clients.delete(serverUrl);
  }
}

