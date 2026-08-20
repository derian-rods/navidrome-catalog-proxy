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
    .map(item => {
      const ranked = rankYoutubeResult(item, query);
      return {
        id: youtubeVirtualId(item.id),
        source: 'youtube',
        sourceId: item.id,
        title: item.title || '',
        artist: item.channel || item.uploader || 'YouTube',
        album: 'YouTube',
        duration: item.duration || 0,
        url: item.url || item.webpage_url || `https://www.youtube.com/watch?v=${item.id}`,
        thumbnail: item.thumbnail || '',
        channel: item.channel || item.uploader || '',
        score: ranked.score,
        badges: ranked.badges
      };
    })
    .filter(item => allowLongForm || !item.duration || item.duration <= config.youtube.maxSongDurationSeconds)
    .sort((a, b) => b.score - a.score);

  const limited = results.slice(0, config.youtube.maxRemoteSongs);
  rememberYoutubeResults(limited);
  saveVirtualTracks(limited);
  return limited;
}
