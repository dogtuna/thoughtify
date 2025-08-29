import express from 'express';
import functionsTest from 'firebase-functions-test';
import { describe, test, expect, afterAll } from 'vitest';

// Ensure API key for auth
process.env.MCP_API_KEY = 'test-key';

// Lazy import after env var is set
const { mcpServer } = await import('../mcpServer.js');

const fft = functionsTest();

function startServer() {
  const app = express();
  app.use(express.json());
  // Use a catch-all regex path; Express 5 no longer accepts "*" directly
  app.all(/.*/, (req, res) => mcpServer(req, res));
  const server = app.listen(0);
  return new Promise<{ url: string; close: () => void }>((resolve) => {
    server.on('listening', () => {
      const { port } = server.address() as any;
      resolve({ url: `http://127.0.0.1:${port}`, close: () => server.close() });
    });
  });
}

describe('mcpServer HTTPS function', () => {
  afterAll(() => {
    fft.cleanup();
  });

  test('ping tool responds', async () => {
    const { url, close } = await startServer();
    const initResp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'ApiKey test-key',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'initialize',
        params: { clientInfo: { name: 'test', version: '0.0.0' }, capabilities: {} },
        id: 1,
      }),
    });
    expect(initResp.status).toBe(200);
    const sessionId = initResp.headers.get('mcp-session-id');
    expect(sessionId).toBeTruthy();

    const pingResp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'ApiKey test-key',
        'Mcp-Session-Id': sessionId ?? '',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'call_tool',
        params: { name: 'ping', arguments: {} },
        id: 2,
      }),
    });
    const pingJson = await pingResp.json();
    expect(pingJson.result.content[0].text).toBe('pong');
    close();
  });
});
