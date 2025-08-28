// functions/mcpServer.js
import { onRequest } from "firebase-functions/v2/https";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

// ---------- config ----------
const PROTOCOL_VERSION = "2025-03-26";
const SERVER_NAME = "firebase-callables";
const SERVER_VER  = "1.0.2";
const CALL_TIMEOUT_MS = 120_000;

// Tools to expose (your callable Cloud Functions)
const callableFunctions = [
  "generateTrainingPlan",
  "generateStudyMaterial",
  "generateCourseOutline",
  "generateAssessment",
  "generateLessonContent",
  "generateClarifyingQuestions",
  "generateProjectBrief",
  "generateStatusUpdate",
  "generateLearningStrategy",
  "generateContentAssets",
  "generateLearnerPersona",
  "generateHierarchicalOutline",
  "generateLearningDesignDocument",
  "generateStoryboard",
  "generateInitialInquiryMap",
  "generateAvatar",
  "savePersona",
  "generateInvitation",
  "sendEmailBlast",
  "sendEmailReply",
];

// Open input schema: accept any object
const anyObject = z.object({}).catchall(z.any());

// ---------- helpers ----------
function toToolResult(result) {
  try {
    if (result === undefined || result === null) {
      return { content: [{ type: "text", text: "null" }] };
    }
    if (typeof result === "string") {
      return { content: [{ type: "text", text: result }] };
    }
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  } catch (e) {
    return {
      content: [{ type: "text", text: `Error serializing result: ${e?.message || String(e)}` }],
      isError: true,
    };
  }
}

async function callCallable(name, input) {
  const mod = await import("./index.js");
  const fn = mod?.[name];
  if (!fn) throw new Error(`Function ${name} not found in index.js`);
  if (typeof fn.run === "function") {
    return await fn.run({ data: input }); // v2 onCall testing API
  }
  if (typeof fn === "function") {
    return await fn({ data: input });      // fallback
  }
  throw new Error(`Function ${name} is not callable`);
}

/**
 * If no session is provided and body lacks an "initialize" message,
 * prepend a minimal initialize so single-call POSTs work in serverless.
 */
function ensureInitializedBodyIfNeeded(req, body) {
  const hasSession = !!(req.get("Mcp-Session-Id") || req.get("mcp-session-id"));
  const msgs = Array.isArray(body) ? body : [body];
  const hasInitialize = msgs.some((m) => m && m.method === "initialize");

  if (hasSession || hasInitialize) return body;

  const init = {
    jsonrpc: "2.0",
    id: 1, // id doesn't matter; client can ignore it
    method: "initialize",
    params: {
      protocolVersion: PROTOCOL_VERSION,
      clientInfo: { name: "server-auto-init", version: SERVER_VER },
      capabilities: {},
    },
  };
  return Array.isArray(body) ? [init, ...body] : [init, body];
}

// ---------- server ----------
function buildServer() {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VER });

  // Simple ping tool for sanity checks
  server.registerTool(
    "ping",
    { title: "ping", description: "Health check", inputSchema: { type: "object" } },
    async () => ({ content: [{ type: "text", text: "pong" }] })
  );

  for (const name of callableFunctions) {
    server.registerTool(
      name,
      {
        title: name,
        description: `Proxy to the ${name} Cloud Function`,
        inputSchema: anyObject,
      },
      async (input) => {
        try {
          if (!input || typeof input !== "object") {
            return { content: [{ type: "text", text: "Input must be an object" }], isError: true };
          }
          const timeout = new Promise((_, rej) =>
            setTimeout(() => rej(new Error(`Timeout after ${CALL_TIMEOUT_MS}ms`)), CALL_TIMEOUT_MS)
          );
          const result = await Promise.race([callCallable(name, input), timeout]);
          return toToolResult(result);
        } catch (err) {
          const msg = err?.message || String(err);
          return { content: [{ type: "text", text: `Error: ${msg}` }], isError: true };
        }
      }
    );
  }
  return server;
}

export const mcpServer = onRequest(async (req, res) => {
  // CORS + security + caching
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS, GET");
  res.set("Access-Control-Allow-Headers", "Content-Type, Mcp-Session-Id, mcp-session-id");
  res.set("Access-Control-Expose-Headers", "Mcp-Session-Id");
  res.set("X-Content-Type-Options", "nosniff");
  res.set("Cache-Control", "no-store");
  res.set("Vary", "Accept"); // content negotiation (JSON/SSE)

  if (req.method === "OPTIONS") return void res.status(204).end();

  // Health endpoint for quick browser check
  if (req.method === "GET") {
    return void res.status(200).json({ ok: true, name: SERVER_NAME, version: SERVER_VER });
  }

  if (req.method !== "POST") {
    return void res
      .status(405)
      .json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed." }, id: null });
  }

  try {
    const server = buildServer();

    // Stateless mode: DO NOT generate server-side session ids.
    // (Multiple CF instances won't share memory; let each POST stand alone.)
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    res.on("close", () => {
      try {
        transport.close();
        server.close?.();
      } catch {}
    });

    await server.connect(transport);

    // Parse body and auto-prepend initialize if needed (sessionless safety)
    const parsed =
      typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body ?? {};
    const body = ensureInitializedBodyIfNeeded(req, parsed);

    await transport.handleRequest(req, res, body);
  } catch (error) {
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: error?.message || "Internal server error" },
        id: null,
      });
    }
  }
});
