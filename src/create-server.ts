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
      publishedAt: z.string().optional().describe('ISO date for publish date'),
      bgImageUrl: z.string().url().optional().describe('Cover image URL'),
      authorId: z.number().int().optional().describe('Author numeric ID'),
      categoryIds: z.array(z.number().int()).optional().describe('Category numeric IDs'),
      genreIds: z.array(z.number().int()).optional().describe('Genre numeric IDs'),
      speciesIds: z.array(z.number().int()).optional().describe('Species numeric IDs'),
      typeIds: z.array(z.number().int()).optional().describe('Type numeric IDs'),
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
      publishedAt: z.string().optional(),
      bgImageUrl: z.string().url().optional(),
      authorId: z.number().int().optional(),
      categoryIds: z.array(z.number().int()).optional().describe('Replaces all categories'),
      genreIds: z.array(z.number().int()).optional().describe('Replaces all genres'),
      speciesIds: z.array(z.number().int()).optional().describe('Replaces all species'),
      typeIds: z.array(z.number().int()).optional().describe('Replaces all types'),
    },
    async ({ id, ...data }) => {
      try { return ok(await cms.updateArticle(id, data)); }
      catch (e) { return err(e); }
    },
  );

  server.tool(
    'admin_publish_article',
    'Admin: publish or unpublish an article by numeric ID. Can also be used to publish a SCHEDULED article immediately.',
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
    'admin_schedule_article',
    'Admin: schedule an article for future publication. The article will be automatically published at the specified date/time.',
    {
      id: z.number().int().positive().describe('Article numeric ID'),
      publishedAt: z.string().describe('ISO 8601 datetime (e.g. "2026-07-15T10:00:00Z")'),
    },
    async ({ id, publishedAt }) => {
      try { return ok(await cms.scheduleArticle(id, publishedAt)); }
      catch (e) { return err(e); }
    },
  );

  server.tool(
    'admin_unschedule_article',
    'Admin: cancel a scheduled publication and revert the article to DRAFT. The article will NOT be published automatically.',
    { id: z.number().int().positive().describe('Article numeric ID') },
    async ({ id }) => {
      try { return ok(await cms.unscheduleArticle(id)); }
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
    'Admin: create a new category. Use a Phosphor icon name for the icon field (e.g. "Code", "ChartBar", "Palette", "BookOpen", "Megaphone", "Star"). The full list of valid icon names: Article, BookOpen, Briefcase, ChartBar, ChartLine, Cloud, Code, Cpu, Cube, Desktop, DeviceMobile, Diamond, Gear, GearSix, Globe, GridFour, Heart, Lightbulb, Lightning, LockKey, MapPin, Megaphone, MonitorPlay, PaintBrush, Palette, PuzzlePiece, Rocket, ShieldCheck, Star, Storefront, Tag, TreeStructure, Users, Wrench.',
    {
      name: z.string().describe('Display name'),
      slug: z.string().describe('URL slug (lowercase, hyphens)'),
      locale: z.enum(['es', 'pt', 'en']).describe('Language'),
      description: z.string().optional().describe('Short description'),
      icon: z.string().optional().describe('Phosphor icon name (e.g. "Code", "ChartBar", "BookOpen")'),
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
      icon: z.string().optional().describe('Phosphor icon name'),
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

  // ── TAXONOMY: GENRES ─────────────────────────────────────────────────────────

  server.tool(
    'list_genres',
    'List genres. If no locale provided, returns all locales.',
    {
      locale: z.enum(['es', 'pt', 'en', 'all']).optional().describe('Language or "all" (default: all)'),
    },
    async ({ locale }) => {
      try { return ok(await cms.listGenres(locale)); }
      catch (e) { return err(e); }
    },
  );

  server.tool(
    'admin_create_genre',
    'Admin: create a new genre. Pass groupId to group translations together (same groupId across es/pt/en = same concept).',
    {
      name: z.string().describe('Display name'),
      slug: z.string().describe('URL slug (lowercase, hyphens)'),
      locale: z.enum(['es', 'pt', 'en']).describe('Language'),
      icon: z.string().optional().describe('Phosphor icon name (e.g. "TreeStructure", "Tag", "Star"). Valid names: Article, BookOpen, Briefcase, ChartBar, ChartLine, Cloud, Code, Cpu, Cube, Desktop, DeviceMobile, Diamond, Gear, GearSix, Globe, GridFour, Heart, Lightbulb, Lightning, LockKey, MapPin, Megaphone, MonitorPlay, PaintBrush, Palette, PuzzlePiece, Rocket, ShieldCheck, Star, Storefront, Tag, TreeStructure, Users, Wrench.'),
      groupId: z.string().optional().describe('Group ID to link translations'),
    },
    async (args) => {
      try { return ok(await cms.createGenre(args)); }
      catch (e) { return err(e); }
    },
  );

  server.tool(
    'admin_update_genre',
    'Admin: update an existing genre by numeric ID.',
    {
      id: z.number().int().positive().describe('Genre numeric ID'),
      name: z.string().optional(),
      slug: z.string().optional(),
      icon: z.string().optional().describe('Phosphor icon name'),
      groupId: z.string().optional(),
    },
    async ({ id, ...data }) => {
      try { return ok(await cms.updateGenre(id, data)); }
      catch (e) { return err(e); }
    },
  );

  server.tool(
    'admin_delete_genre',
    'Admin: permanently delete a genre by numeric ID.',
    { id: z.number().int().positive().describe('Genre numeric ID') },
    async ({ id }) => {
      try { await cms.deleteGenre(id); return ok({ deleted: true, id }); }
      catch (e) { return err(e); }
    },
  );

  // ── TAXONOMY: SPECIES ────────────────────────────────────────────────────────

  server.tool(
    'list_species',
    'List species. If no locale provided, returns all locales.',
    {
      locale: z.enum(['es', 'pt', 'en', 'all']).optional().describe('Language or "all" (default: all)'),
    },
    async ({ locale }) => {
      try { return ok(await cms.listSpecies(locale)); }
      catch (e) { return err(e); }
    },
  );

  server.tool(
    'admin_create_species',
    'Admin: create a new species. Pass groupId to group translations together.',
    {
      name: z.string().describe('Display name'),
      slug: z.string().describe('URL slug (lowercase, hyphens)'),
      locale: z.enum(['es', 'pt', 'en']).describe('Language'),
      icon: z.string().optional().describe('Phosphor icon name (e.g. "GridFour", "Cube", "Diamond"). Valid names: Article, BookOpen, Briefcase, ChartBar, ChartLine, Cloud, Code, Cpu, Cube, Desktop, DeviceMobile, Diamond, Gear, GearSix, Globe, GridFour, Heart, Lightbulb, Lightning, LockKey, MapPin, Megaphone, MonitorPlay, PaintBrush, Palette, PuzzlePiece, Rocket, ShieldCheck, Star, Storefront, Tag, TreeStructure, Users, Wrench.'),
      groupId: z.string().optional().describe('Group ID to link translations'),
    },
    async (args) => {
      try { return ok(await cms.createSpecies(args)); }
      catch (e) { return err(e); }
    },
  );

  server.tool(
    'admin_update_species',
    'Admin: update an existing species by numeric ID.',
    {
      id: z.number().int().positive().describe('Species numeric ID'),
      name: z.string().optional(),
      slug: z.string().optional(),
      icon: z.string().optional().describe('Phosphor icon name'),
      groupId: z.string().optional(),
    },
    async ({ id, ...data }) => {
      try { return ok(await cms.updateSpecies(id, data)); }
      catch (e) { return err(e); }
    },
  );

  server.tool(
    'admin_delete_species',
    'Admin: permanently delete a species by numeric ID.',
    { id: z.number().int().positive().describe('Species numeric ID') },
    async ({ id }) => {
      try { await cms.deleteSpecies(id); return ok({ deleted: true, id }); }
      catch (e) { return err(e); }
    },
  );

  // ── TAXONOMY: TYPES ──────────────────────────────────────────────────────────

  server.tool(
    'list_types',
    'List types. If no locale provided, returns all locales.',
    {
      locale: z.enum(['es', 'pt', 'en', 'all']).optional().describe('Language or "all" (default: all)'),
    },
    async ({ locale }) => {
      try { return ok(await cms.listTypes(locale)); }
      catch (e) { return err(e); }
    },
  );

  server.tool(
    'admin_create_type',
    'Admin: create a new type. Pass groupId to group translations together.',
    {
      name: z.string().describe('Display name'),
      slug: z.string().describe('URL slug (lowercase, hyphens)'),
      locale: z.enum(['es', 'pt', 'en']).describe('Language'),
      icon: z.string().optional().describe('Phosphor icon name (e.g. "Tag", "Code", "Gear"). Valid names: Article, BookOpen, Briefcase, ChartBar, ChartLine, Cloud, Code, Cpu, Cube, Desktop, DeviceMobile, Diamond, Gear, GearSix, Globe, GridFour, Heart, Lightbulb, Lightning, LockKey, MapPin, Megaphone, MonitorPlay, PaintBrush, Palette, PuzzlePiece, Rocket, ShieldCheck, Star, Storefront, Tag, TreeStructure, Users, Wrench.'),
      groupId: z.string().optional().describe('Group ID to link translations'),
    },
    async (args) => {
      try { return ok(await cms.createType(args)); }
      catch (e) { return err(e); }
    },
  );

  server.tool(
    'admin_update_type',
    'Admin: update an existing type by numeric ID.',
    {
      id: z.number().int().positive().describe('Type numeric ID'),
      name: z.string().optional(),
      slug: z.string().optional(),
      icon: z.string().optional().describe('Phosphor icon name'),
      groupId: z.string().optional(),
    },
    async ({ id, ...data }) => {
      try { return ok(await cms.updateType(id, data)); }
      catch (e) { return err(e); }
    },
  );

  server.tool(
    'admin_delete_type',
    'Admin: permanently delete a type by numeric ID.',
    { id: z.number().int().positive().describe('Type numeric ID') },
    async ({ id }) => {
      try { await cms.deleteType(id); return ok({ deleted: true, id }); }
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
    'Admin: create a new cover template. The htmlContent and cssContent can use {title}, {hook}, {author}, {category}, {genres}, {species}, {types}, {date}, {readingTime}, {tags}, {bgImage}, {excerpt}, {siteName} placeholders. IMPORTANT: {title} supports inline markdown — **bold** and *italic* are converted to <strong> and <em> HTML tags. You MUST include CSS rules like ".title strong { color: YOUR_ACCENT_COLOR; }" in cssContent to style bold text, and ".title em { ... }" for italic text. Otherwise bold/italic will have no visible effect.',
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
    'Admin: update an existing cover template by ID. Only provided fields are updated. Available placeholders for htmlContent/cssContent: {title}, {hook}, {author}, {category}, {genres}, {species}, {types}, {date}, {readingTime}, {tags}, {bgImage}, {excerpt}, {siteName}.',
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

  server.tool(
    'admin_update_short_link',
    'Admin: update a short link\'s destination URL or active status. The short code is preserved.',
    {
      id: z.number().int().positive().describe('Short link numeric ID'),
      url: z.string().url().optional().describe('New destination URL'),
      active: z.boolean().optional().describe('Set to false to deactivate, true to activate'),
    },
    async (args) => {
      try { return ok(await cms.updateShortLink(args.id, { url: args.url, active: args.active })); }
      catch (e) { return err(e); }
    },
  );

  server.tool(
    'admin_delete_short_link',
    'Admin: permanently delete a short link by its numeric ID.',
    { id: z.number().int().positive().describe('Short link numeric ID') },
    async ({ id }) => {
      try { await cms.deleteShortLink(id); return ok({ deleted: true, id }); }
      catch (e) { return err(e); }
    },
  );

  // ── SOCIAL PUBLICATIONS ──────────────────────────────────────────────────────

  server.tool(
    'admin_list_social_publications',
    'Admin: list social media publications with optional filters. A social publication is a planned post for LinkedIn, Twitter/X, Instagram, or Facebook. Each publication has its own copy (text), image, publishing schedule, and status (PENDING, PUBLISHED, FAILED). When a publication is published (manually or via scheduler), LinkedIn posts go live on the actual platform via API.',
    {
      platform: z.enum(['LINKEDIN', 'TWITTER', 'INSTAGRAM_SQUARE', 'INSTAGRAM_PORTRAIT', 'INSTAGRAM_STORY', 'FACEBOOK', 'OG_IMAGE']).optional().describe('Filter by social platform'),
      status: z.enum(['PENDING', 'PUBLISHED', 'FAILED']).optional().describe('Filter by publication status'),
      locale: z.enum(['es', 'pt', 'en']).optional().describe('Filter by language'),
      articleId: z.number().int().positive().optional().describe('Filter by article ID'),
      page: z.number().int().positive().optional().describe('Page number'),
      pageSize: z.number().int().positive().max(100).optional().describe('Results per page'),
    },
    async (args) => {
      try { return ok(await cms.listSocialPublications(args)); }
      catch (e) { return err(e); }
    },
  );

  server.tool(
    'admin_get_social_publication',
    'Admin: get a single social publication by ID with full details including template, short link, and article info.',
    { id: z.number().int().positive().describe('Social publication numeric ID') },
    async ({ id }) => {
      try { return ok(await cms.getSocialPublication(id)); }
      catch (e) { return err(e); }
    },
  );

  server.tool(
    'admin_create_social_publication',
    'Admin: create a new social media publication for an article. This creates a PENDING publication with a default schedule (tomorrow at 9 AM). You can then generate an image and copy for it, and publish it manually or let the scheduler publish it automatically.',
    {
      articleId: z.number().int().positive().describe('Article numeric ID'),
      platform: z.enum(['LINKEDIN', 'TWITTER', 'INSTAGRAM_SQUARE', 'INSTAGRAM_PORTRAIT', 'INSTAGRAM_STORY', 'FACEBOOK', 'OG_IMAGE']).describe('Target social platform'),
      locale: z.enum(['es', 'pt', 'en']).describe('Language for the post'),
      templateId: z.number().int().positive().optional().describe('Cover template ID for image generation'),
    },
    async ({ articleId, platform, locale, templateId }) => {
      try { return ok(await cms.createSocialPublication(articleId, platform, locale, templateId)); }
      catch (e) { return err(e); }
    },
  );

  server.tool(
    'admin_update_social_publication',
    'Admin: update a social publication. Can set copy (post text), schedule (publishedAt), template, or short link.',
    {
      id: z.number().int().positive().describe('Social publication numeric ID'),
      copy: z.string().optional().describe('Post text / copy'),
      templateId: z.number().int().positive().nullable().optional().describe('Cover template ID (null to clear)'),
      publishedAt: z.string().nullable().optional().describe('ISO datetime for scheduled publishing (null to clear schedule)'),
      shortLinkId: z.number().int().positive().nullable().optional().describe('Short link ID (null to clear)'),
    },
    async ({ id, ...data }) => {
      try { return ok(await cms.updateSocialPublication(id, data)); }
      catch (e) { return err(e); }
    },
  );

  server.tool(
    'admin_social_generate_image',
    'Admin: generate a cover image for a social publication by composing the article data with the assigned template. Renders HTML+CSS via Puppeteer and uploads the PNG to the media bucket. The publication gets its imageKey and imageUrl set.',
    { id: z.number().int().positive().describe('Social publication numeric ID') },
    async ({ id }) => {
      try { return ok(await cms.generateSocialImage(id)); }
      catch (e) { return err(e); }
    },
  );

  server.tool(
    'admin_social_generate_copy',
    'Admin: generate post copy (text) for a social publication using Gemini AI. The prompt is adapted per platform and locale. The generated text is stored in the publication\'s copy field.',
    { id: z.number().int().positive().describe('Social publication numeric ID') },
    async ({ id }) => {
      try { return ok(await cms.generateSocialCopy(id)); }
      catch (e) { return err(e); }
    },
  );

  server.tool(
    'admin_social_publish',
    'Admin: publish a social publication. For LINKEDIN: posts the image and text to the actual LinkedIn feed via the LinkedIn REST API. The post URN is saved as platformPostId. If the API call fails, status is set to FAILED with errorLog. Other platforms are marked PUBLISHED locally. Can optionally schedule for a future date.',
    {
      id: z.number().int().positive().describe('Social publication numeric ID'),
      publishedAt: z.string().optional().describe('Optional ISO datetime for scheduled publishing'),
    },
    async ({ id, publishedAt }) => {
      try { return ok(await cms.publishSocialPublication(id, publishedAt)); }
      catch (e) { return err(e); }
    },
  );

  server.tool(
    'admin_social_unpublish',
    'Admin: revert a published social publication back to PENDING status.',
    { id: z.number().int().positive().describe('Social publication numeric ID') },
    async ({ id }) => {
      try { return ok(await cms.unpublishSocialPublication(id)); }
      catch (e) { return err(e); }
    },
  );

  server.tool(
    'admin_delete_social_publication',
    'Admin: permanently delete a social publication by numeric ID.',
    { id: z.number().int().positive().describe('Social publication numeric ID') },
    async ({ id }) => {
      try { await cms.deleteSocialPublication(id); return ok({ deleted: true, id }); }
      catch (e) { return err(e); }
    },
  );

  return server;
}
