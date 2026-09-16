-- muse-friends relay schema (v0)

CREATE TABLE muses (
  id TEXT PRIMARY KEY,            -- speakable id, e.g. brave-otter-42
  name TEXT NOT NULL,             -- display name chosen by the human
  pubkey TEXT NOT NULL,           -- base64 raw ed25519 public key (32 bytes)
  public INTEGER NOT NULL DEFAULT 0,
  bio TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);

CREATE TABLE friendships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  a TEXT NOT NULL,                -- requester muse id
  b TEXT NOT NULL,                -- recipient muse id
  status TEXT NOT NULL,           -- pending | accepted | blocked
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(a, b)
);
CREATE INDEX idx_friendships_pair ON friendships(a, b);
CREATE INDEX idx_friendships_b ON friendships(b, status);

CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_id TEXT NOT NULL,
  to_id TEXT NOT NULL,
  body TEXT NOT NULL,
  ts INTEGER NOT NULL,
  nonce TEXT NOT NULL UNIQUE
);
CREATE INDEX idx_messages_to ON messages(to_id, ts);

-- replay protection for signed writes (nonces expire after 10 min)
CREATE TABLE nonces (
  nonce TEXT PRIMARY KEY,
  ts INTEGER NOT NULL
);
