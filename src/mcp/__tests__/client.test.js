import http from 'node:http';
import { Buffer } from 'node:buffer';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import * as client from '../client.js';
import { describe, test, expect, vi } from 'vitest';

async function startMockServer() {
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => 's1' });
  const server = new McpServer({ name: 'mock', version: '1.0.0' });
  server.registerTool('ping', {
    title: 'ping',
    description: 'Ping tool',
    inputSchema: { type: 'object', properties: {} },
  }, async () => ({ content: [{ type: 'text', text: 'pong' }] }));
  await server.connect(transport);

  const httpServer = http.createServer((req, res) => {
    // @ts-ignore
    req.get = (name) => req.headers[name.toLowerCase()];
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', async () => {
      const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : undefined;
      await transport.handleRequest(req, res, body);
    });
  });

  await new Promise((resolve) => httpServer.listen(0, resolve));
  const port = httpServer.address().port;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => httpServer.close(),
  };
}

describe('MCP client', () => {
  test('connect and listTools', async () => {
    const { url, close } = await startMockServer();
    await client.connect(url, { Authorization: 'ApiKey test' });
    const tools = await client.listTools(url, { Authorization: 'ApiKey test' });
    expect(tools.some(t => t.name === 'ping')).toBe(true);
    close();
  });

  test('connect fails for bad server', async () => {
    const badServer = http.createServer((req, res) => { res.statusCode = 500; res.end('error'); });
    await new Promise((r) => badServer.listen(0, r));
    const badUrl = `http://127.0.0.1:${badServer.address().port}`;
    await expect(client.connect(badUrl)).rejects.toBeDefined();
    badServer.close();
  });

  test.skip('runZap calls triggerZap tool', async () => {
    const spy = vi
      .spyOn(client, 'runTool')
      .mockResolvedValue({ content: [{ text: { ok: true } }] });
    const res = await client.runZap(
      { zapUrl: 'https://example.com', payload: { foo: 'bar' } },
      'http://example.com',
      { Authorization: 'test' }
    );
    expect(spy).toHaveBeenCalledWith(
      'http://example.com',
      'triggerZap',
      { zapUrl: 'https://example.com', payload: { foo: 'bar' } },
      { Authorization: 'test' }
    );
    expect(res).toEqual({ ok: true });
    spy.mockRestore();
  });
});
