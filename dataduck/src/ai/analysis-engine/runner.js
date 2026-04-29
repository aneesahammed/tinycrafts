import { queryPrepared as duckdbQueryPrepared } from '../../duckdb/engine.js';
import { inferDisplayColumnTypes } from '../../util/format.js';
import { activeDatasetFingerprint } from '../dataset-fingerprint.js';
import { compileToolPlan } from './compiler.js';
import { diagnosticArtifact, runtimeArtifactFromJob } from './artifacts.js';
import { safeAnalysisError } from './errors.js';
import { summarizeArtifact, summarizeArtifacts } from './summary.js';

export async function runAnalysisToolPlan({
  plan,
  context,
  startFingerprint,
  getStoreState,
  queryFn = duckdbQueryPrepared,
  now = () => Date.now(),
} = {}) {
  let compiled;
  try {
    compiled = compileToolPlan(plan, context);
  } catch (error) {
    const safe = safeAnalysisError(error);
    const clarify = safe.kind === 'clarify';
    return {
      mode: clarify ? 'clarify' : 'analysis',
      title: plan?.title || 'Analysis',
      text: safe.safeMessage,
      artifacts: [diagnosticArtifact({
        id: 'compile_diagnostic',
        status: clarify ? 'unsupported' : 'error',
        code: safe.code,
        safeMessage: safe.safeMessage,
        requestId: safe.requestId,
        retryAfter: safe.retryAfter,
      })],
      incomplete: true,
    };
  }
  if (compiled.mode !== 'analysis') {
    return {
      mode: compiled.mode,
      title: compiled.title,
      text: compiled.message,
      artifacts: [],
    };
  }

  const artifacts = [];
  for (const job of compiled.jobs) {
    try {
      assertFresh(startFingerprint, getStoreState?.());
      const artifact = await runJob({ job, queryFn, now });
      artifact.text = summarizeArtifact(artifact);
      artifacts.push(artifact);
      assertFresh(startFingerprint, getStoreState?.());
    } catch (error) {
      const safe = safeAnalysisError(error);
      if (safe.code === 'STALE_DATASET') {
        return {
          mode: 'error',
          title: compiled.title,
          text: safe.safeMessage,
          artifacts: [diagnosticArtifact({
            id: 'stale_dataset',
            status: 'stale',
            code: safe.code,
            safeMessage: safe.safeMessage,
            failedStepId: job.id,
            requestId: safe.requestId,
            retryAfter: safe.retryAfter,
          })],
          incomplete: true,
        };
      }
      const clarify = safe.kind === 'clarify';
      artifacts.push(diagnosticArtifact({
        id: `${job.id}_diagnostic`,
        tool: job.tool,
        status: clarify ? 'unsupported' : 'incomplete',
        code: safe.code,
        safeMessage: safe.safeMessage,
        failedStepId: job.id,
        requestId: safe.requestId,
        retryAfter: safe.retryAfter,
      }));
      return {
        mode: clarify ? 'clarify' : 'analysis',
        title: compiled.title,
        text: safe.safeMessage,
        artifacts,
        incomplete: true,
      };
    }
  }

  return {
    mode: 'analysis',
    title: compiled.title,
    text: summarizeArtifacts(compiled.title, artifacts),
    artifacts,
    incomplete: false,
  };
}

async function runJob({ job, queryFn, now }) {
  if (job.kind === 'metadata') {
    return runtimeArtifactFromJob({ job, result: { columns: job.columns, rows: job.rows, columnTypes: job.columnTypes }, elapsedMs: 0 });
  }
  const startedAt = now();
  const result = await queryFn(job.sql, job.params || []);
  const elapsedMs = Math.max(0, Math.round(now() - startedAt));
  const columns = result.columns || inferColumns(result.rows);
  const columnTypes = inferDisplayColumnTypes(columns, result.rows || [], result.columnTypes || {});
  return runtimeArtifactFromJob({
    job,
    result: { ...result, columns, columnTypes },
    elapsedMs,
  });
}

function assertFresh(startFingerprint, state) {
  if (!startFingerprint || activeDatasetFingerprint(state) === startFingerprint) return;
  const error = new Error('The active file changed before analysis completed. Ask again for the current file.');
  error.code = 'STALE_DATASET';
  throw error;
}

function inferColumns(rows = []) {
  return rows[0] ? Object.keys(rows[0]) : [];
}
