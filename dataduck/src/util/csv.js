import { valueToDisplay } from './format.js';

export function toCsv(columns, rows, columnTypes = {}) {
  const header = columns.map(escapeCsv).join(',');
  const body = rows
    .map((row) => columns.map((column) => escapeCsv(row[column], columnTypes[column])).join(','))
    .join('\n');
  return `${header}\n${body}`;
}

export function escapeCsv(value, columnType = null) {
  if (value == null) return '';
  const text = valueToDisplay(value, columnType).replaceAll('"', '""');
  return /[",\n\r]/.test(text) ? `"${text}"` : text;
}

export function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
