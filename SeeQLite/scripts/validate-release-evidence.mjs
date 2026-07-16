import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const REQUIRED_STEP_IDS = [
  'open',
  'inspect-search',
  'query-result-plan',
  'cancel-rehydrate',
  'er-list-join',
  'export',
  'offline-update',
  'privacy-limits',
];
const REQUIRED_PLATFORM_IDS = ['safari-voiceover', 'nvda'];
const PLACEHOLDER_PATTERN = /__TEMPLATE__|TODO|TBD|REPLACE_ME|REPLACE WITH|ENTER VALUE|YOUR NAME|EXAMPLE\.COM|PLACEHOLDER/i;
const DATABASE_CONTENT_PATTERN = /ada@example\.test|first note|sqlite format 3|CREATE TABLE|SELECT \*|sqlite_schema|BLOB ·/i;
const MAX_AGE_DAYS = 30;

export function parseManualEvidence(markdown) {
  const match = /```json\s*([\s\S]*?)```/i.exec(markdown);
  if (!match) throw new Error('Manual evidence must contain one fenced JSON block.');
  const evidence = JSON.parse(match[1]);
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) throw new Error('Manual evidence JSON must be an object.');
  return evidence;
}

export function renderManualEvidence(evidence) {
  return `# SeeQLite manual accessibility evidence\n\n\`\`\`json\n${JSON.stringify(evidence, null, 2)}\n\`\`\`\n`;
}

export function validateManualEvidence(evidence, options = {}) {
  const issues = [];
  const warnings = [];
  const now = options.now instanceof Date ? options.now : new Date();
  const allowTemplate = options.allowIncompleteTemplate === true;
  const expectedCommit = options.expectedCommit;
  const mode = evidence?.mode;
  const isTemplate = mode === 'template';

  if (evidence?.schemaVersion !== 1) issues.push('schemaVersion must be 1.');
  if (mode !== 'template' && mode !== 'record') issues.push('mode must be template or record.');
  if (isTemplate && !allowTemplate) issues.push('Template evidence is incomplete; run with --allow-incomplete-template only for protocol review.');
  if (mode === 'record' && evidence.recordStatus !== 'complete') issues.push('recordStatus must be complete for release evidence.');

  for (const field of ['recordId', 'testedAt', 'tester', 'buildSha', 'signature']) {
    requireString(evidence?.[field], field, issues, { allowTemplate: isTemplate && allowTemplate });
  }
  if (evidence?.sanitizedArtifacts !== true) {
    if (isTemplate && allowTemplate) warnings.push('sanitizedArtifacts is not confirmed in the incomplete template.');
    else issues.push('sanitizedArtifacts must be true.');
  }

  if (!isTemplate || !allowTemplate) {
    if (typeof evidence?.testedAt === 'string') validateFreshDate(evidence.testedAt, now, issues);
    if (typeof evidence?.buildSha === 'string' && !/^[0-9a-f]{40}$/i.test(evidence.buildSha)) issues.push('buildSha must be a 40-character commit SHA.');
    if (expectedCommit && evidence?.buildSha !== expectedCommit) issues.push(`buildSha must match the checked commit ${expectedCommit}.`);
    if (typeof evidence?.signature === 'string' && evidence.signature.trim().length < 4) issues.push('signature is too short to identify the tester.');
  }

  if (!Array.isArray(evidence?.platforms)) {
    issues.push('platforms must be an array.');
  } else {
    const ids = evidence.platforms.map((platform) => platform?.id);
    for (const requiredId of REQUIRED_PLATFORM_IDS) if (!ids.includes(requiredId)) issues.push(`Missing platform record: ${requiredId}.`);
    if (new Set(ids).size !== ids.length) issues.push('platform IDs must be unique.');
    for (const platform of evidence.platforms) validatePlatform(platform, { issues, warnings, allowTemplate: isTemplate && allowTemplate, isTemplate });
  }

  if (!Array.isArray(evidence?.findings)) {
    if (!isTemplate || !allowTemplate) issues.push('findings must be an array.');
  } else {
    for (const finding of evidence.findings) validateFinding(finding, issues, { allowTemplate: isTemplate && allowTemplate });
  }

  const serialized = JSON.stringify(evidence);
  if (DATABASE_CONTENT_PATTERN.test(serialized)) issues.push('Evidence contains database-derived or user data; attach sanitized artifacts only.');
  if (!isTemplate || !allowTemplate) {
    const placeholderMatch = serialized.match(PLACEHOLDER_PATTERN);
    if (placeholderMatch) issues.push(`Evidence contains a placeholder token: ${placeholderMatch[0]}.`);
  }

  return { ok: issues.length === 0, complete: mode === 'record' && issues.length === 0, issues, warnings };
}

