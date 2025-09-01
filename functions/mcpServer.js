// functions/mcpServer.js
/* eslint-env node */
/* global process */
import { onRequest } from "firebase-functions/v2/https";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import toolSchemas from "./mcpSchemas.js";
import admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp();
}

const API_KEY = process.env.MCP_API_KEY;

const SERVER_NAME = "firebase-callables";
const SERVER_VER = "1.0.4";
const CALL_TIMEOUT_MS = Number(
  process.env.MCP_CALL_TIMEOUT_MS ?? "120000",
);
const SESSION_TTL_MS = Number(process.env.MCP_SESSION_TTL_MS ?? "600000");

// Keep transports (and servers) by session id across requests in this CF instance
const transports = new Map(); // Map<string, { transport: StreamableHTTPServerTransport, lastActivity: number }>
const servers = new Map(); // Map<string, { server: McpServer, lastActivity: number }>

if (SESSION_TTL_MS > 0) {
  setInterval(() => {
    const now = Date.now();
    for (const [sid, { transport, lastActivity }] of transports) {
      if (now - lastActivity > SESSION_TTL_MS) {
        try { transport.close(); } catch { /* ignore */ }
        transports.delete(sid);
        const serverEntry = servers.get(sid);
        try { serverEntry?.server?.close?.(); } catch { /* ignore */ }
        servers.delete(sid);
      }
    }
  }, SESSION_TTL_MS).unref?.();
}

// Tools to expose
const callableFunctions = [
  "generateTrainingPlan",
  "generateStudyMaterial",
  "generateCourseOutline",
  "generateAssessment",
  "generateLessonContent",
  "generateProjectQuestions",
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
  "triggerZap",
];

const anyObject = z.record(z.any());

async function verifyAuth(req) {
  const header = req.get("Authorization") || "";
  if (header.startsWith("Bearer ")) {
    const token = header.slice(7);
    await admin.auth().verifyIdToken(token);
    return;
  }
  if (header.startsWith("ApiKey ")) {
    const key = header.slice(7);
    if (API_KEY && key === API_KEY) return;
  }
  throw new Error("Unauthorized");
}

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
    { title: "ping", description: "Health check" },
    async () => ({ content: [{ type: "text", text: "pong" }] })
  );

  for (const name of callableFunctions) {
    const schema = toolSchemas[name] || anyObject;
    server.registerTool(
      name,
      { title: name, description: `Proxy to the ${name} Cloud Function`, inputSchema: schema },
      async (input) => {
        try {
          const data = schema.parse(input ?? {});
          const timeout = new Promise((_, rej) =>
            setTimeout(() => rej(new Error(`Timeout after ${CALL_TIMEOUT_MS}ms`)), CALL_TIMEOUT_MS)
          );
          const result = await Promise.race([callCallable(name, data), timeout]);
          return toToolResult(result);
        } catch (err) {
          if (err instanceof z.ZodError) {
            return {
              content: [
                { type: "text", text: `Invalid input: ${err.issues.map((i) => i.message).join(", ")}` },
              ],
              isError: true,
            };
          }
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

  if (req.method === "POST" || req.method === "DELETE") {
    try {
      await verifyAuth(req);
    } catch {
      return void res.status(401).json({ error: "Unauthorized" });
    }
  }

  try {
    if (req.method === "POST") {
      let transportEntry = sessionId ? transports.get(sessionId) : undefined;
      let transport = transportEntry?.transport;

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
            transports.set(sid, { transport, lastActivity: Date.now() });
          },
        });

        transport.onclose = () => {
          if (transport.sessionId) {
            try { servers.get(transport.sessionId)?.server?.close?.(); } catch {
              /* ignore */
            }
            servers.delete(transport.sessionId);
            transports.delete(transport.sessionId);
          }
        };

        const server = buildServer();
        servers.set(transport.sessionId ?? "pending", { server, lastActivity: Date.now() }); // overwritten once session exists
        await server.connect(transport);
      }

      await transport.handleRequest(req, res, body);

      // If session id just got assigned on this initialize, fix server map key
      if (!sessionId && transport.sessionId && servers.has("pending")) {
        const entry = servers.get("pending");
        if (entry) {
          servers.set(transport.sessionId, entry);
          servers.delete("pending");
          entry.lastActivity = Date.now();
        }
      }

      if (transport.sessionId) {
        const now = Date.now();
        const te = transports.get(transport.sessionId);
        if (te) te.lastActivity = now;
        const se = servers.get(transport.sessionId);
        if (se) se.lastActivity = now;
      }
      return;
    }

    if (req.method === "DELETE") {
      if (!sessionId || !transports.get(sessionId)) {
        return void res.status(400).send("Invalid or missing session ID");
      }
      const t = transports.get(sessionId);
      try { t?.transport?.close(); } catch {
        /* ignore */
      }
      transports.delete(sessionId);
      const s = servers.get(sessionId);
      try { s?.server?.close?.(); } catch { /* ignore */ }
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
