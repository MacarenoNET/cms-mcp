# cms-mcp

MCP server for MacarenoNet CMS. Exposes read (public) and admin tools via stdio.

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

## Setup

```bash
cd cms-mcp
npm install
npm run build
```

## Claude Desktop / Cowork

Add to `claude_desktop_config.json`:

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

## Cursor

Add to `.cursor/mcp.json` in the workspace:

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
