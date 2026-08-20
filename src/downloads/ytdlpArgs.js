import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

function writableCookiesFile() {
  if (!config.tools.ytdlpCookiesFile) return '';

  fs.mkdirSync(config.paths.cacheDir, { recursive: true });
  const target = path.join(config.paths.cacheDir, 'youtube-cookies-runtime.txt');

  const sourceStat = fs.statSync(config.tools.ytdlpCookiesFile);
  const targetStat = fs.existsSync(target) ? fs.statSync(target) : null;
  if (!targetStat || sourceStat.mtimeMs > targetStat.mtimeMs || targetStat.size === 0) {
    fs.copyFileSync(config.tools.ytdlpCookiesFile, target);
  }

  return target;
}

export function ytdlpAuthArgs() {
  const args = [];
  const cacheDir = path.join(config.paths.cacheDir, 'yt-dlp');
  fs.mkdirSync(cacheDir, { recursive: true });
  args.push('--cache-dir', cacheDir);

  const cookiesFile = writableCookiesFile();
  if (cookiesFile) {
    args.push('--cookies', cookiesFile);
  }
  if (config.tools.ytdlpJsRuntime) {
    args.push('--js-runtimes', config.tools.ytdlpJsRuntime);
  }
  if (config.tools.ytdlpRemoteComponents) {
    args.push('--remote-components', config.tools.ytdlpRemoteComponents);
  }
  return args;
}
