PRAGMA foreign_keys = OFF;
CREATE TABLE parent (part_a TEXT, part_b TEXT, PRIMARY KEY (part_a, part_b)) WITHOUT ROWID;
CREATE TABLE child (
  id INTEGER PRIMARY KEY,
  parent_a TEXT,
  parent_b TEXT,
  FOREIGN KEY (parent_a, parent_b) REFERENCES parent,
  FOREIGN KEY (parent_a, parent_b) REFERENCES parent
);
CREATE TABLE self_link (id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES self_link(id));
CREATE TABLE unresolved (id INTEGER PRIMARY KEY, missing_id INTEGER REFERENCES missing_parent(id));
