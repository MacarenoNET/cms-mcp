#!/usr/bin/env node
// http.ts — HTTP/SSE entry point (production VPS)
//
// Autenticación (obligatoria): el servidor actúa como administrador del CMS, así que NADIE puede llamar a /mcp
// sin presentar el secreto MCP_AUTH_TOKEN. Se acepta de dos formas, para que sirva con cualquier cliente MCP:
//   1. Cabecera  Authorization: Bearer <MCP_AUTH_TOKEN>
//   2. Secreto en la ruta:  https://<host>/mcp/<MCP_AUTH_TOKEN>   (para conectores que no permiten cabeceras)
// Si MCP_AUTH_TOKEN falta o tiene menos de 32 caracteres, el servidor NO arranca (falla cerrado).
// /health sigue abierto (no expone nada). Las peticiones de navegador (con cabecera Origin) solo se aceptan
// desde los orígenes de MCP_ALLOWED_ORIGINS (por defecto https://claude.ai).

import http from 'node:http';
import { createHash, timingSafeEqual } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer } from './create-server.js';

const PORT = Number(process.env.PORT ?? 3020);

const AUTH_TOKEN = (process.env.MCP_AUTH_TOKEN ?? '').trim();
if (AUTH_TOKEN.length < 32) {
  console.error('FATAL: MCP_AUTH_TOKEN no está definido o es demasiado corto (mínimo 32 caracteres). El servidor no arranca sin autenticación.');
  process.exit(1);
}
const TOKEN_DIGEST = createHash('sha256').update(AUTH_TOKEN).digest();

const ALLOWED_ORIGINS = (process.env.MCP_ALLOWED_ORIGINS ?? 'https://claude.ai,https://www.claude.ai')
  .split(',').map((s) => s.trim()).filter(Boolean);

/** Comparación en tiempo constante (se comparan los hash para igualar longitudes). */
function tokenOk(candidate: string | undefined): boolean {
  if (!candidate) return false;
  const digest = createHash('sha256').update(candidate).digest();
  return timingSafeEqual(digest, TOKEN_DIGEST);
}

function deny(res: http.ServerResponse, status: number, message: string) {
  res.writeHead(status, { 'Content-Type': 'application/json', ...(status === 401 ? { 'WWW-Authenticate': 'Bearer realm="cms-mcp"' } : {}) });
  res.end(JSON.stringify({ error: message }));
}

const httpServer = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const pathname = url.pathname;

  // Health check (abierto: no revela nada)
  if (req.method === 'GET' && pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'cms-mcp' }));
    return;
  }

  // /mcp  o  /mcp/<token>
  const m = pathname.match(/^\/mcp(?:\/([^/]+))?\/?$/);
  if (!m) {
    res.writeHead(404);
    res.end('Not Found');
    return;
  }

  // Orígenes de navegador no permitidos (CSRF / DNS rebinding)
  const origin = req.headers.origin;
  if (origin && !ALLOWED_ORIGINS.includes(origin)) {
    deny(res, 403, 'Origin not allowed');
    return;
  }

  // Autenticación
  const header = req.headers.authorization ?? '';
  const bearer = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : undefined;
  let pathToken: string | undefined;
  try { pathToken = m[1] ? decodeURIComponent(m[1]) : undefined; } catch { pathToken = undefined; }
  if (!tokenOk(bearer) && !tokenOk(pathToken)) {
    deny(res, 401, 'Unauthorized');
    return;
  }

  // Read body for POST requests
  let body: unknown = undefined;
  if (req.method === 'POST') {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
      size += (chunk as Buffer).length;
      if (size > 5 * 1024 * 1024) { deny(res, 413, 'Payload too large'); return; }
      chunks.push(chunk as Buffer);
    }
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
  console.log(`cms-mcp HTTP server running on port ${PORT} (auth: required)`);
  console.log(`MCP endpoint: http://localhost:${PORT}/mcp`);
  console.log(`Health:       http://localhost:${PORT}/health`);
});
