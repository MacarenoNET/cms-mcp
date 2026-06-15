// upload-session.ts — Chunked upload session manager
// Stores chunks on disk, metadata in memory. Thread-safe (single-process MCP).

import { mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

// ── Types ─────────────────────────────────────────────────────────────────────

export type UploadStatus = 'created' | 'uploading' | 'completing' | 'completed' | 'aborted' | 'expired' | 'failed';

export interface UploadSession {
  uploadId: string;
  filename: string;
  sanitizedFilename: string;
  contentType: string;
  totalBytes: number;
  chunkSize: number;
  expectedChunks: number;
  receivedChunks: Set<number>;
  receivedBytes: number;
  sha256Expected?: string;
  status: UploadStatus;
  createdAt: Date;
  expiresAt: Date;
  completedAt?: Date;
  finalUrl?: string;
  finalKey?: string;
}

// ── Config ────────────────────────────────────────────────────────────────────

export const UPLOAD_CONFIG = {
  MAX_FILE_SIZE: 15 * 1024 * 1024,        // 15 MB
  MAX_SINGLE_BASE64: 2 * 1024 * 1024,     // 2 MB for single base64
  DEFAULT_CHUNK_SIZE: 64 * 1024,           // 64 KB
  MAX_CHUNK_SIZE: 256 * 1024,              // 256 KB
  SESSION_TTL_MS: 60 * 60 * 1000,          // 1 hour
  CLEANUP_INTERVAL_MS: 15 * 60 * 1000,     // 15 min
  WORK_DIR: join(tmpdir(), 'mcp-uploads'),
};

export const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

// ── In-memory session store ────────────────────────────────────────────────────

const sessions = new Map<string, UploadSession>();

// ── Cleanup timer ─────────────────────────────────────────────────────────────

let _cleanupTimer: ReturnType<typeof setInterval> | null = null;

function ensureCleanup(): void {
  if (_cleanupTimer) return;
  _cleanupTimer = setInterval(cleanupExpiredSessions, UPLOAD_CONFIG.CLEANUP_INTERVAL_MS);
  _cleanupTimer.unref(); // don't keep process alive
}

async function cleanupExpiredSessions(): Promise<void> {
  const now = new Date();
  for (const [id, session] of sessions) {
    if (session.expiresAt <= now && session.status !== 'completed' && session.status !== 'aborted') {
      await abortUploadInternal(id).catch(() => {});
    }
  }
}

// ── Filename sanitization ──────────────────────────────────────────────────────

export function sanitizeFilename(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .toLowerCase() || 'file';
}

// ── MIME detection from magic bytes ───────────────────────────────────────────

const MAGIC_BYTES: [number[], string][] = [
  [[0xFF, 0xD8, 0xFF], 'image/jpeg'],
  [[0x89, 0x50, 0x4E, 0x47], 'image/png'],
  [[0x47, 0x49, 0x46, 0x38], 'image/gif'],
  [[0x52, 0x49, 0x46, 0x46], 'image/webp'], // RIFF....WEBP — simplified check
];

export function detectMimeType(buffer: Buffer): string | null {
  for (const [magic, mime] of MAGIC_BYTES) {
    if (buffer.length >= magic.length && magic.every((b, i) => buffer[i] === b)) {
      return mime;
    }
  }
  return null;
}

// ── Validation ─────────────────────────────────────────────────────────────────

export function validateCreateUpload(filename: string, contentType: string, totalBytes: number): string | null {
  if (!filename || typeof filename !== 'string') return 'Filename is required';
  if (filename.length > 255) return 'Filename too long';
  
  const sanitized = sanitizeFilename(filename);
  if (!sanitized) return 'Invalid filename';
  
  if (!ALLOWED_IMAGE_TYPES.has(contentType)) {
    return `Unsupported content type: ${contentType}. Allowed: ${[...ALLOWED_IMAGE_TYPES].join(', ')}`;
  }
  
  if (!Number.isInteger(totalBytes) || totalBytes <= 0) return 'totalBytes must be a positive integer';
  if (totalBytes > UPLOAD_CONFIG.MAX_FILE_SIZE) {
    return `File too large: ${totalBytes} bytes. Maximum: ${UPLOAD_CONFIG.MAX_FILE_SIZE} bytes`;
  }
  
  return null; // valid
}

// ── Session operations ─────────────────────────────────────────────────────────

export function createUploadSession(
  filename: string,
  contentType: string,
  totalBytes: number,
  sha256?: string,
): UploadSession {
  ensureCleanup();
  
  const uploadId = `upl_${randomUUID().replace(/-/g, '')}`;
  const sanitizedFilename = sanitizeFilename(filename);
  const chunkSize = UPLOAD_CONFIG.DEFAULT_CHUNK_SIZE;
  const expectedChunks = Math.ceil(totalBytes / chunkSize);
  
  const session: UploadSession = {
    uploadId,
    filename,
    sanitizedFilename,
    contentType,
    totalBytes,
    chunkSize,
    expectedChunks,
    receivedChunks: new Set(),
    receivedBytes: 0,
    sha256Expected: sha256,
    status: 'created',
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + UPLOAD_CONFIG.SESSION_TTL_MS),
  };
  
  sessions.set(uploadId, session);
  return session;
}

