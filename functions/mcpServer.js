// functions/mcpServer.js
import { onRequest } from "firebase-functions/v2/https";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

const SERVER_NAME = "firebase-callables";
const SERVER_VER = "1.0.4";
const CALL_TIMEOUT_MS = 120_000;

// Keep transports (and servers) by session id across requests in this CF instance
const transports = new Map(); // Map<string, StreamableHTTPServerTransport>
const servers = new Map();    // Map<string, McpServer>

// Tools to expose
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

const anyObject = z.record(z.any());

function toToolResult(result) {
  try {
    if (result == null) return { content: [{ type: "text", text: "null" }] };
    if (typeof result === "string") return { content: [{ type: "text", text: result }] };
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  } catch (e) {
    return { content: [{ type: "text", text: `Error serializing result: ${e?.message || String(e)}` }], isError: true };
  }
}

async function callCallable(name, input) {
  const mod = await import("./index.js");
  const fn = mod?.[name];
  if (!fn) throw new Error(`Function ${name} not found in index.js`);
  if (typeof fn.run === "function") return await fn.run({ data: input });
  if (typeof fn === "function") return await fn({ data: input });
  throw new Error(`Function ${name} is not callable`);
}

function buildServer() {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VER });

  // ping tool for sanity checks
  server.registerTool(
    "ping",
    { title: "ping", description: "Health check", inputSchema: anyObject },
    async () => ({ content: [{ type: "text", text: "pong" }] })
  );

  for (const name of callableFunctions) {
    server.registerTool(
      name,
      { title: name, description: `Proxy to the ${name} Cloud Function`, inputSchema: anyObject },
      async (input) => {
        try {
          if (!input || typeof input !== "object") {
            return { content: [{ type: "text", text: "Input must be an object" }], isError: true };
          }
          const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error(`Timeout after ${CALL_TIMEOUT_MS}ms`)), CALL_TIMEOUT_MS));
          const result = await Promise.race([callCallable(name, input), timeout]);
          return toToolResult(result);
        } catch (err) {
          return { content: [{ type: "text", text: `Error: ${err?.message || String(err)}` }], isError: true };
        }
      }
    );
  }

  return server;
}

export const mcpServer = onRequest(async (req, res) => {
  // CORS + security
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS, GET, DELETE");
  res.set("Access-Control-Allow-Headers", "Content-Type, Mcp-Session-Id, mcp-session-id");
  res.set("Access-Control-Expose-Headers", "Mcp-Session-Id");
  res.set("X-Content-Type-Options", "nosniff");
  res.set("Cache-Control", "no-store");
  res.set("Vary", "Accept");

  if (req.method === "OPTIONS") return void res.status(204).end();
  if (req.method === "GET") return void res.status(200).json({ ok: true, name: SERVER_NAME, version: SERVER_VER });

  // Parse body once
  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body ?? {});
  const sessionId = req.get("Mcp-Session-Id") || req.get("mcp-session-id");

  try {
    if (req.method === "POST") {
      let transport = sessionId ? transports.get(sessionId) : undefined;

      if (!transport) {
        // Only create+connect on initialize
        if (!isInitializeRequest(body)) {
          return void res.status(400).json({
            jsonrpc: "2.0",
            error: { code: -32000, message: "Bad Request: Server not initialized" },
            id: null,
          });
        }

        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sid) => {
            transports.set(sid, transport);
          },
        });

        transport.onclose = () => {
          if (transport.sessionId) {
            try { servers.get(transport.sessionId)?.close?.(); } catch {}
            servers.delete(transport.sessionId);
            transports.delete(transport.sessionId);
          }
        };

        const server = buildServer();
        servers.set(transport.sessionId ?? "pending", server); // overwritten once session exists
        await server.connect(transport);
      }

      await transport.handleRequest(req, res, body);

      // If session id just got assigned on this initialize, fix server map key
      if (!sessionId && transport.sessionId && servers.has("pending")) {
        servers.set(transport.sessionId, servers.get("pending"));
        servers.delete("pending");
      }
      return;
    }

    if (req.method === "DELETE") {
      if (!sessionId || !transports.get(sessionId)) {
        return void res.status(400).send("Invalid or missing session ID");
      }
      const t = transports.get(sessionId);
      try { t?.close(); } catch {}
      transports.delete(sessionId);
      servers.delete(sessionId);
      return void res.status(204).end();
    }

    return void res.status(405).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Method not allowed." },
      id: null,
    });
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
