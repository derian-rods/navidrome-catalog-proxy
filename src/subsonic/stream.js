import fs from 'node:fs';
import path from 'node:path';
import { downloadYoutubeAudio } from '../downloads/downloader.js';
import { organizeDownloadedTrack } from '../downloads/processor.js';
import { getOrganizedTrack, getYoutubeResult, rememberOrganizedTrack } from '../catalog/memory.js';
import { proxyToNavidrome, triggerScanFromRequest } from '../navidrome/client.js';

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

export async function stream(request, reply) {
  const videoId = youtubeId(request.query.id);
  if (!videoId) return proxyToNavidrome(request, reply);

  try {
    let organized = getOrganizedTrack(videoId);
    if (!organized || !fs.existsSync(organized.path)) {
      const downloadedPath = await downloadYoutubeAudio(videoId);
      const youtubeInfo = getYoutubeResult(videoId) || {
        title: videoId,
        channel: 'YouTube',
        thumbnail: ''
      };
      organized = await organizeDownloadedTrack(downloadedPath, youtubeInfo);
      rememberOrganizedTrack(videoId, organized);
      triggerScanFromRequest(request).catch(error => {
        request.log.warn({ error }, 'failed to trigger Navidrome scan');
      });
    }
    const audioPath = organized.path;
    const ext = path.extname(audioPath).toLowerCase();
    const stat = fs.statSync(audioPath);

    reply.header('content-type', contentTypes[ext] || 'application/octet-stream');
    reply.header('content-length', stat.size);
    reply.header('accept-ranges', 'bytes');
    return reply.send(fs.createReadStream(audioPath));
  } catch (error) {
    request.log.error({ error, videoId }, 'failed to stream youtube track');
    reply.code(503);
    return reply.send({ error: 'youtube_download_failed', message: error.message });
  }
}
