import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import type { Catalog, CatalogColumn, CatalogForeignKey, CatalogIndex, CatalogTable, QueryValue, WorkerRequest, WorkerResponse } from './protocol';

let db: any = null;
let sqlite3Runtime: any = null;
let dbBufferPointer: number | undefined;
let currentEpoch = 0;

const MAX_DATABASE_BYTES = 512 * 1024 * 1024;
const MAX_QUERY_BYTES = 1 * 1024 * 1024;
const MAX_RESULT_ROWS = 1000;
const MAX_TABLES = 1000;
const MAX_COLUMNS = 20_000;
const MAX_INDEXES = 5_000;
const MAX_FOREIGN_KEYS = 2_000;

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  try {
    if (request.type === 'open') {
      if (request.bytes.byteLength > MAX_DATABASE_BYTES) {
        throw new Error('That database is larger than the 512 MB browser-safe limit.');
      }
      const sqlite3 = sqlite3Runtime ?? (sqlite3Runtime = await sqlite3InitModule());
      disposeDatabase(sqlite3);
      currentEpoch = request.epoch;
      db = new sqlite3.oo1.DB(':memory:');
      dbBufferPointer = sqlite3.wasm.allocFromTypedArray(request.bytes);
      const resultCode = sqlite3.capi.sqlite3_deserialize(
        db.pointer,
        'main',
        dbBufferPointer,
        request.bytes.byteLength,
        request.bytes.byteLength,
        sqlite3.capi.SQLITE_DESERIALIZE_READONLY,
      );
      if (resultCode !== sqlite3.capi.SQLITE_OK) {
        throw new Error(`SQLite could not open that database (code ${resultCode}).`);
      }
      const catalog = readCatalog();
      post({ type: 'ready', requestId: request.requestId, epoch: request.epoch, fileName: request.fileName, tableCount: catalog.tables.filter((table) => table.kind === 'table').length, catalog });
      return;
    }

    if (request.epoch !== currentEpoch) throw new Error('That database session is no longer active.');
    if (!db) throw new Error('Open a SQLite database before running a query.');
    const trimmed = request.sql.trim();
    if (!trimmed) throw new Error('Enter a SQL query first.');
    if (new TextEncoder().encode(trimmed).byteLength > MAX_QUERY_BYTES) {
      throw new Error('That query is larger than the 1 MB limit.');
    }
    if (hasMultipleStatements(trimmed)) throw new Error('Run one read-only statement at a time.');
    if (!/^select\b/i.test(trimmed) && !/^with\b/i.test(trimmed) && !/^explain\s+query\s+plan\s+(?:select|with)\b/i.test(trimmed)) {
      throw new Error('SeeQLite is read-only. Start with SELECT or WITH.');
    }
    const stmt = db.prepare(trimmed);
    try {
      if (!sqlite3Runtime.capi.sqlite3_stmt_readonly(stmt.pointer)) {
        throw new Error('SeeQLite is read-only. That statement would change the database.');
      }
      const columns = stmt.getColumnNames().map((name: string) => ({ name }));
      const rows: QueryValue[][] = [];
      let truncated = false;
      while (stmt.step()) {
        if (rows.length === MAX_RESULT_ROWS) {
          truncated = true;
          break;
        }
        rows.push(stmt.get([]).map(normalizeValue));
      }
      post({ type: 'result', requestId: request.requestId, epoch: request.epoch, result: { columns, rows, returnedRows: rows.length, truncated } });
    } finally {
      stmt.finalize();
    }
  } catch (error) {
    if (request.type === 'open' && sqlite3Runtime) disposeDatabase(sqlite3Runtime);
    post({ type: 'error', requestId: request.requestId, epoch: request.epoch, code: 'SQLITE_ERROR', message: error instanceof Error ? error.message : 'SQLite query failed.' });
  }
};

function normalizeValue(value: unknown): QueryValue {
  if (value instanceof Uint8Array) {
    const preview = Array.from(value.slice(0, 16), (byte) => byte.toString(16).padStart(2, '0')).join(' ');
    return { kind: 'blob', bytes: value.byteLength, preview };
  }
  return value as QueryValue;
}

