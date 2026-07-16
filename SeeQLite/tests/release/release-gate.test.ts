import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildReleaseEvidence, buildRiskResults, extractRequirementIds, makeCommandEvidence, runReleaseGate, validateReleaseEvidence, writeJsonAtomically } from '../../scripts/release-gate.mjs';

const rootDir = process.cwd();
const requirementIds = extractRequirementIds(readFileSync(path.join(rootDir, '.planning/REQUIREMENTS.md'), 'utf8'));
const commit = 'a'.repeat(40);

function commandEvidence(outcome: 'passed' | 'failed' = 'passed') {
  return makeCommandEvidence({ id: 'fixture-suite', file: 'node', args: ['fixture'], cwd: rootDir, requirementIds }, {
    ok: outcome === 'passed',
    exitCode: outcome === 'passed' ? 0 : 1,
    stdout: 'database-derived marker must not be persisted',
    stderr: '',
    startedAt: '2026-07-16T10:00:00.000Z',
    completedAt: '2026-07-16T10:01:00.000Z',
    retries: 0,
  });
}

describe('release gate evidence contract', () => {
  it('extracts all 48 requirement IDs from the canonical requirements file', () => {
    expect(requirementIds).toHaveLength(48);
    expect(new Set(requirementIds).size).toBe(48);
  });

  it('accepts a synthetic complete record only when every release gate is green', () => {
    const commands = [commandEvidence()];
    const evidence = buildReleaseEvidence({
      commitSha: commit,
      startedAt: '2026-07-16T10:00:00.000Z',
      completedAt: '2026-07-16T10:01:00.000Z',
      commands,
      manual: { outcome: 'passed', path: 'manual.json', issues: [] },
      deployed: { outcome: 'passed', path: 'deployed.json', issues: [] },
      rollback: { outcome: 'passed', path: 'rollback.json', issues: [] },
      risk: { checked: true, manifestPath: 'risk.json', resultPath: 'results.json', issues: [] },
      requirementIds,
      status: 'complete',
      issues: [],
    });
    expect(validateReleaseEvidence(evidence, { requirementIds, now: new Date('2026-07-16T12:00:00.000Z') })).toEqual({ ok: true, issues: [] });
  });

  it('rejects a failed command, skipped/retried evidence, and incomplete human gates', () => {
    const failed = commandEvidence('failed');
    failed.retried = true;
    failed.retryCount = 1;
    failed.attempts = 2;
    const evidence = buildReleaseEvidence({
      commitSha: commit,
      startedAt: '2026-07-16T10:00:00.000Z',
      completedAt: '2026-07-16T10:01:00.000Z',
      commands: [failed],
      manual: { outcome: 'incomplete', path: 'manual.md', issues: ['unexecuted'] },
      deployed: { outcome: 'missing', path: null, issues: ['missing'] },
      rollback: { outcome: 'missing', path: null, issues: ['missing'] },
      risk: { checked: false, manifestPath: 'risk.json', resultPath: 'results.json', issues: ['not checked'] },
      requirementIds,
      status: 'incomplete',
      issues: ['fixture command failed'],
    });
    const result = validateReleaseEvidence(evidence, { requirementIds, now: new Date('2026-07-16T12:00:00.000Z') });
    expect(result.ok).toBe(false);
    expect(result.issues).toEqual(expect.arrayContaining([
      'Command fixture-suite is not passed.',
      'Command fixture-suite has skip/retry masking.',
      'Manual Safari/VoiceOver/NVDA evidence is not complete.',
      'Deployed artifact evidence is not passed.',
      'Rollback rehearsal evidence is not passed.',
      'PF risk evidence has not passed the current-run checker.',
    ]));
  });

  it('stores command output only as digests, never as raw database-derived content', () => {
    const evidence = commandEvidence();
    expect(JSON.stringify(evidence)).not.toContain('database-derived marker');
    expect(evidence.stdoutSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('maps every PF manifest reference only through an exact orchestrator command string', async () => {
    const manifest = JSON.parse(await readFile(path.join(rootDir, 'docs/release/risk-evidence.json'), 'utf8'));
    const commandEvidence = [
      { command: 'npm run test:e2e -- tests/e2e/app.spec.ts --project=chromium', outcome: 'passed', artifact: 'artifacts/app.json', startedAt: '2026-07-16T10:00:00.000Z', completedAt: '2026-07-16T10:01:00.000Z', skipped: false, fixme: false, todo: false, conditional: false, retryCount: 0, attempts: 1, retried: false },
      { command: 'npm run test:e2e -- tests/e2e/keyboard-workflows.spec.ts --project=chromium', outcome: 'passed', artifact: 'artifacts/keyboard.json', startedAt: '2026-07-16T10:00:00.000Z', completedAt: '2026-07-16T10:01:00.000Z', skipped: false, fixme: false, todo: false, conditional: false, retryCount: 0, attempts: 1, retried: false },
      { command: 'npm run test:e2e -- tests/e2e/accessibility.spec.ts --project=chromium', outcome: 'passed', artifact: 'artifacts/a11y.json', startedAt: '2026-07-16T10:00:00.000Z', completedAt: '2026-07-16T10:01:00.000Z', skipped: false, fixme: false, todo: false, conditional: false, retryCount: 0, attempts: 1, retried: false },
      { command: 'npm run test:performance -- tests/performance/scalability.spec.ts --project=chromium', outcome: 'passed', artifact: 'artifacts/scalability.json', startedAt: '2026-07-16T10:00:00.000Z', completedAt: '2026-07-16T10:01:00.000Z', skipped: false, fixme: false, todo: false, conditional: false, retryCount: 0, attempts: 1, retried: false },
      { command: 'npm run test:performance -- tests/performance/release-benchmarks.spec.ts --project=chromium', outcome: 'passed', artifact: 'artifacts/performance.json', startedAt: '2026-07-16T10:00:00.000Z', completedAt: '2026-07-16T10:01:00.000Z', skipped: false, fixme: false, todo: false, conditional: false, retryCount: 0, attempts: 1, retried: false },
    ];
    const results = buildRiskResults(manifest, commandEvidence, commit);
    expect(results).toHaveLength(28);
    expect(results.every((result) => result.outcome === 'passed')).toBe(true);
  });

  it('writes evidence atomically without leaving temporary files', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'seeqlite-release-gate-'));
    const target = path.join(directory, 'evidence.json');
    try {
      await writeJsonAtomically(target, { schemaVersion: 1, status: 'incomplete' }, { tempSuffix: 'fixture' });
      expect(JSON.parse(await readFile(target, 'utf8'))).toEqual({ schemaVersion: 1, status: 'incomplete' });
      expect(await readdir(directory)).toEqual(['evidence.json']);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('runs a fake command and emits an incomplete current-run artifact when human evidence is absent', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'seeqlite-release-gate-run-'));
    const evidencePath = path.join(directory, 'test-results.json');
    try {
      const result = await runReleaseGate({
        rootDir,
        commands: [{ id: 'fixture-suite', file: 'node', args: ['--version'], cwd: '.', requirementIds }],
        runner: async () => ({ ok: true, exitCode: 0, stdout: 'ok', stderr: '', startedAt: '2026-07-16T10:00:00.000Z', completedAt: '2026-07-16T10:01:00.000Z', retries: 0 }),
        commitSha: commit,
        now: new Date('2026-07-16T10:00:00.000Z'),
        evidencePath,
        releaseGapsPath: path.join(directory, 'RELEASE-GAPS.md'),
        manualPath: path.join(directory, 'missing-manual.md'),
        deployedPath: path.join(directory, 'missing-deployed.json'),
        rollbackPath: path.join(directory, 'missing-rollback.json'),
      });
      expect(result.ok).toBe(false);
      expect(result.evidence.status).toBe('incomplete');
      expect(JSON.parse(await readFile(evidencePath, 'utf8')).commitSha).toBe(commit);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
