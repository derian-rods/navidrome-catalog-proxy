import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { getVirtualTrack } from '../db/index.js';
import { proxyToNavidrome } from '../navidrome/client.js';
import { okResponse } from './responses.js';
import { isYoutubeId, toSubsonicSong, youtubeSourceId } from './virtual.js';

function fallbackTrack(id) {
  const sourceId = youtubeSourceId(id);
  if (!sourceId) return null;
  return {
    id,
    source: 'youtube',
    sourceId,
    title: sourceId,
    artist: 'YouTube',
    album: 'YouTube',
    duration: 0,
    thumbnail: '',
    score: 0,
    badges: []
  };
}

export async function getSong(request, reply) {
  const id = String(request.query.id || '');
  if (!isYoutubeId(id)) return proxyToNavidrome(request, reply);

  const sourceId = youtubeSourceId(id);
  const track = getVirtualTrack('youtube', sourceId) || fallbackTrack(id);
  return okResponse({ song: toSubsonicSong(track) });
}

export async function getCoverArt(request, reply) {
  const id = String(request.query.id || '');
  if (!isYoutubeId(id)) return proxyToNavidrome(request, reply);

  const sourceId = youtubeSourceId(id);
  const track = getVirtualTrack('youtube', sourceId);
  if (!track?.thumbnail) {
    reply.code(404);
    return reply.send({ error: 'cover_not_found' });
  }

  const coverDir = path.join(config.paths.cacheDir, 'covers');
  const coverPath = path.join(coverDir, `${sourceId}.jpg`);
  try {
    if (!fs.existsSync(coverPath)) {
      fs.mkdirSync(coverDir, { recursive: true });
      const response = await fetch(track.thumbnail);
      if (!response.ok) throw new Error(`thumbnail fetch failed with HTTP ${response.status}`);
      fs.writeFileSync(coverPath, Buffer.from(await response.arrayBuffer()));
    }

    reply.header('content-type', 'image/jpeg');
    reply.header('cache-control', 'public, max-age=86400');
    return reply.send(fs.createReadStream(coverPath));
  } catch (error) {
    request.log.warn({ error, sourceId }, 'failed to proxy YouTube thumbnail, redirecting');
    return reply.redirect(302, track.thumbnail);
  }
}
