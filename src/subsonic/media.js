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

  return reply.redirect(302, track.thumbnail);
}
