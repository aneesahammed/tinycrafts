import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync('styles.css', 'utf8');

describe('responsive CSS', () => {
  it('keeps the empty mobile view focused on the file picker instead of stacking an empty rail', () => {
    expect(css).toContain('.stage:has(.work[data-state="empty"]) > .rail');
    expect(css).toContain('.stage:has(.work[data-state="empty"]) > .rail-resizer-track');
    expect(css).toMatch(/\.stage:has\(\.work\[data-state="empty"\]\) > \.rail\s*\{[^}]*display:\s*none/s);
  });

  it('compresses header controls on narrow screens', () => {
    expect(css).toContain('@media (max-width: 760px)');
    expect(css).toMatch(/\.head \.cmd-trigger-label,\s*\.head \.cmd-trigger-shortcut\s*\{[^}]*display:\s*none/s);
  });

  it('keeps the run bar and status pill on one line whenever the work area is narrow', () => {
    expect(css).toMatch(/\.status\s*\{[^}]*white-space:\s*nowrap/s);
    expect(css).toMatch(/container:\s*work \/ inline-size/);
    expect(css).toMatch(/@container work \(max-width: 480px\)\s*\{\s*\.status \.ms,\s*\.status \.ms-sep,[^{]*\{[^}]*display:\s*none/s);
  });

  it('gives the stacked rail scroll room so columns are never squeezed to zero', () => {
    expect(css).toMatch(/@media \(max-width: 980px\)[\s\S]*\.rail \.cols\s*\{[^}]*flex:\s*0 0 auto/);
  });

  it('draws resizers as full-edge handles without a grip', () => {
    expect(css).not.toMatch(/radial-gradient\(circle at 1px 1px/);
    expect(css).toMatch(/\.rail-resizer,\s*\.right-resizer\s*\{[^}]*top:\s*0;\s*bottom:\s*0/s);
  });

  it('collapses the left rail without reserving sidebar width', () => {
    expect(css).toMatch(/\.stage\[data-rail-collapsed="true"\]\s*\{[^}]*grid-template-columns:\s*0 0 minmax\(0,\s*1fr\) 0/s);
    expect(css).toMatch(/\.stage\[data-rail-collapsed="true"\] > \.rail\s*\{[^}]*visibility:\s*hidden/s);
  });

  it('shows the left rail in the empty responsive layout when it is expanded', () => {
    expect(css).toMatch(/\.stage:not\(\[data-rail-collapsed="true"\]\):has\(\.work\[data-state="empty"\]\)\s*\{[^}]*grid-template-rows:\s*220px 1fr/s);
    expect(css).toMatch(/\.stage:not\(\[data-rail-collapsed="true"\]\):has\(\.work\[data-state="empty"\]\) > \.rail\s*\{[^}]*display:\s*flex/s);
  });

  it('sizes the assistant from its own drag-resized width with the edge handle visible', () => {
    expect(css).toMatch(/\.stage\[data-right-open="true"\]:has\(\.assistant-host\)\s*\{[^}]*--panel-w:\s*var\(--assistant-w/s);
    // Work area keeps a floor: panel and rail are capped against it.
    expect(css).toMatch(/--work-min:\s*360px/);
    expect(css).toMatch(/--panel-col:\s*min\(var\(--panel-w\),\s*max\(var\(--panel-min\),\s*calc\(100vw - var\(--rail-col\) - 2px - var\(--work-min\)\)\)\)/);
    expect(css).not.toMatch(/:has\(\.assistant-host\) > \.right-resizer-track/);
    expect(css).not.toContain('data-panel-size');
    expect(css).toMatch(/\.stage > \.profile-drawer\.assistant-host\s*\{\s*width:\s*min\(380px,\s*100vw\);?\s*\}/s);
    expect(css).toMatch(/\.assistant-suggestion\s*\{[^}]*width:\s*100%[^}]*max-width:\s*100%[^}]*min-width:\s*0[^}]*white-space:\s*normal[^}]*overflow-wrap:\s*anywhere/s);
  });

  it('prevents long recent file names from widening the empty state', () => {
    expect(css).toMatch(/\.empty \.recent \.row \.name\s*\{[^}]*min-width:\s*0[^}]*overflow:\s*hidden[^}]*text-overflow:\s*ellipsis[^}]*white-space:\s*nowrap/s);
  });
});
