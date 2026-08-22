import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { searchYoutube } from '../catalog/youtube.js';
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
import { triggerScanFromRequest } from '../navidrome/client.js';
import { youtubeSourceId } from '../subsonic/virtual.js';

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../web');

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

function sourceIdFromRequest(value) {
  const input = String(value || '').trim();
  if (!input) return '';
  return youtubeSourceId(input) || input;
}

function nowIso() {
  return new Date().toISOString();
}

function requireAdmin(request, reply) {
  if (!config.catalog.adminPassword) {
    reply.code(503);
    return { error: 'admin_password_not_configured' };
  }
  const password = String(request.headers['x-catalog-password'] || request.body?.password || '').trim();
  if (password !== config.catalog.adminPassword) {
    reply.code(401);
    return { error: 'invalid_admin_password' };
  }
  return null;
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
  app.get('/catalog', async (_request, reply) => sendWebFile(reply, 'index.html'));
  app.get('/catalog/', async (_request, reply) => sendWebFile(reply, 'index.html'));
  app.get('/catalog/app.js', async (_request, reply) => sendWebFile(reply, 'app.js'));
  app.get('/catalog/styles.css', async (_request, reply) => sendWebFile(reply, 'styles.css'));

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
    const authError = requireAdmin(request, reply);
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
    const authError = requireAdmin(request, reply);
    if (authError) return authError;
    return { ok: true };
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
    const authError = requireAdmin(request, reply);
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
    const authError = requireAdmin(request, reply);
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
    const authError = requireAdmin(request, reply);
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
    const authError = requireAdmin(request, reply);
    if (authError) return authError;
    const scanStarted = await triggerScan(request);
    return { ok: scanStarted, scanStarted };
  });
}
