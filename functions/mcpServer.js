// functions/mcpServer.js
import { onRequest } from "firebase-functions/v2/https";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const PROTOCOL_VERSION = "2025-03-26";
const SERVER_NAME = "firebase-callables";
const SERVER_VER = "1.0.3";
const CALL_TIMEOUT_MS = 120_000;

// List of callable Cloud Functions to expose as MCP tools
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

const anyObject = z.object({}).catchall(z.any());

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
    return await fn.run({ data: input }); // v2 onCall test runner
  }
  if (typeof fn === "function") {
    return await fn({ data: input }); // fallback
  }
  throw new Error(`Function ${name} is not callable`);
}

function buildServer() {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VER });

  // Minimal health tool
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
          return {
            content: [{ type: "text", text: `Error: ${err?.message || String(err)}` }],
            isError: true,
          };
        }
      }
    );
  }

  return server;
}

export const mcpServer = onRequest(async (req, res) => {
  // CORS + security
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS, GET");
  res.set("Access-Control-Allow-Headers", "Content-Type, Mcp-Session-Id, mcp-session-id");
  res.set("Access-Control-Expose-Headers", "Mcp-Session-Id");
  res.set("X-Content-Type-Options", "nosniff");
  res.set("Cache-Control", "no-store");
  res.set("Vary", "Accept"); // content negotiation (JSON/SSE)

  if (req.method === "OPTIONS") return void res.status(204).end();

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

    // Use real sessions so the client can: initialize → list → call
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
    });

    res.on("close", () => {
      try {
        transport.close();
        server.close?.();
      } catch {}
    });

    await server.connect(transport);

    // MUST start each session with exactly one initialize message.
    // We DO NOT auto-prepend initialize. Client must send it first per session.
    const body =
      typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body ?? {};

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
