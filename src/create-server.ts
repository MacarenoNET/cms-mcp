// create-server.ts — McpServer factory (shared between stdio and http transports)

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import * as cms from './cms-client.js';

function ok(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}

function err(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  return { content: [{ type: 'text' as const, text: `Error: ${msg}` }], isError: true };
}

export function createServer(): McpServer {
  const server = new McpServer({ name: 'cms-mcp', version: '1.0.0' });

  // ── PUBLIC TOOLS ────────────────────────────────────────────────────────────

  server.tool(
    'list_articles',
    'List published articles. Supports filtering by locale, category, featured status and full-text search.',
    {
      locale:   z.enum(['es', 'pt', 'en']).optional().describe('Language (default: es)'),
      page:     z.number().int().positive().optional().describe('Page number (default: 1)'),
      pageSize: z.number().int().positive().max(50).optional().describe('Results per page (default: 9, max: 50)'),
      category: z.string().optional().describe('Category slug to filter by'),
      featured: z.boolean().optional().describe('Only return featured articles'),
      q:        z.string().optional().describe('Full-text search query'),
    },
    async (args) => {
      try { return ok(await cms.listArticles(args)); }
      catch (e) { return err(e); }
    },
  );

  server.tool(
    'get_article',
    'Get a single published article by slug. Returns full content including markdown body, author, categories and localizations.',
    {
      slug:   z.string().describe('Article slug'),
      locale: z.enum(['es', 'pt', 'en']).optional().describe('Language (default: es, falls back to es if not found)'),
    },
    async ({ slug, locale }) => {
      try { return ok(await cms.getArticle(slug, locale)); }
      catch (e) { return err(e); }
    },
  );

  server.tool(
    'list_categories',
    'List published categories for a given locale.',
    {
      locale: z.enum(['es', 'pt', 'en']).optional().describe('Language (default: es)'),
    },
    async ({ locale }) => {
      try { return ok(await cms.listCategories(locale)); }
      catch (e) { return err(e); }
    },
  );

  // ── ADMIN TOOLS ─────────────────────────────────────────────────────────────

  server.tool(
    'admin_list_articles',
    'Admin: list all articles including drafts. Requires CMS_ADMIN_EMAIL and CMS_ADMIN_PASSWORD env vars.',
    {
      locale:     z.enum(['es', 'pt', 'en', 'all']).optional().describe('Language or "all"'),
      status:     z.enum(['all', 'published', 'draft']).optional().describe('Filter by status (default: all)'),
      search:     z.string().optional().describe('Search in title or slug'),
      category:   z.string().optional().describe('Category slug'),
      documentId: z.string().optional().describe('Group ID shared across translations'),
      page:       z.number().int().positive().optional(),
      pageSize:   z.number().int().positive().max(100).optional(),
    },
    async (args) => {
      try { return ok(await cms.listAllArticles(args)); }
      catch (e) { return err(e); }
    },
  );

  server.tool(
    'admin_get_article',
    'Admin: get a single article by numeric ID (includes drafts).',
    { id: z.number().int().positive().describe('Article numeric ID') },
    async ({ id }) => {
      try { return ok(await cms.getArticleById(id)); }
      catch (e) { return err(e); }
    },
  );

  server.tool(
    'admin_create_article',
    'Admin: create a new article. To create a translation, pass the documentId of the existing article group.',
    {
      title:       z.string().describe('Article title'),
      slug:        z.string().describe('URL slug (lowercase, hyphens)'),
      locale:      z.enum(['es', 'pt', 'en']).describe('Language'),
      excerpt:     z.string().describe('Short summary (1-2 sentences)'),
      content:     z.string().describe('Full content in Markdown'),
      hook:        z.string().optional().describe('Short punchy phrase for the cover image'),
      featured:    z.boolean().optional().describe('Show in featured section'),
      tags:        z.array(z.string()).optional().describe('Tag list'),
      publishDate: z.string().optional().describe('ISO date for publish date'),
      bgImageUrl:  z.string().url().optional().describe('Cover image URL'),
      authorId:    z.number().int().optional().describe('Author numeric ID'),
      categoryIds: z.array(z.number().int()).optional().describe('Category numeric IDs'),
      documentId:  z.string().optional().describe('Existing documentId to link this as a translation'),
    },
    async (args) => {
      try { return ok(await cms.createArticle(args)); }
      catch (e) { return err(e); }
    },
  );

  server.tool(
    'admin_update_article',
    'Admin: update an existing article by numeric ID. Only provided fields are updated.',
    {
      id:          z.number().int().positive().describe('Article numeric ID'),
      title:       z.string().optional(),
      slug:        z.string().optional(),
      excerpt:     z.string().optional(),
      content:     z.string().optional().describe('Full content in Markdown'),
      hook:        z.string().optional(),
      featured:    z.boolean().optional(),
      tags:        z.array(z.string()).optional(),
      publishDate: z.string().optional(),
      bgImageUrl:  z.string().url().optional(),
      authorId:    z.number().int().optional(),
      categoryIds: z.array(z.number().int()).optional().describe('Replaces all categories'),
    },
    async ({ id, ...data }) => {
      try { return ok(await cms.updateArticle(id, data)); }
      catch (e) { return err(e); }
    },
  );

  server.tool(
    'admin_publish_article',
    'Admin: publish or unpublish an article by numeric ID.',
    {
      id:      z.number().int().positive().describe('Article numeric ID'),
      publish: z.boolean().describe('true = publish, false = revert to draft'),
    },
    async ({ id, publish }) => {
      try { return ok(await cms.publishArticle(id, publish)); }
      catch (e) { return err(e); }
    },
  );

  server.tool(
    'admin_delete_article',
    'Admin: permanently delete an article by numeric ID.',
    { id: z.number().int().positive().describe('Article numeric ID') },
    async ({ id }) => {
      try { await cms.deleteArticle(id); return ok({ deleted: true, id }); }
      catch (e) { return err(e); }
    },
  );

  server.tool(
    'admin_list_authors',
    'Admin: list all authors.',
    {},
    async () => {
      try { return ok(await cms.listAuthors()); }
      catch (e) { return err(e); }
    },
  );

  server.tool(
    'admin_list_categories',
    'Admin: list all categories (all locales or filtered).',
    { locale: z.enum(['es', 'pt', 'en', 'all']).optional() },
    async ({ locale }) => {
      try { return ok(await cms.listAllCategories(locale)); }
      catch (e) { return err(e); }
    },
  );

  server.tool(
    'admin_list_subscribers',
    'Admin: list newsletter subscribers with optional search and pagination.',
    {
      search:   z.string().optional().describe('Filter by email'),
      page:     z.number().int().positive().optional(),
      pageSize: z.number().int().positive().max(100).optional(),
    },
    async (args) => {
      try { return ok(await cms.listSubscribers(args)); }
      catch (e) { return err(e); }
    },
  );

  server.tool(
    'admin_likes_stats',
    'Admin: get total likes count and top liked articles.',
    {},
    async () => {
      try { return ok(await cms.getLikesStats()); }
      catch (e) { return err(e); }
    },
  );

  server.tool(
    'admin_upload_image',
    'Admin: upload an image file to the media bucket. Returns the public URL to use as bgImageUrl in article create/update. Requires local filesystem access.',
    {
      filePath: z.string().describe('Absolute path to the image file on disk (png, jpg, webp, etc.)'),
    },
    async ({ filePath }) => {
      try { return ok(await cms.uploadImage(filePath)); }
      catch (e) { return err(e); }
    },
  );

  server.tool(
    'admin_upload_image_base64',
    'Admin: upload an image from base64 data (no local file needed). Pass the full data URI (data:image/png;base64,iVBOR...) or raw base64. Max ~2 MB. Returns the public URL to use as bgImageUrl.',
    {
      dataUri:  z.string().describe('Full data URI (e.g. "data:image/png;base64,iVBORw0KGgo...") or raw base64 string'),
      filename: z.string().optional().describe('Optional filename with extension (e.g. "cover.png"). Defaults to "image.png".'),
    },
    async ({ dataUri, filename }) => {
      try { return ok(await cms.uploadImageBase64(dataUri, filename)); }
      catch (e) { return err(e); }
    },
  );

  server.tool(
    'admin_upload_image_from_url',
    'Admin: download an image from a public HTTPS URL and upload it to the media bucket. SSRF-safe — blocks localhost/private IPs. Returns the public URL to use as bgImageUrl.',
    {
      imageUrl: z.string().url().describe('HTTPS URL of the image to download (jpg, png, webp, gif)'),
      filename: z.string().optional().describe('Optional filename. Defaults to extracted from URL.'),
    },
    async ({ imageUrl, filename }) => {
      try { return ok(await cms.uploadImageFromUrl(imageUrl, filename)); }
      catch (e) { return err(e); }
    },
  );

  // ── Chunked upload (universal — works with any AI client, even JSON-only) ─

  server.tool(
    'admin_create_upload',
    'Admin: start a new chunked upload session. Use this for large images or when your client cannot send local files. After creating, send chunks with admin_upload_chunk, then finish with admin_complete_upload.',
    {
      filename:    z.string().describe('Original filename (e.g. "cover.jpg")'),
      contentType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/gif']).describe('MIME type of the file'),
      totalBytes:  z.number().int().positive().describe('Total file size in bytes'),
      sha256:      z.string().optional().describe('Optional expected SHA-256 hash for integrity check'),
    },
    async (args) => {
      try { return ok(cms.adminCreateUpload(args)); }
      catch (e) { return err(e); }
    },
  );

  server.tool(
    'admin_upload_chunk',
    'Admin: send one base64-encoded chunk of an upload session created by admin_create_upload. Idempotent — resending the same chunk is safe.',
    {
      uploadId:    z.string().describe('Upload session ID from admin_create_upload'),
      index:       z.number().int().min(0).describe('Chunk index (0-based)'),
      base64Chunk: z.string().describe('Base64-encoded chunk data'),
    },
    async (args) => {
      try { return ok(await cms.adminUploadChunk(args)); }
      catch (e) { return err(e); }
    },
  );

  server.tool(
    'admin_complete_upload',
    'Admin: finalize a chunked upload. Assembles all chunks, validates size, MIME type, uploads to the media bucket, and returns the public URL. Idempotent — safe to call multiple times.',
    {
      uploadId: z.string().describe('Upload session ID from admin_create_upload'),
    },
    async ({ uploadId }) => {
      try { return ok(await cms.adminCompleteUpload({ uploadId })); }
      catch (e) { return err(e); }
    },
  );

  server.tool(
    'admin_abort_upload',
    'Admin: cancel an incomplete chunked upload and free storage. Safe to call on already-completed or non-existent sessions.',
    {
      uploadId: z.string().describe('Upload session ID to cancel'),
    },
    async ({ uploadId }) => {
      try { return ok(await cms.adminAbortUpload({ uploadId })); }
      catch (e) { return err(e); }
    },
  );

  return server;
}
