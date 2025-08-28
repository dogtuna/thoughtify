// functions/mcpServer.js
import { onRequest } from "firebase-functions/v2/https";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

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

// ------------------------ helpers ------------------------
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
    // Firebase v2 onCall testing API
    return await fn.run({ data: input });
  }
  if (typeof fn === "function") {
    // Fallback for direct callable
    return await fn({ data: input });
  }
  throw new Error(`Function ${name} is not callable`);
}

// ------------------------ server ------------------------
function buildServer() {
  const server = new McpServer({
    name: "firebase-callables",
    version: "1.0.1",
  });

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

          // Guard long-running calls
          const TIMEOUT_MS = 120_000;
          const timeout = new Promise((_, rej) =>
            setTimeout(() => rej(new Error(`Timeout after ${TIMEOUT_MS}ms`)), TIMEOUT_MS)
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

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  // Simple health/info for quick checks in a browser
  if (req.method === "GET") {
    res.status(200).json({ ok: true, name: "firebase-callables", version: "1.0.1" });
    return;
  }

  if (req.method !== "POST") {
    res
      .status(405)
      .json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed." }, id: null });
    return;
  }

  try {
    const server = buildServer();

    // Emit a session id so clients can reuse it across calls
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
    });

    // Clean up when the connection closes
    res.on("close", () => {
      try {
        transport.close();
        server.close?.();
      } catch {
        /* noop */
      }
    });

    await server.connect(transport);

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
