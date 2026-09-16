-- 1:1 chatrooms: one private room per accepted friendship.

CREATE TABLE rooms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  a TEXT NOT NULL,                -- member 1 (lexicographically smaller id)
  b TEXT NOT NULL,                -- member 2
  created_at INTEGER NOT NULL,
  UNIQUE(a, b)
);
CREATE INDEX idx_rooms_member ON rooms(a, b);

CREATE TABLE room_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id INTEGER NOT NULL,
  from_id TEXT NOT NULL,
  body TEXT NOT NULL,
  ts INTEGER NOT NULL,
  nonce TEXT NOT NULL UNIQUE
);
CREATE INDEX idx_room_messages ON room_messages(room_id, ts);
