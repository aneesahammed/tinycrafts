import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import { SQLITE_RUNTIME_LOAD_ERROR } from './protocol';
import type { Catalog, CatalogColumn, CatalogDetails, CatalogForeignKey, CatalogIndex, CatalogLimit, CatalogTable, CatalogWarning, QueryValue, WorkerRequest, WorkerResponse } from './protocol';

let db: any = null;
let sqlite3Runtime: any = null;
let dbBufferPointer: number | undefined;
let currentEpoch = 0;
let queryDeadline = 0;

const MAX_DATABASE_BYTES = 512 * 1024 * 1024;
const MAX_QUERY_BYTES = 1 * 1024 * 1024;
const MAX_RESULT_ROWS = 1000;
const MAX_RESULT_COLUMNS = 250;
const MAX_RESULT_CELLS = 50_000;
const MAX_RESULT_BYTES = 8 * 1024 * 1024;
const MAX_TEXT_PREVIEW_BYTES = 64 * 1024;
const MAX_BLOB_PREVIEW_BYTES = 256;
const QUERY_DEADLINE_MS = 30_000;
const MAX_TABLES = 5_000;
const MAX_COLUMNS = 50_000;
const MAX_INDEXES = 5_000;
const MAX_FOREIGN_KEYS = 2_000;
const MAX_CATALOG_TEXT_BYTES = 16 * 1024;
const MAX_CATALOG_IDENTIFIER_BYTES = 64 * 1024;
const VIRTUAL_SHADOW_SUFFIXES = new Set(['config', 'content', 'data', 'docsize', 'idx', 'node', 'parent', 'rowid', 'segdir', 'segments', 'stat']);

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  try {
    if (request.type === 'open') {
      if (request.bytes.byteLength > MAX_DATABASE_BYTES) {
        throw new Error('That database is larger than the 512 MB browser-safe limit.');
      }
      const sqlite3 = sqlite3Runtime ?? (sqlite3Runtime = await initializeSqliteRuntime());
      disposeDatabase(sqlite3);
      currentEpoch = request.epoch;
      db = new sqlite3.oo1.DB(':memory:');
      const bytes = new Uint8Array(request.bytes);
      dbBufferPointer = sqlite3.wasm.allocFromTypedArray(bytes);
      const resultCode = sqlite3.capi.sqlite3_deserialize(
        db.pointer,
        'main',
        dbBufferPointer,
        bytes.byteLength,
        bytes.byteLength,
        sqlite3.capi.SQLITE_DESERIALIZE_READONLY,
      );
      if (resultCode !== sqlite3.capi.SQLITE_OK) {
        throw new Error(`SQLite could not open that database (code ${resultCode}).`);
      }
      configureReadOnly(sqlite3);
      configureProgressHandler(sqlite3);
      const catalog = readCatalog();
      sqlite3.capi.sqlite3_limit(db.pointer, sqlite3.capi.SQLITE_LIMIT_COLUMN, MAX_RESULT_COLUMNS);
      post({ type: 'ready', requestId: request.requestId, epoch: request.epoch, fileName: request.fileName, tableCount: catalog.tables.filter((table) => (table.kind === 'table' || table.kind === 'virtual') && !table.internal).length, catalog });
      return;
    }

    if (request.epoch !== currentEpoch) throw new Error('That database session is no longer active.');
    if (!db) throw new Error('Open a SQLite database before running a query.');
    if (request.type === 'details') {
      const details = readCatalogDetails(request.tableName);
      post({ type: 'details', requestId: request.requestId, epoch: request.epoch, details });
      return;
    }
    const trimmed = request.sql.trim();
    if (!trimmed) throw new Error('Enter a SQL query first.');
    if (new TextEncoder().encode(trimmed).byteLength > MAX_QUERY_BYTES) {
      throw new Error('That query is larger than the 1 MB limit.');
    }
    if (!/^select\b/i.test(trimmed) && !/^with\b/i.test(trimmed) && !/^explain\s+query\s+plan\s+(?:select|with)\b/i.test(trimmed)) {
      throw new Error('SeeQLite is read-only. Start with SELECT or WITH.');
    }
    assertSingleStatement(sqlite3Runtime, trimmed);
    const stmt = db.prepare(trimmed);
    try {
      if (sqlite3Runtime.capi.sqlite3_bind_parameter_count(stmt.pointer) > 0) {
        throw new Error('Bind parameters are not supported; use literal values in this local editor.');
      }
      if (!sqlite3Runtime.capi.sqlite3_stmt_readonly(stmt.pointer)) {
        throw new Error('SeeQLite is read-only. That statement would change the database.');
      }
      const columns = stmt.getColumnNames().map((name: string) => ({ name }));
      if (columns.length > MAX_RESULT_COLUMNS) throw new Error('That result exceeds the 250-column browser limit.');
      const rows: QueryValue[][] = [];
      let truncated = false;
      let truncationReason: 'row-limit' | 'cell-limit' | 'byte-limit' | undefined;
      let resultBytes = 0;
      queryDeadline = Date.now() + QUERY_DEADLINE_MS;
      while (stmt.step()) {
        if (rows.length === MAX_RESULT_ROWS) {
          truncated = true;
          truncationReason = 'row-limit';
          break;
        }
        if ((rows.length + 1) * columns.length > MAX_RESULT_CELLS) {
          truncated = true;
          truncationReason = 'cell-limit';
          break;
        }
        const row = stmt.get([]).map(normalizeValue);
        const rowBytes = row.reduce((total: number, value: QueryValue) => total + estimateValueBytes(value), 0);
        if (resultBytes + rowBytes > MAX_RESULT_BYTES) {
          truncated = true;
          truncationReason = 'byte-limit';
          break;
        }
        rows.push(row);
        resultBytes += rowBytes;
      }
      post({ type: 'result', requestId: request.requestId, epoch: request.epoch, result: { columns, rows, returnedRows: rows.length, truncated, ...(truncationReason ? { truncationReason } : {}) } });
    } finally {
      queryDeadline = 0;
      stmt.finalize();
    }
  } catch (error) {
    if (request.type === 'open' && sqlite3Runtime) disposeDatabase(sqlite3Runtime);
    post({ type: 'error', requestId: request.requestId, epoch: request.epoch, code: 'SQLITE_ERROR', message: toUserError(error, request.type) });
  }
};

