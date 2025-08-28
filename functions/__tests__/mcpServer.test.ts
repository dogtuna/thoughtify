import http from 'node:http';
import functionsTest from 'firebase-functions-test';

// Ensure API key for auth
process.env.MCP_API_KEY = 'test-key';

// Lazy import after env var is set
const { mcpServer } = await import('../mcpServer.js');

const fft = functionsTest();

function startWrappedServer() {
  const wrapped = fft.wrap(mcpServer);
  const server = http.createServer((req, res) => {
    // Express-style helper
    // @ts-ignore
    req.get = (name: string) => req.headers[name.toLowerCase()];
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      // @ts-ignore
      req.body = chunks.length ? Buffer.concat(chunks).toString() : undefined;
      wrapped(req, res);
    });
  });
  return new Promise<{url: string, close: () => void}>((resolve) => {
    server.listen(0, () => {
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
    const { url, close } = await startWrappedServer();
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
