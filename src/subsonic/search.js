import { searchYoutube } from '../catalog/youtube.js';
import { callNavidromeJson } from '../navidrome/client.js';
import { okResponse } from './responses.js';
import { toSubsonicSong } from './virtual.js';

const searchCache = new Map();
const searchCacheTtlMs = 2 * 60 * 1000;

function intParam(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function emptySearchResult(name) {
  return { [name]: { artist: [], album: [], song: [] } };
}

function getSearchResult(localResponse, name) {
  return localResponse?.['subsonic-response']?.[name] || { artist: [], album: [], song: [] };
}

async function searchLocal(request, endpoint, resultName) {
  try {
    const local = await callNavidromeJson(request, endpoint);
    return getSearchResult(local, resultName);
  } catch (error) {
    request.log.warn({ error }, `Navidrome ${endpoint} failed; continuing with remote catalog only`);
    return { artist: [], album: [], song: [] };
  }
}

async function searchRemote(request, query) {
  const key = query.toLowerCase().replace(/\s+/g, ' ').trim();
  const cached = searchCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.promise;
  }

  const promise = (async () => {
    try {
      return await searchYoutube(query);
    } catch (error) {
      request.log.warn({ error }, 'YouTube search failed; continuing with local catalog only');
      return [];
    }
  })();

  searchCache.set(key, { promise, expiresAt: Date.now() + searchCacheTtlMs });
  try {
    return await promise;
  } catch (error) {
    searchCache.delete(key);
    request.log.warn({ error }, 'YouTube search failed; continuing with local catalog only');
    return [];
  }
}

async function mergedSearch(request, endpoint, resultName) {
  const query = String(request.query.query || '').trim();
  if (!query) {
    return okResponse(emptySearchResult(resultName));
  }

  const [local, remote] = await Promise.all([
    searchLocal(request, endpoint, resultName),
    searchRemote(request, query)
  ]);

  const songCount = intParam(request.query.songCount, configSafeMax(remote.length));
  const songOffset = intParam(request.query.songOffset, 0);
  const localSongs = local.song || [];
  const remoteSongs = songCount > 0 ? remote.map(toSubsonicSong) : [];
  const mergedSongs = [...localSongs, ...remoteSongs].slice(songOffset, songOffset + songCount);

  request.log.info({
    query,
    endpoint,
    localSongs: localSongs.length,
    remoteSongs: remoteSongs.length,
    returnedSongs: mergedSongs.length,
    songCount,
    songOffset
  }, 'merged Subsonic search results');

  return okResponse({
    [resultName]: {
      artist: local.artist || [],
      album: local.album || [],
      song: mergedSongs
    }
  });
}

function configSafeMax(value) {
  return Math.max(0, value || 0);
}

export async function search3(request) {
  return mergedSearch(request, 'search3.view', 'searchResult3');
}

export async function search2(request) {
  return mergedSearch(request, 'search2.view', 'searchResult2');
}
