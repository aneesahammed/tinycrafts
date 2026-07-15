export type CapabilityResult = { ok: true } | { ok: false; missing: string[] };

export function checkCapabilities(): CapabilityResult {
  const missing = [
    typeof Worker === 'undefined' ? 'Web Worker' : null,
    typeof WebAssembly === 'undefined' ? 'WebAssembly' : null,
    typeof BigInt === 'undefined' ? 'BigInt' : null,
    typeof File === 'undefined' ? 'File input' : null,
  ].filter((value): value is string => value !== null);
  return missing.length ? { ok: false, missing } : { ok: true };
}