function validatePlatform(platform, context) {
  const { issues, warnings, allowTemplate, isTemplate } = context;
  const prefix = `platforms.${platform?.id ?? '<missing>'}`;
  if (!REQUIRED_PLATFORM_IDS.includes(platform?.id)) issues.push(`${prefix}.id is not an approved platform ID.`);
  requireString(platform?.osVersion, `${prefix}.osVersion`, issues, { allowTemplate });
  requireString(platform?.browserVersion, `${prefix}.browserVersion`, issues, { allowTemplate });
  requireString(platform?.assistiveTechnologyVersion, `${prefix}.assistiveTechnologyVersion`, issues, { allowTemplate });
  if (platform?.id === 'safari-voiceover') {
    if (!allowTemplate && !/^macOS\b/i.test(platform?.osVersion ?? '')) issues.push(`${prefix}.osVersion must identify macOS.`);
    if (!allowTemplate && !/^Safari\b/i.test(platform?.browserVersion ?? '')) issues.push(`${prefix}.browserVersion must identify released Safari, not WebKit.`);
    if (/webkit/i.test(platform?.browserVersion ?? '')) issues.push(`${prefix}.browserVersion must not substitute WebKit for Safari.`);
    if (!allowTemplate && !/^VoiceOver\b/i.test(platform?.assistiveTechnologyVersion ?? '')) issues.push(`${prefix}.assistiveTechnologyVersion must identify VoiceOver.`);
  }
  if (platform?.id === 'nvda') {
    if (!allowTemplate && !/^Windows\b/i.test(platform?.osVersion ?? '')) issues.push(`${prefix}.osVersion must identify Windows.`);
    if (!allowTemplate && !/^(?:Firefox|Chrome)\b/i.test(platform?.browserVersion ?? '')) issues.push(`${prefix}.browserVersion must identify Firefox or Chrome.`);
    if (!allowTemplate && !/^NVDA\b/i.test(platform?.assistiveTechnologyVersion ?? '')) issues.push(`${prefix}.assistiveTechnologyVersion must identify NVDA.`);
  }

  const coverage = platform?.coverage;
  if (!coverage || typeof coverage !== 'object') {
    issues.push(`${prefix}.coverage is required.`);
  } else {
    requireCoverage(coverage.themes, ['light', 'dark'], `${prefix}.coverage.themes`, issues, allowTemplate);
    requireCoverage(coverage.zoom, ['200%'], `${prefix}.coverage.zoom`, issues, allowTemplate);
    requireCoverage(coverage.reducedMotion, ['reduce'], `${prefix}.coverage.reducedMotion`, issues, allowTemplate);
    requireCoverage(coverage.forcedColors, ['active'], `${prefix}.coverage.forcedColors`, issues, allowTemplate);
  }

  if (!Array.isArray(platform?.steps)) {
    issues.push(`${prefix}.steps must be an array.`);
    return;
  }
  const stepIds = platform.steps.map((step) => step?.id);
  for (const requiredId of REQUIRED_STEP_IDS) if (!stepIds.includes(requiredId)) issues.push(`${prefix}.steps is missing ${requiredId}.`);
  if (new Set(stepIds).size !== stepIds.length) issues.push(`${prefix}.steps IDs must be unique.`);
  for (const step of platform.steps) validateStep(step, `${prefix}.steps.${step?.id ?? '<missing>'}`, { issues, warnings, allowTemplate, isTemplate });
}

