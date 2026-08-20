import fs from 'node:fs';
import path from 'node:path';
import { getOrCreateYoutubeTrack } from '../downloads/youtubeTrack.js';
import { proxyToNavidrome } from '../navidrome/client.js';

const contentTypes = {
  '.opus': 'audio/ogg',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.flac': 'audio/flac'
};

function youtubeId(id) {
  return String(id || '').startsWith('yt:') ? String(id).slice(3) : '';
}

function parseRange(rangeHeader, size) {
  const match = String(rangeHeader || '').match(/^bytes=(\d*)-(\d*)$/);
  if (!match) return null;

  let start = match[1] === '' ? null : Number.parseInt(match[1], 10);
  let end = match[2] === '' ? null : Number.parseInt(match[2], 10);

  if (start === null && end === null) return null;
  if (start === null) {
    const suffixLength = end;
    start = Math.max(size - suffixLength, 0);
    end = size - 1;
  } else {
    end = end === null ? size - 1 : Math.min(end, size - 1);
  }

  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || start >= size) {
    return { invalid: true };
  }

  return { start, end };
}

function sendAudioFile(request, reply, audioPath) {
  const ext = path.extname(audioPath).toLowerCase();
  const stat = fs.statSync(audioPath);
  const contentType = contentTypes[ext] || 'application/octet-stream';
  const range = parseRange(request.headers.range, stat.size);

  reply.header('content-type', contentType);
  reply.header('accept-ranges', 'bytes');

  if (range?.invalid) {
    reply.code(416);
    reply.header('content-range', `bytes */${stat.size}`);
    return reply.send();
  }

  if (range) {
    const chunkSize = range.end - range.start + 1;
    reply.code(206);
    reply.header('content-length', chunkSize);
    reply.header('content-range', `bytes ${range.start}-${range.end}/${stat.size}`);
    return reply.send(fs.createReadStream(audioPath, { start: range.start, end: range.end }));
  }

  reply.header('content-length', stat.size);
  return reply.send(fs.createReadStream(audioPath));
}

export async function stream(request, reply) {
  const videoId = youtubeId(request.query.id);
  if (!videoId) return proxyToNavidrome(request, reply);

  try {
    const organized = await getOrCreateYoutubeTrack(videoId, request);
    return sendAudioFile(request, reply, organized.path);
  } catch (error) {
    request.log.error({ error, videoId }, 'failed to stream youtube track');
    reply.code(503);
    return reply.send({ error: 'youtube_download_failed', message: error.message });
  }
}
