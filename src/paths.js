import path from 'node:path';

export function sanitizeFilename(value) {
  return String(value || '')
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/[\u0000-\u001f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180) || 'Unknown';
}

export function safeJoin(root, ...parts) {
  const target = path.resolve(root, ...parts);
  const resolvedRoot = path.resolve(root);
  if (target !== resolvedRoot && !target.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error(`Unsafe path outside root: ${target}`);
  }
  return target;
}

export function buildTrackPath(musicDir, meta, extension) {
  const artist = sanitizeFilename(meta.artist || 'Unknown Artist');
  const album = sanitizeFilename(meta.album || 'Singles');
  const track = String(meta.track || 1).padStart(2, '0');
  const title = sanitizeFilename(meta.title || 'Unknown Title');
  return safeJoin(musicDir, artist, album, `${track} - ${title}.${extension}`);
}
