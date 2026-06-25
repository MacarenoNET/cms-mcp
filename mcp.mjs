#!/usr/bin/env node
// mcp.mjs — Ejecuta herramientas del CMS MCP en producción
// Uso: node mcp.mjs <tool> [args JSON]
// Ej:  node mcp.mjs admin_list_templates
//      node mcp.mjs get_article '{"slug":"ia-salio-mas-cara","locale":"es"}'

const MCP_URL = 'https://mcp.macareno.net/mcp';

async function call(tool, args = {}) {
    const res = await fetch(MCP_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream' },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/call', id: '1', params: { name: tool, arguments: args } })
    });
    const text = await res.text();
    const dataLine = text.split('\n').find(l => l.startsWith('data:'));
    if (!dataLine) { console.log('Respuesta:', text.slice(0, 500)); return; }
    const data = JSON.parse(dataLine.slice(5));
    if (data.error) { console.log('Error:', data.error.message); return; }
    const result = JSON.parse(data.result.content[0].text);
    return result;
}

// ── Main
const [, , tool, argsRaw] = process.argv;
if (!tool) {
    console.log('Uso: node mcp.mjs <tool> [args]');
    console.log('Ej:  node mcp.mjs admin_list_templates');
    process.exit(1);
}

const args = argsRaw ? JSON.parse(argsRaw) : {};
const result = await call(tool, args);
console.log(JSON.stringify(result, null, 2));
