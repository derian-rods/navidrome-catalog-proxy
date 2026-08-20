import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { buildTrackPath, safeJoin, sanitizeFilename } from '../paths.js';
import { downloadCover, resolveMetadata } from '../catalog/metadata.js';

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    let stderr = '';
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `${command} exited with code ${code}`));
    });
  });
}

function extensionForFormat() {
  if (config.audio.format === 'opus') return 'opus';
  if (config.audio.format === 'mp3') return 'mp3';
  if (config.audio.format === 'm4a') return 'm4a';
  return config.audio.format;
}

function availablePath(targetPath) {
  if (!fs.existsSync(targetPath)) return targetPath;
  const dir = path.dirname(targetPath);
  const ext = path.extname(targetPath);
  const base = path.basename(targetPath, ext);
  let i = 2;
  let candidate;
  do {
    candidate = path.join(dir, `${base} (${i})${ext}`);
    i++;
  } while (fs.existsSync(candidate));
  return candidate;
}

async function writeCover(albumDir, meta) {
  const cover = await downloadCover(meta);
  if (!cover) return '';

  fs.mkdirSync(albumDir, { recursive: true });
  const rawCover = safeJoin(config.paths.cacheDir, `${sanitizeFilename(meta.artist)} - ${sanitizeFilename(meta.album)}.jpg`);
  fs.mkdirSync(path.dirname(rawCover), { recursive: true });
  fs.writeFileSync(rawCover, cover);

  const coverPath = path.join(albumDir, 'cover.jpg');
  await run(config.tools.ffmpeg, [
    '-y',
    '-i', rawCover,
    '-vf', 'scale=500:-1:flags=lanczos',
    '-q:v', '6',
    '-frames:v', '1',
    coverPath
  ]).catch(() => fs.copyFileSync(rawCover, coverPath));

  return coverPath;
}

export async function organizeDownloadedTrack(inputPath, youtubeInfo = {}) {
  const meta = await resolveMetadata(youtubeInfo);
  const ext = extensionForFormat();
  const targetPath = availablePath(buildTrackPath(config.paths.musicDir, meta, ext));
  const albumDir = path.dirname(targetPath);
  const tempPath = `${targetPath}.tmp.${ext}`;

  fs.mkdirSync(albumDir, { recursive: true });
  const coverPath = await writeCover(albumDir, meta);

  const args = [
    '-y',
    '-i', inputPath,
    '-map_metadata', '-1',
    '-map', '0:a:0',
    '-metadata', `title=${meta.title}`,
    '-metadata', `artist=${meta.artist}`,
    '-metadata', `album=${meta.album}`,
    '-metadata', `date=${meta.year || ''}`,
    '-metadata', `genre=${meta.genre || 'Music'}`,
    '-metadata', `track=${meta.track || 1}`,
    '-metadata', `albumartist=${meta.albumArtist || meta.artist}`
  ];

  if (ext === 'opus') {
    args.push('-c:a', 'libopus', '-b:a', config.audio.opusBitrate, '-vbr', 'on', tempPath);
  } else if (ext === 'mp3') {
    args.push('-c:a', 'libmp3lame', '-q:a', '2', tempPath);
  } else {
    args.push('-c:a', 'copy', tempPath);
  }

  await run(config.tools.ffmpeg, args);
  fs.renameSync(tempPath, targetPath);

  return { path: targetPath, coverPath, meta };
}
