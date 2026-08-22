import { spawn } from 'node:child_process';
import { config } from '../config.js';
import { rememberYoutubeResults } from './memory.js';
import { rankYoutubeResult } from './ranker.js';
import { saveVirtualTracks } from '../db/index.js';
import { ytdlpAuthArgs } from '../downloads/ytdlpArgs.js';
import { youtubeVirtualId } from '../subsonic/virtual.js';

function runYtDlp(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(config.tools.ytdlp, args, { windowsHide: true });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', code => {
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr.trim() || `yt-dlp exited with code ${code}`));
    });
  });
}

function isYoutubeUrl(value) {
  return /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//i.test(String(value || '').trim());
}

export function looksLikeYoutubeUrl(value) {
  return isYoutubeUrl(value);
}

function toYoutubeResult(item, query = '') {
  const ranked = query ? rankYoutubeResult(item, query) : { score: 50, badges: [] };
  return {
    id: youtubeVirtualId(item.id),
    source: 'youtube',
    sourceId: item.id,
    title: item.title || '',
    artist: item.channel || item.uploader || item.playlist_uploader || 'YouTube',
    album: item.playlist_title || item.album || 'YouTube',
    duration: item.duration || 0,
    url: item.url?.startsWith('http') ? item.url : item.webpage_url || `https://www.youtube.com/watch?v=${item.id}`,
    thumbnail: item.thumbnail || '',
    channel: item.channel || item.uploader || '',
    score: ranked.score,
    badges: ranked.badges
  };
}

export async function searchYoutube(query) {
  const search = `ytsearch${config.youtube.maxResults}:${query}`;
  const output = await runYtDlp([
    ...ytdlpAuthArgs(),
    '--dump-json',
    '--flat-playlist',
    '--no-warnings',
    search
  ]);

  const allowLongForm = /ambient|meditation|meditaci[oó]n|sleep|relax|relajante|binaural|432hz|963hz/i.test(query);
  const results = output
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => JSON.parse(line))
    .map(item => toYoutubeResult(item, query))
    .filter(item => allowLongForm || !item.duration || item.duration <= config.youtube.maxSongDurationSeconds)
    .sort((a, b) => b.score - a.score);

  const limited = results.slice(0, config.youtube.maxRemoteSongs);
  rememberYoutubeResults(limited);
  saveVirtualTracks(limited);
  return limited;
}

export async function searchYoutubeCollections(query, limit = config.youtube.maxPlaylistResults) {
  const search = `ytsearch${limit}:${query} album playlist full album`;
  const output = await runYtDlp([
    ...ytdlpAuthArgs(),
    '--dump-json',
    '--flat-playlist',
    '--no-warnings',
    search
  ]);

  return output
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => JSON.parse(line))
    .filter(item => item?.id)
    .map(item => {
      const result = toYoutubeResult(item, query);
      return {
        ...result,
        type: item.ie_key === 'YoutubePlaylist' || String(item.url || '').includes('list=') ? 'playlist' : 'video',
        entryCount: item.playlist_count || item.n_entries || 0
      };
    })
    .slice(0, limit);
}

export async function previewYoutubeUrl(url) {
  if (!isYoutubeUrl(url)) throw new Error('only YouTube URLs are supported');
  const output = await runYtDlp([
    ...ytdlpAuthArgs(),
    '--dump-single-json',
    '--flat-playlist',
    '--no-warnings',
    url
  ]);
  const info = JSON.parse(output);
  const rawEntries = Array.isArray(info.entries) && info.entries.length > 0 ? info.entries : [info];
  const entries = rawEntries
    .filter(item => item?.id)
    .map(item => toYoutubeResult({
      ...item,
      playlist_title: info.title || item.playlist_title,
      playlist_uploader: info.uploader || item.playlist_uploader
    }))
    .slice(0, 100);

  rememberYoutubeResults(entries);
  saveVirtualTracks(entries);
  return {
    title: info.title || entries[0]?.title || 'YouTube',
    uploader: info.uploader || info.channel || '',
    url,
    count: entries.length,
    entries
  };
}
