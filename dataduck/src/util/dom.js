// Single, named Trusted Types policy. With `require-trusted-types-for 'script'`
// in CSP, ANY DOM-XSS sink (innerHTML, createContextualFragment, etc.) refuses
// raw strings — it must receive a TrustedHTML produced by a CSP-allowlisted
// policy. We expose exactly one ('dataduck-html') and route every templated
// HTML write through it. If a future regression ever feeds a string straight
// to innerHTML somewhere else, the browser throws instead of parsing it.
//
// The policy is pass-through: this codebase already escapes user input via
// `esc()` before substitution, so the policy's job is structural — it is the
// single registered chokepoint, not a sanitizer. Browsers without Trusted
// Types support (Firefox, Safari today) silently skip the policy and behave
// as before; the CSP directive is also ignored on those engines.
const TRUSTED_TYPES_POLICY_NAME = 'dataduck-html';
const TRUSTED_TYPES_POLICY_KEY = Symbol.for('dataduck.trustedTypesPolicy');

const trustedHtmlPolicy = (() => {
  const tt = globalThis.trustedTypes;
  if (!tt?.createPolicy) return null;
  if (globalThis[TRUSTED_TYPES_POLICY_KEY]) return globalThis[TRUSTED_TYPES_POLICY_KEY];
  try {
    const policy = tt.createPolicy(TRUSTED_TYPES_POLICY_NAME, {
      createHTML: (input) => String(input),
      // Worker / script URL sinks. Validate the URL is same-origin (or
      // blob: from same origin) before producing a TrustedScriptURL.
      // The only third-party script exception is GoatCounter's collector.
      createScriptURL: (input) => {
        const raw = String(input);
        const url = new URL(raw, globalThis.location?.href ?? 'http://localhost');
        const sameOrigin = url.origin === globalThis.location?.origin;
        const goatCounterScript = url.href === 'https://gc.zgo.at/count.js';
        const allowedScheme = ['http:', 'https:', 'file:', 'blob:'].includes(url.protocol);
        if ((!sameOrigin && !goatCounterScript) || !allowedScheme) {
          throw new Error(`Untrusted script URL refused by dataduck-html policy: ${raw}`);
        }
        return raw;
      },
    });
    globalThis[TRUSTED_TYPES_POLICY_KEY] = policy;
    return policy;
  } catch (error) {
    // In dev, HMR can leave behind a policy created by an older module instance.
    // Production should fail closed if CSP blocks the only approved policy.
    if (import.meta.env?.DEV) return null;
    throw error;
  }
})();

function toTrustedHtml(html) {
  return trustedHtmlPolicy ? trustedHtmlPolicy.createHTML(html) : html;
}

/**
 * Wrap a same-origin script/worker URL as a TrustedScriptURL. On browsers
 * without Trusted Types support the input is returned as-is. The policy
 * throws on cross-origin URLs, so callers do not have to validate themselves.
 */
export function trustedScriptUrl(url) {
  return trustedHtmlPolicy ? trustedHtmlPolicy.createScriptURL(url) : url;
}

/**
 * Replace an element's contents with parsed HTML.
 *
 * Uses Range.createContextualFragment instead of element.innerHTML —
 * functionally equivalent for templating but parses through the document's
 * normal HTML parser path. Callers MUST escape any untrusted user input
 * before substituting it into the template string. Output is funneled
 * through the 'dataduck-html' Trusted Types policy where supported.
 */
export function setHtml(el, html) {
  const range = document.createRange();
  range.selectNodeContents(el);
  el.textContent = '';
  el.appendChild(range.createContextualFragment(toTrustedHtml(html)));
}

/**
 * Append parsed HTML as the last child(ren) of an element.
 */
export function appendHtml(el, html) {
  const range = document.createRange();
  range.selectNodeContents(el);
  el.appendChild(range.createContextualFragment(toTrustedHtml(html)));
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
  const cls = size === 'lg' ? 'spin lg' : 'spin';
  return `<span class="${cls}" role="status" aria-label="Loading"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span>`;
}
