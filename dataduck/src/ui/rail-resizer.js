const STORAGE_KEY = 'dataduck:rail-w';
const MIN_PX = 200;
const MAX_PX = 480;
const DEFAULT_PX = 256;
const KEY_STEP = 16;
// Mirrors --work-min / --panel-min in styles.css: drags stop where the grid
// would start squeezing the work area, so the handle never "slips".
const WORK_MIN_PX = 360;
const TRACKS_PX = 2;

const widthOf = (el) => el?.getBoundingClientRect().width || 0;

export function setupRailResize(stage, resizer) {
  // Room left for the rail once the work area and any open panel keep their minimums.
  const layoutMax = () => {
    const stageWidth = widthOf(stage);
    if (!stageWidth) return MAX_PX;
    const panelMin = stage.dataset.rightOpen === 'true' ? RIGHT_MIN_PX : 0;
    return stageWidth - WORK_MIN_PX - TRACKS_PX - panelMin;
  };

  // fit=false on startup: the stored width is restored as-is and CSS caps it
  // for the current window, so a narrow first load never shrinks it for good.
  const apply = (width, fit = true) => {
    const next = Math.round(Math.max(MIN_PX, Math.min(width, MAX_PX, fit ? layoutMax() : Infinity)));
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
  apply(initial, false);

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
    const current = widthOf(stage.querySelector('.rail')) || Number(resizer.getAttribute('aria-valuenow')) || DEFAULT_PX;
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

const RIGHT_MIN_PX = 320;
const RIGHT_MAX_PX = 900;
// The assistant keeps its own width (and opens wider by default) so a wide
// chat never widens the column profile, chart or snapshots panel.
const RIGHT_PANELS = {
  panel: { prop: '--right-w', key: 'dataduck:right-w', def: 420 },
  assistant: { prop: '--assistant-w', key: 'dataduck:assistant-w', def: 480 },
};

export function setupRightResize(stage, resizer) {
  const target = () => (stage.querySelector('.assistant-host') ? RIGHT_PANELS.assistant : RIGHT_PANELS.panel);
  // Prefer the rendered width: CSS may be capping a larger stored value.
  const current = (panel = target()) => widthOf(stage.querySelector('.right-panel:not([hidden])'))
    || parseFloat(stage.style.getPropertyValue(panel.prop)) || panel.def;
  // Room left for the panel once the rail and the work area's minimum are placed.
  const layoutMax = () => {
    const stageWidth = widthOf(stage);
    if (!stageWidth) return RIGHT_MAX_PX;
    return stageWidth - widthOf(stage.querySelector('.rail')) - TRACKS_PX - WORK_MIN_PX;
  };

  const apply = (width, panel = target(), fit = true) => {
    const next = Math.round(Math.max(RIGHT_MIN_PX, Math.min(width, RIGHT_MAX_PX, fit ? layoutMax() : Infinity)));
    stage.style.setProperty(panel.prop, `${next}px`);
    resizer.setAttribute('aria-valuenow', String(next));
    return next;
  };

  const persist = (width, panel = target()) => {
    try { localStorage.setItem(panel.key, String(width)); } catch { /* private mode */ }
  };

  resizer.setAttribute('aria-valuemin', String(RIGHT_MIN_PX));
  resizer.setAttribute('aria-valuemax', String(RIGHT_MAX_PX));

  for (const panel of Object.values(RIGHT_PANELS)) {
    let initial = panel.def;
    try {
      const stored = Number(localStorage.getItem(panel.key));
      if (Number.isFinite(stored) && stored >= RIGHT_MIN_PX && stored <= RIGHT_MAX_PX) initial = stored;
    } catch { /* private mode */ }
    apply(initial, panel, false);
  }
  // The handle serves whichever panel is open; report that panel's width.
  resizer.addEventListener('focus', () => resizer.setAttribute('aria-valuenow', String(current())));

  // The right panel sits on the RIGHT edge of the stage, so the panel grows
  // as the user drags toward the LEFT. Compute the panel width from the
  // distance between the pointer and the stage's right edge.
  const resizeFromViewportX = (clientX) => {
    const box = stage.getBoundingClientRect();
    apply(box.right - clientX);
  };

  resizer.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    resizer.setPointerCapture?.(event.pointerId);
    document.body.classList.add('is-resizing-right');

    const onMove = (moveEvent) => resizeFromViewportX(moveEvent.clientX);
    const onEnd = () => {
      document.body.classList.remove('is-resizing-right');
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onEnd);
      window.removeEventListener('pointercancel', onEnd);
      persist(current());
    };

    resizeFromViewportX(event.clientX);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onEnd);
    window.addEventListener('pointercancel', onEnd);
  });

  resizer.addEventListener('keydown', (event) => {
    const width = current();
    let next = width;
    // Right arrow shrinks (panel right edge is fixed, drag-right narrows it),
    // left arrow widens. Mirrors what dragging the handle does in either direction.
    if (event.key === 'ArrowLeft') next = width + KEY_STEP;
    else if (event.key === 'ArrowRight') next = width - KEY_STEP;
    else if (event.key === 'Home') next = RIGHT_MAX_PX;
    else if (event.key === 'End') next = RIGHT_MIN_PX;
    else return;
    event.preventDefault();
    persist(apply(next));
  });

  resizer.addEventListener('dblclick', () => {
    persist(apply(target().def));
  });
}
