import fs from 'node:fs';
import { getOrganizedTrack, getYoutubeResult, rememberOrganizedTrack } from '../catalog/memory.js';
import { getOrganizedTrack as getPersistedOrganizedTrack, getVirtualTrack, saveOrganizedTrack } from '../db/index.js';
import { triggerScanFromRequest } from '../navidrome/client.js';
import { downloadYoutubeAudio } from './downloader.js';
import { organizeDownloadedTrack } from './processor.js';

const inFlight = new Map();

async function organizeYoutubeTrack(videoId, request) {
  let organized = getOrganizedTrack(videoId) || getPersistedOrganizedTrack('youtube', videoId);
  if (organized && fs.existsSync(organized.path)) return organized;

  const downloadedPath = await downloadYoutubeAudio(videoId);
  const youtubeInfo = getYoutubeResult(videoId) || getVirtualTrack('youtube', videoId) || {
    title: videoId,
    channel: 'YouTube',
    thumbnail: ''
  };

  organized = await organizeDownloadedTrack(downloadedPath, youtubeInfo);
  rememberOrganizedTrack(videoId, organized);
  saveOrganizedTrack('youtube', videoId, organized);

  triggerScanFromRequest(request).catch(error => {
    request.log.warn({ error }, 'failed to trigger Navidrome scan');
  });

  return organized;
}

export async function getOrCreateYoutubeTrack(videoId, request) {
  const cached = getOrganizedTrack(videoId) || getPersistedOrganizedTrack('youtube', videoId);
  if (cached && fs.existsSync(cached.path)) return cached;

  if (!inFlight.has(videoId)) {
    const promise = organizeYoutubeTrack(videoId, request).finally(() => {
      inFlight.delete(videoId);
    });
    inFlight.set(videoId, promise);
  }

  return inFlight.get(videoId);
}
