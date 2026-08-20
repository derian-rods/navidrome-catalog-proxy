import { searchYoutube } from '../catalog/youtube.js';
import { callNavidromeJson } from '../navidrome/client.js';
import { okResponse } from './responses.js';
import { toSubsonicSong } from './virtual.js';

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
  try {
    return await searchYoutube(query);
  } catch (error) {
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

  return okResponse({
    [resultName]: {
      artist: local.artist || [],
      album: local.album || [],
      song: [
        ...(local.song || []),
        ...remote.map(toSubsonicSong)
      ]
    }
  });
}

export async function search3(request) {
  return mergedSearch(request, 'search3.view', 'searchResult3');
}

export async function search2(request) {
  return mergedSearch(request, 'search2.view', 'searchResult2');
}
