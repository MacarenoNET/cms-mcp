#!/usr/bin/env node
// index.ts -- stdio entry point (local dev / Claude Desktop / Cursor)

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './create-server.js';

const server = createServer();
const transport = new StdioServerTransport();
await server.connect(transport);
