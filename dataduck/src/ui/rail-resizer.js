const STORAGE_KEY = 'dataduck:rail-w';
const MIN_PX = 200;
const MAX_PX = 480;
const DEFAULT_PX = 256;
const KEY_STEP = 16;

export function setupRailResize(stage, resizer) {
  const apply = (width) => {
    const next = Math.round(Math.min(Math.max(width, MIN_PX), MAX_PX));
    stage.style.setProperty('--rail-w', `${next}px`);
    resizer.setAttribute('aria-valuenow', String(next));
    return next;
  };

  const persist = (width) => {
    try { localStorage.setItem(STORAGE_KEY, String(width)); } catch { /* private mode */ }
  };

  resizer.setAttribute('aria-valuemin', String(MIN_PX));
  resizer.setAttribute('aria-valuemax', String(MAX_PX));

  let initial = DEFAULT_PX;
  try {
    const stored = Number(localStorage.getItem(STORAGE_KEY));
    if (Number.isFinite(stored) && stored >= MIN_PX && stored <= MAX_PX) initial = stored;
  } catch { /* private mode */ }
  apply(initial);

  const resizeFromViewportX = (clientX) => {
    const box = stage.getBoundingClientRect();
    apply(clientX - box.left);
  };

  resizer.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    resizer.setPointerCapture?.(event.pointerId);
    document.body.classList.add('is-resizing-rail');

    const onMove = (moveEvent) => resizeFromViewportX(moveEvent.clientX);
    const onEnd = () => {
      document.body.classList.remove('is-resizing-rail');
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onEnd);
      window.removeEventListener('pointercancel', onEnd);
      const current = Number(resizer.getAttribute('aria-valuenow'));
      if (Number.isFinite(current)) persist(current);
    };

    resizeFromViewportX(event.clientX);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onEnd);
    window.addEventListener('pointercancel', onEnd);
  });

  resizer.addEventListener('keydown', (event) => {
    const current = Number(resizer.getAttribute('aria-valuenow')) || DEFAULT_PX;
    let next = current;
    if (event.key === 'ArrowLeft') next = current - KEY_STEP;
    else if (event.key === 'ArrowRight') next = current + KEY_STEP;
    else if (event.key === 'Home') next = MIN_PX;
    else if (event.key === 'End') next = MAX_PX;
    else return;
    event.preventDefault();
    persist(apply(next));
  });

  resizer.addEventListener('dblclick', () => {
    persist(apply(DEFAULT_PX));
  });
}
