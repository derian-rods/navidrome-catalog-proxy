import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

let db;

function getDbPath() {
  fs.mkdirSync(config.paths.dataDir, { recursive: true });
  return path.join(config.paths.dataDir, 'catalog.sqlite');
}

function migrate(database) {
  database.pragma('journal_mode = WAL');
  database.pragma('foreign_keys = ON');
  database.exec(`
    CREATE TABLE IF NOT EXISTS virtual_tracks (
      source TEXT NOT NULL,
      source_id TEXT NOT NULL,
      title TEXT NOT NULL,
      artist TEXT NOT NULL,
      album TEXT NOT NULL,
      duration INTEGER NOT NULL DEFAULT 0,
      url TEXT NOT NULL,
      thumbnail TEXT NOT NULL DEFAULT '',
      channel TEXT NOT NULL DEFAULT '',
      score INTEGER NOT NULL DEFAULT 0,
      badges_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (source, source_id)
    );

    CREATE TABLE IF NOT EXISTS organized_tracks (
      source TEXT NOT NULL,
      source_id TEXT NOT NULL,
      local_path TEXT NOT NULL,
      cover_path TEXT NOT NULL DEFAULT '',
      meta_json TEXT NOT NULL DEFAULT '{}',
      navidrome_id TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (source, source_id),
      FOREIGN KEY (source, source_id) REFERENCES virtual_tracks(source, source_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS download_jobs (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      source_id TEXT NOT NULL,
      status TEXT NOT NULL,
      error TEXT NOT NULL DEFAULT '',
      output_path TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS cleanup_candidates (
      source TEXT NOT NULL,
      source_id TEXT NOT NULL,
      original_path TEXT NOT NULL,
      quarantine_path TEXT NOT NULL DEFAULT '',
      reason TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'candidate',
      first_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      quarantined_at TEXT,
      restored_at TEXT,
      deleted_at TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (source, source_id)
    );
  `);
}

export function getDb() {
  if (!db) {
    db = new Database(getDbPath());
    migrate(db);
  }
  return db;
}

export function saveVirtualTracks(results) {
  const database = getDb();
  const statement = database.prepare(`
    INSERT INTO virtual_tracks (
      source, source_id, title, artist, album, duration, url, thumbnail, channel, score, badges_json, updated_at
    ) VALUES (
      @source, @sourceId, @title, @artist, @album, @duration, @url, @thumbnail, @channel, @score, @badgesJson, CURRENT_TIMESTAMP
    )
    ON CONFLICT(source, source_id) DO UPDATE SET
      title = excluded.title,
      artist = excluded.artist,
      album = excluded.album,
      duration = excluded.duration,
      url = excluded.url,
      thumbnail = excluded.thumbnail,
      channel = excluded.channel,
      score = excluded.score,
      badges_json = excluded.badges_json,
      updated_at = CURRENT_TIMESTAMP
  `);

  const insertMany = database.transaction(items => {
    for (const result of items) {
      statement.run({
        ...result,
        badgesJson: JSON.stringify(result.badges || [])
      });
    }
  });
  insertMany(results);
}

export function getVirtualTrack(source, sourceId) {
  const row = getDb().prepare(`
    SELECT * FROM virtual_tracks WHERE source = ? AND source_id = ?
  `).get(source, sourceId);
  if (!row) return null;
  return {
    id: `${row.source === 'youtube' ? 'yt' : row.source}:${row.source_id}`,
    source: row.source,
    sourceId: row.source_id,
    title: row.title,
    artist: row.artist,
    album: row.album,
    duration: row.duration,
    url: row.url,
    thumbnail: row.thumbnail,
    channel: row.channel,
    score: row.score,
    badges: JSON.parse(row.badges_json || '[]')
  };
}

export function saveOrganizedTrack(source, sourceId, organized) {
  getDb().prepare(`
    INSERT INTO organized_tracks (
      source, source_id, local_path, cover_path, meta_json, updated_at
    ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(source, source_id) DO UPDATE SET
      local_path = excluded.local_path,
      cover_path = excluded.cover_path,
      meta_json = excluded.meta_json,
      updated_at = CURRENT_TIMESTAMP
  `).run(source, sourceId, organized.path, organized.coverPath || '', JSON.stringify(organized.meta || {}));
}