function readCatalog(): Catalog {
  const tables: CatalogTable[] = [];
  const foreignKeys: CatalogForeignKey[] = [];
  const objects = selectRows("SELECT name, type FROM sqlite_schema WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%' ORDER BY name COLLATE NOCASE");
  if (objects.length > MAX_TABLES) throw new Error('This database has too many tables for the browser catalog limit.');
  let columnCount = 0;
  let indexCount = 0;

  for (const [rawName, rawKind] of objects) {
    const name = String(rawName);
    const kind = rawKind === 'view' ? 'view' : 'table';
    const columns: CatalogColumn[] = selectRows(`PRAGMA table_xinfo(${quoteIdentifier(name)})`)
      .filter((row) => Number(row[6] ?? 0) === 0)
      .map((row) => ({
        name: String(row[1] ?? ''),
        type: String(row[2] ?? ''),
        notNull: Boolean(row[3]),
        primaryKey: Number(row[5] ?? 0),
        defaultValue: row[4] == null ? null : String(row[4]),
      }));
    columnCount += columns.length;
    if (columnCount > MAX_COLUMNS) throw new Error('This database has too many columns for the browser catalog limit.');
    const indexes: CatalogIndex[] = selectRows(`PRAGMA index_list(${quoteIdentifier(name)})`).map((row) => ({
      name: String(row[1] ?? ''),
      unique: Boolean(row[2]),
      columns: selectRows(`PRAGMA index_info(${quoteIdentifier(String(row[1] ?? ''))})`)
        .sort((left, right) => Number(left[0]) - Number(right[0]))
        .map((indexRow) => String(indexRow[2] ?? ''))
        .filter(Boolean),
    }));
    indexCount += indexes.length;
    if (indexCount > MAX_INDEXES) throw new Error('This database has too many indexes for the browser catalog limit.');
    tables.push({ name, kind, columns, indexes });

    if (kind === 'table') {
      const grouped = new Map<number, CatalogForeignKey>();
      for (const row of selectRows(`PRAGMA foreign_key_list(${quoteIdentifier(name)})`)) {
        const id = Number(row[0] ?? 0);
        const existing = grouped.get(id) ?? { id, fromTable: name, fromColumns: [], toTable: String(row[2] ?? ''), toColumns: [] };
        existing.fromColumns.push(String(row[3] ?? ''));
        existing.toColumns.push(String(row[4] ?? ''));
        grouped.set(id, existing);
      }
      foreignKeys.push(...grouped.values());
      if (foreignKeys.length > MAX_FOREIGN_KEYS) throw new Error('This database has too many relationships for the browser catalog limit.');
    }
  }
  return { tables, foreignKeys };
}

function selectRows(sql: string): unknown[][] {
  if (!db) throw new Error('SQLite database is not open.');
  const statement = db.prepare(sql);
  try {
    const rows: unknown[][] = [];
    while (statement.step()) rows.push(statement.get([]));
    return rows;
  } finally {
    statement.finalize();
  }
}

function quoteIdentifier(identifier: string) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function disposeDatabase(sqlite3: any) {
  db?.close();
  db = null;
  if (dbBufferPointer !== undefined) sqlite3.wasm.dealloc(dbBufferPointer);
  dbBufferPointer = undefined;
}

function hasMultipleStatements(sql: string) {
  let quote: string | null = null;
  let lineComment = false;
  let blockComment = false;
  for (let index = 0; index < sql.length; index += 1) {
    const character = sql[index];
    const next = sql[index + 1];
    if (lineComment) {
      if (character === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (character === '*' && next === '/') { blockComment = false; index += 1; }
      continue;
    }
    if (!quote && character === '-' && next === '-') { lineComment = true; index += 1; continue; }
    if (!quote && character === '/' && next === '*') { blockComment = true; index += 1; continue; }
    if (quote) {
      if (character === quote && sql[index + 1] === quote) { index += 1; continue; }
      if (character === quote) quote = null;
      continue;
    }
    if (character === "'" || character === '"' || character === '`') { quote = character; continue; }
    if (character !== ';') continue;
    const rest = sql.slice(index + 1).replace(/(?:--[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/|\s)/g, '');
    if (rest.length > 0) return true;
  }
  return false;
}

function post(response: WorkerResponse) {
  self.postMessage(response);
}
