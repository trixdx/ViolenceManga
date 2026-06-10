import {
  getState, updateSettings, updateProfile, resetData,
  importState, mergeState, isValidBackup, flushSave,
} from '../store.js';
import {
  applyAllVisualSettings, showToast, showShortcutsHelp,
  escapeHtml, updateSidebar, PALETTES,
} from '../ui.js';
import { getCurrentUser, getUserPublicInfo, logout } from '../auth.js';
import { updateAuthMenu } from '../menu.js';

import { t, setUiLanguage, applyDocumentI18n } from '../i18n.js';
import { clearPrefetchCache } from '../prefetch.js';
import { getOfflineCacheStats, clearOfflineCache } from '../offline.js';
import { promptInstall } from '../pwa.js';

const TABS = [
  { id: 'appearance', labelKey: 'settings.tab.appearance', icon: '🎨' },
  { id: 'reading', labelKey: 'settings.tab.reading', icon: '📖' },
  { id: 'content', labelKey: 'settings.tab.content', icon: '🌐' },
  { id: 'technical', labelKey: 'settings.tab.technical', icon: '⚙️' },
  { id: 'account', labelKey: 'settings.tab.account', icon: '👤' },
  { id: 'data', labelKey: 'settings.tab.data', icon: '💾' },
];

export function renderSettings(container, navigate, activeTab = 'appearance') {
  const s = getState().settings;
  const profile = getState().profile;

  container.innerHTML = `
    <div class="page-header">
      <h2>${t('settings.title')}</h2>
      <p>${t('settings.subtitle')}</p>
    </div>

    <div class="settings-layout">
      <nav class="settings-nav">
        ${TABS.map(tab => `
          <button class="settings-nav-item ${activeTab === tab.id ? 'active' : ''}" data-tab="${tab.id}">
            <span>${tab.icon}</span> ${t(tab.labelKey)}
          </button>
        `).join('')}
      </nav>

      <div class="settings-panel" id="settings-panel">
        ${renderTab(activeTab, s, profile)}
      </div>
    </div>
  `;

  container.querySelectorAll('.settings-nav-item').forEach(btn => {
    btn.addEventListener('click', () => navigate('settings', { tab: btn.dataset.tab }));
  });

  bindSettingsLogic(container, navigate, activeTab);
}

