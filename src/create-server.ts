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
      locale: z.enum(['es', 'pt', 'en']).optional().describe('Language (default: es)'),
      page: z.number().int().positive().optional().describe('Page number (default: 1)'),
      pageSize: z.number().int().positive().max(50).optional().describe('Results per page (default: 9, max: 50)'),
      category: z.string().optional().describe('Category slug to filter by'),
      featured: z.boolean().optional().describe('Only return featured articles'),
      q: z.string().optional().describe('Full-text search query'),
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
      slug: z.string().describe('Article slug'),
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
      locale: z.enum(['es', 'pt', 'en', 'all']).optional().describe('Language or "all"'),
      status: z.enum(['all', 'published', 'draft']).optional().describe('Filter by status (default: all)'),
      search: z.string().optional().describe('Search in title or slug'),
      category: z.string().optional().describe('Category slug'),
      documentId: z.string().optional().describe('Group ID shared across translations'),
      page: z.number().int().positive().optional(),
      pageSize: z.number().int().positive().max(100).optional(),
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
      title: z.string().describe('Article title'),
      slug: z.string().describe('URL slug (lowercase, hyphens)'),
      locale: z.enum(['es', 'pt', 'en']).describe('Language'),
      excerpt: z.string().describe('Short summary (1-2 sentences)'),
      content: z.string().describe('Full content in Markdown'),
      hook: z.string().optional().describe('Short punchy phrase for the cover image'),
      featured: z.boolean().optional().describe('Show in featured section'),
      tags: z.array(z.string()).optional().describe('Tag list'),
      publishDate: z.string().optional().describe('ISO date for publish date'),
      bgImageUrl: z.string().url().optional().describe('Cover image URL'),
      authorId: z.number().int().optional().describe('Author numeric ID'),
      categoryIds: z.array(z.number().int()).optional().describe('Category numeric IDs'),
      documentId: z.string().optional().describe('Existing documentId to link this as a translation'),
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
      id: z.number().int().positive().describe('Article numeric ID'),
      title: z.string().optional(),
      slug: z.string().optional(),
      excerpt: z.string().optional(),
      content: z.string().optional().describe('Full content in Markdown'),
      hook: z.string().optional(),
      featured: z.boolean().optional(),
      tags: z.array(z.string()).optional(),
      publishDate: z.string().optional(),
      bgImageUrl: z.string().url().optional(),
      authorId: z.number().int().optional(),
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
      id: z.number().int().positive().describe('Article numeric ID'),
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
      search: z.string().optional().describe('Filter by email'),
      page: z.number().int().positive().optional(),
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
    'Admin: upload an image from base64 data (no local file needed). Pass the full data URI (data:image/png;base64,iVBOR...) or raw base64. Max 5 MB — for larger files use the chunked upload flow (admin_create_upload). Returns the public URL to use as bgImageUrl.',
    {
      dataUri: z.string().describe('Full data URI (e.g. "data:image/png;base64,iVBORw0KGgo...") or raw base64 string'),
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
    [
      'Admin: start a chunked upload session for images that exceed the 5 MB single-upload limit (max 10 MB).',
      'Workflow: (1) call admin_create_upload → get uploadId and chunkSize (bytes).',
      '(2) Split the binary image into chunks of exactly chunkSize bytes (last chunk may be smaller).',
      '    Base64-encode each binary chunk independently and send with admin_upload_chunk.',
      '    Because chunkSize (64512) is divisible by 3, you can also split a full-file base64 string',
      '    at character positions that are multiples of (chunkSize / 3 * 4) = 86016.',
      '(3) Call admin_complete_upload → returns the public image URL.',
      'If anything goes wrong, call admin_abort_upload to free storage.',
    ].join(' '),
    {
      filename: z.string().describe('Original filename with extension (e.g. "cover.jpg")'),
      contentType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml']).describe('MIME type of the file'),
      totalBytes: z.number().int().positive().describe('Total file size in bytes (max 10 MB = 10485760)'),
      sha256: z.string().optional().describe('Optional expected SHA-256 hex hash for integrity verification'),
    },
    async (args) => {
      try { return ok(cms.adminCreateUpload(args)); }
      catch (e) { return err(e); }
    },
  );

  server.tool(
    'admin_upload_chunk',
    'Admin: send one base64-encoded chunk of an upload session created by admin_create_upload. Send chunkSize binary bytes per chunk (last chunk can be smaller). Max decoded size per call: 256 KB. Idempotent — resending the same chunk index is safe.',
    {
      uploadId: z.string().describe('Upload session ID from admin_create_upload'),
      index: z.number().int().min(0).describe('Chunk index (0-based)'),
      base64Chunk: z.string().describe('Base64-encoded binary chunk. Decoded size must equal chunkSize bytes (or remaining bytes for the last chunk).'),
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

  // ── IMAGE GENERATION ─────────────────────────────────────────────────────────

  server.tool(
    'admin_generate_image',
    'Admin: generate an image with Gemini AI from a text prompt and upload it directly to the media bucket. Returns { id, key, url }. Use admin_delete_media to remove the image if it is rejected during an approval flow.',
    {
      prompt: z.string().describe('Text description of the image to generate'),
      aspectRatio: z.enum(['16:9', '1:1', '4:3']).optional().describe('Desired aspect ratio (default: model decides)'),
    },
    async ({ prompt, aspectRatio }) => {
      try { return ok(await cms.generateImage({ prompt, aspectRatio })); }
      catch (e) { return err(e); }
    },
  );

  server.tool(
    'admin_delete_media',
    'Admin: permanently delete a media record and its file from the storage bucket by media ID. Use this in image approval flows to remove generated images that were not approved, avoiding unused files in the bucket.',
    {
      id: z.number().int().positive().describe('Media record ID (from admin_generate_image or admin_upload_image*)'),
    },
    async ({ id }) => {
      try { return ok(await cms.deleteMedia(id)); }
      catch (e) { return err(e); }
    },
  );

  // ── CATEGORY ADMIN ───────────────────────────────────────────────────────────

  server.tool(
    'admin_create_category',
    'Admin: create a new category. Use a Lucide icon name for the icon field (e.g. "Code", "ChartBar", "Palette", "Shield", "FileText", "Cloud").',
    {
      name: z.string().describe('Display name'),
      slug: z.string().describe('URL slug (lowercase, hyphens)'),
      locale: z.enum(['es', 'pt', 'en']).describe('Language'),
      description: z.string().optional().describe('Short description'),
      icon: z.string().optional().describe('Lucide icon name (e.g. "Code", "ChartBar")'),
    },
    async (args) => {
      try { return ok(await cms.createCategory(args)); }
      catch (e) { return err(e); }
    },
  );

  server.tool(
    'admin_update_category',
    'Admin: update an existing category by numeric ID.',
    {
      id: z.number().int().positive().describe('Category numeric ID'),
      name: z.string().optional(),
      slug: z.string().optional(),
      description: z.string().optional(),
      icon: z.string().optional().describe('Lucide icon name'),
    },
    async ({ id, ...data }) => {
      try { return ok(await cms.updateCategory(id, data)); }
      catch (e) { return err(e); }
    },
  );

  server.tool(
    'admin_delete_category',
    'Admin: permanently delete a category by numeric ID.',
    { id: z.number().int().positive().describe('Category numeric ID') },
    async ({ id }) => {
      try { await cms.deleteCategory(id); return ok({ deleted: true, id }); }
      catch (e) { return err(e); }
    },
  );

  // ── Social Templates Tools ─────────────────────────────────────────────────

  server.tool(
    'admin_list_social_templates',
    'Admin: list social media cover templates. Optionally filter to only active ones.',
    {
      activeOnly: z.boolean().optional().describe('If true, returns only active templates'),
    },
    async ({ activeOnly }) => {
      try { return ok(await cms.listSocialTemplates(activeOnly)); }
      catch (e) { return err(e); }
    },
  );

  server.tool(
    'admin_get_social_template',
    'Admin: get a single social media template by numeric ID.',
    { id: z.number().int().positive().describe('Template numeric ID') },
    async ({ id }) => {
      try { return ok(await cms.getSocialTemplate(id)); }
      catch (e) { return err(e); }
    },
  );

  server.tool(
    'admin_create_social_template',
    'Admin: create a new social media cover template. Platform values: instagram_square, instagram_portrait, instagram_story, facebook, twitter, linkedin, og. The htmlContent and cssContent can use {title}, {hook}, {author}, {category}, {date}, {readingTime}, {tags}, {bgImage}, {excerpt}, {siteName} placeholders.',
    {
      name: z.string().describe('Template name (e.g. "OG Image Default")'),
      platform: z.enum(['instagram_square', 'instagram_portrait', 'instagram_story', 'facebook', 'twitter', 'linkedin', 'og']).describe('Target social platform'),
      htmlContent: z.string().describe('HTML content with optional {placeholder} variables'),
      cssContent: z.string().describe('CSS styles for the template'),
      width: z.number().int().positive().describe('Canvas width in pixels'),
      height: z.number().int().positive().describe('Canvas height in pixels'),
      active: z.boolean().optional().describe('Set to true to activate the template'),
    },
    async (args) => {
      try { return ok(await cms.createSocialTemplate(args)); }
      catch (e) { return err(e); }
    },
  );

  server.tool(
    'admin_update_social_template',
    'Admin: update an existing social media template by ID. Only provided fields are updated.',
    {
      id: z.number().int().positive().describe('Template numeric ID'),
      name: z.string().optional(),
      platform: z.enum(['instagram_square', 'instagram_portrait', 'instagram_story', 'facebook', 'twitter', 'linkedin', 'og']).optional(),
      htmlContent: z.string().optional(),
      cssContent: z.string().optional(),
      width: z.number().int().positive().optional(),
      height: z.number().int().positive().optional(),
      active: z.boolean().optional(),
    },
    async ({ id, ...data }) => {
      try { return ok(await cms.updateSocialTemplate(id, data)); }
      catch (e) { return err(e); }
    },
  );

  server.tool(
    'admin_delete_social_template',
    'Admin: permanently delete a social media template by numeric ID.',
    { id: z.number().int().positive().describe('Template numeric ID') },
    async ({ id }) => {
      try { await cms.deleteSocialTemplate(id); return ok({ deleted: true, id }); }
      catch (e) { return err(e); }
    },
  );

  return server;
}
