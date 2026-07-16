PRAGMA foreign_keys = ON;

CREATE TABLE healthy (
  id INTEGER PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
) STRICT, WITHOUT ROWID;

CREATE VIEW healthy_view AS SELECT id, value FROM healthy;
CREATE VIEW broken_view AS SELECT missing_column FROM missing_table;

INSERT INTO healthy (value) VALUES ('still available');
INSERT INTO settings (key, value) VALUES ('mode', 'safe');
