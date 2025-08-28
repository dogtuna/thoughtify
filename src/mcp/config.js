// src/mcp/config.js
// Exports MCP server configuration derived from environment variables.

export const MCP_SERVER_URL = import.meta.env.VITE_MCP_URL;

export const MCP_HEADERS = import.meta.env.VITE_MCP_API_KEY
  ? { Authorization: `ApiKey ${import.meta.env.VITE_MCP_API_KEY}` }
  : {};

