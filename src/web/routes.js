import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { searchYoutube } from '../catalog/youtube.js';
import { getOrganizedTrack, getVirtualTrack } from '../db/index.js';
import { getOrCreateYoutubeTrack } from '../downloads/youtubeTrack.js';
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

export async function registerWebRoutes(app) {
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
}
