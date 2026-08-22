import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { nanoid } from 'nanoid';
import { looksLikeYoutubeUrl, previewYoutubeUrl, searchYoutube, searchYoutubeCollections } from '../catalog/youtube.js';
import { config } from '../config.js';
import {
  getCleanupCandidate,
  getOrganizedTrack,
  getVirtualTrack,
  listCleanupCandidates,
  listOrganizedTracks,
  updateCleanupCandidate,
  upsertCleanupCandidate
} from '../db/index.js';
import { getOrCreateYoutubeTrack } from '../downloads/youtubeTrack.js';
import { triggerScanFromRequest, validateNavidromeCredentials } from '../navidrome/client.js';
import { youtubeSourceId } from '../subsonic/virtual.js';

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../web/dist');
const downloadJobs = new Map();

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.svg': 'image/svg+xml'
};

function sendWebFile(reply, relativePath) {
  const filePath = path.join(webDir, relativePath);
  reply.header('content-type', contentTypes[path.extname(filePath)] || 'application/octet-stream');
  reply.header('cache-control', relativePath === 'index.html' ? 'no-store' : 'public, max-age=3600');
  return reply.send(fs.createReadStream(filePath));
}

function sendWebAsset(reply, requestPath) {
  const relativePath = requestPath.replace(/^\//, '');
  const filePath = path.join(webDir, relativePath);
  const normalized = path.normalize(filePath);
  if (!normalized.startsWith(webDir) || !fs.existsSync(normalized) || fs.statSync(normalized).isDirectory()) {
    reply.code(404);
    return reply.send({ error: 'not_found' });
  }
  reply.header('content-type', contentTypes[path.extname(normalized)] || 'application/octet-stream');
  reply.header('cache-control', 'public, max-age=31536000, immutable');
  return reply.send(fs.createReadStream(normalized));
}

function sourceIdFromRequest(value) {
  const input = String(value || '').trim();
  if (!input) return '';
  return youtubeSourceId(input) || input;
}

function nowIso() {
  return new Date().toISOString();
}

function publicJob(job) {
  return {
    id: job.id,
    status: job.status,
    total: job.total,
    completed: job.completed,
    failed: job.failed,
    scanStarted: job.scanStarted,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    finishedAt: job.finishedAt,
    items: job.items
  };
}

function updateJob(job, fields = {}) {
  Object.assign(job, fields, { updatedAt: nowIso() });
}

function startDownloadJob(sourceIds, request) {
  const job = {
    id: nanoid(),
    status: 'queued',
    total: sourceIds.length,
    completed: 0,
    failed: 0,
    scanStarted: false,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    finishedAt: '',
    items: sourceIds.map(sourceId => ({
      sourceId,
      status: 'queued',
      message: 'Queued',
      path: '',
      error: '',
      startedAt: '',
      finishedAt: ''
    }))
  };
  downloadJobs.set(job.id, job);

  void runDownloadJob(job, request);
  return job;
}

async function runDownloadJob(job, request) {
  updateJob(job, { status: 'running' });
  for (const item of job.items) {
    item.status = 'downloading';
    item.message = 'Downloading and processing audio';
    item.startedAt = nowIso();
    updateJob(job);
    try {
      const organized = await getOrCreateYoutubeTrack(item.sourceId, request);
      item.status = 'done';
      item.message = 'Saved to Navidrome library';
      item.path = organized.path;
      item.finishedAt = nowIso();
      job.completed++;
    } catch (error) {
      request.log.warn({ error, sourceId: item.sourceId, jobId: job.id }, 'download job item failed');
      item.status = 'failed';
      item.message = 'Download failed';
      item.error = error.message;
      item.finishedAt = nowIso();
      job.failed++;
    }
    updateJob(job);
  }

  job.scanStarted = await triggerScan(request);
  updateJob(job, {
    status: job.failed > 0 ? 'completed_with_errors' : 'completed',
    finishedAt: nowIso()
  });
}

async function requireAdmin(request, reply) {
  const user = String(request.headers['x-catalog-user'] || request.body?.user || '').trim();
  const password = String(request.headers['x-catalog-password'] || request.body?.password || '').trim();
  if (user && await validateNavidromeCredentials(user, password)) return null;

  if (config.catalog.adminPassword && !user && password === config.catalog.adminPassword) return null;

  if (!config.catalog.adminPassword && !config.navidrome.password) {
    reply.code(503);
    return { error: 'admin_password_not_configured' };
  }

  if (!user) {
    reply.code(401);
    return { error: 'invalid_admin_password' };
  }
  reply.code(401);
  return { error: 'invalid_navidrome_login' };
}

function quarantinePathFor(sourceId, originalPath) {
  const relative = path.relative(config.paths.musicDir, originalPath);
  const safeRelative = relative.startsWith('..') || path.isAbsolute(relative)
    ? path.basename(originalPath)
    : relative;
  return path.join(config.cleanup.quarantineDir, 'catalog', sourceId, safeRelative);
}

function downloadedTrack(sourceId) {
  const organized = getOrganizedTrack('youtube', sourceId);
  if (!organized) throw new Error('downloaded track not found');
  return organized;
}

async function triggerScan(request) {
  return triggerScanFromRequest(request).catch(error => {
    request.log.warn({ error }, 'failed to trigger Navidrome scan');
    return false;
  });
}

export async function registerWebRoutes(app) {
  app.get('/', async (_request, reply) => sendWebFile(reply, 'index.html'));
  app.get('/login', async (_request, reply) => sendWebFile(reply, 'index.html'));
  app.get('/search', async (_request, reply) => sendWebFile(reply, 'index.html'));
  app.get('/downloaded', async (_request, reply) => sendWebFile(reply, 'index.html'));
  app.get('/quarantine', async (_request, reply) => sendWebFile(reply, 'index.html'));
  app.get('/settings', async (_request, reply) => sendWebFile(reply, 'index.html'));
  app.get('/assets/*', async (request, reply) => sendWebAsset(reply, request.url));

  app.get('/api/catalog/search', async request => {
    const query = String(request.query.q || request.query.query || '').trim();
    if (!query) return { results: [] };
    return { results: await searchYoutube(query) };
  });

  app.get('/api/catalog/track/:sourceId', async request => {
    const sourceId = sourceIdFromRequest(request.params.sourceId);
    const track = getVirtualTrack('youtube', sourceId);
    const organized = getOrganizedTrack('youtube', sourceId);
    return { track, organized, downloaded: Boolean(organized) };
  });

  app.post('/api/catalog/download', async (request, reply) => {
    const authError = await requireAdmin(request, reply);
    if (authError) return authError;

    const sourceId = sourceIdFromRequest(request.body?.sourceId || request.body?.id);
    if (!sourceId) {
      reply.code(400);
      return { error: 'missing_source_id' };
    }

    const organized = await getOrCreateYoutubeTrack(sourceId, request);
    return {
      ok: true,
      source: 'youtube',
      sourceId,
      path: organized.path,
      coverPath: organized.coverPath || '',
      meta: organized.meta || {}
    };
  });

  app.post('/api/admin/check', async (request, reply) => {
    const authError = await requireAdmin(request, reply);
    if (authError) return authError;
    return { ok: true };
  });

  app.post('/api/auth/login', async (request, reply) => {
    const user = String(request.body?.user || '').trim();
    const password = String(request.body?.password || '').trim();
    if (await validateNavidromeCredentials(user, password)) return { ok: true, user };
    reply.code(401);
    return { error: 'invalid_navidrome_login' };
  });

  app.post('/api/catalog/lookup', async request => {
    const query = String(request.body?.query || '').trim();
    const mode = String(request.body?.mode || 'auto');
    const limit = Math.min(Math.max(Number.parseInt(String(request.body?.limit || '30'), 10) || 30, 1), 50);
    if (!query) return { songs: [], collections: [], preview: null };

    if (looksLikeYoutubeUrl(query)) {
      return { songs: [], collections: [], preview: await previewYoutubeUrl(query) };
    }

    const [songs, collections] = await Promise.all([
      mode === 'collections' ? Promise.resolve([]) : searchYoutube(query),
      mode === 'songs' ? Promise.resolve([]) : searchYoutubeCollections(query, Math.min(limit, config.youtube.maxPlaylistResults))
    ]);

    return {
      songs: songs.slice(0, limit),
      collections: collections.slice(0, limit),
      preview: null
    };
  });

  app.post('/api/catalog/preview-url', async (request, reply) => {
    const authError = await requireAdmin(request, reply);
    if (authError) return authError;
    const url = String(request.body?.url || '').trim();
    if (!url) {
      reply.code(400);
      return { error: 'missing_url' };
    }
    return { preview: await previewYoutubeUrl(url) };
  });

  app.post('/api/catalog/download-batch', async (request, reply) => {
    const authError = await requireAdmin(request, reply);
    if (authError) return authError;
    const sourceIds = Array.isArray(request.body?.sourceIds) ? request.body.sourceIds.map(sourceIdFromRequest).filter(Boolean) : [];
    if (sourceIds.length === 0) {
      reply.code(400);
      return { error: 'missing_source_ids' };
    }

    const results = [];
    for (const sourceId of sourceIds.slice(0, 100)) {
      try {
        const organized = await getOrCreateYoutubeTrack(sourceId, request);
        results.push({ ok: true, sourceId, path: organized.path, coverPath: organized.coverPath || '', meta: organized.meta || {} });
      } catch (error) {
        request.log.warn({ error, sourceId }, 'batch download item failed');
        results.push({ ok: false, sourceId, error: error.message });
      }
    }
    const scanStarted = await triggerScan(request);
    return { ok: results.every(result => result.ok), scanStarted, results };
  });

  app.post('/api/catalog/download-jobs', async (request, reply) => {
    const authError = await requireAdmin(request, reply);
    if (authError) return authError;
    const sourceIds = Array.isArray(request.body?.sourceIds) ? request.body.sourceIds.map(sourceIdFromRequest).filter(Boolean) : [];
    if (sourceIds.length === 0) {
      reply.code(400);
      return { error: 'missing_source_ids' };
    }
    return { job: publicJob(startDownloadJob(sourceIds.slice(0, 100), request)) };
  });

  app.get('/api/catalog/download-jobs/:jobId', async (request, reply) => {
    const authError = await requireAdmin(request, reply);
    if (authError) return authError;
    const job = downloadJobs.get(String(request.params.jobId || ''));
    if (!job) {
      reply.code(404);
      return { error: 'download_job_not_found' };
    }
    return { job: publicJob(job) };
  });

  app.get('/api/catalog/downloaded', async () => ({
    tracks: listOrganizedTracks().map(track => ({
      ...track,
      exists: fs.existsSync(track.path),
      quarantined: track.cleanupStatus === 'quarantined' && Boolean(track.quarantinePath)
    }))
  }));

  app.get('/api/catalog/quarantine', async () => ({
    candidates: listCleanupCandidates('quarantined').map(candidate => ({
      ...candidate,
      exists: Boolean(candidate.quarantinePath) && fs.existsSync(candidate.quarantinePath)
    }))
  }));

  app.post('/api/catalog/downloaded/:sourceId/quarantine', async (request, reply) => {
    const authError = await requireAdmin(request, reply);
    if (authError) return authError;

    const sourceId = sourceIdFromRequest(request.params.sourceId);
    const organized = downloadedTrack(sourceId);
    const target = quarantinePathFor(sourceId, organized.path);
    if (!fs.existsSync(organized.path)) throw new Error('downloaded file does not exist');

    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.renameSync(organized.path, target);
    upsertCleanupCandidate({
      source: 'youtube',
      sourceId,
      originalPath: organized.path,
      quarantinePath: target,
      reason: 'manual catalog quarantine',
      status: 'quarantined'
    });
    updateCleanupCandidate('youtube', sourceId, { quarantined_at: nowIso() });
    const scanStarted = await triggerScan(request);
    return { ok: true, changed: true, scanStarted, candidate: getCleanupCandidate('youtube', sourceId) };
  });

  app.post('/api/catalog/quarantine/:sourceId/restore', async (request, reply) => {
    const authError = await requireAdmin(request, reply);
    if (authError) return authError;

    const sourceId = sourceIdFromRequest(request.params.sourceId);
    const candidate = getCleanupCandidate('youtube', sourceId);
    if (!candidate || candidate.status !== 'quarantined') throw new Error('quarantined track not found');
    if (!fs.existsSync(candidate.quarantinePath)) throw new Error('quarantine file does not exist');

    fs.mkdirSync(path.dirname(candidate.originalPath), { recursive: true });
    fs.renameSync(candidate.quarantinePath, candidate.originalPath);
    updateCleanupCandidate('youtube', sourceId, { status: 'restored', restored_at: nowIso() });
    const scanStarted = await triggerScan(request);
    return { ok: true, changed: true, scanStarted, candidate: getCleanupCandidate('youtube', sourceId) };
  });

  app.delete('/api/catalog/quarantine/:sourceId', async (request, reply) => {
    const authError = await requireAdmin(request, reply);
    if (authError) return authError;

    const sourceId = sourceIdFromRequest(request.params.sourceId);
    const candidate = getCleanupCandidate('youtube', sourceId);
    if (!candidate || candidate.status !== 'quarantined') throw new Error('quarantined track not found');
    if (candidate.quarantinePath && fs.existsSync(candidate.quarantinePath)) {
      fs.unlinkSync(candidate.quarantinePath);
    }
    updateCleanupCandidate('youtube', sourceId, { status: 'deleted', deleted_at: nowIso() });
    const scanStarted = await triggerScan(request);
    return { ok: true, changed: true, scanStarted, candidate: getCleanupCandidate('youtube', sourceId) };
  });

  app.post('/api/catalog/rescan', async (request, reply) => {
    const authError = await requireAdmin(request, reply);
    if (authError) return authError;
    const scanStarted = await triggerScan(request);
    return { ok: scanStarted, scanStarted };
  });
}