async function initializeSqliteRuntime() {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await sqlite3InitModule();
    } catch {
      // A content-length mismatch is transient and safe to retry before any DB exists.
    }
  }
  throw new Error(SQLITE_RUNTIME_LOAD_ERROR);
}

function configureReadOnly(sqlite3: any) {
  if (!db) throw new Error('SQLite database is not open.');
  const capi = sqlite3.capi;
  const resultCode = capi.sqlite3_set_authorizer(db.pointer, readOnlyAuthorizer, 0);
  if (resultCode !== capi.SQLITE_OK) throw new Error('SQLite could not apply its read-only policy.');
  const limits: Array<[number, number]> = [
    [capi.SQLITE_LIMIT_SQL_LENGTH, MAX_QUERY_BYTES],
    [capi.SQLITE_LIMIT_COMPOUND_SELECT, 64],
    [capi.SQLITE_LIMIT_EXPR_DEPTH, 1000],
    [capi.SQLITE_LIMIT_FUNCTION_ARG, 100],
    [capi.SQLITE_LIMIT_ATTACHED, 0],
    [capi.SQLITE_LIMIT_TRIGGER_DEPTH, 0],
    [capi.SQLITE_LIMIT_WORKER_THREADS, 0],
  ];
  for (const [category, value] of limits) capi.sqlite3_limit(db.pointer, category, value);
}

function configureProgressHandler(sqlite3: any) {
  if (!db) throw new Error('SQLite database is not open.');
  sqlite3.capi.sqlite3_progress_handler(db.pointer, 10_000, queryProgressHandler, 0);
}

function queryProgressHandler(_cbArg: number) {
  return queryDeadline > 0 && Date.now() >= queryDeadline ? 1 : 0;
}

function readOnlyAuthorizer(_cbArg: number, actionCode: number, arg1: string | 0, arg2: string | 0) {
  if (!sqlite3Runtime) return 1;
  const capi = sqlite3Runtime.capi;
  if (actionCode === capi.SQLITE_READ || actionCode === capi.SQLITE_SELECT || actionCode === capi.SQLITE_RECURSIVE) return capi.SQLITE_OK;
  if (actionCode === capi.SQLITE_FUNCTION) {
    const functionName = `${arg1 || ''} ${arg2 || ''}`.toLowerCase();
    return functionName.includes('load_extension') ? capi.SQLITE_DENY : capi.SQLITE_OK;
  }
  if (actionCode === capi.SQLITE_PRAGMA) {
    const pragmaName = String(arg1 || '').toLowerCase();
    return ['table_list', 'table_xinfo', 'index_list', 'index_info', 'index_xinfo', 'foreign_key_list'].includes(pragmaName)
      ? capi.SQLITE_OK
      : capi.SQLITE_DENY;
  }
  return capi.SQLITE_DENY;
}

