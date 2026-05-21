import { trustedScriptUrl } from './util/dom.js';

const GOATCOUNTER_ENDPOINT = 'https://dataduck.goatcounter.com/count';
const GOATCOUNTER_SCRIPT = 'https://gc.zgo.at/count.js';
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

export function setupAnalytics({
  documentRef = document,
  locationRef = window.location,
  isDev = import.meta.env.DEV,
} = {}) {
  if (isDev || locationRef?.protocol === 'file:' || LOCAL_HOSTS.has(locationRef?.hostname)) return null;

  const script = documentRef.createElement('script');
  script.async = true;
  script.dataset.goatcounter = GOATCOUNTER_ENDPOINT;
  script.src = trustedScriptUrl(GOATCOUNTER_SCRIPT);
  documentRef.head.appendChild(script);
  return script;
}
