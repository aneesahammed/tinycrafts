import { registerFile, unregisterFile, query } from './engine.js';
import { sanitizeTableName, uniqueTableName } from './sanitize.js';
import { profileFile } from './profile.js';
import { summarizeTable } from './summarize.js';
import { quoteIdentifier, quoteString } from '../util/sql-quote.js';
import { recordRecent } from '../state/recents.js';

const PARQUET_EXT = /\.(parquet|parq)$/i;

export function looksLikeParquet(file) {
  return PARQUET_EXT.test(file.name);
}

function virtualNameFor(originalName) {
  const safe = originalName.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+/, '') || 'data.parquet';
  const id = crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `parqview_${id}_${safe}`;
}

export async function openFileInto(store, file) {
  if (!looksLikeParquet(file)) throw new Error(`${file.name} is not a .parquet or .parq file.`);

  const taken = new Set(store.state.files.keys());
  const tableName = uniqueTableName(sanitizeTableName(file.name), taken);
  const virtualName = virtualNameFor(file.name);

  await registerFile(virtualName, file);
  await query(
    `CREATE OR REPLACE VIEW ${quoteIdentifier(tableName)} AS SELECT * FROM read_parquet(${quoteString(virtualName)});`,
  );

  const profile = await profileFile(virtualName, tableName);

  let summary = new Map();
  try {
    summary = await summarizeTable(tableName);
  } catch (e) {
    console.warn('SUMMARIZE failed:', e);
  }

  store.addFile(tableName, { virtualName, file, size: file.size, profile, summary });
  await rebindLegacyAlias(store);
  await recordRecent({ name: file.name, size: file.size }).catch(() => {});
  return tableName;
}

export async function closeFile(store, tableName) {
  const record = store.state.files.get(tableName);
  if (!record) return;
  await query(`DROP VIEW IF EXISTS ${quoteIdentifier(tableName)};`).catch((e) => console.warn('drop view', e));
  await unregisterFile(record.virtualName);
  store.removeFile(tableName);
  await rebindLegacyAlias(store);
}

export async function setActiveFile(store, tableName) {
  store.setActive(tableName);
  await rebindLegacyAlias(store);
}

async function rebindLegacyAlias(store) {
  const active = store.state.activeTable;
  if (!active) {
    await query(`DROP VIEW IF EXISTS parquet_file;`).catch(() => {});
    return;
  }
  await query(`CREATE OR REPLACE VIEW parquet_file AS SELECT * FROM ${quoteIdentifier(active)};`).catch((e) =>
    console.warn('rebind parquet_file', e),
  );
}
