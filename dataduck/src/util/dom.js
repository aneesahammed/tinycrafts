/**
 * Replace an element's contents with parsed HTML.
 *
 * Uses Range.createContextualFragment instead of element.innerHTML —
 * functionally equivalent for templating but parses through the document's
 * normal HTML parser path, so callers MUST escape any untrusted user input
 * before substituting it into the template string.
 */
export function setHtml(el, html) {
  const range = document.createRange();
  range.selectNodeContents(el);
  el.textContent = '';
  el.appendChild(range.createContextualFragment(html));
}

/**
 * Append parsed HTML as the last child(ren) of an element.
 */
export function appendHtml(el, html) {
  const range = document.createRange();
  range.selectNodeContents(el);
  el.appendChild(range.createContextualFragment(html));
}

const ESCAPE_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ESCAPE_MAP[c]);
}

/**
 * iOS-style segmented activity spinner markup. Pair with `.spin` CSS class.
 * Use `size = 'lg'` for the larger 26px variant.
 */
export function spinner(size = '') {
  const cls = `spin${size ? ` ${size}` : ''}`;
  return `<span class="${cls}" role="status" aria-label="Loading"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span>`;
}
