#!/usr/bin/env node
// index.ts -- stdio entry point (local dev / Claude Desktop / Cursor)

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './create-server.js';

async function main() {
    const server = createServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('[cms-mcp] Server connected via stdio');

    // Graceful shutdown
    const shutdown = async () => {
        console.error('[cms-mcp] Shutting down...');
        await server.close().catch(() => { });
        process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
}

main().catch((err) => {
    console.error('[cms-mcp] Fatal error:', err);
    process.exit(1);
});
