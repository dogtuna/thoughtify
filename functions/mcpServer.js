import { createServer } from "@modelcontextprotocol/server";
import { onRequest } from "firebase-functions/v2/https";

// Create MCP server instance
const mcp = createServer();

// List of callable Cloud Functions we want to expose as MCP tools
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

function registerCallable(name) {
  mcp.registerTool({
    name,
    description: `Proxy to the ${name} Cloud Function`,
    inputSchema: { type: "object", additionalProperties: true },
    async handler(input) {
      if (!input || typeof input !== "object") {
        throw new Error("Input must be an object");
      }
      const mod = await import("./index.js");
      const fn = mod[name];
      if (!fn || typeof fn.run !== "function") {
        throw new Error(`Function ${name} is not callable`);
      }
      const result = await fn.run({ data: input });
      return result;
    },
  });
}

for (const name of callableFunctions) {
  registerCallable(name);
}

export const mcpServer = onRequest(async (req, res) => {
  // Basic CORS for local testing
  res.set("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") {
    res.set("Access-Control-Allow-Methods", "POST");
    res.set("Access-Control-Allow-Headers", "Content-Type");
    res.status(204).end();
    return;
  }
  try {
    await mcp.handleRequest(req, res);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

