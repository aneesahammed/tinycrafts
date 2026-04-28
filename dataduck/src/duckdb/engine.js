import * as duckdb from '@duckdb/duckdb-wasm';
import duckdbWasmMvp from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url';
import duckdbWorkerMvp from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url';
import duckdbWasmEh from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url';
import duckdbWorkerEh from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url';
import { arrowTableToObjects } from '../util/arrow.js';

const BUNDLES = {
  mvp: { mainModule: duckdbWasmMvp, mainWorker: duckdbWorkerMvp },
  eh: { mainModule: duckdbWasmEh, mainWorker: duckdbWorkerEh },
};

let dbPromise = null;

export async function getEngine() {
  if (!dbPromise) {
    dbPromise = (async () => {
      const bundle = await duckdb.selectBundle(BUNDLES);
      const worker = new Worker(bundle.mainWorker);
      const logger = new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING);
      const db = new duckdb.AsyncDuckDB(logger, worker);
      await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
      const conn = await db.connect();
      return { db, conn, worker, duckdb };
    })();
  }
  return dbPromise;
}

export async function query(sql) {
  const { conn } = await getEngine();
  const table = await conn.query(sql);
  return arrowTableToObjects(table);
}

export async function tryQuery(sql) {
  try {
    return await query(sql);
  } catch (error) {
    console.warn('Optional query failed:', sql, error);
    return { columns: [], rows: [] };
  }
}

export async function registerFile(virtualName, fileHandle) {
  const { db, duckdb: dd } = await getEngine();
  await db.registerFileHandle(
    virtualName,
    fileHandle,
    dd.DuckDBDataProtocol.BROWSER_FILEREADER,
    true,
  );
}

export async function unregisterFile(virtualName) {
  const { db } = await getEngine();
  try {
    await db.dropFile(virtualName);
  } catch (error) {
    console.warn('dropFile failed:', error);
  }
}
