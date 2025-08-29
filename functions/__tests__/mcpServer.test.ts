import express from 'express';
import functionsTest from 'firebase-functions-test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
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
    const transport = new StreamableHTTPClientTransport(new URL(url), {
      requestInit: { headers: { Authorization: 'ApiKey test-key' } },
    });
    const client = new Client({ name: 'test', version: '0.0.0' }, { capabilities: {} });
    await client.connect(transport);
    const res = await client.callTool({ name: 'ping', arguments: {} });
    expect(res.content[0].text).toBe('pong');
    await client.close();
    close();
  });
});
