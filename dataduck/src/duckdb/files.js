import { registerFile, unregisterFile, query } from './engine.js';
import { sanitizeTableName, uniqueTableName } from './sanitize.js';
import { profileFile } from './profile.js';
import { summarizeTable } from './summarize.js';
import { quoteIdentifier } from '../util/sql-quote.js';
import { recordRecent } from '../state/recents.js';
import {
  deferredSummaryWarning,
  detectFileFormat,
  isSupportedFile,
  readerSql,
  shouldEagerSummarize,
} from './formats.js';
import { withNormalizedRowCount } from './profile-row-count.js';

export { isSupportedFile };

const RESERVED_TABLE_NAMES = new Set(['active_file', 'parquet_file']);

function virtualNameFor(originalName) {
  const safe = originalName.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+/, '') || 'data';
  const id = crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `dataduck_${id}_${safe}`;
}

export async function openFileInto(store, file, options = {}) {
  const format = detectFileFormat(file);
  if (!format) throw new Error(`${file.name} is not a supported file. Open .parquet, .parq, or .csv.`);

  const taken = new Set([...store.state.files.keys(), ...RESERVED_TABLE_NAMES]);
  const tableName = uniqueTableName(sanitizeTableName(file.name), taken);
  const virtualName = virtualNameFor(file.name);
  let registered = false;
  let viewCreated = false;

  try {
    await registerFile(virtualName, file);
    registered = true;
    await query(
      `CREATE OR REPLACE VIEW ${quoteIdentifier(tableName)} AS SELECT * FROM ${readerSql(format.id, virtualName, options)};`,
    );
    viewCreated = true;

    let profile = await profileFile(virtualName, tableName, format);

    let summary = new Map();
    let summaryStatus = 'ready';
    const warnings = [];
    if (shouldEagerSummarize(format.id, file)) {
      try {
        summary = await summarizeTable(tableName);
      } catch (e) {
        summaryStatus = 'failed';
        console.warn('SUMMARIZE failed:', e);
      }
    } else {
      summaryStatus = 'deferred';
      warnings.push(deferredSummaryWarning(file));
    }

    profile = withNormalizedRowCount(profile, summary);
    store.addFile(tableName, {
      virtualName,
      file,
      size: file.size,
      format: format.id,
      csvMode: format.id === 'csv' ? options.csvMode || 'auto' : null,
      summaryStatus,
      profile,
      summary,
    });
    await rebindActiveAliases(store);
    await recordRecent({
      name: file.name,
      size: file.size,
      file,
      format: format.id,
      csvMode: format.id === 'csv' ? options.csvMode || 'auto' : null,
    }).catch(() => {});
    return { tableName, warnings };
  } catch (error) {
    if (viewCreated) await query(`DROP VIEW IF EXISTS ${quoteIdentifier(tableName)};`).catch((e) => console.warn('drop view', e));
    if (registered) await unregisterFile(virtualName);
    throw error;
  }
}

export async function closeFile(store, tableName) {
  const record = store.state.files.get(tableName);
  if (!record) return;
  await query(`DROP VIEW IF EXISTS ${quoteIdentifier(tableName)};`).catch((e) => console.warn('drop view', e));
  await unregisterFile(record.virtualName);
  store.removeFile(tableName);
  await rebindActiveAliases(store);
}

export async function setActiveFile(store, tableName) {
  store.setActive(tableName);
  await rebindActiveAliases(store);
}

async function rebindActiveAliases(store) {
  const active = store.state.activeTable;
  if (!active) {
    await query(`DROP VIEW IF EXISTS active_file;`).catch(() => {});
    await query(`DROP VIEW IF EXISTS parquet_file;`).catch(() => {});
    return;
  }
  await query(`CREATE OR REPLACE VIEW active_file AS SELECT * FROM ${quoteIdentifier(active)};`).catch((e) =>
    console.warn('rebind active_file', e),
  );
  await query(`CREATE OR REPLACE VIEW parquet_file AS SELECT * FROM ${quoteIdentifier(active)};`).catch((e) =>
    console.warn('rebind parquet_file', e),
  );
}
