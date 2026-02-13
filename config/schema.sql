-- Notion2Wordpress SQLite schema
-- Created : 2025-10-28
-- Updated : 2026-02-10


PRAGMA foreign_keys = ON;

BEGIN TRANSACTION;

-- 1) jobs: top-level job runs
CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_type TEXT NOT NULL CHECK(job_type IN ('scheduled', 'manual')),
  status TEXT NOT NULL CHECK(status IN ('running', 'completed', 'failed')),
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  error_message TEXT,
  pages_processed INTEGER NOT NULL DEFAULT 0,
  pages_succeeded INTEGER NOT NULL DEFAULT 0,
  pages_failed INTEGER NOT NULL DEFAULT 0,
  last_sync_timestamp TEXT
);

CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_started_at ON jobs(started_at);

-- 2) pages: per-page attempts within a job
CREATE TABLE IF NOT EXISTS pages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL,
  notion_page_id TEXT NOT NULL,
  wp_post_id INTEGER,
  status TEXT NOT NULL CHECK(status IN ('pending', 'success', 'failed')),
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_pages_job_id ON pages(job_id);
CREATE INDEX IF NOT EXISTS idx_pages_notion_page_id ON pages(notion_page_id);

-- 3) image_assets: images discovered during a sync attempt
CREATE TABLE IF NOT EXISTS image_assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  page_id INTEGER NOT NULL,
  notion_page_id TEXT NOT NULL,
  notion_block_id TEXT NOT NULL,
  notion_url TEXT NOT NULL,
  wp_media_id INTEGER,
  wp_media_url TEXT,
  status TEXT NOT NULL CHECK(status IN ('pending', 'uploaded', 'failed')),
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_image_assets_page_id ON image_assets(page_id);
CREATE INDEX IF NOT EXISTS idx_image_assets_notion_block_id ON image_assets(notion_block_id);

-- 4) npage_post_map: final mapping, created only after successful sync
CREATE TABLE IF NOT EXISTS npage_post_map (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  notion_page_id TEXT NOT NULL UNIQUE,
  wp_post_id INTEGER NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_npage_post_map_notion_page_id ON npage_post_map(notion_page_id);
CREATE INDEX IF NOT EXISTS idx_npage_post_map_wp_post_id ON npage_post_map(wp_post_id);

COMMIT;
