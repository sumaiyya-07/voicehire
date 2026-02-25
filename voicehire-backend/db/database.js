// db/database.js
// Sets up SQLite database with all required tables on first run.
// Uses better-sqlite3 which is synchronous and needs zero configuration.

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'voicehire.db');

let db;

function getDB() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL'); // better performance
    db.pragma('foreign_keys = ON');
    initSchema();
  }
  return db;
}

function initSchema() {
  db.exec(`
    -- ─────────────────────────────────────────
    --  USERS TABLE
    -- ─────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS users (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT    NOT NULL,
      email       TEXT    NOT NULL UNIQUE,
      password    TEXT    NOT NULL,
      photo       TEXT,               -- base64 or URL
      created_at  TEXT    DEFAULT (datetime('now')),
      updated_at  TEXT    DEFAULT (datetime('now'))
    );

    -- ─────────────────────────────────────────
    --  INTERVIEWS TABLE
    -- ─────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS interviews (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      job_role        TEXT    NOT NULL,
      experience      TEXT,
      interview_type  TEXT    NOT NULL,   -- behavioral / technical / situational / mixed
      topic           TEXT,
      difficulty      TEXT    NOT NULL,   -- Easy / Medium / Hard / Expert
      num_questions   INTEGER NOT NULL,
      overall_score   INTEGER,
      grade           TEXT,
      status          TEXT    DEFAULT 'in_progress', -- in_progress / completed
      started_at      TEXT    DEFAULT (datetime('now')),
      completed_at    TEXT
    );

    -- ─────────────────────────────────────────
    --  QUESTIONS TABLE
    -- ─────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS questions (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      interview_id    INTEGER NOT NULL REFERENCES interviews(id) ON DELETE CASCADE,
      question_index  INTEGER NOT NULL,
      question_text   TEXT    NOT NULL
    );

    -- ─────────────────────────────────────────
    --  ANSWERS TABLE
    -- ─────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS answers (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      interview_id    INTEGER NOT NULL REFERENCES interviews(id) ON DELETE CASCADE,
      question_id     INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
      answer_text     TEXT    NOT NULL,
      score           INTEGER,
      positive        TEXT,
      improve         TEXT,
      brief           TEXT,
      answered_at     TEXT    DEFAULT (datetime('now'))
    );

    -- ─────────────────────────────────────────
    --  REPORTS TABLE
    -- ─────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS reports (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      interview_id      INTEGER NOT NULL UNIQUE REFERENCES interviews(id) ON DELETE CASCADE,
      overall_score     INTEGER,
      grade             TEXT,
      communication     INTEGER,
      relevance         INTEGER,
      confidence        INTEGER,
      structure         INTEGER,
      depth             INTEGER,
      strengths         TEXT,   -- JSON array stored as string
      improvements      TEXT,   -- JSON array stored as string
      recommendation    TEXT,
      generated_at      TEXT    DEFAULT (datetime('now'))
    );
  `);

  console.log('✅ Database schema initialized');
}

module.exports = { getDB };
