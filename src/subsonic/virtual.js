export function isYoutubeId(id) {
  const value = String(id || '');
  return value.startsWith('yt:') || value.startsWith('yt-');
}

export function youtubeSourceId(id) {
  return isYoutubeId(id) ? String(id).slice(3) : '';
}

export function youtubeVirtualId(sourceId) {
  return `yt-${sourceId}`;
}

function stableIdPart(value) {
  return String(value || 'youtube')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'youtube';
}

function pathPart(value) {
  return String(value || 'YouTube')
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || 'YouTube';
}

export function toSubsonicSong(result) {
  const sourceId = result.sourceId || youtubeSourceId(result.id);
  const id = youtubeVirtualId(sourceId);
  const artist = result.artist || result.channel || 'YouTube';
  const album = result.album || 'YouTube';
  const title = result.title || sourceId;
  const artistId = `yt-artist-${stableIdPart(artist)}`;
  const albumId = `yt-album-${sourceId}`;
  const duration = result.duration || 0;

  return {
    id,
    parent: albumId,
    albumId,
    artistId,
    title,
    album,
    artist,
    isDir: false,
    duration,
    bitRate: 128,
    size: duration > 0 ? duration * 16000 : 1,
    track: 1,
    discNumber: 1,
    year: new Date().getUTCFullYear(),
    genre: 'YouTube',
    type: 'music',
    suffix: 'opus',
    contentType: 'audio/ogg',
    path: `YouTube/${pathPart(artist)} - ${pathPart(title)}.opus`,
    coverArt: id,
    created: new Date().toISOString(),
    starred: false,
    userRating: Math.max(1, Math.min(5, Math.round((result.score || 0) / 20)))
  };
}