function toUserError(error: unknown, requestType: WorkerRequest['type']) {
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  const resultCode = typeof error === 'object' && error !== null && 'resultCode' in error
    ? Number((error as { resultCode?: unknown }).resultCode)
    : undefined;
  if (requestType === 'open') {
    if (message.includes('sqlite runtime download was interrupted')) return SQLITE_RUNTIME_LOAD_ERROR;
    if (message.includes('too many tables') || message.includes('too many columns') || message.includes('too many indexes') || message.includes('too many relationships')) {
      return error instanceof Error ? error.message : 'That database exceeds the browser catalog limit.';
    }
    return 'That file could not be opened as a SQLite database.';
  }
  if (requestType === 'details') {
    if (message.includes('no longer available')) return 'That object is no longer available in the current database.';
    if (message.includes('limit') || message.includes('too many')) return 'That object has too much metadata for the browser detail limit.';
    return 'This object’s index details could not be loaded.';
  }
  if (message.includes('one read-only statement')) return 'Run one read-only statement at a time.';
  if (message.includes('bind parameters are not supported')) return 'Bind parameters are not supported; use literal values in this local editor.';
  if (resultCode === sqlite3Runtime?.capi.SQLITE_AUTH) return 'That statement was rejected by SeeQLite’s read-only policy.';
  if (resultCode === sqlite3Runtime?.capi.SQLITE_INTERRUPT) return 'That query exceeded SeeQLite’s 30-second safety deadline.';
  if (message.includes('one read-only statement') || message.includes('start with select') || message.includes('read-only') || message.includes('not authorized') || message.includes('readonly')) {
    return 'That statement was rejected by SeeQLite’s read-only policy.';
  }
  if (message.includes('larger than') || message.includes('limit') || message.includes('too many')) {
    return 'That request exceeded a browser safety limit.';
  }
  return 'SQLite could not run that query.';
}

function normalizeValue(value: unknown): QueryValue {
  if (value instanceof Uint8Array) {
    const previewBytes = Math.min(value.byteLength, MAX_BLOB_PREVIEW_BYTES);
    const preview = Array.from(value.slice(0, previewBytes), (byte) => byte.toString(16).padStart(2, '0')).join(' ');
    return { kind: 'blob', bytes: value.byteLength, preview, previewBytes, truncated: value.byteLength > previewBytes };
  }
  if (typeof value === 'string') {
    const bytes = new TextEncoder().encode(value);
    if (bytes.byteLength <= MAX_TEXT_PREVIEW_BYTES) return value;
    return { kind: 'text', value: new TextDecoder().decode(bytes.slice(0, MAX_TEXT_PREVIEW_BYTES)), bytes: bytes.byteLength, truncated: true };
  }
  return value as QueryValue;
}

function estimateValueBytes(value: QueryValue) {
  if (value === null) return 0;
  if (typeof value === 'string') return new TextEncoder().encode(value).byteLength;
  if (typeof value === 'bigint' || typeof value === 'number') return 8;
  if (value.kind === 'text') return value.value.length + 16;
  return value.previewBytes + 16;
}