export function getSession(uploadId: string): UploadSession | null {
  const session = sessions.get(uploadId);
  if (!session) return null;
  if (session.expiresAt <= new Date()) {
    abortUploadInternal(uploadId).catch(() => {});
    return null;
  }
  return session;
}

async function getChunkDir(uploadId: string): Promise<string> {
  const dir = join(UPLOAD_CONFIG.WORK_DIR, uploadId, 'chunks');
  await mkdir(dir, { recursive: true });
  return dir;
}

async function getSessionDir(uploadId: string): Promise<string> {
  const dir = join(UPLOAD_CONFIG.WORK_DIR, uploadId);
  await mkdir(dir, { recursive: true });
  return dir;
}

// ── Chunk operations ──────────────────────────────────────────────────────────

export async function writeChunk(
  uploadId: string,
  index: number,
  base64Data: string,
): Promise<{ receivedBytes: number; totalReceivedBytes: number }> {
  const session = getSession(uploadId);
  if (!session) throw new Error(`Upload session ${uploadId} not found or expired`);
  if (session.status === 'completed') throw new Error(`Upload ${uploadId} already completed`);
  if (session.status === 'aborted') throw new Error(`Upload ${uploadId} was aborted`);
  
  if (!Number.isInteger(index) || index < 0 || index >= session.expectedChunks) {
    throw new Error(`Invalid chunk index ${index}. Expected 0-${session.expectedChunks - 1}`);
  }
  
  const buffer = Buffer.from(base64Data, 'base64');
  const expectedSize = (index === session.expectedChunks - 1)
    ? session.totalBytes - (index * session.chunkSize)
    : session.chunkSize;
  
  if (buffer.length !== expectedSize) {
    throw new Error(`Chunk ${index} size mismatch: got ${buffer.length}, expected ${expectedSize}`);
  }
  
  if (buffer.length > UPLOAD_CONFIG.MAX_CHUNK_SIZE) {
    throw new Error(`Chunk ${index} too large: ${buffer.length} > ${UPLOAD_CONFIG.MAX_CHUNK_SIZE}`);
  }
  
  const chunkDir = await getChunkDir(uploadId);
  const chunkPath = join(chunkDir, `${String(index).padStart(6, '0')}.part`);
  await writeFile(chunkPath, buffer);
  
  const isNew = !session.receivedChunks.has(index);
  session.receivedChunks.add(index);
  if (isNew) {
    session.receivedBytes += buffer.length;
  }
  session.status = 'uploading';
  
  return {
    receivedBytes: buffer.length,
    totalReceivedBytes: session.receivedBytes,
  };
}

// ── Assemble & complete ───────────────────────────────────────────────────────

export async function assembleFile(uploadId: string): Promise<Buffer> {
  const session = getSession(uploadId);
  if (!session) throw new Error(`Upload session ${uploadId} not found or expired`);
  
  // Check all chunks present
  const missing: number[] = [];
  for (let i = 0; i < session.expectedChunks; i++) {
    if (!session.receivedChunks.has(i)) missing.push(i);
  }
  if (missing.length > 0) {
    throw new Error(`Missing chunks: ${missing.join(', ')}`);
  }
  
  const chunkDir = join(UPLOAD_CONFIG.WORK_DIR, uploadId, 'chunks');
  const chunks: Buffer[] = [];
  for (let i = 0; i < session.expectedChunks; i++) {
    const chunkPath = join(chunkDir, `${String(i).padStart(6, '0')}.part`);
    chunks.push(await readFile(chunkPath));
  }
  
  return Buffer.concat(chunks);
}

export async function cleanupSession(uploadId: string): Promise<void> {
  const dir = join(UPLOAD_CONFIG.WORK_DIR, uploadId);
  await rm(dir, { recursive: true, force: true });
  sessions.delete(uploadId);
}

async function abortUploadInternal(uploadId: string): Promise<void> {
  const session = sessions.get(uploadId);
  if (session && session.status !== 'completed') {
    session.status = 'aborted';
  }
  await cleanupSession(uploadId);
}

export async function abortUpload(uploadId: string): Promise<void> {
  const session = sessions.get(uploadId);
  if (!session) {
    await cleanupSession(uploadId); // clean orphan files
    return;
  }
  await abortUploadInternal(uploadId);
}

export function markCompleted(
  uploadId: string,
  finalUrl: string,
  finalKey: string,
): void {
  const session = sessions.get(uploadId);
  if (session) {
    session.status = 'completed';
    session.completedAt = new Date();
    session.finalUrl = finalUrl;
    session.finalKey = finalKey;
  }
  // Keep session in memory briefly for idempotent complete, cleanup will handle later
}
