// cms-client.ts — HTTP client for cms-api (public + admin)

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

// ── Cover Templates ──────────────────────────────────────────────────────────

export function listTemplates(activeOnly?: boolean): Promise<unknown[]> {
  const p: Record<string, string> = {};
  if (activeOnly !== undefined) p.active = String(activeOnly);
  return adminGet<unknown[]>('/admin/social-templates', p);
}

export function getTemplate(id: number): Promise<unknown> {
  return adminGet<unknown>(`/admin/social-templates/${id}`);
}

export function createTemplate(data: {
  name: string;
  htmlContent: string;
  cssContent: string;
  width: number;
  height: number;
  active?: boolean;
}): Promise<unknown> {
  return adminPost<unknown>('/admin/social-templates', data);
}

export function updateTemplate(id: number, data: {
  name?: string;
  htmlContent?: string;
  cssContent?: string;
  width?: number;
  height?: number;
  active?: boolean;
}): Promise<unknown> {
  return adminPut<unknown>(`/admin/social-templates/${id}`, data);
}

export function deleteTemplate(id: number): Promise<void> {
  return adminDelete(`/admin/social-templates/${id}`);
}

// ── Cover Rendering ──────────────────────────────────────────────────────────

export function composeCover(articleId: number, templateId: number): Promise<{ id: number; key: string; url: string }> {
  return adminPost<{ id: number; key: string; url: string }>('/admin/compose-cover', { articleId, templateId });
}

// ── Analytics ────────────────────────────────────────────────────────────────

export function getAnalyticsDashboard(start?: string, end?: string) {
  const p: Record<string, string> = {};
  if (start) p.start = start;
  if (end) p.end = end;
  return adminGet<{ dashboard: unknown }>('/admin/analytics/dashboard', p);
}

export function getAnalyticsTrending(limit = 10) {
  return adminGet<{ articles: unknown[] }>('/admin/analytics/trending', { limit: String(limit) });
}

export function getAnalyticsSources(start?: string, end?: string) {
  const p: Record<string, string> = {};
  if (start) p.start = start;
  if (end) p.end = end;
  return adminGet<{ sources: unknown[] }>('/admin/analytics/sources', p);
}

export function getAnalyticsAudience(start?: string, end?: string) {
  const p: Record<string, string> = {};
  if (start) p.start = start;
  if (end) p.end = end;
  return adminGet<{ devices: unknown[]; countries: unknown[] }>('/admin/analytics/audience', p);
}

export function getArticleAnalytics(articlePath: string, start?: string, end?: string) {
  return adminPost<{ stats: unknown }>('/admin/analytics/article-stats', { path: articlePath, start, end });
}
