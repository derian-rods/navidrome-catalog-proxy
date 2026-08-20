import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function boolFromEnv(name, fallback = false) {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function intFromEnv(name, fallback) {
  const value = Number.parseInt(process.env[name] || '', 10);
  return Number.isFinite(value) ? value : fallback;
}

export const config = {
  rootDir,
  host: process.env.HOST || '127.0.0.1',
  port: intFromEnv('PORT', 4540),
  logLevel: process.env.LOG_LEVEL || 'info',
  navidrome: {
    url: process.env.NAVIDROME_URL || 'http://127.0.0.1:4533',
    user: process.env.NAVIDROME_USER || '',
    password: process.env.NAVIDROME_PASSWORD || ''
  },
  paths: {
    musicDir: process.env.MUSIC_DIR || '/opt/navidrome/music',
    downloadDir: process.env.DOWNLOAD_DIR || path.join(rootDir, 'downloads'),
    cacheDir: process.env.CACHE_DIR || path.join(rootDir, 'cache'),
    dataDir: process.env.DATA_DIR || path.join(rootDir, 'data')
  },
  tools: {
    ytdlp: process.env.YTDLP_PATH || 'yt-dlp',
    ffmpeg: process.env.FFMPEG_PATH || 'ffmpeg',
    ffprobe: process.env.FFPROBE_PATH || 'ffprobe'
  },
  audio: {
    format: process.env.AUDIO_FORMAT || 'opus',
    opusBitrate: process.env.OPUS_BITRATE || '128k',
    preferOriginalOpus: boolFromEnv('PREFER_ORIGINAL_OPUS', true)
  },
  youtube: {
    maxResults: intFromEnv('YOUTUBE_MAX_RESULTS', 10)
  },
  cleanup: {
    enabled: boolFromEnv('CLEANUP_ENABLED', false),
    dryRun: boolFromEnv('CLEANUP_DRY_RUN', true),
    maxPlayCount: intFromEnv('CLEANUP_MAX_PLAY_COUNT', 1),
    notPlayedDays: intFromEnv('CLEANUP_NOT_PLAYED_DAYS', 30),
    minLibraryAgeDays: intFromEnv('CLEANUP_MIN_LIBRARY_AGE_DAYS', 45),
    quarantineDays: intFromEnv('CLEANUP_QUARANTINE_DAYS', 30)
  }
};