export function getOrganizedTrack(source, sourceId) {
  const row = getDb().prepare(`
    SELECT * FROM organized_tracks WHERE source = ? AND source_id = ?
  `).get(source, sourceId);
  if (!row) return null;
  return {
    path: row.local_path,
    coverPath: row.cover_path,
    meta: JSON.parse(row.meta_json || '{}'),
    navidromeId: row.navidrome_id || ''
  };
}

export function getCatalogStats() {
  const database = getDb();
  const virtualTracks = database.prepare('SELECT COUNT(*) AS count FROM virtual_tracks').get().count;
  const organizedTracks = database.prepare('SELECT COUNT(*) AS count FROM organized_tracks').get().count;
  const downloadJobs = database.prepare('SELECT COUNT(*) AS count FROM download_jobs').get().count;
  const cleanupCandidates = database.prepare('SELECT COUNT(*) AS count FROM cleanup_candidates WHERE status != ?').get('deleted').count;
  return { virtualTracks, organizedTracks, downloadJobs, cleanupCandidates };
}

export function listCleanupCandidates(status = '') {
  const database = getDb();
  const sql = status
    ? 'SELECT * FROM cleanup_candidates WHERE status = ? ORDER BY first_seen_at ASC'
    : 'SELECT * FROM cleanup_candidates ORDER BY first_seen_at ASC';
  const rows = status ? database.prepare(sql).all(status) : database.prepare(sql).all();
  return rows.map(row => ({
    source: row.source,
    sourceId: row.source_id,
    originalPath: row.original_path,
    quarantinePath: row.quarantine_path,
    reason: row.reason,
    status: row.status,
    firstSeenAt: row.first_seen_at,
    quarantinedAt: row.quarantined_at,
    restoredAt: row.restored_at,
    deletedAt: row.deleted_at
  }));
}

export function insertCleanupCandidate(candidate) {
  getDb().prepare(`
    INSERT INTO cleanup_candidates (source, source_id, original_path, reason, updated_at)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(source, source_id) DO NOTHING
  `).run(candidate.source, candidate.sourceId, candidate.originalPath, candidate.reason);
}

export function getCleanupCandidate(source, sourceId) {
  const row = getDb().prepare(`
    SELECT * FROM cleanup_candidates WHERE source = ? AND source_id = ?
  `).get(source, sourceId);
  if (!row) return null;
  return {
    source: row.source,
    sourceId: row.source_id,
    originalPath: row.original_path,
    quarantinePath: row.quarantine_path,
    reason: row.reason,
    status: row.status,
    firstSeenAt: row.first_seen_at,
    quarantinedAt: row.quarantined_at,
    restoredAt: row.restored_at,
    deletedAt: row.deleted_at
  };
}

export function updateCleanupCandidate(source, sourceId, fields) {
  const allowed = ['quarantine_path', 'status', 'quarantined_at', 'restored_at', 'deleted_at'];
  const entries = Object.entries(fields).filter(([key]) => allowed.includes(key));
  if (entries.length === 0) return;
  const assignments = entries.map(([key]) => `${key} = ?`).join(', ');
  getDb().prepare(`
    UPDATE cleanup_candidates
    SET ${assignments}, updated_at = CURRENT_TIMESTAMP
    WHERE source = ? AND source_id = ?
  `).run(...entries.map(([, value]) => value), source, sourceId);
}

export function listOrganizedTracksForCleanup(minCreatedAt) {
  const rows = getDb().prepare(`
    SELECT ot.source, ot.source_id, ot.local_path, ot.created_at, vt.title, vt.artist, vt.album
    FROM organized_tracks ot
    LEFT JOIN virtual_tracks vt ON vt.source = ot.source AND vt.source_id = ot.source_id
    LEFT JOIN cleanup_candidates cc ON cc.source = ot.source AND cc.source_id = ot.source_id
    WHERE ot.created_at <= ? AND cc.source IS NULL
    ORDER BY ot.created_at ASC
  `).all(minCreatedAt);
  return rows.map(row => ({
    source: row.source,
    sourceId: row.source_id,
    localPath: row.local_path,
    createdAt: row.created_at,
    title: row.title || '',
    artist: row.artist || '',
    album: row.album || ''
  }));
}
