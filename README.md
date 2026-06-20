# cms-mcp

MCP server for MacarenoNet CMS. Exposes read (public) and admin tools via stdio or HTTP/SSE.

**Production endpoint:** `https://mcp.macareno.net/mcp`

## Tools

### Public (no auth)
| Tool | Description |
|------|-------------|
| `list_articles` | List published articles with filters (locale, category, featured, search) |
| `get_article` | Get a single article by slug + locale |
| `list_categories` | List categories by locale |

### Admin (requires credentials)
| Tool | Description |
|------|-------------|
| `admin_list_articles` | List all articles including drafts |
| `admin_get_article` | Get article by numeric ID |
| `admin_create_article` | Create a new article (or translation) |
| `admin_update_article` | Update article fields by ID |
| `admin_publish_article` | Publish or unpublish by ID |
| `admin_delete_article` | Permanently delete by ID |
| `admin_list_authors` | List all authors |
| `admin_list_categories` | List all categories (all locales) |
| `admin_list_subscribers` | List newsletter subscribers |
| `admin_likes_stats` | Total likes + top articles |

### Upload images (requires credentials)
| Tool | Description |
|------|-------------|
| `admin_upload_image` | Upload an image from a local file path. Requires filesystem access (stdio mode only). |
| `admin_upload_image_base64` | Upload an image from a base64 data URI or raw base64 string. Max **5 MB**. |
| `admin_upload_image_from_url` | Download an image from a public HTTPS URL and upload it to the media bucket. SSRF-safe. Max 10 MB. |
| `admin_create_upload` | Start a chunked upload session for files up to **10 MB** (use when image > 5 MB). Returns `uploadId` and `chunkSize`. |
| `admin_upload_chunk` | Send one base64-encoded chunk. Idempotent. |
| `admin_complete_upload` | Finalize a chunked upload — assembles chunks, validates MIME, uploads to S3. Returns public URL. |
| `admin_abort_upload` | Cancel an incomplete chunked upload and free temp storage. |

#### Chunked upload workflow

```
1. admin_create_upload  →  { uploadId, chunkSize: 64512 }
2. For each chunk i (binary slices of exactly chunkSize bytes, last may be smaller):
     admin_upload_chunk(uploadId, i, base64(binaryChunk))
3. admin_complete_upload(uploadId)  →  { url, key, ... }
```

`chunkSize` (64512) is divisible by 3, so you can also split a full-file base64 string at
character positions that are multiples of `64512 / 3 * 4 = 86016`.

All upload methods return `{ id, key, url }`. Use `url` as the `bgImageUrl` when creating or updating an article.

## Usage

### 🌐 Remote HTTP/SSE (VS Code Copilot, Cursor, Continue, Cline)

No installation needed — just point to the production endpoint:

```json
{
  "mcpServers": {
    "cms": {
      "url": "https://mcp.macareno.net/mcp"
    }
  }
}
```

Works out of the box for **all public tools**. Admin tools work automatically (credentials are server-side).

### 🖥️ Local stdio (Claude Desktop, Cowork)

Claude Desktop only supports local processes. Use `npx` — no cloning needed:

```json
{
  "mcpServers": {
    "cms": {
      "command": "npx",
      "args": ["github:MacarenoNET/cms-mcp"],
      "env": {
        "CMS_API_URL": "https://api.macareno.net",
        "CMS_ADMIN_EMAIL": "admin@macareno.net",
        "CMS_ADMIN_PASSWORD": "your-password"
      }
    }
  }
}
```

Or clone and run locally:

```bash
git clone https://github.com/MacarenoNET/cms-mcp.git
cd cms-mcp
npm install
npm run build
```

Then in `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "cms": {
      "command": "node",
      "args": ["D:/CMS/cms-mcp/dist/index.js"],
      "env": {
        "CMS_API_URL": "https://api.macareno.net",
        "CMS_ADMIN_EMAIL": "admin@macareno.net",
        "CMS_ADMIN_PASSWORD": "your-password"
      }
    }
  }
}
```

### 📋 Config file locations

| Client | File |
|--------|------|
| VS Code Copilot | `.vscode/mcp.json` |
| Cursor | `.cursor/mcp.json` |
| Cline | VS Code settings → `cline.mcpServers` |
| Continue.dev | `~/.continue/config.json` |
| Claude Desktop | `%APPDATA%\Claude\claude_desktop_config.json` |
