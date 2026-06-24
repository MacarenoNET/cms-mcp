// cms-client.ts — HTTP client for cms-api (public + admin)

import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import * as uploadSession from './upload-session.js';

const BASE = (process.env.CMS_API_URL ?? '').replace(/\/$/, '');
if (!BASE) throw new Error('Missing env: CMS_API_URL');

// ── JWT session (in-memory, per process) ──────────────────────────────────────

let _token: string | null = null;
let _loginPromise: Promise<string> | null = null;

async function ensureToken(): Promise<string> {
  if (_token) return _token;
  if (_loginPromise) return _loginPromise;

  _loginPromise = (async () => {
    try {
      const email = process.env.CMS_ADMIN_EMAIL;
      const password = process.env.CMS_ADMIN_PASSWORD;
      if (!email || !password) throw new Error('Missing env: CMS_ADMIN_EMAIL / CMS_ADMIN_PASSWORD');

      for (let attempt = 0; attempt < 5; attempt++) {
        const res = await fetch(`${BASE}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });
        if (res.status === 429) {
          await new Promise(r => setTimeout(r, Math.min(2000 * 2 ** attempt, 20000)));
          continue;
        }
        if (!res.ok) throw new Error(`cms-api login failed: ${res.status}`);
        const data = await res.json() as { token: string };
        _token = data.token;
        return _token;
      }
      throw new Error('cms-api login rate-limited');
    } finally {
      _loginPromise = null;
    }
  })();

  return _loginPromise;
}

// ── Generic helpers ───────────────────────────────────────────────────────────

async function publicGet<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${BASE}/api${path}`);
  if (params) for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`cms-api ${res.status}: ${res.statusText}`);
  return res.json() as Promise<T>;
}

async function adminFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const doFetch = async (token: string) =>
    fetch(`${BASE}/api${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(init.headers as Record<string, string> ?? {}),
      },
    });

  let token = await ensureToken();
  let res = await doFetch(token);

  if (res.status === 401) {
    _token = null;
    token = await ensureToken();
    res = await doFetch(token);
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { message?: string };
    throw new Error(err.message ?? `cms-api ${res.status}: ${res.statusText}`);
  }
  // Handle empty responses (204, 304, etc.)
  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

async function adminGet<T>(path: string, params?: Record<string, string>): Promise<T> {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  return adminFetch<T>(`${path}${qs}`);
}

async function adminPost<T>(path: string, body: unknown): Promise<T> {
  return adminFetch<T>(path, { method: 'POST', body: JSON.stringify(body) });
}

async function adminPut<T>(path: string, body: unknown): Promise<T> {
  return adminFetch<T>(path, { method: 'PUT', body: JSON.stringify(body) });
}

async function adminDelete(path: string): Promise<void> {
  await adminFetch(path, { method: 'DELETE' });
}

// ── Multipart upload (manual boundary — Node 22 fetch + FormData is buggy) ──

async function adminUploadMultipart(
  path: string,
  fieldName: string,
  fileBuffer: Buffer,
  filename: string,
  mimeType: string,
): Promise<Response> {
  const boundary = `----CmsMcp${Date.now()}`;
  const header = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="${fieldName}"; filename="${filename}"\r\nContent-Type: ${mimeType}\r\n\r\n`,
  );
  const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
  const body = Buffer.concat([header, fileBuffer, footer]);

  const doFetch = async (token: string) =>
    fetch(`${BASE}/api${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body,
    });

  let token = await ensureToken();
  let res = await doFetch(token);

  if (res.status === 401) {
    _token = null;
    token = await ensureToken();
    res = await doFetch(token);
  }

  return res;
}

// ── Public API ────────────────────────────────────────────────────────────────

export function listArticles(params: {
  locale?: string;
  page?: number;
  pageSize?: number;
  category?: string;
  featured?: boolean;
  q?: string;
}) {
  const p: Record<string, string> = {};
  if (params.locale) p.locale = params.locale;
  if (params.page) p.page = String(params.page);
  if (params.pageSize) p.pageSize = String(params.pageSize);
  if (params.category) p.category = params.category;
  if (params.featured !== undefined) p.featured = String(params.featured);
  if (params.q) p.q = params.q;
  return publicGet<{ articles: unknown[]; total: number; pageCount: number }>('/articles', p);
}

export function getArticle(slug: string, locale = 'es') {
  return publicGet<unknown>(`/articles/${slug}`, { locale });
}

export function listCategories(locale = 'es') {
  return publicGet<unknown[]>('/categories', { locale });
}

// ── Admin API ─────────────────────────────────────────────────────────────────

export function listAllArticles(params: {
  locale?: string;
  status?: 'all' | 'published' | 'draft';
  search?: string;
  category?: string;
  documentId?: string;
  page?: number;
  pageSize?: number;
}) {
  const p: Record<string, string> = {};
  if (params.locale) p.locale = params.locale;
  if (params.status) p.status = params.status;
  if (params.search) p.search = params.search;
  if (params.category) p.category = params.category;
  if (params.documentId) p.documentId = params.documentId;
  if (params.page) p.page = String(params.page);
  if (params.pageSize) p.pageSize = String(params.pageSize);
  return adminGet<{ articles: unknown[]; total: number; pageCount: number }>('/admin/articles', p);
}

export function getArticleById(id: number) {
  return adminGet<unknown>(`/admin/articles/${id}`);
}

export function createArticle(data: {
  title: string;
  slug: string;
  locale: string;
  excerpt: string;
  hook?: string;
  content: string;
  featured?: boolean;
  tags?: string[];
  publishDate?: string;
  bgImageUrl?: string;
  authorId?: number;
  categoryIds?: number[];
  documentId?: string;
}) {
  return adminPost<unknown>('/admin/articles', data);
}

export function updateArticle(id: number, data: {
  title?: string;
  slug?: string;
  excerpt?: string;
  hook?: string;
  content?: string;
  featured?: boolean;
  tags?: string[];
  publishDate?: string;
  bgImageUrl?: string;
  authorId?: number;
  categoryIds?: number[];
}) {
  return adminPut<unknown>(`/admin/articles/${id}`, data);
}

export function publishArticle(id: number, publish: boolean) {
  return adminPost<unknown>(`/admin/articles/${id}/publish`, { publish });
}

export function deleteArticle(id: number) {
  return adminDelete(`/admin/articles/${id}`);
}

export function listAuthors() {
  return adminGet<unknown[]>('/admin/authors');
}

export function listSubscribers(params: { search?: string; page?: number; pageSize?: number }) {
  const p: Record<string, string> = {};
  if (params.search) p.search = params.search;
  if (params.page) p.page = String(params.page);
  if (params.pageSize) p.pageSize = String(params.pageSize);
  return adminGet<{ subscribers: unknown[]; total: number; pageCount: number }>('/admin/subscribers', p);
}

export function getLikesStats() {
  return adminGet<{ totalLikes: number; topArticles: unknown[] }>('/admin/likes');
}

export function listAllCategories(locale?: string) {
  const p: Record<string, string> = {};
  if (locale) p.locale = locale;
  return adminGet<unknown[]>('/admin/categories', p);
}

// ── Upload — Chunked session (Phase 1: universal, works with any AI client) ───

export function adminCreateUpload(params: {
  filename: string;
  contentType: string;
  totalBytes: number;
  sha256?: string;
}) {
  const err = uploadSession.validateCreateUpload(params.filename, params.contentType, params.totalBytes);
  if (err) throw new Error(err);

  const session = uploadSession.createUploadSession(
    params.filename,
    params.contentType,
    params.totalBytes,
    params.sha256,
  );

  return {
    uploadId: session.uploadId,
    chunkSize: session.chunkSize,
    expiresAt: session.expiresAt.toISOString(),
  };
}

export async function adminUploadChunk(params: {
  uploadId: string;
  index: number;
  base64Chunk: string;
}) {
  return uploadSession.writeChunk(params.uploadId, params.index, params.base64Chunk);
}

export async function adminCompleteUpload(params: {
  uploadId: string;
}): Promise<{ url: string; key: string; filename: string; contentType: string; size: number }> {
  const session = uploadSession.getSession(params.uploadId);
  if (!session) throw new Error(`Upload session ${params.uploadId} not found or expired`);
  if (session.status === 'completed' && session.finalUrl && session.finalKey) {
    // Idempotent: already completed
    return { url: session.finalUrl, key: session.finalKey, filename: session.sanitizedFilename, contentType: session.contentType, size: session.totalBytes };
  }

  session.status = 'completing';

  // Assemble all chunks
  const buffer = await uploadSession.assembleFile(params.uploadId);

  // Validate size
  if (buffer.length !== session.totalBytes) {
    await uploadSession.abortUpload(params.uploadId);
    throw new Error(`Size mismatch: expected ${session.totalBytes}, got ${buffer.length}`);
  }

  // Validate real MIME
  const realMime = uploadSession.detectMimeType(buffer);
  if (!realMime || realMime !== session.contentType) {
    await uploadSession.abortUpload(params.uploadId);
    throw new Error(`MIME mismatch: declared ${session.contentType}, detected ${realMime ?? 'unknown'}`);
  }

  // Upload to CMS API
  const res = await adminUploadMultipart('/admin/upload', 'file', buffer, session.sanitizedFilename, session.contentType);
  if (!res.ok) {
    session.status = 'failed';
    const err = await res.json().catch(() => ({})) as { message?: string };
    throw new Error(err.message ?? `cms-api upload failed: ${res.status}`);
  }
  const text = await res.text();
  if (!text) throw new Error('Empty upload response');
  const result = JSON.parse(text) as { id: number; key: string; url: string };

  // Cleanup
  uploadSession.markCompleted(params.uploadId, result.url, result.key);
  await uploadSession.cleanupSession(params.uploadId);

  return {
    url: result.url,
    key: result.key,
    filename: session.sanitizedFilename,
    contentType: session.contentType,
    size: session.totalBytes,
  };
}

export async function adminAbortUpload(params: { uploadId: string }) {
  await uploadSession.abortUpload(params.uploadId);
  return { uploadId: params.uploadId, status: 'aborted' };
}

// ── Upload — Direct (Phase 2: convenience methods) ────────────────────────────

export async function uploadImage(filePath: string): Promise<{ id: number; key: string; url: string }> {
  const buffer = await readFile(filePath);
  const filename = basename(filePath);
  const ext = filename.split('.').pop()?.toLowerCase() ?? 'png';
  const mimeMap: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml' };
  const mimeType = mimeMap[ext] ?? 'application/octet-stream';
  return uploadBuffer(buffer, filename, mimeType);
}

export async function uploadImageBase64(dataUriOrBase64: string, filename?: string): Promise<{ id: number; key: string; url: string }> {
  let mimeType = 'image/png';
  let base64 = dataUriOrBase64;

  const dataUriMatch = base64.match(/^data:([^;]+);base64,(.+)$/);
  if (dataUriMatch) {
    mimeType = dataUriMatch[1];
    base64 = dataUriMatch[2];
  }

  const buffer = Buffer.from(base64, 'base64');
  if (buffer.length > uploadSession.UPLOAD_CONFIG.MAX_SINGLE_BASE64) {
    throw new Error(`Base64 too large (${buffer.length} bytes). Max single upload: ${uploadSession.UPLOAD_CONFIG.MAX_SINGLE_BASE64}. Use chunked upload instead.`);
  }

  if (!uploadSession.ALLOWED_IMAGE_TYPES.has(mimeType)) {
    throw new Error(`Unsupported image type: ${mimeType}. Use chunked upload for other formats.`);
  }

  if (!filename) {
    const ext = mimeType.split('/').pop() ?? 'png';
    filename = `image.${ext}`;
  }

  return uploadBuffer(buffer, filename, mimeType);
}

// SSRF check — throws if the URL targets a private/loopback address or non-HTTPS scheme
function assertSafeUrl(url: URL): void {
  if (url.protocol !== 'https:') throw new Error('Only HTTPS URLs allowed');
  const hostname = url.hostname.toLowerCase();
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname.startsWith('0.')) {
    throw new Error('Blocked URL: localhost/loopback');
  }
  const ipv4Match = hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (ipv4Match) {
    const [, a, b] = ipv4Match.map(Number);
    if (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a === 127) {
      throw new Error('Blocked URL: private IP range');
    }
  }
}

export async function uploadImageFromUrl(imageUrl: string, filename?: string): Promise<{ id: number; key: string; url: string }> {
  // SSRF protection: validate initial URL
  let parsed: URL;
  try { parsed = new URL(imageUrl); } catch { throw new Error('Invalid URL'); }
  assertSafeUrl(parsed);

  // Download with safety limits — follow redirects manually so every hop is SSRF-checked
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  let currentUrl = imageUrl;
  let response: Response;
  let hops = 0;

  try {
    while (true) {
      response = await fetch(currentUrl, {
        redirect: 'manual',
        signal: controller.signal,
      });

      if (![301, 302, 303, 307, 308].includes(response.status)) break;
      if (hops >= 3) throw new Error('Too many redirects (max 3)');

      const location = response.headers.get('location');
      if (!location) throw new Error('Redirect without Location header');

      const redirectUrl = new URL(location, currentUrl);
      assertSafeUrl(redirectUrl); // SSRF check on every redirect target
      currentUrl = redirectUrl.toString();
      hops++;
    }
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) throw new Error(`Download failed: HTTP ${response.status}`);

  const contentType = response.headers.get('content-type')?.split(';')[0]?.trim() ?? 'application/octet-stream';
  if (!uploadSession.ALLOWED_IMAGE_TYPES.has(contentType)) {
    throw new Error(`Unsupported content type from URL: ${contentType}. Allowed: ${[...uploadSession.ALLOWED_IMAGE_TYPES].join(', ')}`);
  }

  const contentLength = response.headers.get('content-length');
  if (contentLength && Number(contentLength) > uploadSession.UPLOAD_CONFIG.MAX_FILE_SIZE) {
    throw new Error(`Remote file too large: ${contentLength} bytes`);
  }

  const arrayBuffer = await response.arrayBuffer();
  if (arrayBuffer.byteLength > uploadSession.UPLOAD_CONFIG.MAX_FILE_SIZE) {
    throw new Error(`Downloaded file too large: ${arrayBuffer.byteLength} bytes`);
  }

  const buffer = Buffer.from(arrayBuffer);
  const detectedMime = uploadSession.detectMimeType(buffer);
  if (detectedMime && detectedMime !== contentType) {
    throw new Error(`MIME mismatch from URL: declared ${contentType}, detected ${detectedMime}`);
  }

  const finalFilename = filename
    ? uploadSession.sanitizeFilename(filename)
    : uploadSession.sanitizeFilename(parsed.pathname.split('/').pop() ?? 'image');

  return uploadBuffer(buffer, finalFilename, contentType);
}

async function uploadBuffer(buffer: Buffer, filename: string, mimeType: string): Promise<{ id: number; key: string; url: string }> {
  const res = await adminUploadMultipart('/admin/upload', 'file', buffer, filename, mimeType);
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { message?: string };
    throw new Error(err.message ?? `cms-api ${res.status}: ${res.statusText}`);
  }
  const text = await res.text();
  if (!text) throw new Error('Empty upload response');
  return JSON.parse(text) as { id: number; key: string; url: string };
}

// ── Image generation ──────────────────────────────────────────────────────────

export function generateImage(params: {
  prompt: string;
  aspectRatio?: '16:9' | '1:1' | '4:3';
}): Promise<{ id: number; key: string; url: string }> {
  return adminPost<{ id: number; key: string; url: string }>('/admin/generate-image', params);
}

export function deleteMedia(id: number): Promise<{ deleted: boolean }> {
  return adminFetch<{ deleted: boolean }>(`/admin/upload/${id}`, { method: 'DELETE' });
}

// ── Category admin ────────────────────────────────────────────────────────────

export function createCategory(data: {
  name: string;
  slug: string;
  locale: string;
  description?: string;
  icon?: string;
}): Promise<unknown> {
  return adminPost<unknown>('/admin/categories', data);
}

export function updateCategory(id: number, data: {
  name?: string;
  slug?: string;
  description?: string;
  icon?: string;
}): Promise<unknown> {
  return adminPut<unknown>(`/admin/categories/${id}`, data);
}

export function deleteCategory(id: number): Promise<void> {
  return adminDelete(`/admin/categories/${id}`);
}

// ── Social Templates ─────────────────────────────────────────────────────────

export function listSocialTemplates(activeOnly?: boolean): Promise<unknown[]> {
  const p: Record<string, string> = {};
  if (activeOnly !== undefined) p.active = String(activeOnly);
  return adminGet<unknown[]>('/admin/social-templates', p);
}

export function getSocialTemplate(id: number): Promise<unknown> {
  return adminGet<unknown>(`/admin/social-templates/${id}`);
}

export function createSocialTemplate(data: {
  name: string;
  platform: string;
  htmlContent: string;
  cssContent: string;
  width: number;
  height: number;
  active?: boolean;
}): Promise<unknown> {
  return adminPost<unknown>('/admin/social-templates', data);
}

export function updateSocialTemplate(id: number, data: {
  name?: string;
  platform?: string;
  htmlContent?: string;
  cssContent?: string;
  width?: number;
  height?: number;
  active?: boolean;
}): Promise<unknown> {
  return adminPut<unknown>(`/admin/social-templates/${id}`, data);
}

export function deleteSocialTemplate(id: number): Promise<void> {
  return adminDelete(`/admin/social-templates/${id}`);
}