function readCatalog(): Catalog {
  const tables: CatalogTable[] = [];
  const foreignKeys: CatalogForeignKey[] = [];
  const limits: CatalogLimit[] = [];
  const schemaSqlByName = new Map(selectRows("SELECT name, sql FROM sqlite_schema WHERE type IN ('table', 'view')").map((row) => [String(row[0]), row[1] == null ? null : boundCatalogText(String(row[1]))]));
  const objects = selectRows('PRAGMA table_list')
    .filter((row) => String(row[0] ?? '') === 'main')
    .filter((row) => ['table', 'view', 'virtual', 'shadow'].includes(String(row[2] ?? '')))
    .sort((left, right) => {
      const leftInternal = String(left[1] ?? '').startsWith('sqlite_') || String(left[2] ?? '') === 'shadow';
      const rightInternal = String(right[1] ?? '').startsWith('sqlite_') || String(right[2] ?? '') === 'shadow';
      return Number(leftInternal) - Number(rightInternal) || String(left[1] ?? '').localeCompare(String(right[1] ?? ''), undefined, { sensitivity: 'base' });
    });
  const virtualPrefixes = new Set(
    objects
      .filter((row) => String(row[2] ?? '') === 'virtual')
      .map((row) => String(row[1] ?? '')),
  );
  if (objects.length > MAX_TABLES) limits.push({ kind: 'objects', limit: MAX_TABLES });
  let columnCount = 0;
  let columnBudgetReached = false;
  let relationshipBudgetReached = false;

  for (const row of objects.slice(0, MAX_TABLES)) {
    const rawName = row[1];
    const rawKind = row[2];
    const name = String(rawName);
    const shadowByVirtualPrefix = [...virtualPrefixes].some((prefix) => {
      if (!prefix || !name.startsWith(`${prefix}_`)) return false;
      return VIRTUAL_SHADOW_SUFFIXES.has(name.slice(prefix.length + 1));
    });
    const kind = rawKind === 'view' ? 'view' : rawKind === 'virtual' ? 'virtual' : rawKind === 'shadow' || shadowByVirtualPrefix ? 'shadow' : 'table';
    const internal = name.startsWith('sqlite_') || kind === 'shadow';
    const warnings: CatalogWarning[] = [];
    let columns: CatalogColumn[] = [];
    if (columnBudgetReached) {
      warnings.push('columns-limited');
    } else {
      try {
        const nextColumns = selectRows(`PRAGMA table_xinfo(${quoteIdentifier(name)})`).map((row) => ({
          name: String(row[1] ?? ''),
          type: String(row[2] ?? ''),
          notNull: Number(row[3] ?? 0) === 1,
          primaryKey: Number(row[5] ?? 0),
          defaultValue: row[4] == null ? null : boundCatalogText(String(row[4])),
          hidden: Number(row[6] ?? 0),
        }));
        if (columnCount + nextColumns.length > MAX_COLUMNS) {
          columnBudgetReached = true;
          limits.push({ kind: 'columns', limit: MAX_COLUMNS });
          warnings.push('columns-limited');
        } else {
          columns = nextColumns;
          columnCount += columns.length;
        }
      } catch {
        warnings.push('columns-unavailable');
      }
    }
    tables.push({ name, kind, internal, schemaSql: schemaSqlByName.get(name) ?? null, withoutRowid: Number(row[4] ?? 0) === 1, strict: Number(row[5] ?? 0) === 1, columns, indexes: [], ...(warnings.length ? { warnings } : {}) });

    if (kind === 'table' && !internal && !relationshipBudgetReached) {
      try {
        const grouped = new Map<number, CatalogForeignKey>();
        for (const row of selectRows(`PRAGMA foreign_key_list(${quoteIdentifier(name)})`)) {
          const id = Number(row[0] ?? 0);
          const existing = grouped.get(id) ?? { id, fromTable: name, fromColumns: [], toTable: String(row[2] ?? ''), toColumns: [], onUpdate: String(row[5] ?? 'NO ACTION'), onDelete: String(row[6] ?? 'NO ACTION'), match: String(row[7] ?? 'NONE') };
          existing.fromColumns.push(String(row[3] ?? ''));
          existing.toColumns.push(String(row[4] ?? ''));
          grouped.set(id, existing);
        }
        if (foreignKeys.length + grouped.size > MAX_FOREIGN_KEYS) {
          relationshipBudgetReached = true;
          limits.push({ kind: 'relationships', limit: MAX_FOREIGN_KEYS });
          warnings.push('foreign-keys-unavailable');
        } else {
          foreignKeys.push(...grouped.values());
        }
      } catch {
        warnings.push('foreign-keys-unavailable');
      }
    }
  }
  return { tables, foreignKeys, limits };
}

function readCatalogDetails(tableName: string): CatalogDetails {
  const name = String(tableName);
  if (new TextEncoder().encode(name).byteLength > MAX_CATALOG_IDENTIFIER_BYTES) throw new Error('That object name exceeds the browser detail limit.');
  const exists = selectRows('PRAGMA table_list').some((row) => String(row[0] ?? '') === 'main' && String(row[1] ?? '') === name);
  if (!exists) throw new Error('That object is no longer available in the current database.');
  const indexes = readTableIndexes(name);
  return { tableName: name, indexes };
}

