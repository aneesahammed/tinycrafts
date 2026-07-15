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

  it('collapses the left rail without reserving sidebar width', () => {
    expect(css).toMatch(/\.stage\[data-rail-collapsed="true"\]\s*\{[^}]*grid-template-columns:\s*0 0 minmax\(0,\s*1fr\) 0/s);
    expect(css).toMatch(/\.stage\[data-rail-collapsed="true"\] > \.rail\s*\{[^}]*visibility:\s*hidden/s);
  });

  it('shows the left rail in the empty responsive layout when it is expanded', () => {
    expect(css).toMatch(/\.stage:not\(\[data-rail-collapsed="true"\]\):has\(\.work\[data-state="empty"\]\)\s*\{[^}]*grid-template-rows:\s*220px 1fr/s);
    expect(css).toMatch(/\.stage:not\(\[data-rail-collapsed="true"\]\):has\(\.work\[data-state="empty"\]\) > \.rail\s*\{[^}]*display:\s*flex/s);
  });

  it('keeps the assistant panel compact by default with an explicit wide mode', () => {
    expect(css).toMatch(/\.stage\[data-right-open="true"\]:has\(\.assistant-host\)\s*\{[^}]*grid-template-columns:\s*var\(--rail-w,\s*256px\) 1px minmax\(0,\s*1fr\) 0 min\(480px,\s*38vw\)/s);
    expect(css).toMatch(/\.stage\[data-right-open="true"\]:has\(\.assistant-panel\[data-panel-size="wide"\]\)\s*\{[^}]*grid-template-columns:\s*var\(--rail-w,\s*256px\) 1px minmax\(0,\s*1fr\) 0 min\(760px,\s*54vw\)/s);
    expect(css).toMatch(/\.stage > \.profile-drawer\.assistant-host\s*\{\s*width:\s*min\(380px,\s*100vw\);?\s*\}/s);
    expect(css).toMatch(/\.stage > \.profile-drawer\.assistant-host:has\(\.assistant-panel\[data-panel-size="wide"\]\)\s*\{\s*width:\s*min\(760px,\s*100vw\);?\s*\}/s);
    expect(css).toMatch(/\.assistant-suggestion\s*\{[^}]*width:\s*100%[^}]*max-width:\s*100%[^}]*min-width:\s*0[^}]*white-space:\s*normal[^}]*overflow-wrap:\s*anywhere/s);
  });

  it('prevents long recent file names from widening the empty state', () => {
    expect(css).toMatch(/\.empty \.recent \.row \.name\s*\{[^}]*min-width:\s*0[^}]*overflow:\s*hidden[^}]*text-overflow:\s*ellipsis[^}]*white-space:\s*nowrap/s);
  });
});
