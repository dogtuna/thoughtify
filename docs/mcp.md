# Model Context Protocol (MCP) Server

The MCP server runs as a Firebase Cloud Function and exposes a thin HTTP API for
dispatching tools over the Model Context Protocol.

## Endpoints

- `GET /mcpServer` – health check returning the server name and version.
- `POST /mcpServer` – JSON‑RPC requests. Sessions are created on the
  `initialize` request and subsequent calls must include the `Mcp-Session-Id`
  header. All POST requests require authentication.
- `DELETE /mcpServer` – close an existing session by providing its
  `Mcp-Session-Id` header.

## Authentication

Tool requests to the MCP Cloud Function require an `Authorization` header.

Use one of the following formats:

- **Firebase ID token**: `Authorization: Bearer <ID_TOKEN>`
- **API key**: `Authorization: ApiKey <API_KEY>`

The API key must match the `MCP_API_KEY` environment variable or secret
configured for the function. Requests without a valid token or key receive
`401 Unauthorized`.

## Available tools

The server exposes a `ping` health check and proxies the following callable
functions:

- `generateTrainingPlan`
- `generateStudyMaterial`
- `generateCourseOutline`
- `generateAssessment`
- `generateLessonContent`
- `generateProjectQuestions`
- `generateProjectBrief`
- `generateStatusUpdate`
- `generateLearningStrategy`
- `generateContentAssets`
- `generateLearnerPersona`
- `generateHierarchicalOutline`
- `generateLearningDesignDocument`
- `generateStoryboard`
- `generateInitialInquiryMap`
- `generateAvatar`
- `savePersona`
- `generateInvitation`
- `sendEmailBlast`
- `sendEmailReply`

## Client usage

A lightweight client is provided in `src/mcp/client.js`:

```js
import { connect, listTools, runTool, runToolStream, close } from "./src/mcp/client.js";

// Initialize the session
await connect();

// Inspect available tools
const tools = await listTools();
console.log(tools);

// Run a tool once
const res = await runTool("generateCourseOutline", { topic: "Photosynthesis" });
console.log(res.content);

// Stream a tool's output
for await (const chunk of runToolStream("generateProjectBrief", { subject: "AI" })) {
  console.log(chunk);
}

await close();
```

To authenticate with an API key:

```js
await connect("https://<FUNCTION_URL>", { Authorization: "ApiKey <API_KEY>" });
```

## Configuration

- `MCP_CALL_TIMEOUT_MS` — maximum time in milliseconds to wait for a callable
  function to respond. Defaults to `120000` if unset.
- `MCP_SESSION_TTL_MS` — how long (ms) inactive sessions are kept before they
  are discarded.
