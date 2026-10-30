import { beforeEach, describe, expect, it } from 'vitest';
import { setupRailResize, setupRightResize } from '../src/ui/rail-resizer.js';

function mount() {
  const stage = document.createElement('div');
  const host = document.createElement('aside');
  host.className = 'right-panel profile-drawer';
  const resizer = document.createElement('div');
  stage.append(host);
  setupRightResize(stage, resizer);
  return { stage, host, resizer };
}

const width = (stage, prop) => stage.style.getPropertyValue(prop);

describe('right panel edge resize', () => {
  beforeEach(() => localStorage.clear());

  it('gives the assistant its own remembered width, separate from the other panels', () => {
    const { stage, host, resizer } = mount();
    expect(width(stage, '--right-w')).toBe('420px');
    expect(width(stage, '--assistant-w')).toBe('480px');

    host.classList.add('assistant-host');
    resizer.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    expect(width(stage, '--assistant-w')).toBe('496px');
    expect(width(stage, '--right-w')).toBe('420px');
    expect(localStorage.getItem('dataduck:assistant-w')).toBe('496');

    host.classList.remove('assistant-host');
    resizer.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    expect(width(stage, '--right-w')).toBe('404px');
    expect(width(stage, '--assistant-w')).toBe('496px');
  });

  it('double-click resets only the open panel to its own default', () => {
    const { stage, host, resizer } = mount();
    host.classList.add('assistant-host');
    resizer.dispatchEvent(new KeyboardEvent('keydown', { key: 'End' }));
    expect(width(stage, '--assistant-w')).toBe('320px');
    resizer.dispatchEvent(new MouseEvent('dblclick'));
    expect(width(stage, '--assistant-w')).toBe('480px');
  });
});

describe('edge resize never squeezes the work area', () => {
  beforeEach(() => localStorage.clear());

  const sized = (el, width) => { el.getBoundingClientRect = () => ({ width, height: 0, x: 0, y: 0, left: 0, top: 0, right: width, bottom: 0 }); };

  function layout(stageWidth, railWidth) {
    const stage = document.createElement('div');
    const rail = document.createElement('aside');
    rail.className = 'rail';
    const host = document.createElement('aside');
    host.className = 'right-panel profile-drawer assistant-host';
    stage.append(rail, host);
    sized(stage, stageWidth);
    sized(rail, railWidth);
    return { stage, rail };
  }

  it('stops the right panel where the work area would drop below 360px', () => {
    const { stage } = layout(1000, 256);
    const resizer = document.createElement('div');
    setupRightResize(stage, resizer);
    resizer.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home' }));
    // 1000 stage - 256 rail - 2 tracks - 360 work minimum
    expect(stage.style.getPropertyValue('--assistant-w')).toBe('382px');
  });

  it('stops the rail where the work area and an open panel would be squeezed', () => {
    const { stage } = layout(1000, 256);
    stage.dataset.rightOpen = 'true';
    const resizer = document.createElement('div');
    setupRailResize(stage, resizer);
    resizer.dispatchEvent(new KeyboardEvent('keydown', { key: 'End' }));
    // 1000 - 360 work - 2 tracks - 320 panel minimum
    expect(stage.style.getPropertyValue('--rail-w')).toBe('318px');
  });

  it('restores stored widths untouched on load; CSS caps them for the window', () => {
    localStorage.setItem('dataduck:assistant-w', '900');
    const { stage } = layout(1000, 256);
    setupRightResize(stage, document.createElement('div'));
    expect(stage.style.getPropertyValue('--assistant-w')).toBe('900px');
  });
});
