import { execFileSync } from 'node:child_process';
import { copyFile, link, mkdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';

export const LARGE_DATABASE_SIZES_MIB = [64, 128, 256] as const;
export const CATALOG_DATABASE_SIZES_MIB = [25, 50] as const;
const PAGE_SIZE = 4096;
const INITIAL_OVERHEAD_ESTIMATE = 270_336;
const CATALOG_SCHEMA_ESTIMATE = 20 * 1024 * 1024;

export type LargeDatabaseFixture = {
  sizeMiB: (typeof LARGE_DATABASE_SIZES_MIB)[number];
  path: string;
  reimportPath: string;
  bytes: number;
  payloadBytes: number;
};

export type CatalogDatabaseFixture = {
  sizeMiB: (typeof CATALOG_DATABASE_SIZES_MIB)[number];
  path: string;
  bytes: number;
  payloadBytes: number;
};

/**
 * Creates a valid, deterministic SQLite file without committing a large binary
 * fixture. The CLI is deliberately an explicit prerequisite: silently padding
 * a small database would not prove that SQLite can deserialize the target size.
 */
export async function createLargeDatabase(directory: string, sizeMiB: LargeDatabaseFixture['sizeMiB']): Promise<LargeDatabaseFixture> {
  await mkdir(directory, { recursive: true });
  const targetBytes = sizeMiB * 1024 * 1024;
  const filePath = path.join(directory, `large-${sizeMiB}MiB.sqlite`);
  const reimportPath = path.join(directory, `large-${sizeMiB}MiB-reimport.sqlite`);
  const payloadBytes = await createSizedDatabase(filePath, targetBytes, targetBytes - INITIAL_OVERHEAD_ESTIMATE, 'CREATE TABLE payload(data BLOB NOT NULL);');
  try {
    await link(filePath, reimportPath);
  } catch {
    await copyFile(filePath, reimportPath);
  }
  return { sizeMiB, path: filePath, reimportPath, bytes: targetBytes, payloadBytes };
}

/**
 * Builds a catalog-heavy file at an exact byte size. The catalog is intentionally
 * over the approved 5,000-object budget; the filler only makes the file-size
 * matrix reproducible and is never used as an application limit workaround.
 */
export async function createCatalogDatabase(directory: string, sizeMiB: CatalogDatabaseFixture['sizeMiB']): Promise<CatalogDatabaseFixture> {
  await mkdir(directory, { recursive: true });
  const targetBytes = sizeMiB * 1024 * 1024;
  const filePath = path.join(directory, `catalog-${sizeMiB}MiB.sqlite`);
  const tableSql = Array.from({ length: 5_001 }, (_, index) => `CREATE TABLE t_${String(index).padStart(4, '0')} (id INTEGER);`).join('\n');
  const payloadBytes = await createSizedDatabase(filePath, targetBytes, targetBytes - CATALOG_SCHEMA_ESTIMATE, `${tableSql}\nCREATE TABLE payload(data BLOB NOT NULL);`);
  return { sizeMiB, path: filePath, bytes: targetBytes, payloadBytes };
}

export async function removeLargeDatabaseDirectory(directory: string) {
  await rm(directory, { recursive: true, force: true });
}

async function createSizedDatabase(filePath: string, targetBytes: number, initialPayloadBytes: number, schemaSql: string) {
  let payloadBytes = Math.max(PAGE_SIZE, initialPayloadBytes);
  let actualBytes = 0;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    await rm(filePath, { force: true });
    try {
      execFileSync('sqlite3', [filePath], {
        input: [
          `PRAGMA page_size=${PAGE_SIZE};`,
          'PRAGMA journal_mode=OFF;',
          'PRAGMA synchronous=OFF;',
          schemaSql,
          `INSERT INTO payload VALUES(zeroblob(${payloadBytes}));`,
        ].join('\n'),
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (error) {
      throw new Error('The performance fixture requires the sqlite3 CLI on PATH; no database was generated.', { cause: error });
    }

    actualBytes = (await stat(filePath)).size;
    if (actualBytes === targetBytes) return payloadBytes;
    payloadBytes = Math.max(PAGE_SIZE, payloadBytes - (actualBytes - targetBytes));
  }

  throw new Error(`Could not create an exact SQLite fixture (expected ${targetBytes} bytes, got ${actualBytes}).`);
}
