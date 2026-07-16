import { execFile, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { loadJson, validateRiskEvidence } from './check-risk-evidence.mjs';
import { parseManualEvidence, validateManualEvidence } from './validate-release-evidence.mjs';

const execFileAsync = promisify(execFile);
export const DOD_IDS = Object.freeze(Array.from({ length: 10 }, (_, index) => `DOD-${String(index + 1).padStart(2, '0')}`));
export const REQUIRED_COMMAND_FIELDS = Object.freeze(['id', 'file', 'args', 'cwd', 'requirementIds']);

export const DEFAULT_COMMANDS = Object.freeze([
  command('seeqlite-typecheck', 'npm', ['run', 'typecheck'], ['PLAT-03', 'PLAT-04', 'SAFE-01', 'SQL-01', 'REL-01']),
  command('seeqlite-unit', 'npm', ['test', '--', '--reporter=dot'], ['SAFE-01', 'SAFE-02', 'SAFE-03', 'SQL-02', 'SQL-03', 'SQL-04', 'RES-01', 'RES-02', 'PLAN-01', 'HIST-01', 'HIST-02', 'REL-01']),
  command('seeqlite-build', 'npm', ['run', 'build'], ['PLAT-02', 'PLAT-03', 'OFF-01', 'OFF-02', 'REL-01']),
  command('seeqlite-bundle', 'npm', ['run', 'check:bundle'], ['PLAT-02', 'PERF-01', 'REL-01']),
  command('seeqlite-e2e-chromium', 'npm', ['run', 'test:e2e', '--', '--project=chromium', '--retries=0'], allRequirements()),
  command('seeqlite-e2e-firefox', 'npm', ['run', 'test:e2e', '--', '--project=firefox', '--retries=0'], allRequirements()),
  command('seeqlite-e2e-webkit', 'npm', ['run', 'test:e2e', '--', '--project=webkit', '--retries=0'], allRequirements()),
  command('seeqlite-performance', 'npm', ['run', 'test:performance', '--', '--project=chromium', '--project=firefox', '--project=webkit', '--retries=0'], ['PERF-01', 'CANCEL-01', 'CANCEL-02', 'REL-01']),
  command('seeqlite-dependency-check', 'node', ['scripts/audit-release-dependencies.mjs', '--check'], ['SEC-02', 'REL-01']),
  command('seeqlite-production-audit', 'npm', ['audit', '--omit=dev', '--audit-level=high'], ['SEC-02', 'REL-01']),
  command('pages-build', 'node', ['../scripts/build-pages.mjs'], ['PLAT-02', 'REL-02']),
  command('pages-verify', 'node', ['../scripts/verify-pages-build.mjs'], ['PLAT-02', 'REL-02']),
  command('dataduck-test', 'npm', ['--prefix', '../dataduck', 'test'], ['REL-02']),
  command('dataduck-build', 'npm', ['--prefix', '../dataduck', 'run', 'build'], ['REL-02']),
  command('dataduck-bundle', 'npm', ['--prefix', '../dataduck', 'run', 'check:bundle'], ['REL-02']),
  command('risk-app-chromium', 'npm', ['run', 'test:e2e', '--', 'tests/e2e/app.spec.ts', '--project=chromium'], ['SEC-01', 'SEC-02', 'REL-01']),
  command('risk-keyboard-chromium', 'npm', ['run', 'test:e2e', '--', 'tests/e2e/keyboard-workflows.spec.ts', '--project=chromium'], ['A11Y-01', 'REL-01']),
  command('risk-accessibility-chromium', 'npm', ['run', 'test:e2e', '--', 'tests/e2e/accessibility.spec.ts', '--project=chromium'], ['A11Y-01', 'REL-01']),
  command('risk-scalability-chromium', 'npm', ['run', 'test:performance', '--', 'tests/performance/scalability.spec.ts', '--project=chromium'], ['PERF-01', 'REL-01']),
  command('risk-release-performance-chromium', 'npm', ['run', 'test:performance', '--', 'tests/performance/release-benchmarks.spec.ts', '--project=chromium'], ['PERF-01', 'CANCEL-01', 'CANCEL-02', 'REL-01']),
]);

function allRequirements() {
  return extractRequirementIds(readRequirements());
}

function command(id, file, args, requirementIds) {
  return Object.freeze({ id, file, args, cwd: '.', requirementIds: Object.freeze(requirementIds) });
}

function readRequirements() {
  const requirementsPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.planning/REQUIREMENTS.md');
  return readFileSync(requirementsPath, 'utf8');
}

export function extractRequirementIds(markdown) {
  return [...new Set([...String(markdown).matchAll(/^####\s+([A-Z][A-Z0-9-]+)\s+—/gm)].map((match) => match[1]))];
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function normalizeCommand(commandSpec, rootDir) {
  const issues = [];
  for (const field of REQUIRED_COMMAND_FIELDS) {
    if (typeof commandSpec?.[field] === 'undefined') issues.push(`command.${field} is required.`);
  }
  if (!Array.isArray(commandSpec?.args)) issues.push(`command.${commandSpec?.id ?? '<missing>'}.args must be an array.`);
  if (!Array.isArray(commandSpec?.requirementIds)) issues.push(`command.${commandSpec?.id ?? '<missing>'}.requirementIds must be an array.`);
  return {
    issues,
    command: {
      id: commandSpec?.id,
      file: commandSpec?.file,
      args: commandSpec?.args ?? [],
      cwd: path.resolve(rootDir, commandSpec?.cwd ?? '.'),
      cwdRelative: commandSpec?.cwd ?? '.',
      requirementIds: commandSpec?.requirementIds ?? [],
    },
  };
}

export function makeCommandEvidence(spec, outcome) {
  const startedAt = outcome.startedAt ?? new Date().toISOString();
  const completedAt = outcome.completedAt ?? startedAt;
  const exitCode = Number.isInteger(outcome.exitCode) ? outcome.exitCode : (outcome.ok ? 0 : 1);
  const retries = Number.isInteger(outcome.retries) ? outcome.retries : 0;
  return {
    id: spec.id,
    command: [spec.file, ...spec.args].join(' '),
    cwd: spec.cwdRelative ?? spec.cwd,
    requirementIds: [...spec.requirementIds],
    outcome: exitCode === 0 && outcome.ok !== false ? 'passed' : 'failed',
    exitCode,
    startedAt,
    completedAt,
    attempts: retries + 1,
    retryCount: retries,
    retried: retries > 0,
    skipped: outcome.skipped === true,
    fixme: outcome.fixme === true,
    todo: outcome.todo === true,
    conditional: outcome.conditional === true,
    artifact: `artifacts/commands/${spec.id}.json`,
    stdoutSha256: sha256(String(outcome.stdout ?? '')),
    stderrSha256: sha256(String(outcome.stderr ?? '')),
  };
}

export function buildRiskResults(manifest, commandEvidence, commitSha) {
  const byCommand = new Map(commandEvidence.map((entry) => [entry.command, entry]));
  const results = [];
  for (const risk of manifest?.risks ?? []) {
    for (const kind of ['prevention', 'recovery']) {
      for (const reference of risk[kind] ?? []) {
        const matching = byCommand.get(reference.command);
        const outcome = matching?.outcome === 'passed' ? 'passed' : 'failed';
        results.push({
          key: reference.resultKey,
          pfId: risk.id,
          kind,
          file: reference.file,
          testId: reference.testId,
          command: reference.command,
          expectedAssertion: reference.expectedAssertion,
          sourceSha256: reference.sourceSha256,
          outcome,
          artifact: matching?.artifact ?? `artifacts/risks/${reference.resultKey}.json`,
          commitSha,
          startedAt: matching?.startedAt ?? new Date().toISOString(),
          completedAt: matching?.completedAt ?? new Date().toISOString(),
          skipped: matching?.skipped ?? false,
          fixme: matching?.fixme ?? false,
          todo: matching?.todo ?? false,
          conditional: matching?.conditional ?? false,
          excluded: false,
          retryCount: matching?.retryCount ?? 0,
          attempts: matching?.attempts ?? 1,
          retried: matching?.retried ?? false,
          attempt: 1,
        });
      }
    }
  }
  return results;
}

function statusFromManual(manualPath, expectedCommit, now, rootDir) {
  const safePath = safeEvidencePath(manualPath, rootDir);
  if (!manualPath || !existsSync(manualPath)) return { outcome: 'missing', path: safePath, issues: ['Manual accessibility evidence file is missing.'] };
  try {
    const evidence = parseManualEvidence(readFileSync(manualPath, 'utf8'));
    const validation = validateManualEvidence(evidence, { expectedCommit, now });
    return { outcome: validation.complete ? 'passed' : 'incomplete', path: safePath, issues: [...validation.issues, ...validation.warnings] };
  } catch (error) {
    return { outcome: 'invalid', path: safePath, issues: [error instanceof Error ? error.message : String(error)] };
  }
}

function statusFromJson(filePath, label, rootDir) {
  const safePath = safeEvidencePath(filePath, rootDir);
  if (!filePath || !existsSync(filePath)) return { outcome: 'missing', path: safePath, issues: [`${label} evidence file is missing.`] };
  try {
    const value = loadJson(filePath);
    const outcome = value?.outcome ?? value?.status;
    const issues = [];
    if (value?.schemaVersion !== 1) issues.push(`${label} evidence schemaVersion must be 1.`);
    if (outcome !== 'passed') issues.push(`${label} evidence is not passed.`);
    return { outcome: issues.length === 0 ? 'passed' : 'incomplete', path: safePath, issues };
  } catch (error) {
    return { outcome: 'invalid', path: safePath, issues: [error instanceof Error ? error.message : String(error)] };
  }
}

function safeEvidencePath(filePath, rootDir) {
  if (!filePath) return null;
  const relative = path.relative(path.resolve(rootDir), path.resolve(filePath));
  if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) return relative.split(path.sep).join('/');
  return 'external-artifact';
}

export function validateReleaseEvidence(evidence, { requirementIds = [], now = new Date() } = {}) {
  const issues = [];
  if (evidence?.schemaVersion !== 1) issues.push('schemaVersion must be 1.');
  if (!/^[0-9a-f]{40}$/i.test(evidence?.commitSha ?? '')) issues.push('commitSha must be a 40-character SHA.');
  if (!['complete', 'incomplete'].includes(evidence?.status)) issues.push('status must be complete or incomplete.');
  const startedAt = new Date(evidence?.startedAt ?? 'invalid');
  const completedAt = new Date(evidence?.completedAt ?? 'invalid');
  if (Number.isNaN(startedAt.getTime()) || Number.isNaN(completedAt.getTime())) issues.push('startedAt and completedAt must be ISO timestamps.');
  if (!Array.isArray(evidence?.commands) || evidence.commands.length === 0) issues.push('commands must contain at least one result.');
  const commandIds = new Set();
  for (const commandResult of evidence?.commands ?? []) {
    if (commandIds.has(commandResult.id)) issues.push(`Duplicate command result: ${commandResult.id}.`);
    commandIds.add(commandResult.id);
    if (commandResult.outcome !== 'passed') issues.push(`Command ${commandResult.id} is not passed.`);
    if (commandResult.skipped || commandResult.fixme || commandResult.todo || commandResult.conditional || commandResult.retried || commandResult.retryCount !== 0 || commandResult.attempts !== 1) issues.push(`Command ${commandResult.id} has skip/retry masking.`);
  }
  const covered = new Set((evidence?.requirements ?? []).filter((entry) => entry?.outcome === 'passed').map((entry) => entry.id));
  for (const id of requirementIds) if (!covered.has(id)) issues.push(`Requirement ${id} has no passed evidence link.`);
  const done = new Set((evidence?.definitionOfDone ?? []).filter((entry) => entry?.outcome === 'passed').map((entry) => entry.id));
  for (const id of DOD_IDS) if (!done.has(id)) issues.push(`${id} has no passed evidence link.`);
  if (evidence?.manual?.outcome !== 'passed') issues.push('Manual Safari/VoiceOver/NVDA evidence is not complete.');
  if (evidence?.deployed?.outcome !== 'passed') issues.push('Deployed artifact evidence is not passed.');
  if (evidence?.rollback?.outcome !== 'passed') issues.push('Rollback rehearsal evidence is not passed.');
  if (evidence?.risk?.checked !== true) issues.push('PF risk evidence has not passed the current-run checker.');
  if (evidence?.status === 'complete' && issues.length > 0) issues.push('Complete release evidence contains blocking issues.');
  if (evidence?.status === 'incomplete' && issues.length === 0) issues.push('Incomplete release evidence must contain at least one blocking issue.');
  if (evidence?.completedAt && new Date(evidence.completedAt) > new Date(now.getTime() + 86_400_000)) issues.push('completedAt is too far in the future.');
  return { ok: issues.length === 0, issues };
}

export async function writeJsonAtomically(filePath, value, { tempSuffix = `${process.pid}-${Date.now()}` } = {}) {
  return writeTextAtomically(filePath, `${JSON.stringify(value, null, 2)}\n`, { tempSuffix });
}

export async function writeTextAtomically(filePath, content, { tempSuffix = `${process.pid}-${Date.now()}` } = {}) {
  const absolute = path.resolve(filePath);
  await mkdir(path.dirname(absolute), { recursive: true });
  const temporary = `${absolute}.${tempSuffix}.tmp`;
  try {
    await writeFile(temporary, content, 'utf8');
    await rename(temporary, absolute);
  } finally {
    await rm(temporary, { force: true });
  }
}

export function renderReleaseGaps(evidence) {
  const rows = [
    ['RUN-01', 'Current complete release evidence is missing or incomplete.', 'Release engineering', '.release-evidence/test-results.json'],
    ...(evidence?.manual?.outcome === 'passed' ? [] : [['A11Y-01', 'Released Safari + VoiceOver and Windows NVDA evidence is not complete.', 'Accessibility owner', 'docs/release/accessibility-safari.md']]),
    ...(evidence?.deployed?.outcome === 'passed' ? [] : [['REL-02', 'Authorized public deployment/header/MIME/service-worker evidence is not complete.', 'Release engineering', '.release-evidence/deployed-seeqlite.json']]),
    ...(evidence?.rollback?.outcome === 'passed' ? [] : [['REL-02', 'Production-shaped rollback rehearsal is not complete.', 'Release engineering', '.release-evidence/rollback.json']]),
    ...(evidence?.risk?.checked ? [] : [['SEC-02', 'Current PF-01…PF-14 risk results have not passed the release checker.', 'Security/release owner', '.release-evidence/test-results.json']]),
    ...((evidence?.commands ?? []).some((entry) => entry.requirementIds?.includes('PERF-01') && entry.outcome === 'passed') ? [] : [['PERF-01', 'Qualified constrained-host memory/performance evidence is not complete.', 'Performance owner', 'docs/release/gaps/PERFORMANCE-GAPS.md']]),
  ];
  const unique = [...new Map(rows.map((row) => [row.join('|'), row])).values()];
  return [
    '# SeeQLite release gaps',
    '',
    'This report is release-blocking. It is regenerated by `scripts/release-gate.mjs` from sanitized gate state; no database-derived values belong here.',
    '',
    '| ID | Gap | Owner | Required evidence |',
    '|---|---|---|---|',
    ...unique.map((row) => `| ${row[0]} | ${row[1]} | ${row[2]} | ${row[3]} |`),
    '',
  ].join('\n');
}

export function buildReleaseEvidence({ commitSha, startedAt, completedAt, commands, manual, deployed, rollback, risk, requirementIds = [], status, issues = [] }) {
  const commandMap = new Map(commands.map((entry) => [entry.id, entry]));
  const passedCommandIds = new Set(commands.filter((entry) => entry.outcome === 'passed').map((entry) => entry.id));
  const requirements = requirementIds.map((id) => {
    const evidenceKeys = commands.filter((entry) => entry.requirementIds.includes(id)).map((entry) => entry.id).filter((idValue) => passedCommandIds.has(idValue));
    return { id, evidenceKeys, outcome: evidenceKeys.length ? 'passed' : 'missing' };
  });
  const definitionOfDone = DOD_IDS.map((id) => ({ id, evidenceKeys: [...passedCommandIds], outcome: passedCommandIds.size === commands.length && commands.length > 0 ? 'passed' : 'missing' }));
  return {
    schemaVersion: 1,
    runId: `${commitSha}-${startedAt}`,
    status: status ?? 'incomplete',
    commitSha,
    startedAt,
    completedAt,
    commands,
    requirements,
    definitionOfDone,
    manual,
    deployed,
    rollback,
    risk,
    issues,
    commandCount: commandMap.size,
  };
}

export async function runReleaseGate({ rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), commands = DEFAULT_COMMANDS, runner = runProcess, commitSha = readCommit(rootDir), now = new Date(), evidencePath = path.join(rootDir, '.release-evidence/test-results.json'), releaseGapsPath = path.join(rootDir, 'docs/release/gaps/RELEASE-GAPS.md'), manualPath = path.join(rootDir, 'docs/release/accessibility-safari.md'), deployedPath = path.join(rootDir, '.release-evidence/deployed-seeqlite.json'), rollbackPath = path.join(rootDir, '.release-evidence/rollback.json'), riskManifestPath = path.join(rootDir, 'docs/release/risk-evidence.json') } = {}) {
  const startedAt = now.toISOString();
  const normalized = commands.map((entry) => normalizeCommand(entry, rootDir));
  const commandIssues = normalized.flatMap((entry) => entry.issues);
  const commandEvidence = [];
  for (const entry of normalized) {
    if (entry.issues.length) continue;
    const result = await runner(entry.command);
    commandEvidence.push(makeCommandEvidence(entry.command, result));
  }
  const completedAt = new Date().toISOString();
  const allCommandsPassed = commandIssues.length === 0 && commandEvidence.length === normalized.length && commandEvidence.every((entry) => entry.outcome === 'passed');
  const manual = statusFromManual(manualPath, commitSha, now, rootDir);
  const deployed = statusFromJson(deployedPath, 'Deployed', rootDir);
  const rollback = statusFromJson(rollbackPath, 'Rollback', rootDir);
  let risk = { checked: false, manifestPath: safeEvidencePath(riskManifestPath, rootDir), resultPath: safeEvidencePath(evidencePath, rootDir), issues: ['Risk checker is deferred until all release commands finish.'] };
  const riskResults = existsSync(riskManifestPath) && allCommandsPassed ? buildRiskResults(loadJson(riskManifestPath), commandEvidence, commitSha) : [];
  const evidenceSkeleton = { schemaVersion: 1, commitSha, startedAt, completedAt, commands: commandEvidence, requirements: [], definitionOfDone: [], manual, deployed, rollback, risk, status: 'incomplete' };
  const requirementIds = extractRequirementIds(readRequirements());
  const provisional = buildReleaseEvidence({ ...evidenceSkeleton, requirementIds, issues: [...commandIssues, ...commandEvidence.filter((entry) => entry.outcome !== 'passed').map((entry) => `Command ${entry.id} failed.`)] });
  if (allCommandsPassed) {
    const manifest = loadJson(riskManifestPath);
    const riskResult = validateRiskEvidence({ manifest, results: { schemaVersion: 1, commitSha, startedAt, completedAt, results: riskResults }, rootDir, expectedCommit: commitSha, now });
    risk = { checked: riskResult.ok, manifestPath: safeEvidencePath(riskManifestPath, rootDir), resultPath: safeEvidencePath(evidencePath, rootDir), issues: riskResult.issues };
  }
  const finalIssues = [...provisional.issues, ...manual.issues, ...deployed.issues, ...rollback.issues, ...risk.issues];
  const final = buildReleaseEvidence({ commitSha, startedAt, completedAt, commands: commandEvidence, manual, deployed, rollback, risk, requirementIds, status: allCommandsPassed && manual.outcome === 'passed' && deployed.outcome === 'passed' && rollback.outcome === 'passed' && risk.checked ? 'complete' : 'incomplete', issues: [...new Set(finalIssues)] });
  await writeJsonAtomically(evidencePath, final);
  if (final.status !== 'complete') await writeTextAtomically(releaseGapsPath, renderReleaseGaps(final));
  return { ok: final.status === 'complete', evidence: final };
}

async function runProcess(spec) {
  const startedAt = new Date().toISOString();
  try {
    const result = await execFileAsync(spec.file, spec.args, { cwd: spec.cwd, maxBuffer: 20 * 1024 * 1024, env: { ...process.env, CI: process.env.CI ?? '1' } });
    return { ok: true, exitCode: 0, stdout: result.stdout, stderr: result.stderr, startedAt, completedAt: new Date().toISOString(), retries: 0, ...detectOutputFlags(`${result.stdout}\n${result.stderr}`) };
  } catch (error) {
    const stdout = error?.stdout ?? '';
    const stderr = error?.stderr ?? String(error);
    return { ok: false, exitCode: Number.isInteger(error?.code) ? error.code : 1, stdout, stderr, startedAt, completedAt: new Date().toISOString(), retries: 0, ...detectOutputFlags(`${stdout}\n${stderr}`) };
  }
}

function detectOutputFlags(output) {
  const normalized = String(output).toLowerCase();
  return {
    skipped: /\b(?:\d+\s+)?skipped\b/.test(normalized),
    fixme: /\bfixme\b/.test(normalized),
    todo: /\btodo\b/.test(normalized),
    conditional: /\bconditionally\s+(?:excluded|skipped)\b/.test(normalized),
  };
}

function readCommit(rootDir) {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: rootDir, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

async function cli() {
  const result = await runReleaseGate();
  console.log(JSON.stringify(result.evidence, null, 2));
  if (!result.ok) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await cli();
