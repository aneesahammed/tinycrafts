import { stripSupportedExtension } from './formats.js';

const INVALID = /[^a-z0-9_]+/g;
const COLLAPSE = /_+/g;
const TRIM = /^_+|_+$/g;

export function sanitizeTableName(filename) {
  const stem = stripSupportedExtension(String(filename));
  const lowered = stem.toLowerCase();
  const replaced = lowered.replace(INVALID, '_');
  const collapsed = replaced.replace(COLLAPSE, '_').replace(TRIM, '');
  if (!collapsed) return 'data';
  if (/^[0-9]/.test(collapsed)) return `t_${collapsed}`;
  return collapsed;
}

export function uniqueTableName(base, takenSet) {
  if (!takenSet.has(base)) return base;
  let i = 1;
  while (takenSet.has(`${base}_${i}`)) i += 1;
  return `${base}_${i}`;
}
