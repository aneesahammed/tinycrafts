PRAGMA foreign_keys = ON;
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);
CREATE TABLE notes (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  body TEXT,
  payload BLOB,
  body_length INTEGER GENERATED ALWAYS AS (length(body)) STORED
);
CREATE INDEX notes_body_partial_idx ON notes(body) WHERE body IS NOT NULL;
CREATE INDEX users_email_lower_idx ON users(lower(email));
INSERT INTO users (email, created_at) VALUES ('ada@example.test', '1843-12-10');
INSERT INTO notes (user_id, body, payload) VALUES (1, 'first note', X'CAFE');
