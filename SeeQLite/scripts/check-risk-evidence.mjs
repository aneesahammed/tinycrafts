import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const EXPECTED_RISK_IDS = Object.freeze([
  'PF-01', 'PF-02', 'PF-03', 'PF-04', 'PF-05', 'PF-06', 'PF-07',
  'PF-08', 'PF-09', 'PF-10', 'PF-11', 'PF-12', 'PF-13', 'PF-14',
]);

const VALID_SEVERITIES = new Set(['critical', 'high', 'medium', 'low']);
const MAX_AGE_DAYS = 30;
const SHA256 = /^[0-9a-f]{64}$/i;
const COMMIT_SHA = /^[0-9a-f]{40}$/i;
const SAFE_RELATIVE_PATH = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[^\\:*?"<>|]+$/;
const TEST_CALL = /\b(?:test|it)\s*\(\s*(['"`])([\s\S]*?)\1\s*,/g;

export function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export function extractTestTitles(source) {
  const titles = [];
  for (const match of source.matchAll(TEST_CALL)) {
    const title = match[2];
    if (!title.includes('${')) titles.push(title);
    else titles.push(title);
  }
  return titles;
}

export function loadJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function isoTime(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function addIssue(context, message, gap = {}) {
  context.issues.push(message);
  context.gaps.push({
    pfId: gap.pfId ?? 'GLOBAL',
    criterion: gap.criterion ?? message,
    owner: gap.owner ?? 'Release engineering',
    evidence: gap.evidence ?? 'risk-evidence.json',
  });
}

function pathFor(rootDir, relativePath) {
  if (typeof relativePath !== 'string' || !SAFE_RELATIVE_PATH.test(relativePath)) return null;
  const absolute = path.resolve(rootDir, relativePath);
  const root = path.resolve(rootDir) + path.sep;
  if (!absolute.startsWith(root)) return null;
  return absolute;
}

function validateReference(reference, risk, kind, context, index) {
  const prefix = `${risk.id}.${kind}[${index}]`;
  const gap = { pfId: risk.id, owner: risk.owner, evidence: `${kind}:${reference?.file ?? '<missing>'}` };
  for (const field of ['file', 'testId', 'command', 'expectedAssertion', 'sourceSha256', 'resultKey']) {
    if (typeof reference?.[field] !== 'string' || !reference[field].trim()) {
      addIssue(context, `${prefix}.${field} is required.`, { ...gap, criterion: `${kind} reference must include ${field}` });
    }
  }
  if (typeof reference?.sourceSha256 === 'string' && !SHA256.test(reference.sourceSha256)) {
    addIssue(context, `${prefix}.sourceSha256 must be a SHA-256 digest.`, { ...gap, criterion: `${kind} source digest is invalid` });
  }

  const sourcePath = pathFor(context.rootDir, reference?.file);
  if (!sourcePath) {
    addIssue(context, `${prefix}.file must be a safe repository-relative path.`, { ...gap, criterion: `${kind} source path is unsafe or missing` });
    return;
  }
  if (!existsSync(sourcePath)) {
    addIssue(context, `${prefix}.file does not exist: ${reference.file}.`, { ...gap, criterion: `${kind} source file is missing` });
    return;
  }
  const source = readFileSync(sourcePath, 'utf8');
  const digest = sha256(source);
  if (reference.sourceSha256 !== digest) {
    addIssue(context, `${prefix}.sourceSha256 does not match ${reference.file}.`, { ...gap, criterion: `${kind} source digest is stale` });
  }
  const titles = extractTestTitles(source);
  const matches = titles.filter((title) => title === reference.testId).length;
  if (matches !== 1) {
    addIssue(context, `${prefix}.testId must match exactly one literal test title in ${reference.file}; found ${matches}.`, { ...gap, criterion: `${kind} test title is missing or ambiguous` });
  }
  const expectedResultKey = `${risk.id}.${kind}.${index}`;
  if (reference.resultKey !== expectedResultKey) {
    addIssue(context, `${prefix}.resultKey must be ${expectedResultKey}.`, { ...gap, criterion: `${kind} result key is not canonical` });
  }
}

function validateFreshness(value, label, now, context, gap) {
  const date = isoTime(value);
  if (!date) {
    addIssue(context, `${label} must be an ISO timestamp.`, { ...gap, criterion: `${label} is invalid` });
    return null;
  }
  const ageDays = (now.getTime() - date.getTime()) / 86_400_000;
  if (ageDays > MAX_AGE_DAYS) addIssue(context, `${label} is stale; evidence must be <= ${MAX_AGE_DAYS} days old.`, { ...gap, criterion: `${label} is stale` });
  if (ageDays < -1) addIssue(context, `${label} cannot be more than one day in the future.`, { ...gap, criterion: `${label} is in the future` });
  return date;
}

function validateResult(result, reference, risk, kind, context, expectedCommit, runWindow) {
  const prefix = `results.${result?.key ?? '<missing>'}`;
  const gap = { pfId: risk.id, owner: risk.owner, evidence: `${kind}:${reference.file}` };
  if (!result || typeof result !== 'object') {
    addIssue(context, `${prefix} must be an object.`, { ...gap, criterion: `${kind} result is missing` });
    return;
  }
  for (const field of ['key', 'pfId', 'kind', 'file', 'testId', 'command', 'expectedAssertion', 'sourceSha256', 'outcome', 'artifact', 'commitSha', 'startedAt', 'completedAt']) {
    if (typeof result[field] !== 'string' || !result[field].trim()) addIssue(context, `${prefix}.${field} is required.`, { ...gap, criterion: `${kind} result is missing ${field}` });
  }
  if (result.key !== reference.resultKey) addIssue(context, `${prefix} does not match manifest resultKey ${reference.resultKey}.`, { ...gap, criterion: `${kind} result key does not match manifest` });
  if (result.pfId !== risk.id || result.kind !== kind || result.file !== reference.file || result.testId !== reference.testId) {
    addIssue(context, `${prefix} does not match the manifest source identity.`, { ...gap, criterion: `${kind} result source identity changed` });
  }
  if (result.command !== reference.command) addIssue(context, `${prefix}.command does not match the manifest.`, { ...gap, criterion: `${kind} runner command changed` });
  if (result.expectedAssertion !== reference.expectedAssertion) addIssue(context, `${prefix}.expectedAssertion does not match the manifest.`, { ...gap, criterion: `${kind} expected assertion changed` });
  if (result.sourceSha256 !== reference.sourceSha256) addIssue(context, `${prefix}.sourceSha256 does not match the manifest.`, { ...gap, criterion: `${kind} result source digest changed` });
  if (result.outcome !== 'passed') addIssue(context, `${prefix}.outcome must be passed.`, { ...gap, criterion: `${kind} result did not pass` });
  if (result.skipped === true || result.fixme === true || result.todo === true || result.conditional === true || result.excluded === true) {
    addIssue(context, `${prefix} is skipped, fixme, todo, conditional, or excluded.`, { ...gap, criterion: `${kind} result cannot be skipped or conditionally excluded` });
  }
  if (result.retryCount !== 0 || result.attempts !== 1 || result.retried === true || result.attempt !== 1) {
    addIssue(context, `${prefix} is retry-masked or does not record exactly one first attempt.`, { ...gap, criterion: `${kind} result must be a single non-retried attempt` });
  }
  if (typeof result.artifact === 'string' && !result.artifact.startsWith('artifacts/')) addIssue(context, `${prefix}.artifact must be a sanitized artifacts/ path.`, { ...gap, criterion: `${kind} result artifact path is unsafe` });
  if (result.commitSha !== expectedCommit) addIssue(context, `${prefix}.commitSha does not match the checked release commit.`, { ...gap, criterion: `${kind} result commit is stale` });
  const startedAt = validateFreshness(result.startedAt, `${prefix}.startedAt`, context.now, context, gap);
  const completedAt = validateFreshness(result.completedAt, `${prefix}.completedAt`, context.now, context, gap);
  if (startedAt && completedAt && completedAt < startedAt) addIssue(context, `${prefix} completedAt precedes startedAt.`, { ...gap, criterion: `${kind} result time ordering is invalid` });
  if (runWindow && startedAt && completedAt && (startedAt < runWindow.startedAt || completedAt > runWindow.completedAt)) addIssue(context, `${prefix} is outside the declared runner window.`, { ...gap, criterion: `${kind} result is outside the checked run` });
}

export function validateRiskEvidence({ manifest, results, rootDir, expectedCommit, now = new Date() }) {
  const context = { rootDir: path.resolve(rootDir), expectedCommit, now: now instanceof Date ? now : new Date(now), issues: [], gaps: [] };
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    addIssue(context, 'Manifest must be a JSON object.', { criterion: 'manifest shape is invalid' });
    return { ok: false, issues: context.issues, gaps: context.gaps };
  }
  if (manifest.schemaVersion !== 1) addIssue(context, 'Manifest schemaVersion must be 1.', { criterion: 'manifest schema version is unsupported' });
  if (!Array.isArray(manifest.risks)) {
    addIssue(context, 'Manifest risks must be an array.', { criterion: 'manifest risks are missing' });
    return { ok: false, issues: context.issues, gaps: context.gaps };
  }

  const ids = manifest.risks.map((risk) => risk?.id);
  for (const id of EXPECTED_RISK_IDS) if (!ids.includes(id)) addIssue(context, `Missing risk ${id}.`, { pfId: id, criterion: 'risk entry is missing' });
  for (const id of ids.filter((value) => !EXPECTED_RISK_IDS.includes(value))) addIssue(context, `Unknown risk ${String(id)}.`, { pfId: String(id), criterion: 'risk ID is not in PF-01..PF-14' });
  for (const id of new Set(ids.filter((value) => EXPECTED_RISK_IDS.includes(value)))) {
    if (ids.filter((value) => value === id).length !== 1) addIssue(context, `Risk ${id} appears more than once.`, { pfId: id, criterion: 'risk ID must appear exactly once' });
  }

  const references = new Map();
  for (const risk of manifest.risks) {
    if (!risk || typeof risk !== 'object') {
      addIssue(context, 'Each risk entry must be an object.', { criterion: 'risk entry shape is invalid' });
      continue;
    }
    const gap = { pfId: risk.id, owner: risk.owner, evidence: `risk ${risk.id}` };
    if (!EXPECTED_RISK_IDS.includes(risk.id)) continue;
    if (!VALID_SEVERITIES.has(risk.severity)) addIssue(context, `${risk.id}.severity is invalid.`, { ...gap, criterion: 'risk severity is invalid' });
    if (risk.status !== 'resolved') addIssue(context, `${risk.id}.status must be resolved.`, { ...gap, criterion: 'risk is unresolved' });
    for (const field of ['title', 'source', 'owner']) if (typeof risk[field] !== 'string' || !risk[field].trim()) addIssue(context, `${risk.id}.${field} is required.`, { ...gap, criterion: `risk ${field} is missing` });
    for (const kind of ['prevention', 'recovery']) {
      if (!Array.isArray(risk[kind]) || risk[kind].length === 0) {
        addIssue(context, `${risk.id}.${kind} must contain at least one reference.`, { ...gap, criterion: `${kind} evidence is missing` });
        continue;
      }
      for (let index = 0; index < risk[kind].length; index += 1) {
        const reference = risk[kind][index];
        validateReference(reference, risk, kind, context, index);
        if (reference?.resultKey) {
          if (references.has(reference.resultKey)) addIssue(context, `${risk.id}.${kind}[${index}] duplicates resultKey ${reference.resultKey}.`, { ...gap, criterion: 'result key is duplicated' });
          references.set(reference.resultKey, { risk, kind, reference });
        }
      }
    }
  }

  if (!COMMIT_SHA.test(expectedCommit ?? '')) addIssue(context, 'expectedCommit must be an explicit 40-character release commit SHA.', { criterion: 'release commit is missing or invalid' });
  if (!results || typeof results !== 'object' || Array.isArray(results)) {
    addIssue(context, 'Runner results must be a JSON object.', { criterion: 'runner results are missing' });
    return { ok: false, issues: context.issues, gaps: context.gaps };
  }
  if (results.schemaVersion !== 1) addIssue(context, 'Runner results schemaVersion must be 1.', { criterion: 'runner result schema version is unsupported' });
  if (results.commitSha !== expectedCommit) addIssue(context, 'Runner results commitSha must equal the checked release commit.', { criterion: 'runner result commit is stale' });
  const startedAt = validateFreshness(results.startedAt, 'runner.startedAt', context.now, context, { criterion: 'runner start timestamp is invalid' });
  const completedAt = validateFreshness(results.completedAt, 'runner.completedAt', context.now, context, { criterion: 'runner completed timestamp is invalid' });
  const runWindow = startedAt && completedAt ? { startedAt, completedAt } : null;
  if (startedAt && completedAt && completedAt < startedAt) addIssue(context, 'runner.completedAt precedes runner.startedAt.', { criterion: 'runner time ordering is invalid' });
  if (!Array.isArray(results.results)) {
    addIssue(context, 'Runner results.results must be an array.', { criterion: 'runner result records are missing' });
    return { ok: false, issues: context.issues, gaps: context.gaps };
  }
  const seenResultKeys = new Set();
  for (const result of results.results) {
    if (seenResultKeys.has(result?.key)) addIssue(context, `Runner result key ${String(result?.key)} appears more than once.`, { pfId: result?.pfId, criterion: 'runner result key is duplicated' });
    seenResultKeys.add(result?.key);
    const entry = references.get(result?.key);
    if (!entry) {
      addIssue(context, `Runner result ${String(result?.key)} is not declared by the manifest.`, { pfId: result?.pfId, criterion: 'runner result key is unknown' });
      continue;
    }
    validateResult(result, entry.reference, entry.risk, entry.kind, context, expectedCommit, runWindow);
  }
  for (const [resultKey, entry] of references) {
    if (!seenResultKeys.has(resultKey)) addIssue(context, `Missing runner result ${resultKey}.`, { pfId: entry.risk.id, owner: entry.risk.owner, evidence: `${entry.kind}:${entry.reference.file}`, criterion: `${entry.kind} named result is missing` });
  }
  for (const riskId of EXPECTED_RISK_IDS) {
    const risk = manifest.risks.find((entry) => entry?.id === riskId);
    if (!risk) continue;
    for (const kind of ['prevention', 'recovery']) {
      const referencesForKind = Array.isArray(risk[kind]) ? risk[kind] : [];
      const passed = referencesForKind.some((reference) => {
        const result = results.results.find((candidate) => candidate?.key === reference?.resultKey);
        return result?.outcome === 'passed' && result?.skipped !== true && result?.fixme !== true && result?.conditional !== true && result?.retryCount === 0 && result?.attempts === 1 && result?.attempt === 1;
      });
      if (!passed) addIssue(context, `${riskId} has no fresh passing ${kind} result.`, { pfId: riskId, owner: risk.owner, evidence: `${kind}:${referencesForKind[0]?.file ?? 'manifest'}`, criterion: `${kind} evidence must be fresh, passing, and non-retried` });
    }
  }
  return { ok: context.issues.length === 0, issues: context.issues, gaps: context.gaps };
}

export function renderRiskGaps(manifest, gaps) {
  const owners = new Map((manifest?.risks ?? []).map((risk) => [risk?.id, risk?.owner || 'Release engineering']));
  const rows = [...new Map((gaps ?? []).map((gap) => {
    const pfId = gap?.pfId ?? 'GLOBAL';
    const criterion = gap?.criterion ?? 'Evidence criterion failed';
    const owner = gap?.owner || owners.get(pfId) || 'Release engineering';
    const evidence = gap?.evidence || 'risk-evidence.json';
    return [`${pfId}|${criterion}|${owner}|${evidence}`, { pfId, criterion, owner, evidence }];
  })).values()].sort((a, b) => `${a.pfId}|${a.criterion}`.localeCompare(`${b.pfId}|${b.criterion}`));
  const body = rows.length === 0
    ? '| — | — | — | — |\n|---|---|---|---|\n| No gaps | — | — | — |'
    : ['| PF ID | Criterion | Owner | Named evidence |', '|---|---|---|---|', ...rows.map((row) => `| ${row.pfId} | ${row.criterion} | ${row.owner} | ${row.evidence} |`)].join('\n');
  return ['# SeeQLite risk evidence gaps', '', 'Generated by `scripts/check-risk-evidence.mjs`. This file is release-blocking until every row is closed by fresh, named prevention and recovery evidence.', '', body, ''].join('\n');
}

function runCli() {
  const [, , manifestPath, resultsPath, ...args] = process.argv;
  if (!manifestPath || !resultsPath) {
    console.error('Usage: node scripts/check-risk-evidence.mjs <risk-evidence.json> <runner-results.json> [--commit SHA] [--now ISO] [--gaps PATH]');
    process.exitCode = 2;
    return;
  }
  const commitIndex = args.indexOf('--commit');
  const expectedCommit = commitIndex >= 0 ? args[commitIndex + 1] : execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const nowIndex = args.indexOf('--now');
  const now = nowIndex >= 0 ? new Date(args[nowIndex + 1]) : new Date();
  const gapsIndex = args.indexOf('--gaps');
  const gapsPath = gapsIndex >= 0 ? args[gapsIndex + 1] : path.resolve(path.dirname(manifestPath), 'gaps/RISK-GAPS.md');
  try {
    const manifest = loadJson(path.resolve(manifestPath));
    const results = loadJson(path.resolve(resultsPath));
    const manifestAbsolute = path.resolve(manifestPath);
    const projectRoot = path.resolve(path.dirname(manifestAbsolute), '../..');
    const result = validateRiskEvidence({ manifest, results, rootDir: projectRoot, expectedCommit, now });
    if (!result.ok) {
      const report = renderRiskGaps(manifest, result.gaps);
      writeFileSync(path.resolve(gapsPath), report, 'utf8');
      console.error(report);
      for (const issue of result.issues) console.error(`ERROR: ${issue}`);
      console.error(`Risk evidence incomplete; write the deterministic gap report to ${gapsPath}.`);
      process.exitCode = 1;
      return;
    }
    console.log(`Risk evidence PASS: ${EXPECTED_RISK_IDS.length} risks with fresh prevention and recovery results.`);
  } catch (error) {
    console.error(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) runCli();
