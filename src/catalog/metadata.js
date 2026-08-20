function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function parseYoutubeTitle(title, channel) {
  const clean = String(title || '')
    .replace(/\[[^\]]*]/g, '')
    .replace(/\((official\s*)?(audio|lyrics?|lyric video|video oficial|official video|visualizer|letra)\)/ig, '')
    .replace(/\s+/g, ' ')
    .trim();

  const match = clean.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  if (match) {
    return { artist: match[1].trim(), title: match[2].trim() };
  }

  const artist = String(channel || '').replace(/\s*-\s*topic$/i, '').trim();
  return { artist, title: clean };
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { 'user-agent': 'navidrome-catalog-proxy/0.1.0' }
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function searchITunes(artist, title) {
  const term = artist ? `${artist} ${title}` : title;
  const data = await fetchJson(`https://itunes.apple.com/search?term=${encodeURIComponent(term)}&media=music&entity=song&limit=8`);
  const results = data.results || [];
  if (results.length === 0) return null;

  const expectedArtist = normalize(artist);
  const expectedTitle = normalize(title);
  let best = null;
  let bestScore = -1;

  for (const item of results) {
    const itemArtist = normalize(item.artistName);
    const itemTitle = normalize(item.trackName);
    let score = 0;
    if (expectedTitle && itemTitle === expectedTitle) score += 8;
    if (expectedTitle && (itemTitle.includes(expectedTitle) || expectedTitle.includes(itemTitle))) score += 4;
    if (expectedArtist && itemArtist === expectedArtist) score += 6;
    if (expectedArtist && (itemArtist.includes(expectedArtist) || expectedArtist.includes(itemArtist))) score += 3;
    if (score > bestScore) {
      best = item;
      bestScore = score;
    }
  }

  if (!best || bestScore < 4) return null;
  return {
    artist: best.artistName || artist || 'Unknown Artist',
    title: best.trackName || title || 'Unknown Title',
    album: best.collectionName || 'Singles',
    year: best.releaseDate ? String(best.releaseDate).slice(0, 4) : '',
    genre: best.primaryGenreName || 'Music',
    track: best.trackNumber || 1,
    coverUrl: best.artworkUrl100 ? best.artworkUrl100.replace('100x100bb', '600x600bb') : '',
    source: 'itunes'
  };
}

async function searchMusicBrainz(artist, title) {
  const query = artist ? `artist:"${artist}" AND recording:"${title}"` : `recording:"${title}"`;
  const url = `https://musicbrainz.org/ws/2/recording/?query=${encodeURIComponent(query)}&fmt=json&limit=5&inc=artists+releases`;
  const data = await fetchJson(url);
  const recording = data.recordings?.[0];
  if (!recording) return null;
  const release = recording.releases?.[0];
  return {
    artist: recording['artist-credit']?.map(credit => credit.name).filter(Boolean).join(', ') || artist || 'Unknown Artist',
    title: recording.title || title || 'Unknown Title',
    album: release?.title || 'Singles',
    year: release?.date ? String(release.date).slice(0, 4) : '',
    genre: 'Music',
    track: 1,
    releaseId: release?.id || '',
    coverUrl: '',
    source: 'musicbrainz'
  };
}

export async function resolveMetadata(input) {
  const parsed = parseYoutubeTitle(input.title, input.channel);
  const artist = input.artist || parsed.artist;
  const title = input.trackTitle || parsed.title;

  try {
    const itunes = await searchITunes(artist, title);
    if (itunes) return itunes;
  } catch {
    // Fallback below.
  }

  try {
    const musicBrainz = await searchMusicBrainz(artist, title);
    if (musicBrainz) return musicBrainz;
  } catch {
    // Use parsed YouTube data below.
  }

  return {
    artist: artist || 'Unknown Artist',
    title: title || input.title || 'Unknown Title',
    album: 'YouTube',
    year: '',
    genre: 'Music',
    track: 1,
    coverUrl: input.thumbnail || '',
    source: 'youtube'
  };
}

export async function downloadCover(meta) {
  if (meta.coverUrl) {
    const response = await fetch(meta.coverUrl);
    if (response.ok) return Buffer.from(await response.arrayBuffer());
  }

  if (meta.releaseId) {
    const response = await fetch(`https://coverartarchive.org/release/${meta.releaseId}/front-500`, { redirect: 'follow' });
    if (response.ok) return Buffer.from(await response.arrayBuffer());
  }

  return null;
}
