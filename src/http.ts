#!/usr/bin/env node
// http.ts — HTTP/SSE entry point (production VPS)

import http from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer } from './create-server.js';

const PORT = Number(process.env.PORT ?? 3020);

const httpServer = http.createServer(async (req, res) => {
  // Health check
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'cms-mcp' }));
    return;
  }

  if (req.url !== '/mcp') {
    res.writeHead(404);
    res.end('Not Found');
    return;
  }

  // Read body for POST requests
  let body: unknown = undefined;
  if (req.method === 'POST') {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    try { body = JSON.parse(Buffer.concat(chunks).toString()); }
    catch { body = undefined; }
  }

  // One transport per request — stateless, works for all MCP tool calls
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless
  });

  const server = createServer();
  await server.connect(transport);

  await transport.handleRequest(
    req as Parameters<typeof transport.handleRequest>[0],
    res as Parameters<typeof transport.handleRequest>[1],
    body,
  );

  res.on('close', () => { server.close().catch(() => {}); });
});

httpServer.listen(PORT, () => {
  console.log(`cms-mcp HTTP server running on port ${PORT}`);
  console.log(`MCP endpoint: http://localhost:${PORT}/mcp`);
  console.log(`Health:       http://localhost:${PORT}/health`);
});
