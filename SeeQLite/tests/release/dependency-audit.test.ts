import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildInventory, normalizeAuditReport, renderInventory, sha256, validateInventory } from '../../scripts/audit-release-dependencies.mjs';

const rootDir = process.cwd();
const packageJson = JSON.parse(readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
const lockfile = JSON.parse(readFileSync(path.join(rootDir, 'package-lock.json'), 'utf8'));
const cleanAudit = { metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 } }, vulnerabilities: {} };

function inventory(overrides: Record<string, unknown> = {}) {
  return buildInventory({ rootDir, packageJson, lockfile, auditReport: cleanAudit, ...overrides });
}

describe('release dependency audit', () => {
  it('builds a clean exact runtime inventory from source imports, lockfile, and dist', () => {
    const result = inventory();
    expect(result.runtimePackageCount).toBe(19);
    expect(validateInventory(result, { rootDir })).toEqual({ ok: true, issues: [] });
    expect(result.packages.every((entry) => entry.version && entry.license && entry.noticeSources.length > 0)).toBe(true);
  });

  it.each([
    ['unknown license', (candidate: any) => { candidate.packages.find((entry: any) => entry.name === 'react').license = 'UNLICENSED'; }],
    ['missing notice evidence', (candidate: any) => { candidate.packages[0].noticeSources = []; }],
    ['remote request', (candidate: any) => { candidate.packages[0].remoteRequests = 'https://example.test'; }],
    ['missing artifact asset', (candidate: any) => { candidate.packages[0].artifactAssets = ['assets/not-built.js']; }],
  ])('rejects %s in a generated inventory', (_name, mutate) => {
    const candidate = inventory();
    mutate(candidate);
    const result = validateInventory(candidate, { rootDir });
    expect(result.ok).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it('rejects lockfile and artifact drift against the checked inventory', () => {
    const candidate = inventory();
    const expected = structuredClone(candidate);
    expected.lockfileSha256 = '0'.repeat(64);
    expected.artifactDigest = '1'.repeat(64);
    const result = validateInventory(candidate, { rootDir, expected });
    expect(result.ok).toBe(false);
    expect(result.issues).toEqual(expect.arrayContaining(['lockfile digest drifted from the checked inventory.', 'built artifact digest drifted from the checked inventory.']));
  });

  it('blocks unresolved high/critical advisories and unavailable audit results', () => {
    const blocked = inventory({ auditReport: { metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 1, critical: 0, total: 1 } }, vulnerabilities: { react: { severity: 'high', via: [{ title: 'fixture advisory' }] } } } });
    expect(blocked.advisories.status).toBe('blocked');
    expect(validateInventory(blocked, { rootDir }).issues).toEqual(expect.arrayContaining(['advisory status is blocked; clean evidence is required.', 'unresolved High/Critical production advisory blocks release.']));

    const incomplete = inventory({ auditReport: {} });
    expect(normalizeAuditReport({}).status).toBe('incomplete');
    expect(validateInventory(incomplete, { rootDir }).issues).toContain('advisory status is incomplete; clean evidence is required.');
  });

  it('renders a machine-readable, deterministic inventory document', () => {
    const result = inventory();
    const first = renderInventory(result);
    const second = renderInventory(result);
    expect(first).toBe(second);
    const block = /```json\s*([\s\S]*?)```/.exec(first);
    expect(block).not.toBeNull();
    expect(JSON.parse(block![1])).toMatchObject({ schemaVersion: 1, runtimePackageCount: 19 });
    expect(sha256(readFileSync(path.join(rootDir, 'dist/index.html')))).toMatch(/^[0-9a-f]{64}$/);
  });
});
