PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS channels (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  thumbnail_url TEXT,
  connected_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS youtube_connections (
  channel_id TEXT PRIMARY KEY REFERENCES channels(id) ON DELETE CASCADE,
  access_token_enc TEXT NOT NULL,
  refresh_token_enc TEXT,
  token_type TEXT,
  scope TEXT,
  expires_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS oauth_states (
  state TEXT PRIMARY KEY,
  code_verifier TEXT NOT NULL,
  actor_email TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  used_at TEXT
);

CREATE TABLE IF NOT EXISTS videos (
  id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  thumbnail_url TEXT,
  published_at TEXT,
  episode_number INTEGER,
  knowledge_status TEXT NOT NULL DEFAULT 'not_linked',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_videos_published_at ON videos(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_videos_episode_number ON videos(episode_number);

CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  youtube_comment_id TEXT NOT NULL UNIQUE,
  video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  parent_comment_id TEXT,
  author_name TEXT NOT NULL,
  author_channel_id TEXT,
  author_avatar_url TEXT,
  text_display TEXT NOT NULL,
  text_original TEXT NOT NULL,
  like_count INTEGER NOT NULL DEFAULT 0,
  published_at TEXT,
  updated_at_youtube TEXT,
  is_channel_owner INTEGER NOT NULL DEFAULT 0 CHECK (is_channel_owner IN (0,1)),
  has_channel_reply INTEGER NOT NULL DEFAULT 0 CHECK (has_channel_reply IN (0,1)),
  category TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  last_synced_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_comments_video_status ON comments(video_id, status);
CREATE INDEX IF NOT EXISTS idx_comments_parent ON comments(parent_comment_id);
CREATE INDEX IF NOT EXISTS idx_comments_published_at ON comments(published_at DESC);

CREATE TABLE IF NOT EXISTS reply_proposals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  comment_id INTEGER NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  proposed_text TEXT NOT NULL,
  final_text TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  model_label TEXT,
  confidence REAL,
  rationale TEXT,
  knowledge_json TEXT,
  status TEXT NOT NULL DEFAULT 'proposed',
  created_by TEXT NOT NULL,
  reviewed_by TEXT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_proposals_comment ON reply_proposals(comment_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_proposals_status ON reply_proposals(status);

CREATE TABLE IF NOT EXISTS review_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  proposal_id INTEGER NOT NULL REFERENCES reply_proposals(id) ON DELETE CASCADE,
  comment_id INTEGER NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  proposed_text TEXT NOT NULL,
  final_text TEXT,
  reason TEXT,
  reviewer_email TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_review_actions_action ON review_actions(action, created_at DESC);

CREATE TABLE IF NOT EXISTS published_replies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  proposal_id INTEGER REFERENCES reply_proposals(id) ON DELETE SET NULL,
  comment_id INTEGER NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  youtube_reply_id TEXT,
  reply_text TEXT NOT NULL,
  publish_status TEXT NOT NULL,
  requested_by TEXT NOT NULL,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  published_at TEXT
);

CREATE TABLE IF NOT EXISTS style_examples (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  comment_id INTEGER REFERENCES comments(id) ON DELETE SET NULL,
  proposal_id INTEGER REFERENCES reply_proposals(id) ON DELETE SET NULL,
  signal TEXT NOT NULL,
  category TEXT,
  comment_text TEXT NOT NULL,
  proposed_text TEXT,
  final_text TEXT,
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_style_examples_signal ON style_examples(signal, created_at DESC);

CREATE TABLE IF NOT EXISTS style_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rule_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  evidence_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'suggested',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sync_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  result_json TEXT,
  error_message TEXT
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_email TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  payload_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_log(created_at DESC);
