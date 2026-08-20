export function isYoutubeId(id) {
  return String(id || '').startsWith('yt:');
}

export function youtubeSourceId(id) {
  return isYoutubeId(id) ? String(id).slice(3) : '';
}

export function toSubsonicSong(result) {
  return {
    id: result.id,
    parent: 'youtube',
    title: result.title,
    album: result.album || 'YouTube',
    artist: result.artist || result.channel || 'YouTube',
    isDir: false,
    duration: result.duration || 0,
    type: 'music',
    suffix: 'opus',
    contentType: 'audio/ogg',
    coverArt: result.id,
    created: new Date().toISOString(),
    starred: false,
    userRating: Math.max(1, Math.min(5, Math.round((result.score || 0) / 20)))
  };
}
