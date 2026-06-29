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

  // ── IMAGE GENERATION ─────────────────────────────────────────────────────────

  server.tool(
    'admin_image_generate',
    'Admin: generate an image with Gemini AI from a text prompt and upload it directly to the media bucket. Returns { id, key, url }. Use admin_image_delete to remove the image if it is rejected during an approval flow.',
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
    'admin_image_delete',
    'Admin: permanently delete a media record and its file from the storage bucket by media ID. Use this in image approval flows to remove generated images that were not approved, avoiding unused files in the bucket.',
    {
      id: z.number().int().positive().describe('Media record ID (from admin_image_generate)'),
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

  // ── Cover Templates ─────────────────────────────────────────────────────────

  server.tool(
    'admin_list_templates',
    'Admin: list cover templates. Optionally filter to only active ones.',
    {
      activeOnly: z.boolean().optional().describe('If true, returns only active templates'),
    },
    async ({ activeOnly }) => {
      try { return ok(await cms.listTemplates(activeOnly)); }
      catch (e) { return err(e); }
    },
  );

  server.tool(
    'admin_get_template',
    'Admin: get a single cover template by numeric ID.',
    { id: z.number().int().positive().describe('Template numeric ID') },
    async ({ id }) => {
      try { return ok(await cms.getTemplate(id)); }
      catch (e) { return err(e); }
    },
  );

  server.tool(
    'admin_create_template',
    'Admin: create a new cover template. The htmlContent and cssContent can use {title}, {hook}, {author}, {category}, {date}, {readingTime}, {tags}, {bgImage}, {excerpt}, {siteName} placeholders. IMPORTANT: {title} supports inline markdown — **bold** and *italic* are converted to <strong> and <em> HTML tags. You MUST include CSS rules like ".title strong { color: YOUR_ACCENT_COLOR; }" in cssContent to style bold text, and ".title em { ... }" for italic text. Otherwise bold/italic will have no visible effect.',
    {
      name: z.string().describe('Template name (e.g. "OG Image Default")'),
      htmlContent: z.string().describe('HTML content with optional {placeholder} variables'),
      cssContent: z.string().describe('CSS styles for the template. 🎨 IMPORTANT: add rules like ".title strong { color: ...; }" to style **bold** markdown in titles'),
      width: z.number().int().positive().describe('Canvas width in pixels'),
      height: z.number().int().positive().describe('Canvas height in pixels'),
      active: z.boolean().optional().describe('Set to true to activate the template'),
    },
    async (args) => {
      try { return ok(await cms.createTemplate(args)); }
      catch (e) { return err(e); }
    },
  );

  server.tool(
    'admin_update_template',
    'Admin: update an existing cover template by ID. Only provided fields are updated.',
    {
      id: z.number().int().positive().describe('Template numeric ID'),
      name: z.string().optional(),
      htmlContent: z.string().optional(),
      cssContent: z.string().describe('CSS styles for the template. 🎨 Remember: {title} supports **bold** and *italic* markdown — add CSS rules like ".title strong" to style them'),
      width: z.number().int().positive().optional(),
      height: z.number().int().positive().optional(),
      active: z.boolean().optional(),
    },
    async ({ id, ...data }) => {
      try { return ok(await cms.updateTemplate(id, data)); }
      catch (e) { return err(e); }
    },
  );

  server.tool(
    'admin_delete_template',
    'Admin: permanently delete a cover template by numeric ID.',
    { id: z.number().int().positive().describe('Template numeric ID') },
    async ({ id }) => {
      try { await cms.deleteTemplate(id); return ok({ deleted: true, id }); }
      catch (e) { return err(e); }
    },
  );

  // ── Cover Rendering ──────────────────────────────────────────────────────────

  server.tool(
    'admin_compose_cover',
    'Admin: compose a cover image by merging an article with a template. Renders the template HTML+CSS with article data (title, hook, bgImage, etc.), captures a PNG screenshot via Puppeteer, and uploads it to the media bucket. Returns the public URL.',
    {
      articleId: z.number().int().positive().describe('Article numeric ID'),
      templateId: z.number().int().positive().describe('Cover template numeric ID'),
    },
    async (args) => {
      try { return ok(await cms.composeCover(args.articleId, args.templateId)); }
      catch (e) { return err(e); }
    },
  );

  // ── Analytics ───────────────────────────────────────────────────────────────

  server.tool(
    'admin_analytics_dashboard',
    'Admin: get GA4 dashboard KPIs (active users, page views, sessions, bounce rate, engagement rate). Returns null if GA4 is not configured.',
    {
      start: z.string().optional().describe('Start date (default: 7daysAgo)'),
      end: z.string().optional().describe('End date (default: yesterday)'),
    },
    async (args) => {
      try { return ok(await cms.getAnalyticsDashboard(args.start, args.end)); }
      catch (e) { return err(e); }
    },
  );

  server.tool(
    'admin_analytics_trending',
    'Admin: get top articles by page views from GA4 (last 7 days). Returns empty array if GA4 is not configured.',
    {
      limit: z.number().int().positive().optional().describe('Max results (default: 10)'),
    },
    async ({ limit }) => {
      try { return ok(await cms.getAnalyticsTrending(limit)); }
      catch (e) { return err(e); }
    },
  );

  server.tool(
    'admin_analytics_sources',
    'Admin: get traffic sources breakdown from GA4 (source, medium, sessions, views).',
    {
      start: z.string().optional(),
      end: z.string().optional(),
    },
    async (args) => {
      try { return ok(await cms.getAnalyticsSources(args.start, args.end)); }
      catch (e) { return err(e); }
    },
  );

  server.tool(
    'admin_analytics_audience',
    'Admin: get audience breakdown by device category and country from GA4.',
    {
      start: z.string().optional(),
      end: z.string().optional(),
    },
    async (args) => {
      try { return ok(await cms.getAnalyticsAudience(args.start, args.end)); }
      catch (e) { return err(e); }
    },
  );

  server.tool(
    'admin_analytics_article_stats',
    'Admin: get detailed GA4 stats for a single article (views over time, sources, totals). Provide the article path like "/article/my-article-slug".',
    {
      path: z.string().describe('Article path, e.g. "/article/my-slug"'),
      start: z.string().optional(),
      end: z.string().optional(),
    },
    async (args) => {
      try { return ok(await cms.getArticleAnalytics(args.path, args.start, args.end)); }
      catch (e) { return err(e); }
    },
  );

  // ── SHORT LINKS ─────────────────────────────────────────────────────────────

  server.tool(
    'admin_create_short_link',
    'Admin: create a new short link. Receives a full destination URL and returns a 6-character short code. The short URL will be https://articles.macareno.net/{code}.',
    {
      url: z.string().url().describe('Full destination URL including any UTM parameters, e.g. https://articles.macareno.net/articles/28?utm_source=ig&utm_medium=social'),
    },
    async ({ url }) => {
      try { return ok(await cms.createShortLink(url)); }
      catch (e) { return err(e); }
    },
  );

  return server;
}
