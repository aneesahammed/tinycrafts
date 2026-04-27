import { describe, expect, it, vi } from 'vitest';
import { mountEditor } from '../src/ui/editor.js';

function createStore() {
  return {
    subscribe: vi.fn(),
  };
}

describe('editor split pane', () => {
  it('mounts a draggable separator that changes the editor height', () => {
    const work = document.createElement('main');
    work.getBoundingClientRect = () => ({
      top: 100,
      bottom: 700,
      height: 600,
      left: 0,
      right: 900,
      width: 900,
      x: 0,
      y: 100,
      toJSON: () => {},
    });

    mountEditor(work, createStore(), { onRun: vi.fn() });

    const splitter = work.querySelector('.editor-resizer');
    expect(splitter).not.toBeNull();
    expect(splitter.getAttribute('role')).toBe('separator');
    expect(splitter.getAttribute('aria-orientation')).toBe('horizontal');

    splitter.dispatchEvent(new MouseEvent('pointerdown', { clientY: 260, bubbles: true }));
    window.dispatchEvent(new MouseEvent('pointermove', { clientY: 360, bubbles: true }));
    window.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }));

    expect(work.style.getPropertyValue('--editor-height')).toBe('260px');
    expect(splitter.getAttribute('aria-valuenow')).toBe('260');
  });
});