function readTableIndexes(name: string): CatalogIndex[] {
  const indexesByName = new Map<string, CatalogIndex>();
  const definitions = new Map(selectRows(`SELECT name, sql FROM sqlite_schema WHERE type = 'index' AND tbl_name = ${quoteString(name)} ORDER BY name COLLATE NOCASE`).map((row) => [String(row[0] ?? ''), row[1] == null ? null : String(row[1])]));
  for (const row of selectRows(`PRAGMA index_list(${quoteIdentifier(name)})`)) {
    const indexName = String(row[1] ?? '');
    const predicate = indexPredicate(definitions.get(indexName) ?? null);
    indexesByName.set(indexName, {
      name: indexName,
      unique: Number(row[2] ?? 0) === 1,
      origin: row[3] === 'u' ? 'unique' : row[3] === 'pk' ? 'primary-key' : row[3] === 'c' ? 'created' : 'unknown',
      partial: Number(row[4] ?? 0) === 1 || predicate !== null,
      predicate,
      columns: readIndexColumns(indexName),
    });
  }
  for (const [indexName, sql] of definitions) {
    if (indexesByName.has(indexName)) continue;
    const predicate = indexPredicate(sql);
    indexesByName.set(indexName, {
      name: indexName,
      unique: /^\s*CREATE\s+UNIQUE\s+INDEX\b/i.test(sql ?? ''),
      origin: 'created',
      partial: predicate !== null,
      predicate,
      columns: readIndexColumns(indexName),
    });
  }
  const indexes = [...indexesByName.values()];
  if (indexes.length > MAX_INDEXES) throw new Error('That object has too many indexes for the browser detail limit.');
  return indexes;
}

function readIndexColumns(indexName: string) {
  return selectRows(`PRAGMA index_xinfo(${quoteIdentifier(indexName)})`)
    .filter((indexRow) => Number(indexRow[5] ?? 1) === 1)
    .sort((left, right) => Number(left[0]) - Number(right[0]))
    .map((indexRow) => ({ name: indexRow[2] == null ? null : String(indexRow[2]), expression: Number(indexRow[1] ?? 0) === -2 || indexRow[2] == null, descending: Number(indexRow[3] ?? 0) === 1 }));
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

function quoteString(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function indexPredicate(sql: string | null) {
  if (!sql) return null;
  const match = /\)\s*WHERE\s+([\s\S]*)$/i.exec(sql);
  if (!match) return null;
  const predicate = match[1].replace(/;\s*$/, '').trim();
  return predicate ? boundCatalogText(predicate) : null;
}

function boundCatalogText(value: string) {
  const bytes = new TextEncoder().encode(value);
  return bytes.byteLength <= MAX_CATALOG_TEXT_BYTES ? value : `${new TextDecoder().decode(bytes.slice(0, MAX_CATALOG_TEXT_BYTES))} …`;
}

function disposeDatabase(sqlite3: any) {
  db?.close();
  db = null;
  if (dbBufferPointer !== undefined) sqlite3.wasm.dealloc(dbBufferPointer);
  dbBufferPointer = undefined;
}

function assertSingleStatement(sqlite3: any, sql: string) {
  if (!db) throw new Error('SQLite database is not open.');
  const wasm = sqlite3.wasm;
  const capi = sqlite3.capi;
  const stack = wasm.scopedAllocPush();
  let statementPointer: number | bigint | undefined;
  try {
    const sqlByteLength = wasm.jstrlen(sql);
    const output = wasm.scopedAlloc(2 * wasm.ptr.size + sqlByteLength + 1);
    const statementOutput = output;
    const tailOutput = wasm.ptr.add(output, wasm.ptr.size);
    const sqlPointer = wasm.ptr.add(tailOutput, wasm.ptr.size);
    wasm.jstrcpy(sql, wasm.heap8(), sqlPointer, sqlByteLength, false);
    wasm.poke8(wasm.ptr.add(sqlPointer, sqlByteLength), 0);
    const resultCode = capi.sqlite3_prepare_v3(db.pointer, sqlPointer, sqlByteLength, 0, statementOutput, tailOutput);
    sqlite3.oo1.DB.checkRc(db, resultCode);
    statementPointer = wasm.peekPtr(statementOutput);
    const tailPointer = wasm.peekPtr(tailOutput);
    const tail = tailPointer ? wasm.cstrToJs(tailPointer) ?? '' : '';
    if (tail.trim()) throw new Error('Run one read-only statement at a time.');
  } finally {
    if (statementPointer) capi.sqlite3_finalize(statementPointer);
    wasm.scopedAllocPop(stack);
  }
}

function post(response: WorkerResponse) {
  self.postMessage(response);
}
