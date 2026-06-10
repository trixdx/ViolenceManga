let deferredInstall = null;

export function initPwa() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstall = e;
    showInstallBanner();
  });

  window.addEventListener('appinstalled', () => {
    deferredInstall = null;
    hideInstallBanner();
  });
}

function showInstallBanner() {
  if (document.getElementById('pwa-install-banner')) return;
  const banner = document.createElement('div');
  banner.id = 'pwa-install-banner';
  banner.className = 'pwa-install-banner';
  banner.innerHTML = `
    <span id="pwa-install-text"></span>
    <button class="btn btn-primary btn-sm" id="pwa-install-btn">Install</button>
    <button class="btn btn-ghost btn-sm" id="pwa-install-dismiss">×</button>
  `;
  document.body.appendChild(banner);

  import('./i18n.js').then(({ t }) => {
    document.getElementById('pwa-install-text').textContent = t('pwa.install');
    document.getElementById('pwa-install-btn').textContent = t('pwa.installBtn');
  });

  document.getElementById('pwa-install-btn')?.addEventListener('click', async () => {
    if (!deferredInstall) return;
    deferredInstall.prompt();
    await deferredInstall.userChoice;
    hideInstallBanner();
  });

  document.getElementById('pwa-install-dismiss')?.addEventListener('click', hideInstallBanner);
}

function hideInstallBanner() {
  document.getElementById('pwa-install-banner')?.remove();
}

export async function promptInstall() {
  if (!deferredInstall) return false;
  deferredInstall.prompt();
  const { outcome } = await deferredInstall.userChoice;
  return outcome === 'accepted';
}
