import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import type { Catalog, CatalogColumn, CatalogForeignKey, CatalogIndex, CatalogTable, QueryValue, WorkerRequest, WorkerResponse } from './protocol';

let db: any = null;
let sqlite3Runtime: any = null;
let dbBufferPointer: number | undefined;
let currentEpoch = 0;

const MAX_DATABASE_BYTES = 512 * 1024 * 1024;
const MAX_QUERY_BYTES = 1 * 1024 * 1024;
const MAX_RESULT_ROWS = 1000;

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  try {
    if (request.type === 'open') {
      if (request.bytes.byteLength > MAX_DATABASE_BYTES) {
        throw new Error('That database is larger than the 512 MB browser-safe limit.');
      }
      const sqlite3 = sqlite3Runtime ?? (sqlite3Runtime = await sqlite3InitModule());
      db?.close();
      if (dbBufferPointer !== undefined) sqlite3.wasm.dealloc(dbBufferPointer);
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
    if (!/^select\b/i.test(trimmed) && !/^with\b/i.test(trimmed)) {
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
    const indexes: CatalogIndex[] = selectRows(`PRAGMA index_list(${quoteIdentifier(name)})`).map((row) => ({
      name: String(row[1] ?? ''),
      unique: Boolean(row[2]),
      columns: selectRows(`PRAGMA index_info(${quoteIdentifier(String(row[1] ?? ''))})`)
        .sort((left, right) => Number(left[0]) - Number(right[0]))
        .map((indexRow) => String(indexRow[2] ?? ''))
        .filter(Boolean),
    }));
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

function post(response: WorkerResponse) {
  self.postMessage(response);
}
