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
    'List published articles. Supports filtering by locale, featured status and full-text search.',
    {
      locale: z.enum(['es', 'pt', 'en']).optional().describe('Language (default: es)'),
      page: z.number().int().positive().optional().describe('Page number (default: 1)'),
      pageSize: z.number().int().positive().max(50).optional().describe('Results per page (default: 9, max: 50)'),
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
    'Get a single published article by slug. Returns full content including markdown body, author and localizations.',
    {
      slug: z.string().describe('Article slug'),
      locale: z.enum(['es', 'pt', 'en']).optional().describe('Language (default: es, falls back to es if not found)'),
    },
    async ({ slug, locale }) => {
      try { return ok(await cms.getArticle(slug, locale)); }
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
      documentId: z.string().optional().describe('Group ID shared across translations'),
      page: z.number().int().positive().optional().describe('Page number (default: 1)'),
      pageSize: z.number().int().positive().max(100).optional().describe('Results per page (max: 100)'),
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
    'Admin: create a new article. To create a translation, pass the documentId of the existing article group. NOTE: Social Posts are now independent entities — use admin_create_social_publication to create social posts instead.',
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
    'Admin: update an existing article by numeric ID. Only provided fields are updated. Fields like title, slug, excerpt, content, hook, tags, publishedAt, bgImageUrl, authorId, genreIds, speciesIds, typeIds — all optional — are patched individually.',
    {
      id: z.number().int().positive().describe('Article numeric ID'),
      title: z.string().optional().describe('New article title'),
      slug: z.string().optional().describe('New URL slug (lowercase, hyphens)'),
      excerpt: z.string().optional().describe('New short summary'),
      content: z.string().optional().describe('Full content in Markdown'),
      hook: z.string().optional().describe('New punchy phrase for the cover image'),
      featured: z.boolean().optional().describe('Toggle featured status'),
      tags: z.array(z.string()).optional().describe('Replaces all tags'),
      publishedAt: z.string().optional().describe('ISO date to set publish date (nullify by omitting)'),
      bgImageUrl: z.string().url().optional().describe('New cover image URL'),
      authorId: z.number().int().optional().describe('New author numeric ID'),
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

  // ── SUBSCRIBERS ──────────────────────────────────────────────────────────────

  server.tool(
    'admin_list_subscribers',
    'Admin: list newsletter subscribers with optional search and pagination.',
    {
      search: z.string().optional().describe('Filter by email'),
      page: z.number().int().positive().optional().describe('Page number (default: 1)'),
      pageSize: z.number().int().positive().max(100).optional().describe('Results per page (max: 100)'),
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
    'admin_get_genre',
    'Admin: get a single genre by numeric ID.',
    { id: z.number().int().positive().describe('Genre numeric ID') },
    async ({ id }) => {
      try { return ok(await cms.getGenre(id)); }
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
    'Admin: update an existing genre by numeric ID. Only provided fields are updated.',
    {
      id: z.number().int().positive().describe('Genre numeric ID'),
      name: z.string().optional().describe('New display name'),
      slug: z.string().optional().describe('New URL slug'),
      icon: z.string().optional().describe('Phosphor icon name'),
      groupId: z.string().optional().describe('Group ID to link translations'),
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
    'admin_get_species',
    'Admin: get a single species by numeric ID.',
    { id: z.number().int().positive().describe('Species numeric ID') },
    async ({ id }) => {
      try { return ok(await cms.getSpecies(id)); }
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
    'Admin: update an existing species by numeric ID. Only provided fields are updated.',
    {
      id: z.number().int().positive().describe('Species numeric ID'),
      name: z.string().optional().describe('New display name'),
      slug: z.string().optional().describe('New URL slug'),
      icon: z.string().optional().describe('Phosphor icon name'),
      groupId: z.string().optional().describe('Group ID to link translations'),
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
    'admin_get_type',
    'Admin: get a single type by numeric ID.',
    { id: z.number().int().positive().describe('Type numeric ID') },
    async ({ id }) => {
      try { return ok(await cms.getType(id)); }
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
    'Admin: update an existing type by numeric ID. Only provided fields are updated.',
    {
      id: z.number().int().positive().describe('Type numeric ID'),
      name: z.string().optional().describe('New display name'),
      slug: z.string().optional().describe('New URL slug'),
      icon: z.string().optional().describe('Phosphor icon name'),
      groupId: z.string().optional().describe('Group ID to link translations'),
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
      name: z.string().optional().describe('New template name'),
      htmlContent: z.string().optional().describe('HTML content with optional {placeholder} variables'),
      cssContent: z.string().describe('CSS styles for the template. 🎨 Remember: {title} supports **bold** and *italic* markdown — add CSS rules like ".title strong" to style them'),
      width: z.number().int().positive().optional().describe('New canvas width in pixels'),
      height: z.number().int().positive().optional().describe('New canvas height in pixels'),
      active: z.boolean().optional().describe('Toggle active status'),
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
    'Admin: compose a cover image from a CoverPayload object and a template. Renders template HTML+CSS with provided data, captures a PNG screenshot via Puppeteer, and uploads to media bucket. Returns the public URL.',
    {
      templateId: z.number().int().positive().describe('Cover template numeric ID'),
      title: z.string().optional().describe('Article title (supports **bold** and *italic* markdown)'),
      excerpt: z.string().optional().describe('Article excerpt/summary'),
      hook: z.string().optional().describe('Short punchy phrase for the cover'),
      author: z.string().optional().describe('Author name'),
      category: z.string().optional().describe('Category name'),
      genres: z.string().optional().describe('Genres (comma-separated)'),
      species: z.string().optional().describe('Species (comma-separated)'),
      types: z.string().optional().describe('Types (comma-separated)'),
      date: z.string().optional().describe('Publication date'),
      readingTime: z.string().optional().describe('Reading time (e.g. "5 min de lectura")'),
      tags: z.string().optional().describe('Tags (comma-separated)'),
      bgImage: z.string().optional().describe('Background image URL'),
      siteName: z.string().optional().describe('Site name (default: MacarenoNet)'),
    },
    async (args) => {
      try {
        const { templateId, ...payload } = args;
        return ok(await cms.composeCover(payload, templateId));
      }
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
      start: z.string().optional().describe('Start date (default: 7daysAgo)'),
      end: z.string().optional().describe('End date (default: yesterday)'),
    },
    async (args) => {
      try { return ok(await cms.getAnalyticsSources(args.start, args.end)); }
      catch (e) { return err(e); }
    },
  );

  // ── Social Publications ────────────────────────────────────────────────────

  server.tool(
    'admin_list_social_publications',
    'Admin: list all social publications with optional filters (platform, status, locale, articleId).',
    {
      platform: z.string().optional().describe('Filter by platform (LINKEDIN, TWITTER, INSTAGRAM_SQUARE, etc.)'),
      status: z.string().optional().describe('Filter by status (PENDING, PUBLISHED, FAILED)'),
      locale: z.string().optional().describe('Filter by locale'),
      articleId: z.number().int().optional().describe('Filter by article ID'),
      page: z.number().int().positive().optional().describe('Page number (default: 1)'),
      pageSize: z.number().int().positive().max(100).optional().describe('Results per page (max: 100)'),
    },
    async (args) => {
      try { return ok(await cms.listSocialPublications(args)); }
      catch (e) { return err(e); }
    },
  );

  server.tool(
    'admin_get_social_publication',
    'Admin: get a single social publication by ID. Returns full details including platform, status, copy, imageUrl, publishedAt, locale, and linked article info.',
    { id: z.number().int().positive().describe('Social publication numeric ID') },
    async ({ id }) => {
      try { return ok(await cms.getSocialPublication(id)); }
      catch (e) { return err(e); }
    },
  );

  server.tool(
    'admin_create_social_publication',
    'Admin: create a new social publication. ArticleId is optional — standalone posts (marketing, ads) are supported. After creation, use admin_update_social_publication to set copy, status, date and image.',
    {
      platform: z.string().describe('Platform (LINKEDIN, TWITTER, INSTAGRAM_SQUARE, INSTAGRAM_PORTRAIT, INSTAGRAM_STORY, FACEBOOK, OG_IMAGE)'),
      locale: z.string().describe('Language (es, pt, en)'),
      articleId: z.number().int().optional().describe('Optional article ID to link this post to'),
      templateId: z.number().int().optional().describe('Optional cover template ID'),
    },
    async (args) => {
      try { return ok(await cms.createSocialPublication(args.platform, args.locale, args.articleId, args.templateId)); }
      catch (e) { return err(e); }
    },
  );

  server.tool(
    'admin_update_social_publication',
    'Admin: update an existing social publication by ID. Only provided fields are updated. Supports copy, status, publishedAt, imageUrl/imageKey, templateId, and shortLinkId.',
    {
      id: z.number().int().positive().describe('Publication ID'),
      copy: z.string().optional().describe('Post text content'),
      status: z.string().optional().describe('Status (PENDING, PUBLISHED, FAILED)'),
      publishedAt: z.string().optional().describe('ISO date string for scheduling/publishing'),
      imageUrl: z.string().optional().describe('Cover image URL from compose_cover'),
      imageKey: z.string().optional().describe('Cover image storage key'),
      templateId: z.number().int().optional().describe('Cover template ID to assign'),
      shortLinkId: z.number().int().optional().describe('Short link ID to associate'),
    },
    async ({ id, ...data }) => {
      try { return ok(await cms.updateSocialPublication(id, data)); }
      catch (e) { return err(e); }
    },
  );

  server.tool(
    'admin_generate_social_image',
    'Admin: generate a cover image for a social publication. If the post has an articleId, it resolves article data automatically. For standalone posts, pass a CoverPayload (title, excerpt, hook, etc.) to generate the image from scratch without an article.',
    {
      id: z.number().int().positive().describe('Publication ID'),
      title: z.string().optional().describe('Title text (supports **bold** markdown)'),
      excerpt: z.string().optional().describe('Excerpt/summary text'),
      hook: z.string().optional().describe('Hook/punchy phrase'),
      author: z.string().optional().describe('Author name'),
      category: z.string().optional().describe('Category name'),
      genres: z.string().optional().describe('Genres, comma-separated'),
      species: z.string().optional().describe('Species, comma-separated'),
      types: z.string().optional().describe('Types, comma-separated'),
      date: z.string().optional().describe('Publication date string'),
      readingTime: z.string().optional().describe('Reading time (e.g. "5 min de lectura")'),
      tags: z.string().optional().describe('Tags, comma-separated'),
      bgImage: z.string().optional().describe('Background image URL'),
      siteName: z.string().optional().describe('Site name (default: MacarenoNet)'),
    },
    async (args) => {
      try {
        const { id, ...payload } = args;
        const hasPayload = Object.values(payload).some(v => v !== undefined);
        return ok(await cms.generateSocialImage(id, hasPayload ? payload : undefined));
      }
      catch (e) { return err(e); }
    },
  );

  server.tool(
    'admin_generate_social_copy',
    'Admin: generate AI copy text for a social publication using the linked article data and platform prompt template.',
    { id: z.number().int().positive().describe('Publication ID') },
    async ({ id }) => {
      try { return ok(await cms.generateSocialCopy(id)); }
      catch (e) { return err(e); }
    },
  );

  server.tool(
    'admin_generate_copy_from_prompt',
    'Admin: generate copy text from a custom prompt template using Gemini AI. Replaces {title}, {excerpt}, {hook}, {locale} placeholders in the prompt. Does NOT require an existing social publication — use this for standalone/adhoc copy generation.',
    {
      promptTemplate: z.string().describe('Prompt template with optional {title}, {excerpt}, {hook}, {locale} placeholders'),
      title: z.string().optional().describe('Article title to inject into the prompt'),
      excerpt: z.string().optional().describe('Article excerpt to inject'),
      hook: z.string().optional().describe('Article hook to inject'),
      locale: z.string().optional().describe('Locale (es/pt/en) to inject'),
    },
    async (args) => {
      try {
        const { promptTemplate, ...vars } = args;
        return ok(await cms.generateCopyFromPrompt(promptTemplate, vars));
      }
      catch (e) { return err(e); }
    },
  );

  server.tool(
    'admin_publish_social_publication',
    'Admin: publish a social publication immediately or schedule it.',
    {
      id: z.number().int().positive().describe('Publication ID'),
      publishedAt: z.string().optional().describe('Optional ISO date for scheduled publishing'),
    },
    async ({ id, publishedAt }) => {
      try { return ok(await cms.publishSocialPublication(id, publishedAt)); }
      catch (e) { return err(e); }
    },
  );

  server.tool(
    'admin_unpublish_social_publication',
    'Admin: revert a published social publication back to PENDING draft.',
    { id: z.number().int().positive().describe('Publication ID') },
    async ({ id }) => {
      try { return ok(await cms.unpublishSocialPublication(id)); }
      catch (e) { return err(e); }
    },
  );

  server.tool(
    'admin_delete_social_publication',
    'Admin: permanently delete a social publication by ID.',
    { id: z.number().int().positive().describe('Publication ID') },
    async ({ id }) => {
      try { await cms.deleteSocialPublication(id); return ok({ deleted: true, id }); }
      catch (e) { return err(e); }
    },
  );

  // ── Social Prompts ─────────────────────────────────────────────────────────

  server.tool(
    'admin_list_social_prompts',
    'Admin: list AI copy generation prompts. Each prompt is a template for a specific social platform (LinkedIn, Twitter, etc.). Optionally filter to only active prompts.',
    {
      activeOnly: z.boolean().optional().describe('If true, returns only active prompts'),
    },
    async ({ activeOnly }) => {
      try { return ok(await cms.listSocialPrompts(activeOnly)); }
      catch (e) { return err(e); }
    },
  );

  server.tool(
    'admin_get_social_prompt',
    'Admin: get a single social prompt by ID.',
    { id: z.number().int().positive().describe('Social prompt numeric ID') },
    async ({ id }) => {
      try { return ok(await cms.getSocialPrompt(id)); }
      catch (e) { return err(e); }
    },
  );

  server.tool(
    'admin_create_social_prompt',
    'Admin: create a new AI copy generation prompt for a platform. The prompt can use placeholders {title}, {excerpt}, {hook}, {locale} that get replaced dynamically when generating copy.',
    {
      platform: z.string().describe('Platform name (LINKEDIN, TWITTER, INSTAGRAM_SQUARE, INSTAGRAM_PORTRAIT, INSTAGRAM_STORY, FACEBOOK, OG_IMAGE)'),
      prompt: z.string().describe('Prompt template with optional {title}, {excerpt}, {hook}, {locale} placeholders'),
      active: z.boolean().optional().describe('Set to true to activate this prompt'),
    },
    async (args) => {
      try { return ok(await cms.createSocialPrompt(args)); }
      catch (e) { return err(e); }
    },
  );

  server.tool(
    'admin_update_social_prompt',
    'Admin: update an existing social prompt by ID. Only provided fields are updated.',
    {
      id: z.number().int().positive().describe('Social prompt numeric ID'),
      platform: z.string().optional().describe('Platform name (LINKEDIN, TWITTER, etc.)'),
      prompt: z.string().optional().describe('Prompt template text'),
      active: z.boolean().optional().describe('Toggle active status'),
    },
    async ({ id, ...data }) => {
      try { return ok(await cms.updateSocialPrompt(id, data)); }
      catch (e) { return err(e); }
    },
  );

  server.tool(
    'admin_delete_social_prompt',
    'Admin: permanently delete a social prompt by ID.',
    { id: z.number().int().positive().describe('Social prompt numeric ID') },
    async ({ id }) => {
      try { await cms.deleteSocialPrompt(id); return ok({ deleted: true, id }); }
      catch (e) { return err(e); }
    },
  );

  server.tool(
    'admin_analytics_audience',
    'Admin: get audience breakdown by device category and country from GA4.',
    {
      start: z.string().optional().describe('Start date (default: 7daysAgo)'),
      end: z.string().optional().describe('End date (default: yesterday)'),
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
      start: z.string().optional().describe('Start date (default: 7daysAgo)'),
      end: z.string().optional().describe('End date (default: yesterday)'),
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

  // ── SOCIAL PUBLICATIONS (new tools defined above after compose_cover) ──────
  // New tools: admin_list_social_publications, admin_get_social_publication,
  // admin_create_social_publication, admin_update_social_publication,
  // admin_generate_social_image, admin_generate_social_copy,
  // admin_generate_copy_from_prompt, admin_publish_social_publication,
  // admin_unpublish_social_publication, admin_delete_social_publication

  return server;
}
