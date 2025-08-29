// src/mcp/client.js
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { MCP_SERVER_URL, MCP_HEADERS } from "./config.js";

// Keep one live client per server URL
const clients = new Map(); // Map<string, { client, transport, initialized }>

/** Build a transport with optional auth headers (API key or Bearer). */
function makeTransport(serverUrl, extraHeaders = MCP_HEADERS) {
  const headers = {
    // Streamable HTTP expects both
    Accept: "application/json, text/event-stream",
    ...(extraHeaders || {}),
  };
  return new StreamableHTTPClientTransport(new URL(serverUrl), {
    requestInit: { headers },
  });
}

async function ensureClient(serverUrl = MCP_SERVER_URL, extraHeaders = MCP_HEADERS) {
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

async function initializeIfNeeded(rec) {
  if (rec.initialized) return;
  rec.initialized = true;
}

function isNotInitializedErr(err) {
  const msg = String(err?.message || err);
  // Matches server's “Bad Request: Server not initialized” or similar
  return /not initialized/i.test(msg);
}

/** Retry once if the serverless hop lost the session. */
async function withInitRetry(serverUrl = MCP_SERVER_URL, extraHeaders = MCP_HEADERS, fn) {
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

export async function connect(serverUrl = MCP_SERVER_URL, extraHeaders = MCP_HEADERS) {
  await withInitRetry(serverUrl, extraHeaders, async () => undefined);
}

export async function listTools(serverUrl = MCP_SERVER_URL, extraHeaders = MCP_HEADERS) {
  return withInitRetry(serverUrl, extraHeaders, async (rec) => {
    const { tools } = await rec.client.listTools();
    return tools; // [{ name, title, description, inputSchema }, ...]
  });
}

export async function runTool(serverUrl = MCP_SERVER_URL, toolName, args = {}, extraHeaders = MCP_HEADERS) {
  return withInitRetry(serverUrl, extraHeaders, async (rec) => {
    try {
      const res = await rec.client.callTool({ name: toolName, arguments: args });
      if (res && res.isError) {
        const txt = res.content?.[0]?.text || "Unknown tool error";
        throw { code: "tool_error", message: txt };
      }
      const content = res.content?.map((c) => {
        if (c.type === "text") {
          try {
            return { ...c, text: JSON.parse(c.text) };
          } catch {
            return c;
          }
        }
        return c;
      });
      return { ...res, content };
    } catch (err) {
      if (err && typeof err === "object" && "code" in err && "message" in err) {
        throw { code: err.code, message: err.message };
      }
      throw err;
    }
  });
}

export async function runZap(
  { zapUrl, payload },
  serverUrl = MCP_SERVER_URL,
  extraHeaders = MCP_HEADERS
) {
  const result = await runTool(
    serverUrl,
    "triggerZap",
    { zapUrl, payload },
    extraHeaders
  );
  return result.content?.[0]?.text;
}

export async function* runToolStream(serverUrl = MCP_SERVER_URL, toolName, args = {}, extraHeaders = MCP_HEADERS) {
  const queue = [];
  let resolve;
  let done = false;
  let finalRes;
  let error;

  const push = (val) => {
    queue.push(val);
    resolve?.();
  };

  const callPromise = withInitRetry(serverUrl, extraHeaders, async (rec) => {
    const onprogress = (params) => {
      const blocks = params?.content || [];
      for (const block of blocks) {
        if (block.type === "text" && typeof block.text === "string") {
          push(block.text);
        }
      }
    };
    try {
      const res = await rec.client.callTool(
        { name: toolName, arguments: args },
        undefined,
        { onprogress }
      );
      if (res && res.isError) {
        const txt = res.content?.[0]?.text || "Unknown tool error";
        error = { code: "tool_error", message: txt };
      } else {
        const content = res.content?.map((c) => {
          if (c.type === "text") {
            try {
              return { ...c, text: JSON.parse(c.text) };
            } catch {
              return c;
            }
          }
          return c;
        });
        finalRes = { ...res, content };
      }
    } catch (err) {
      if (err && typeof err === "object" && "code" in err && "message" in err) {
        error = { code: err.code, message: err.message };
      } else {
        error = err;
      }
    } finally {
      done = true;
      push(null);
    }
  });

  while (!done || queue.length) {
    if (queue.length) {
      const val = queue.shift();
      if (val !== null) {
        yield val;
      }
    } else {
      await new Promise((r) => (resolve = r));
    }
  }

  await callPromise;
  if (error) throw error;
  return finalRes;
}

export async function close(serverUrl = MCP_SERVER_URL) {
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