function validateStep(step, prefix, context) {
  const { issues, warnings, allowTemplate, isTemplate } = context;
  for (const field of ['action', 'expectedFocus', 'expectedAnnouncement']) requireString(step?.[field], `${prefix}.${field}`, issues, { allowTemplate });
  if (!isTemplate || !allowTemplate) {
    requireString(step?.actualFocus, `${prefix}.actualFocus`, issues, { allowTemplate: false });
    requireString(step?.actualAnnouncement, `${prefix}.actualAnnouncement`, issues, { allowTemplate: false });
  }
  if (step?.outcome !== 'pass') {
    if (isTemplate && allowTemplate && step?.outcome === 'unexecuted') warnings.push(`${prefix} is unexecuted in the template.`);
    else issues.push(`${prefix}.outcome must be pass.`);
  }
  if (isTemplate && allowTemplate) return;

  if (typeof step?.evidence !== 'string' || !step.evidence.startsWith('artifacts/')) issues.push(`${prefix}.evidence must be a sanitized artifacts/ path.`);
  if (step?.findingId !== null) {
    if (typeof step.findingId !== 'string' || !step.findingId.trim()) issues.push(`${prefix}.findingId must be a non-empty finding ID.`);
    if (!/^[0-9a-f]{40}$/i.test(step.fixBuild ?? '')) issues.push(`${prefix}.fixBuild must identify the fixing commit.`);
  } else if (step?.fixBuild !== null) issues.push(`${prefix}.fixBuild must be null when no finding exists.`);
  if (!step?.rerun || step.rerun.outcome !== 'pass') issues.push(`${prefix}.rerun must contain a passing post-fix rerun.`);
  else {
    if (!/^[0-9a-f]{40}$/i.test(step.rerun.fixBuild ?? '')) issues.push(`${prefix}.rerun.fixBuild must be a commit SHA.`);
    if (typeof step.rerun.evidence !== 'string' || !step.rerun.evidence.startsWith('artifacts/')) issues.push(`${prefix}.rerun.evidence must be a sanitized artifacts/ path.`);
  }
}

function validateFinding(finding, issues, options) {
  const prefix = `findings.${finding?.id ?? '<missing>'}`;
  requireString(finding?.id, `${prefix}.id`, issues, options);
  requireString(finding?.severity, `${prefix}.severity`, issues, options);
  requireString(finding?.status, `${prefix}.status`, issues, options);
  if (options.allowTemplate) return;
  if (!['low', 'moderate', 'serious', 'critical'].includes(finding?.severity)) issues.push(`${prefix}.severity is invalid.`);
  if (finding?.status !== 'closed') issues.push(`${prefix} is unresolved; release evidence requires closed findings.`);
  if (!/^[0-9a-f]{40}$/i.test(finding?.fixBuild ?? '')) issues.push(`${prefix}.fixBuild must identify the fixing commit.`);
  if (typeof finding?.regressionTest !== 'string' || !finding.regressionTest.startsWith('tests/')) issues.push(`${prefix}.regressionTest must name a permanent test.`);
  if (typeof finding?.rerunEvidence !== 'string' || !finding.rerunEvidence.startsWith('artifacts/')) issues.push(`${prefix}.rerunEvidence must be a sanitized artifacts/ path.`);
}

function requireCoverage(actual, required, field, issues, allowTemplate) {
  if (!Array.isArray(actual)) {
    if (!allowTemplate) issues.push(`${field} must be an array.`);
    return;
  }
  for (const value of required) if (!actual.includes(value) && !allowTemplate) issues.push(`${field} must include ${value}.`);
}

function requireString(value, field, issues, options = {}) {
  if (typeof value !== 'string' || !value.trim()) {
    if (!options.allowTemplate) issues.push(`${field} is required.`);
  }
}

function validateFreshDate(value, now, issues) {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    issues.push('testedAt must be an ISO date.');
    return;
  }
  const ageDays = (now.getTime() - date.getTime()) / 86_400_000;
  if (ageDays > MAX_AGE_DAYS) issues.push(`testedAt is stale; evidence must be <= ${MAX_AGE_DAYS} days old.`);
  if (ageDays < -1) issues.push('testedAt cannot be more than one day in the future.');
}

async function runCli() {
  const [, , filePath, ...args] = process.argv;
  if (!filePath) {
    console.error('Usage: node scripts/validate-release-evidence.mjs <markdown> [--allow-incomplete-template] [--commit SHA]');
    process.exitCode = 2;
    return;
  }
  const allowIncompleteTemplate = args.includes('--allow-incomplete-template');
  const commitIndex = args.indexOf('--commit');
  const expectedCommit = commitIndex >= 0 ? args[commitIndex + 1] : execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  try {
    const evidence = parseManualEvidence(await readFile(path.resolve(filePath), 'utf8'));
    const result = validateManualEvidence(evidence, { allowIncompleteTemplate, expectedCommit });
    for (const warning of result.warnings) console.warn(`WARNING: ${warning}`);
    for (const issue of result.issues) console.error(`ERROR: ${issue}`);
    if (evidence.mode === 'template' && allowIncompleteTemplate && result.issues.length === 0) {
      console.warn('INCOMPLETE TEMPLATE: human Safari+VoiceOver/NVDA execution is still required.');
      return;
    }
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    console.error(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await runCli();
