import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync('styles.css', 'utf8');

describe('responsive CSS', () => {
  it('keeps the empty mobile view focused on the file picker instead of stacking an empty rail', () => {
    expect(css).toContain('.stage:has(.work[data-state="empty"]) > .rail');
    expect(css).toContain('.stage:has(.work[data-state="empty"]) > .rail-resizer-track');
    expect(css).toMatch(/\.stage:has\(\.work\[data-state="empty"\]\) > \.rail\s*\{[^}]*display:\s*none/s);
  });

  it('compresses header controls on narrow screens so the Run button stays visible', () => {
    expect(css).toContain('@media (max-width: 760px)');
    expect(css).toMatch(/\.head \.cmd-trigger-label,\s*\.head \.cmd-trigger-shortcut\s*\{[^}]*display:\s*none/s);
    expect(css).toMatch(/\.head \.run \.k\s*\{[^}]*display:\s*none/s);
  });

  it('prevents long recent file names from widening the empty state', () => {
    expect(css).toMatch(/\.empty \.recent \.row \.name\s*\{[^}]*min-width:\s*0[^}]*overflow:\s*hidden[^}]*text-overflow:\s*ellipsis[^}]*white-space:\s*nowrap/s);
  });
});
