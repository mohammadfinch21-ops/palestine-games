/**
 * Native shell detection & Capacitor chrome (StatusBar, SplashScreen).
 * Web browsers are unaffected — no `native-app` class is added.
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

  const bottomNav = document.getElementById('native-bottom-nav');
  if (bottomNav) bottomNav.hidden = false;

  initTrainSidebarSheet();
  initNativeBackGuard();

  /* Hide splash once DOM shell is ready */
  await callPlugin('SplashScreen', 'hide');

  return true;
}

function initTrainSidebarSheet() {
  const toggle = document.getElementById('train-sidebar-toggle');
  const sidebar = document.querySelector('.train-sidebar');
  const backdrop = document.getElementById('train-sidebar-backdrop');
  if (!toggle || !sidebar) return;

  const close = () => {
    sidebar.classList.remove('open');
    backdrop?.classList.remove('open');
    toggle.setAttribute('aria-expanded', 'false');
  };

  const open = () => {
    sidebar.classList.add('open');
    backdrop?.classList.add('open');
    toggle.setAttribute('aria-expanded', 'true');
  };

  toggle.addEventListener('click', () => {
    if (sidebar.classList.contains('open')) close();
    else open();
  });

  backdrop?.addEventListener('click', close);

  document.addEventListener('native-screen-change', (e) => {
    if (e.detail?.screen !== 'train') close();
  });
}

/** Prevent Android hardware back from leaving the app unintentionally on home */
function initNativeBackGuard() {
  const App = window.Capacitor?.Plugins?.App;
  if (!App?.addListener) return;

  App.addListener('backButton', ({ canGoBack }) => {
    const active = document.querySelector('.screen.active')?.id?.replace('screen-', '') ?? 'menu';
    if (active === 'menu') {
      App.exitApp?.();
      return;
    }
    document.dispatchEvent(new CustomEvent('native-navigate', { detail: { screen: 'menu' } }));
  }).catch(() => {});
}
