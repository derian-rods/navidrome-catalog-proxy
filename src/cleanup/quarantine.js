import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { safeJoin } from '../paths.js';
import {
  getCleanupCandidate,
  insertCleanupCandidate,
  listCleanupCandidates,
  listOrganizedTracksForCleanup,
  updateCleanupCandidate
} from '../db/index.js';

function isoDaysAgo(days) {
  const date = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return date.toISOString();
}

function nowIso() {
  return new Date().toISOString();
}

function quarantinePathFor(originalPath) {
  const relative = path.relative(config.paths.musicDir, originalPath);
  const safeRelative = relative.startsWith('..') || path.isAbsolute(relative)
    ? path.basename(originalPath)
    : relative;
  return safeJoin(config.cleanup.quarantineDir, safeRelative);
}

export function scanCleanupCandidates() {
  const cutoff = isoDaysAgo(config.cleanup.minLibraryAgeDays);
  const tracks = listOrganizedTracksForCleanup(cutoff);
  let inserted = 0;

  for (const track of tracks) {
    if (!fs.existsSync(track.localPath)) continue;
    insertCleanupCandidate({
      source: track.source,
      sourceId: track.sourceId,
      originalPath: track.localPath,
      reason: `proxy-downloaded track older than ${config.cleanup.minLibraryAgeDays} days`
    });
    inserted++;
  }

  return {
    scanned: tracks.length,
    inserted,
    dryRun: config.cleanup.dryRun,
    candidates: listCleanupCandidates('candidate')
  };
}

export function quarantineCandidate(source, sourceId) {
  const candidate = getCleanupCandidate(source, sourceId);
  if (!candidate) throw new Error('cleanup candidate not found');
  if (candidate.status === 'quarantined') return { candidate, changed: false };
  if (candidate.status !== 'candidate') throw new Error(`cannot quarantine candidate in status ${candidate.status}`);

  const target = quarantinePathFor(candidate.originalPath);
  if (config.cleanup.dryRun) {
    return { candidate: { ...candidate, quarantinePath: target }, changed: false, dryRun: true };
  }

  if (!fs.existsSync(candidate.originalPath)) throw new Error('original file does not exist');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.renameSync(candidate.originalPath, target);
  updateCleanupCandidate(source, sourceId, {
    quarantine_path: target,
    status: 'quarantined',
    quarantined_at: nowIso()
  });
  return { candidate: getCleanupCandidate(source, sourceId), changed: true, dryRun: false };
}

export function restoreCandidate(source, sourceId) {
  const candidate = getCleanupCandidate(source, sourceId);
  if (!candidate) throw new Error('cleanup candidate not found');
  if (candidate.status !== 'quarantined') throw new Error(`cannot restore candidate in status ${candidate.status}`);

  if (config.cleanup.dryRun) {
    return { candidate, changed: false, dryRun: true };
  }

  if (!fs.existsSync(candidate.quarantinePath)) throw new Error('quarantine file does not exist');
  fs.mkdirSync(path.dirname(candidate.originalPath), { recursive: true });
  fs.renameSync(candidate.quarantinePath, candidate.originalPath);
  updateCleanupCandidate(source, sourceId, {
    status: 'restored',
    restored_at: nowIso()
  });
  return { candidate: getCleanupCandidate(source, sourceId), changed: true, dryRun: false };
}

export function deleteExpiredQuarantine() {
  const cutoff = isoDaysAgo(config.cleanup.quarantineDays);
  const candidates = listCleanupCandidates('quarantined')
    .filter(candidate => candidate.quarantinedAt && candidate.quarantinedAt <= cutoff);
  const deleted = [];

  for (const candidate of candidates) {
    if (config.cleanup.dryRun) {
      deleted.push({ ...candidate, dryRun: true });
      continue;
    }
    if (fs.existsSync(candidate.quarantinePath)) {
      fs.unlinkSync(candidate.quarantinePath);
    }
    updateCleanupCandidate(candidate.source, candidate.sourceId, {
      status: 'deleted',
      deleted_at: nowIso()
    });
    deleted.push(getCleanupCandidate(candidate.source, candidate.sourceId));
  }

  return { scanned: candidates.length, deleted, dryRun: config.cleanup.dryRun };
}
