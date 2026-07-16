import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderRiskGaps, sha256, validateRiskEvidence } from '../../scripts/check-risk-evidence.mjs';

const rootDir = process.cwd();
const manifest = JSON.parse(readFileSync(path.join(rootDir, 'docs/release/risk-evidence.json'), 'utf8')) as RiskManifest;
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const now = new Date('2026-07-16T12:00:00.000Z');

type Reference = { file: string; testId: string; command: string; expectedAssertion: string; sourceSha256: string; resultKey: string };
type Risk = { id: string; owner: string; prevention: Reference[]; recovery: Reference[] };
type RiskManifest = { schemaVersion: number; risks: Risk[] };
type RunnerResult = Reference & { key: string; pfId: string; kind: string; outcome: string; artifact: string; startedAt: string; completedAt: string; commitSha: string; skipped: boolean; fixme: boolean; todo: boolean; conditional: boolean; excluded: boolean; retryCount: number; attempts: number; retried: boolean; attempt: number };

function validResults(sourceManifest = manifest): RunnerResults {
  const results: RunnerResult[] = [];
  for (const risk of sourceManifest.risks) {
    for (const kind of ['prevention', 'recovery'] as const) {
      for (const reference of risk[kind]) {
        results.push({
          ...reference,
          key: reference.resultKey,
          pfId: risk.id,
          kind,
          outcome: 'passed',
          artifact: `artifacts/${risk.id}-${kind}.json`,
          startedAt: '2026-07-16T11:00:00.000Z',
          completedAt: '2026-07-16T11:01:00.000Z',
          commitSha: commit,
          skipped: false,
          fixme: false,
          todo: false,
          conditional: false,
          excluded: false,
          retryCount: 0,
          attempts: 1,
          retried: false,
          attempt: 1,
        });
      }
    }
  }
  return { schemaVersion: 1, commitSha: commit, startedAt: '2026-07-16T10:59:00.000Z', completedAt: '2026-07-16T11:02:00.000Z', results };
}

type RunnerResults = { schemaVersion: number; commitSha: string; startedAt: string; completedAt: string; results: RunnerResult[] };

function check(candidateManifest = structuredClone(manifest) as RiskManifest, candidateResults = validResults(candidateManifest)) {
  return validateRiskEvidence({ manifest: candidateManifest, results: candidateResults, rootDir, expectedCommit: commit, now });
}

describe('PF risk evidence checker', () => {
  it('accepts the exact fourteen-risk manifest with fresh non-retried results', () => {
    expect(check()).toEqual({ ok: true, issues: [], gaps: [] });
  });

  it.each([
    ['missing PF', (candidate: RiskManifest) => { candidate.risks = candidate.risks.filter((risk) => risk.id !== 'PF-07'); }],
    ['duplicate PF', (candidate: RiskManifest) => { candidate.risks.push(structuredClone(candidate.risks[0])); }],
    ['unknown PF', (candidate: RiskManifest) => { candidate.risks[0].id = 'PF-99'; }],
    ['unresolved status', (candidate: RiskManifest) => { candidate.risks[0].status = 'open'; }],
    ['missing prevention', (candidate: RiskManifest) => { candidate.risks[0].prevention = []; }],
    ['missing recovery', (candidate: RiskManifest) => { candidate.risks[0].recovery = []; }],
    ['source digest mismatch', (candidate: RiskManifest) => { candidate.risks[0].prevention[0].sourceSha256 = '0'.repeat(64); }],
    ['renamed test', (candidate: RiskManifest) => { candidate.risks[0].prevention[0].testId = 'renamed test'; }],
  ])('rejects %s in the manifest', (_name, mutate) => {
    const candidate = structuredClone(manifest) as RiskManifest;
    mutate(candidate);
    const result = check(candidate);
    expect(result.ok).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it.each([
    ['missing result', (results: RunnerResults) => { results.results.pop(); }],
    ['stale commit', (results: RunnerResults) => { results.commitSha = '0'.repeat(40); }],
    ['failed result', (results: RunnerResults) => { results.results[0].outcome = 'failed'; }],
    ['skipped result', (results: RunnerResults) => { results.results[0].skipped = true; }],
    ['fixme result', (results: RunnerResults) => { results.results[0].fixme = true; }],
    ['conditional result', (results: RunnerResults) => { results.results[0].conditional = true; }],
    ['retry-masked result', (results: RunnerResults) => { results.results[0].retryCount = 1; results.results[0].attempts = 2; results.results[0].retried = true; }],
    ['stale timestamp', (results: RunnerResults) => { results.results[0].completedAt = '2020-01-01T00:00:00.000Z'; }],
    ['unknown result key', (results: RunnerResults) => { results.results[0].key = 'PF-99.prevention.0'; }],
  ])('rejects %s in runner evidence', (_name, mutate) => {
    const results = validResults();
    mutate(results);
    const result = check(manifest, results);
    expect(result.ok).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it('renders a deterministic, owner-aware gap report', () => {
    const gaps = [{ pfId: 'PF-03', criterion: 'prevention result is missing', owner: 'SQLite result bounds', evidence: 'prevention:tests/performance/scalability.spec.ts' }];
    expect(renderRiskGaps(manifest, gaps)).toContain('| PF-03 | prevention result is missing | SQLite result bounds | prevention:tests/performance/scalability.spec.ts |');
    expect(renderRiskGaps(manifest, gaps)).toBe(renderRiskGaps(manifest, gaps));
  });

  it('uses the actual source digest in the manifest contract', () => {
    const source = readFileSync(path.join(rootDir, 'tests/e2e/app.spec.ts'));
    expect(sha256(source)).toBe(manifest.risks[0].prevention[0].sourceSha256);
  });
});
