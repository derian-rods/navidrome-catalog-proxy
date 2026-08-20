import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

export function resolveExecutable(command) {
  if (!command) return { command, available: false, path: '' };

  if (fs.existsSync(command)) {
    return { command, available: true, path: command };
  }

  const lookup = process.platform === 'win32' ? 'where.exe' : 'which';
  const result = spawnSync(lookup, [command], { encoding: 'utf8' });
  const found = result.status === 0
    ? result.stdout.split(/\r?\n/).map(line => line.trim()).find(Boolean)
    : '';

  return { command, available: Boolean(found), path: found || '' };
}

export function getToolReport(config) {
  return {
    ytdlp: resolveExecutable(config.tools.ytdlp),
    ffmpeg: resolveExecutable(config.tools.ffmpeg),
    ffprobe: resolveExecutable(config.tools.ffprobe)
  };
}
