/**
 * Native shell detection & Capacitor chrome (StatusBar, SplashScreen).
 * Tap handling matches mobile web everywhere; only opt-in keys use the touch bridge.
 *
 * Modal buttons register via registerNativeTap + data-native-tap (modal-N keys).
 * The document touchend bridge resolves taps with elementFromPoint and walks up
 * to [data-native-tap] — modal.js also keeps a WeakMap fallback on #modal-overlay.
 */

export function isNativeApp() {
  return (
    typeof window.Capacitor !== 'undefined'
    && window.Capacitor.isNativePlatform?.() === true
  );
}

/** Resolve relative asset paths for Capacitor file:// / https://localhost WebView. */
export function resolveAssetUrl(path) {
  if (!path || /^https?:\/\//i.test(path) || path.startsWith('data:')) return path;
  const Cap = window.Capacitor;
  if (Cap?.convertFileSrc && Cap.isNativePlatform?.()) {
    try {
      const absolute = new URL(path, window.location.href).pathname;
      return Cap.convertFileSrc(absolute);
    } catch {
      /* fall through */
    }
  }
  return path;
}

/** Absolute fetch URL for JSON/assets — relative paths fail on some Capacitor WebViews. */
export function resolveFetchUrl(path) {
  if (!path || /^https?:\/\//i.test(path)) return path;
  try {
    const absolute = new URL(path, window.location.href).href;
    const Cap = window.Capacitor;
    if (Cap?.convertFileSrc && Cap.isNativePlatform?.()) {
      try {
        return Cap.convertFileSrc(new URL(path, window.location.href).pathname);
      } catch {
        /* fall through */
      }
    }
    return absolute;
  } catch {
    return path;
  }
}

function isTapBlocked(el) {
  return Boolean(
    el.disabled
    || el.hidden
    || el.getAttribute('aria-disabled') === 'true'
    || el.closest?.('[inert]'),
  );
}

const TAP_DEDUPE_MS = 400;
const nativeTapHandlers = new Map();
let nativeTouchBridgeReady = false;

if (typeof window !== 'undefined') {
  window.__ptNativeTaps = window.__ptNativeTaps || {};
}

export function registerNativeTap(key, handler) {
  if (!key || typeof handler !== 'function') return;
  nativeTapHandlers.set(String(key), handler);
}

export function unregisterNativeTap(key) {
  nativeTapHandlers.delete(String(key));
}

function findNativeTapTarget(el) {
  let node = el;
  while (node && node !== document.documentElement) {
    const key = node.getAttribute?.('data-native-tap');
    if (key && nativeTapHandlers.has(key)) {
      return { key, node };
    }
    node = node.parentElement;
  }
  return null;
}

function resolveTapHit(x, y, touchTarget) {
  const hits = [];
  if (typeof x === 'number' && typeof y === 'number') {
    hits.push(document.elementFromPoint(x, y));
  }
  if (touchTarget) hits.push(touchTarget);
  for (const hit of hits) {
    const found = findNativeTapTarget(hit);
    if (found) return found;
  }
  return null;
}

/** Fallback bridge for buttons inside scroll layers (train mobile bar). */
function initNativeTouchBridge() {
  if (!isNativeApp() || nativeTouchBridgeReady) return;
  nativeTouchBridgeReady = true;

  let last = { t: 0, x: 0, y: 0 };
  let activeTouchTarget = null;

  document.addEventListener(
    'touchstart',
    (e) => {
      activeTouchTarget = e.target;
    },
    { passive: true, capture: true },
  );

  const dispatchNativeTap = (e, x, y) => {
    const found = resolveTapHit(x, y, activeTouchTarget);
    activeTouchTarget = null;
    if (!found) return false;
    const handler = nativeTapHandlers.get(found.key);
    if (!handler || isTapBlocked(found.node)) return false;

    const now = Date.now();
    const dx = x - last.x;
    const dy = y - last.y;
    if (now - last.t < TAP_DEDUPE_MS && dx * dx + dy * dy < 144) return true;
    last = { t: now, x, y };

    e?.preventDefault?.();
    e?.stopPropagation?.();
    handler(e);
    return true;
  };

  document.addEventListener(
    'touchend',
    (e) => {
      const touch = e.changedTouches?.[0];
      if (!touch) return;
      dispatchNativeTap(e, touch.clientX, touch.clientY);
    },
    { passive: false, capture: true },
  );
}

export function invokeNativeTap(key, e) {
  const handler = nativeTapHandlers.get(String(key));
  if (!handler) return false;
  const el = document.querySelector(`[data-native-tap="${CSS.escape(String(key))}"]`);
  if (el && isTapBlocked(el)) return false;
  handler(e);
  return true;
}

export function unbindTap(el) {
  if (!el) return;
  const key = el.getAttribute?.('data-native-tap');
  if (key) unregisterNativeTap(key);
  el.removeAttribute?.('data-native-tap');
}

/**
 * Same touchend + click binding on web AND Capacitor (matches mobile browser).
 * Pass tapKey only for buttons in scroll layers that need the native bridge fallback.
 */
export function bindTap(el, handler, tapKey) {
  if (!el || typeof handler !== 'function') return;

  el.style.touchAction = 'manipulation';
  el.style.cursor = 'pointer';

  if (isNativeApp() && tapKey) {
    unbindTap(el);
    el.setAttribute('data-native-tap', tapKey);
    registerNativeTap(tapKey, handler);
    window.__ptNativeTaps[tapKey] = handler;
    el.setAttribute('onclick', `window.__ptNativeTaps['${tapKey}']()`);
  }

  let lastAt = 0;
  let touchHandled = false;

  const run = (e) => {
    if (isTapBlocked(el)) return;
    const now = Date.now();
    if (now - lastAt < TAP_DEDUPE_MS) return;
    lastAt = now;
    handler(e);
  };

  el.addEventListener(
    'touchstart',
    () => {
      touchHandled = false;
    },
    { passive: true },
  );

  el.addEventListener(
    'touchend',
    (e) => {
      touchHandled = true;
      if (e.cancelable) e.preventDefault();
      e.stopPropagation();
      run(e);
    },
    { passive: false },
  );

  el.addEventListener('click', (e) => {
    if (touchHandled) {
      touchHandled = false;
      if (e.cancelable) e.preventDefault();
      return;
    }
    if (e?.pointerType === 'mouse' && e?.button !== 0 && e?.button !== undefined) return;
    run(e);
  });
}

/** @deprecated Use bindTap */
export function attachDirectTap(el, handler, tapKey) {
  bindTap(el, handler, tapKey);
}

/** @deprecated Use bindTap */
export function bindNativeClick(el, handler, tapKey) {
  bindTap(el, handler, tapKey);
}

/** @deprecated Use bindTap */
export function bindNativeAction(el, handler, tapKey) {
  bindTap(el, handler, tapKey);
}

async function callPlugin(pluginName, method, ...args) {
  const plugin = window.Capacitor?.Plugins?.[pluginName];
  if (!plugin?.[method]) return;
  try {
    await plugin[method](...args);
  } catch {
    /* plugin optional */
  }
}

export async function initNativeShell() {
  if (!isNativeApp()) return false;

  document.body.classList.add('native-app');
  document.documentElement.classList.add('native-app');
  document.dispatchEvent(new CustomEvent('native-shell-ready'));

  await callPlugin('StatusBar', 'setStyle', { style: 'DARK' });
  await callPlugin('StatusBar', 'setBackgroundColor', { color: '#1a3d2e' });
  await callPlugin('StatusBar', 'setOverlaysWebView', { overlay: false });

  initNativeBackGuard();
  initNativeTouchBridge();

  await callPlugin('SplashScreen', 'hide');

  return true;
}

function initNativeBackGuard() {
  const App = window.Capacitor?.Plugins?.App;
  if (!App?.addListener) return;

  App.addListener('backButton', () => {
    const active = document.querySelector('.screen.active')?.id?.replace('screen-', '') ?? 'menu';
    if (active === 'menu') {
      App.exitApp?.();
      return;
    }
    document.dispatchEvent(new CustomEvent('native-navigate', { detail: { screen: 'menu' } }));
  }).catch(() => {});
}

if (typeof window !== 'undefined' && isNativeApp()) {
  initNativeTouchBridge();
}
