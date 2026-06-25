/**
 * Native shell detection & Capacitor chrome (StatusBar, SplashScreen).
 * Web browsers are unaffected — no `native-app` class is added.
 * UI layout matches the Netlify web app (styles.css); mobile-native.css
 * only adds safe-area / tap / overscroll tweaks — not a separate shell.
 */

export function isNativeApp() {
  return (
    typeof window.Capacitor !== 'undefined'
    && window.Capacitor.isNativePlatform?.() === true
  );
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

  await callPlugin('StatusBar', 'setStyle', { style: 'DARK' });
  await callPlugin('StatusBar', 'setBackgroundColor', { color: '#1a3d2e' });
  await callPlugin('StatusBar', 'setOverlaysWebView', { overlay: false });

  initNativeBackGuard();

  await callPlugin('SplashScreen', 'hide');

  return true;
}

/** Prevent Android hardware back from leaving the app unintentionally on home */
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