function renderTab(tab, s, profile) {
  switch (tab) {
    case 'appearance': {
      const palette = PALETTES.find(p => p.id === (s.palette || 'violet')) || PALETTES[0];
      return `
        <h3>Внешний вид</h3>

        <div class="setting-row">
          <div><label>Тема оформления</label><div class="desc">Тёмная или светлая тема</div></div>
          <div class="theme-picker">
            <button class="theme-option ${s.theme === 'dark' ? 'active' : ''}" data-theme="dark">🌙 Тёмная</button>
            <button class="theme-option ${s.theme === 'light' ? 'active' : ''}" data-theme="light">☀️ Светлая</button>
          </div>
        </div>

        <p class="settings-section-title">Цветовая палитра</p>
        <div class="palette-grid">
          ${PALETTES.map(p => `
            <button type="button" class="palette-swatch ${s.palette === p.id || (!s.palette && p.id === 'violet') ? 'active' : ''}"
              data-palette="${p.id}" title="${p.name}">
              <div class="palette-swatch-dots">
                ${p.colors.map(c => `<span style="background:${c}"></span>`).join('')}
              </div>
              ${p.name}
            </button>
          `).join('')}
        </div>

        <div class="fx-preview-card" id="fx-preview">
          <h4>Предпросмотр · ${palette.name}</h4>
          <p style="color:var(--text-secondary);font-size:0.85rem">Так будут выглядеть акценты интерфейса</p>
          <div class="fx-preview-swatches">
            ${palette.colors.map(c => `<div class="fx-preview-swatch" style="background:${c}"></div>`).join('')}
          </div>
          <button type="button" class="btn btn-primary btn-sm">Кнопка</button>
          <button type="button" class="btn btn-ghost btn-sm" style="margin-left:8px">Вторичная</button>
        </div>

        <p class="settings-section-title">Анимации и переходы</p>
        <div class="setting-row">
          <div><label>Анимации</label><div class="desc">Плавные переходы страниц и карточек</div></div>
          <div class="toggle ${s.animations !== false ? 'active' : ''}" data-setting="animations"></div>
        </div>
        <div class="setting-row">
          <div><label>Скорость переходов</label><div class="desc">Как быстро реагирует интерфейс</div></div>
          <select class="select-input" data-setting="transitionSpeed">
            <option value="fast" ${s.transitionSpeed === 'fast' ? 'selected' : ''}>Быстро</option>
            <option value="normal" ${!s.transitionSpeed || s.transitionSpeed === 'normal' ? 'selected' : ''}>Нормально</option>
            <option value="slow" ${s.transitionSpeed === 'slow' ? 'selected' : ''}>Медленно</option>
          </select>
        </div>

        <p class="settings-section-title">Эффекты</p>
        <div class="setting-row">
          <div><label>Свечение</label><div class="desc">Мягкое свечение кнопок и баннеров</div></div>
          <div class="toggle ${s.effectsGlow !== false ? 'active' : ''}" data-setting="effectsGlow"></div>
        </div>
        <div class="setting-row">
          <div><label>Размытие (glass)</label><div class="desc">Стеклянный эффект панелей</div></div>
          <div class="toggle ${s.effectsBlur !== false ? 'active' : ''}" data-setting="effectsBlur"></div>
        </div>
        <div class="setting-row">
          <div><label>Фоновые сферы</label><div class="desc">Анимированные цветные пятна на фоне</div></div>
          <div class="toggle ${s.effectsOrbs !== false ? 'active' : ''}" data-setting="effectsOrbs"></div>
        </div>
        <div class="setting-row">
          <div><label>Hover карточек</label><div class="desc">Подъём и увеличение обложек при наведении</div></div>
          <div class="toggle ${s.effectsCardHover !== false ? 'active' : ''}" data-setting="effectsCardHover"></div>
        </div>

        <p class="settings-section-title">${t('settings.typography')}</p>
        <div class="setting-row">
          <div><label>${t('settings.iosBold')}</label><div class="desc">${t('settings.iosBoldDesc')}</div></div>
          <div class="toggle ${s.iosBoldFont ? 'active' : ''}" data-setting="iosBoldFont"></div>
        </div>

        <div class="setting-row" style="margin-top:16px">
          <div><label>Компактный сайдбар</label><div class="desc">Сворачивать боковое меню</div></div>
          <div class="toggle ${s.compactSidebar ? 'active' : ''}" data-setting="compactSidebar"></div>
        </div>
      `;
    }

    case 'reading':
      return `
        <h3>Настройки чтения</h3>
        <div class="setting-row">
          <div><label>Режим чтения</label><div class="desc">Вертикальная или горизонтальная прокрутка</div></div>
          <select class="select-input" data-setting="readingMode">
            <option value="vertical" ${s.readingMode === 'vertical' ? 'selected' : ''}>Вертикальный</option>
            <option value="horizontal" ${s.readingMode === 'horizontal' ? 'selected' : ''}>Горизонтальный</option>
          </select>
        </div>
        <div class="setting-row">
          <div><label>Подгонка по ширине</label><div class="desc">Растягивать страницы на всю ширину экрана</div></div>
          <div class="toggle ${s.fitWidth ? 'active' : ''}" data-setting="fitWidth"></div>
        </div>
        <div class="setting-row">
          <div><label>Авто-закладка</label><div class="desc">Запоминать последнюю прочитанную страницу</div></div>
          <div class="toggle ${s.autoBookmark ? 'active' : ''}" data-setting="autoBookmark"></div>
        </div>
        <div class="setting-row">
          <div><label>Сортировка глав</label><div class="desc">Порядок отображения глав в списке</div></div>
          <select class="select-input" data-setting="chapterSort">
            <option value="desc" ${s.chapterSort === 'desc' ? 'selected' : ''}>Новые сверху</option>
            <option value="asc" ${s.chapterSort === 'asc' ? 'selected' : ''}>Старые сверху</option>
          </select>
        </div>
        <div class="setting-row">
          <div><label>Разворот страниц</label><div class="desc">Показывать две страницы рядом как в книге</div></div>
          <div class="toggle ${s.pageSpread ? 'active' : ''}" data-setting="pageSpread"></div>
        </div>
        <div class="setting-row">
          <div><label>${t('settings.autoScroll')}</label><div class="desc">${t('settings.autoScrollDesc')} · <kbd>S</kbd> в ридере</div></div>
          <select class="select-input" data-setting="autoScrollSpeed">
            <option value="0" ${!s.autoScrollSpeed ? 'selected' : ''}>${t('settings.autoScrollOff')}</option>
            <option value="1" ${s.autoScrollSpeed == 1 ? 'selected' : ''}>${t('settings.autoScrollSlow')}</option>
            <option value="2" ${s.autoScrollSpeed == 2 ? 'selected' : ''}>${t('settings.autoScrollNormal')}</option>
            <option value="3" ${s.autoScrollSpeed == 3 ? 'selected' : ''}>${t('settings.autoScrollFast')}</option>
            <option value="4" ${s.autoScrollSpeed == 4 ? 'selected' : ''}>${t('settings.autoScrollFaster')}</option>
            <option value="5" ${s.autoScrollSpeed == 5 ? 'selected' : ''}>${t('settings.autoScrollFaster')} ×2</option>
          </select>
        </div>
      `;

    case 'technical':
      return `
        <h3>${t('settings.technical')}</h3>
        <div class="setting-row">
          <div><label>${t('settings.imageProxy')}</label><div class="desc">${t('settings.imageProxyDesc')} (только dev-сервер)</div></div>
          <div class="toggle ${s.imageProxy !== false ? 'active' : ''}" data-setting="imageProxy"></div>
        </div>
        <div class="setting-row">
          <div><label>${t('settings.prefetch')}</label><div class="desc">${t('settings.prefetchDesc')}</div></div>
          <div class="toggle ${s.prefetchEnabled !== false ? 'active' : ''}" data-setting="prefetchEnabled"></div>
        </div>
        <div class="setting-row">
          <div><label>${t('settings.prefetchAhead')}</label><div class="desc">1–8 страниц</div></div>
          <select class="select-input" data-setting="prefetchAhead">
            ${[2, 3, 4, 5, 6, 8].map(n => `
              <option value="${n}" ${(s.prefetchAhead || 3) == n ? 'selected' : ''}>${n}</option>
            `).join('')}
          </select>
        </div>
        <div class="setting-row">
          <div><label>${t('settings.uiLang')}</label><div class="desc">${t('settings.uiLangDesc')}</div></div>
          <select class="select-input" id="ui-language">
            <option value="ru" ${(s.uiLanguage || 'ru') === 'ru' ? 'selected' : ''}>Русский</option>
            <option value="en" ${s.uiLanguage === 'en' ? 'selected' : ''}>English</option>
          </select>
        </div>
        <div class="settings-info">
          <p>📊 <a href="#/stats" id="goto-stats">${t('nav.stats')}</a> — графики чтения</p>
        </div>
      `;

    case 'content':
      return `
        <h3>Контент и язык</h3>
        <div class="setting-row">
          <div><label>Язык перевода</label><div class="desc">Приоритетный язык глав</div></div>
          <select class="select-input" data-setting="language">
            <option value="ru" ${s.language === 'ru' ? 'selected' : ''}>Русский</option>
            <option value="en" ${s.language === 'en' ? 'selected' : ''}>English</option>
          </select>
        </div>
        <div class="setting-row">
          <div><label>${t('settings.autoTranslate')}</label><div class="desc">${t('settings.autoTranslateDesc')}</div></div>
          <div class="toggle ${s.autoTranslate !== false ? 'active' : ''}" data-setting="autoTranslate"></div>
        </div>
        <div class="setting-row">
          <div><label>NSFW контент (18+)</label><div class="desc">Показывать эротику и взрослый контент</div></div>
          <div class="toggle ${s.showNsfw ? 'active' : ''}" data-setting="showNsfw"></div>
        </div>
        <div class="settings-info">
          <p>⚠️ При отключении NSFW контент с рейтингом erotica/pornographic скрывается из каталога.</p>
        </div>
      `;

    case 'account': {
      const user = getCurrentUser();
      const info = user ? getUserPublicInfo(user) : null;
      return `
        <h3>Аккаунт</h3>
        ${info ? `
          <div class="auth-account-card">
            <p><strong>Логин:</strong> @${escapeHtml(info.login)}</p>
            <p><strong>Email:</strong> ${escapeHtml(info.email)}</p>
            <p><strong>Регистрация:</strong> ${new Date(info.createdAt).toLocaleDateString('ru-RU')}</p>
          </div>
          <button class="btn btn-ghost btn-sm" id="settings-logout" style="margin-top:12px;color:var(--danger)">Выйти из аккаунта</button>
          <div class="settings-divider"></div>
        ` : `
          <div class="auth-account-card guest">
            <p>Вы не авторизованы. Прогресс гостя хранится отдельно от аккаунта.</p>
            <div style="display:flex;gap:8px;margin-top:12px">
              <button class="btn btn-primary btn-sm" id="settings-login">Войти</button>
              <button class="btn btn-ghost btn-sm" id="settings-register">Регистрация</button>
            </div>
          </div>
          <div class="settings-divider"></div>
        `}
        <h3>Профиль</h3>
        <div class="setting-row" style="flex-direction:column;align-items:stretch;gap:12px">
          <label>Отображаемое имя</label>
          <input class="text-input" id="settings-name" value="${escapeHtml(profile.name)}" style="width:100%" />
        </div>
        <div class="setting-row" style="flex-direction:column;align-items:stretch;gap:12px">
          <label>О себе</label>
          <textarea class="text-input" id="settings-bio" rows="3" style="width:100%;resize:vertical" placeholder="Расскажите о себе...">${escapeHtml(profile.bio || '')}</textarea>
        </div>
        <button class="btn btn-primary" id="save-account" style="margin-top:12px">Сохранить профиль</button>
        <div class="settings-info" style="margin-top:20px">
          <p>Уровень: <strong>${profile.level}</strong> · XP: <strong>${profile.xp}</strong></p>
        </div>
      `;
    }

    case 'data':
      return `
        <h3>${t('settings.tab.data')}</h3>
        <div class="setting-row">
          <div><label>${t('settings.import')}</label><div class="desc">${t('settings.importDesc')}</div></div>
          <div class="import-actions">
            <input type="file" id="import-file" accept=".json,application/json" hidden />
            <button class="btn btn-ghost btn-sm" id="import-merge">${t('settings.importMerge')}</button>
            <button class="btn btn-primary btn-sm" id="import-replace">${t('settings.importReplace')}</button>
          </div>
        </div>
        <div class="setting-row">
          <div><label>${t('settings.export')}</label><div class="desc">${t('settings.exportDesc')}</div></div>
          <button class="btn btn-ghost btn-sm" id="export-data">${t('settings.exportBtn')}</button>
        </div>
        <div class="setting-row">
          <div>
            <label>${t('settings.offline')}</label>
            <div class="desc" id="offline-stats-desc">${t('settings.offlineDesc')}</div>
          </div>
          <button class="btn btn-ghost btn-sm" id="clear-offline" style="color:var(--danger)">${t('settings.offlineClear')}</button>
        </div>
        <div class="setting-row">
          <div><label>${t('settings.pwa')}</label><div class="desc">${t('settings.pwaDesc')}</div></div>
          <button class="btn btn-primary btn-sm" id="pwa-install">${t('settings.pwaBtn')}</button>
        </div>
        <div class="setting-row">
          <div><label>${t('settings.shortcuts')}</label><div class="desc">${t('settings.shortcutsDesc')}</div></div>
          <button class="btn btn-ghost btn-sm" id="show-shortcuts">${t('settings.shortcutsShow')}</button>
        </div>
        <div class="setting-row">
          <div><label>${t('settings.reset')}</label><div class="desc">${t('settings.resetDesc')}</div></div>
          <button class="btn btn-ghost btn-sm" id="reset-data" style="color:var(--danger)">${t('settings.resetBtn')}</button>
        </div>
        <div class="settings-info">
          <p>${t('settings.version')} <a href="https://mangadex.org" target="_blank">MangaDex API</a></p>
        </div>
      `;

    default:
      return `<p>${t('settings.notFound')}</p>`;
  }
}

