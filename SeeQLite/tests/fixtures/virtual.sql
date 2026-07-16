CREATE VIRTUAL TABLE documents USING fts5(title, body);
INSERT INTO documents (title, body) VALUES ('SQLite', 'A local database'), ('SeeQLite', 'A browser explorer');
