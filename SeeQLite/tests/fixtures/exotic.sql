CREATE VIRTUAL TABLE search4 USING fts4(title, body);
INSERT INTO search4 (title, body) VALUES ('SQLite', 'A local database');
CREATE VIRTUAL TABLE points USING rtree(id, min_x, max_x, min_y, max_y);
INSERT INTO points VALUES (1, 0, 1, 0, 1);
CREATE TABLE points_archive (id INTEGER);
