import { searchYoutube } from '../catalog/youtube.js';
import { okResponse } from './responses.js';

function toSubsonicSong(result) {
  return {
    id: result.id,
    parent: 'youtube',
    title: result.title,
    album: result.album,
    artist: result.artist,
    isDir: false,
    duration: result.duration,
    type: 'music',
    suffix: 'opus',
    contentType: 'audio/ogg',
    coverArt: result.id,
    created: new Date().toISOString(),
    starred: false,
    userRating: Math.max(1, Math.min(5, Math.round(result.score / 20)))
  };
}

export async function search3(request) {
  const query = String(request.query.query || '').trim();
  if (!query) {
    return okResponse({ searchResult3: { artist: [], album: [], song: [] } });
  }

  const results = await searchYoutube(query);
  return okResponse({
    searchResult3: {
      artist: [],
      album: [],
      song: results.map(toSubsonicSong)
    }
  });
}
