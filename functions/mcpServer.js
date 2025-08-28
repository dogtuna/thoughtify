import { onRequest } from "firebase-functions/v2/https";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

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

// Build a fresh server per request (stateless pattern recommended by SDK)
function buildServer() {
  const server = new McpServer({
    name: "firebase-callables",
    version: "1.0.0",
  });

  // Open input schema: accept any object
  const anyObject = z.object({}).catchall(z.any());

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
            return {
              content: [{ type: "text", text: "Input must be an object" }],
              isError: true,
            };
          }

          // Lazy-load your exported callable functions from index.js
          const mod = await import("./index.js");
          const fn = mod?.[name];

          // Prefer the .run() helper if available (v2 testing API)
          if (fn && typeof fn.run === "function") {
            const result = await fn.run({ data: input });
            return {
              content: [
                {
                  type: "text",
                  text: typeof result === "string" ? result : JSON.stringify(result),
                },
              ],
            };
          }

          // Fallback: attempt direct invocation if it's a function
          if (typeof fn === "function") {
            const result = await fn({ data: input });
            return {
              content: [
                {
                  type: "text",
                  text: typeof result === "string" ? result : JSON.stringify(result),
                },
              ],
            };
          }

          return {
            content: [{ type: "text", text: `Function ${name} is not callable` }],
            isError: true,
          };
        } catch (err) {
          const msg = err?.message || String(err);
          return {
            content: [{ type: "text", text: `Error: ${msg}` }],
            isError: true,
          };
        }
      }
    );
  }

  return server;
}

export const mcpServer = onRequest(async (req, res) => {
  // CORS (needed for browser-based MCP clients)
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST, GET, DELETE, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type, Mcp-Session-Id, mcp-session-id");
  res.set("Access-Control-Expose-Headers", "Mcp-Session-Id");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  // Stateless Streamable HTTP: create a fresh server + transport per request
  if (req.method === "POST") {
    try {
      const server = buildServer();
      const transport = new StreamableHTTPServerTransport({
        // Stateless => no sessionId generator
        sessionIdGenerator: undefined,
      });

      // Clean up when the connection closes
      res.on("close", () => {
        try {
          transport.close();
          // close() may exist on server implementation
          server.close?.();
        } catch {
          /* noop */
        }
      });

      await server.connect(transport);

      // Ensure we pass a parsed body
      const body =
        typeof req.body === "string"
          ? JSON.parse(req.body || "{}")
          : req.body ?? {};

      await transport.handleRequest(req, res, body);
      return;
    } catch (error) {
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: error?.message || "Internal server error" },
          id: null,
        });
      }
      return;
    }
  }

  // Stateless mode doesn't support GET/DELETE notification endpoints
  if (req.method === "GET" || req.method === "DELETE") {
    res
      .status(405)
      .json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Method not allowed." },
        id: null,
      });
    return;
  }

  // Fallback
  res.status(405).send("Method not allowed.");
});