function bindSettingsLogic(container, navigate, activeTab) {
  const panel = container.querySelector('#settings-panel');

  const refreshVisuals = () => applyAllVisualSettings(getState().settings);

  panel.querySelectorAll('.toggle[data-setting]').forEach(toggle => {
    toggle.addEventListener('click', () => {
      const key = toggle.dataset.setting;
      const cur = getState().settings[key];
      const isFx = key === 'animations' || key.startsWith('effects')
        || key === 'imageProxy' || key === 'prefetchEnabled' || key === 'autoTranslate';
      const isOn = isFx ? cur !== false : !!cur;
      const newVal = !isOn;
      updateSettings({ [key]: newVal });
      toggle.classList.toggle('active', newVal);
      if (key === 'compactSidebar') {
        document.body.classList.toggle('compact-sidebar', newVal);
      } else if (key === 'imageProxy' || key === 'prefetchEnabled') {
        clearPrefetchCache();
      } else {
        refreshVisuals();
      }
      showToast(t('toast.saved'));
    });
  });

  panel.querySelectorAll('.select-input[data-setting]').forEach(select => {
    select.addEventListener('change', () => {
      const val = ['prefetchAhead', 'autoScrollSpeed'].includes(select.dataset.setting)
        ? parseInt(select.value, 10)
        : select.value;
      updateSettings({ [select.dataset.setting]: val });
      if (select.dataset.setting === 'prefetchAhead') clearPrefetchCache();
      else refreshVisuals();
      showToast(t('toast.saved'));
    });
  });

  document.getElementById('ui-language')?.addEventListener('change', (e) => {
    setUiLanguage(e.target.value);
    applyDocumentI18n();
    showToast(t('toast.saved'), 'success');
    navigate('settings', { tab: 'technical' });
  });

  document.getElementById('goto-stats')?.addEventListener('click', (e) => {
    e.preventDefault();
    navigate('stats');
  });

  panel.querySelectorAll('.theme-option').forEach(btn => {
    btn.addEventListener('click', () => {
      updateSettings({ theme: btn.dataset.theme });
      refreshVisuals();
      panel.querySelectorAll('.theme-option').forEach(b => b.classList.toggle('active', b === btn));
      showToast('Тема изменена');
    });
  });

  panel.querySelectorAll('.palette-swatch').forEach(btn => {
    btn.addEventListener('click', () => {
      const paletteId = btn.dataset.palette;
      updateSettings({ palette: paletteId });
      refreshVisuals();
      panel.querySelectorAll('.palette-swatch').forEach(b => b.classList.toggle('active', b === btn));
      const p = PALETTES.find(x => x.id === paletteId);
      const preview = document.getElementById('fx-preview');
      if (preview && p) {
        preview.querySelector('h4').textContent = `Предпросмотр · ${p.name}`;
        const swatches = preview.querySelector('.fx-preview-swatches');
        if (swatches) {
          swatches.innerHTML = p.colors.map(c =>
            `<div class="fx-preview-swatch" style="background:${c}"></div>`
          ).join('');
        }
      }
      showToast(`Палитра: ${p?.name || paletteId}`, 'success');
    });
  });

  document.getElementById('settings-login')?.addEventListener('click', () => navigate('login'));
  document.getElementById('settings-register')?.addEventListener('click', () => navigate('register'));
  document.getElementById('settings-logout')?.addEventListener('click', () => {
    logout().then(() => {
      updateAuthMenu();
      updateSidebar();
      showToast(t('toast.logout'));
      navigate('home');
    });
  });

  document.getElementById('save-account')?.addEventListener('click', () => {
    const name = document.getElementById('settings-name')?.value.trim();
    const bio = document.getElementById('settings-bio')?.value.trim();
    if (name) updateProfile({ name, bio });
    showToast('Профиль сохранён', 'success');
  });

  document.getElementById('show-shortcuts')?.addEventListener('click', showShortcutsHelp);

  document.getElementById('export-data')?.addEventListener('click', () => {
    const data = JSON.stringify(getState(), null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'violence-backup.json';
    a.click();
    showToast(t('toast.exported'), 'success');
  });

  async function handleImport(mode) {
    const input = document.getElementById('import-file');
    if (!input) return;
    input.onchange = async () => {
      const file = input.files?.[0];
      input.value = '';
      if (!file) return;
      try {
        const data = JSON.parse(await file.text());
        if (!isValidBackup(data)) {
          showToast(t('toast.importFail'), 'error');
          return;
        }
        if (mode === 'replace' && !confirm(t('settings.importConfirm'))) return;
        if (mode === 'replace')         importState(data);
        else mergeState(data);
        applyAllVisualSettings(getState().settings);
        flushSave().finally(() => {
          showToast(t('toast.imported'), 'success');
          location.reload();
        });
      } catch {
        showToast(t('toast.importFail'), 'error');
      }
    };
    input.click();
  }

  document.getElementById('import-replace')?.addEventListener('click', () => handleImport('replace'));
  document.getElementById('import-merge')?.addEventListener('click', () => handleImport('merge'));

  document.getElementById('pwa-install')?.addEventListener('click', async () => {
    const ok = await promptInstall();
    if (!ok) showToast(t('settings.pwaDesc'), 'info');
  });

  if (activeTab === 'data') {
    getOfflineCacheStats().then(stats => {
      const el = document.getElementById('offline-stats-desc');
      if (el) {
        el.textContent = `${t('settings.offlineDesc')} · ${t('settings.offlineStats', stats)}`;
      }
    });
  }

  document.getElementById('clear-offline')?.addEventListener('click', async () => {
    await clearOfflineCache();
    showToast(t('toast.offlineCleared'), 'success');
    const el = document.getElementById('offline-stats-desc');
    if (el) el.textContent = `${t('settings.offlineDesc')} · ${t('settings.offlineStats', { chapters: 0, pages: 0 })}`;
  });

  document.getElementById('reset-data')?.addEventListener('click', () => {
    if (confirm(t('settings.resetConfirm'))) {
      resetData().then(() => {
        applyAllVisualSettings(getState().settings);
        showToast(t('toast.reset'));
        location.reload();
      });
    }
  });
}
