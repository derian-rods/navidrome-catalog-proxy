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
  return { virtualTracks, organizedTracks, downloadJobs };
}
