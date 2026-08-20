import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { ytdlpAuthArgs } from './ytdlpArgs.js';

const extensionByFormat = {
  opus: 'opus',
  mp3: 'mp3',
  m4a: 'm4a'
};

function ensureDownloadDir() {
  fs.mkdirSync(config.paths.downloadDir, { recursive: true });
}

function expectedPath(videoId) {
  const ext = extensionByFormat[config.audio.format] || config.audio.format;
  return path.join(config.paths.downloadDir, `${videoId}.${ext}`);
}

function runYtDlp(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(config.tools.ytdlp, args, { windowsHide: true });
    let stderr = '';

    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `yt-dlp exited with code ${code}`));
    });
  });
}

export async function downloadYoutubeAudio(videoId) {
  ensureDownloadDir();
  const outputPath = expectedPath(videoId);
  if (fs.existsSync(outputPath)) return outputPath;

  const url = `https://www.youtube.com/watch?v=${videoId}`;
  const outputTemplate = path.join(config.paths.downloadDir, `${videoId}.%(ext)s`);

  await runYtDlp([
    ...ytdlpAuthArgs(),
    '--no-playlist',
    '--extract-audio',
    '--audio-format', config.audio.format,
    '--audio-quality', config.audio.opusBitrate,
    '--output', outputTemplate,
    url
  ]);

  if (!fs.existsSync(outputPath)) {
    const candidates = fs.readdirSync(config.paths.downloadDir)
      .filter(file => file.startsWith(`${videoId}.`))
      .map(file => path.join(config.paths.downloadDir, file));
    if (candidates.length > 0) return candidates[0];
    throw new Error(`Download finished but output file was not found for ${videoId}`);
  }

  return outputPath;
}
