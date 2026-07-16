import { execFileSync } from 'node:child_process';
import { mkdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';

export const LARGE_DATABASE_SIZES_MIB = [64, 128, 256] as const;
const PAGE_SIZE = 4096;
const INITIAL_OVERHEAD_ESTIMATE = 270_336;

export type LargeDatabaseFixture = {
  sizeMiB: (typeof LARGE_DATABASE_SIZES_MIB)[number];
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
  let payloadBytes = targetBytes - INITIAL_OVERHEAD_ESTIMATE;
  let actualBytes = 0;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    await rm(filePath, { force: true });
    try {
      execFileSync('sqlite3', [filePath], {
        input: [
          `PRAGMA page_size=${PAGE_SIZE};`,
          'PRAGMA journal_mode=OFF;',
          'PRAGMA synchronous=OFF;',
          'CREATE TABLE payload(data BLOB NOT NULL);',
          `INSERT INTO payload VALUES(zeroblob(${Math.max(PAGE_SIZE, payloadBytes)}));`,
        ].join('\n'),
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (error) {
      throw new Error('The performance fixture requires the sqlite3 CLI on PATH; no database was generated.', { cause: error });
    }

    actualBytes = (await stat(filePath)).size;
    if (actualBytes === targetBytes) break;
    payloadBytes -= actualBytes - targetBytes;
  }

  if (actualBytes !== targetBytes) {
    throw new Error(`Could not create an exact ${sizeMiB} MiB SQLite fixture (got ${actualBytes} bytes).`);
  }

  return { sizeMiB, path: filePath, bytes: actualBytes, payloadBytes };
}

export async function removeLargeDatabaseDirectory(directory: string) {
  await rm(directory, { recursive: true, force: true });
}
