import { valueToDisplay } from './format.js';

export function toCsv(columns, rows) {
  const header = columns.map(escapeCsv).join(',');
  const body = rows.map((row) => columns.map((column) => escapeCsv(row[column])).join(',')).join('\n');
  return `${header}\n${body}`;
}

export function escapeCsv(value) {
  if (value == null) return '';
  const text = valueToDisplay(value).replaceAll('"', '""');
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
