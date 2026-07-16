import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseManualEvidence, renderManualEvidence, validateManualEvidence } from '../../scripts/validate-release-evidence.mjs';

const templatePath = path.join(process.cwd(), 'docs/release/accessibility-safari.md');
const template = parseManualEvidence(readFileSync(templatePath, 'utf8')) as ManualEvidence;
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();

type ManualEvidence = {
  mode: 'template' | 'record';
  recordStatus: string;
  testedAt: string;
  tester: string;
  buildSha: string;
  signature: string;
  sanitizedArtifacts: boolean;
  platforms: Array<{ id: string; osVersion: string; browserVersion: string; assistiveTechnologyVersion: string; coverage: Record<string, string[]>; steps: Array<Record<string, unknown>> }>;
  [key: string]: unknown;
};

function completeRecord(): ManualEvidence {
  const record = structuredClone(template) as ManualEvidence;
  record.mode = 'record';
  record.recordStatus = 'complete';
  record.recordId = 'manual-2026-07-16';
  record.testedAt = '2026-07-16';
  record.tester = 'A. Engineer';
  record.buildSha = commit;
  record.signature = 'A. Engineer / 2026-07-16';
  record.sanitizedArtifacts = true;
  for (const platform of record.platforms) {
    platform.osVersion = platform.id === 'safari-voiceover' ? 'macOS 15.5' : 'Windows 11 24H2';
    platform.browserVersion = platform.id === 'safari-voiceover' ? 'Safari 18.5' : 'Firefox 140.0';
    platform.assistiveTechnologyVersion = platform.id === 'safari-voiceover' ? 'VoiceOver 15.5' : 'NVDA 2025.1';
    for (const step of platform.steps) {
      step.action = `Run ${step.id} with the synthetic fixture.`;
      step.expectedFocus = 'The documented control remains focused.';
      step.actualFocus = 'The documented control remained focused.';
      step.expectedAnnouncement = 'The documented status is announced.';
      step.actualAnnouncement = 'The documented status was announced.';
      step.outcome = 'pass';
      step.evidence = `artifacts/${platform.id}-${step.id}.png`;
      step.findingId = null;
      step.fixBuild = null;
      step.rerun = { outcome: 'pass', fixBuild: commit, evidence: `artifacts/${platform.id}-${step.id}-rerun.png` };
    }
  }
  return record;
}

describe('manual release evidence validator', () => {
  it('accepts the protocol shape only as an explicitly incomplete template', () => {
    const result = validateManualEvidence(template, { allowIncompleteTemplate: true, expectedCommit: commit, now: new Date('2026-07-16T12:00:00Z') });
    expect(result.ok).toBe(true);
    expect(result.complete).toBe(false);
    expect(result.warnings.some((warning) => warning.includes('unexecuted'))).toBe(true);
    expect(validateManualEvidence(template, { expectedCommit: commit }).ok).toBe(false);
  });

  it('accepts a complete, current, signed record', () => {
    const result = validateManualEvidence(completeRecord(), { expectedCommit: commit, now: new Date('2026-07-16T12:00:00Z') });
    expect(result).toEqual({ ok: true, complete: true, issues: [], warnings: [] });
  });

  it.each([
    ['missing browser version', (record: ManualEvidence) => { record.platforms[0].browserVersion = ''; }],
    ['stale date', (record: ManualEvidence) => { record.testedAt = '2000-01-01'; }],
    ['unexecuted step', (record: ManualEvidence) => { record.platforms[0].steps[0].outcome = 'unexecuted'; }],
    ['placeholder artifact', (record: ManualEvidence) => { record.platforms[0].steps[0].evidence = 'artifacts/__TEMPLATE__.png'; }],
    ['missing rerun', (record: ManualEvidence) => { record.platforms[0].steps[0].rerun = null; }],
    ['unresolved serious finding', (record: ManualEvidence) => { record.findings = [{ id: 'A11Y-01', severity: 'serious', status: 'open' }]; }],
    ['unsafe database-derived content', (record: ManualEvidence) => { record.platforms[0].steps[0].actualAnnouncement = 'ada@example.test'; }],
    ['WebKit substituted for Safari', (record: ManualEvidence) => { record.platforms[0].browserVersion = 'WebKit 18.5'; }],
  ])('rejects %s', (_name, mutate) => {
    const record = completeRecord();
    mutate(record);
    const result = validateManualEvidence(record, { expectedCommit: commit, now: new Date('2026-07-16T12:00:00Z') });
    expect(result.ok).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it('renders a parseable evidence document for release tooling', () => {
    expect(parseManualEvidence(renderManualEvidence(completeRecord()))).toMatchObject({ mode: 'record', recordStatus: 'complete' });
  });
});
