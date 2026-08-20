import { spawn } from 'node:child_process';
import { config } from '../config.js';
import { rememberYoutubeResults } from './memory.js';
import { rankYoutubeResult } from './ranker.js';
import { saveVirtualTracks } from '../db/index.js';

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
    '--dump-json',
    '--flat-playlist',
    '--no-warnings',
    search
  ]);

  const results = output
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => JSON.parse(line))
    .map(item => {
      const ranked = rankYoutubeResult(item, query);
      return {
        id: `yt:${item.id}`,
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
    .sort((a, b) => b.score - a.score);

  rememberYoutubeResults(results);
  saveVirtualTracks(results);
  return results;
}
