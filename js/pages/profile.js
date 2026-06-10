import { getState, updateProfile } from '../store.js';
import { ACHIEVEMENTS, getAchievementProgress } from '../achievements.js';
import { escapeHtml, formatReadTime, showToast, refreshAllAvatars } from '../ui.js';
import { getCurrentUser, getUserPublicInfo, logout } from '../auth.js';
import { updateAuthMenu } from '../menu.js';
import { updateSidebar } from '../ui.js';
import {
  renderAvatarPickerHtml, bindAvatarPicker, applyAvatarEl,
} from '../avatars.js';

export function renderProfile(container, navigate) {
  const state = getState();
  const xpNeeded = state.profile.level * 100;
  const xpPercent = Math.round((state.profile.xp / xpNeeded) * 100);
  const unlockedCount = Object.keys(state.achievements).length;
  const joined = new Date(state.profile.joinedAt).toLocaleDateString('ru-RU');
  const daysSince = Math.floor((Date.now() - state.profile.joinedAt) / 86400000);
  const user = getCurrentUser();
  const userInfo = user ? getUserPublicInfo(user) : null;
  const selectedAvatar = state.profile.avatarUrl
    || (state.profile.avatar?.length === 1 && !state.profile.avatarUrl ? 'letter' : '');

  container.innerHTML = `
    <div class="page-header">
      <h2>Профиль</h2>
      <p>${daysSince} дней с вами</p>
    </div>

    <div class="profile-grid">
      <div class="profile-card">
        <div class="avatar avatar-lg profile-avatar-main" id="profile-avatar"></div>
        <h3 id="profile-name-display">${escapeHtml(state.profile.name)}</h3>
        ${state.profile.bio ? `<p class="profile-bio">${escapeHtml(state.profile.bio)}</p>` : ''}
        <div class="level-badge">Уровень ${state.profile.level}</div>
        <div class="xp-bar"><div class="xp-bar-fill" style="width:${xpPercent}%"></div></div>
        <span class="xp-label">${state.profile.xp} / ${xpNeeded} XP</span>
        <p class="profile-joined">С нами с ${joined}</p>
        ${userInfo
          ? `<p class="profile-auth-info">@${escapeHtml(userInfo.login)} · ${escapeHtml(userInfo.email)}</p>`
          : `<div class="profile-guest-banner">
              <p>Вы вошли как гость. Зарегистрируйтесь, чтобы сохранить прогресс на этом устройстве.</p>
              <div class="profile-guest-actions">
                <button class="btn btn-primary btn-sm" id="go-login">Войти</button>
                <button class="btn btn-ghost btn-sm" id="go-register">Регистрация</button>
              </div>
            </div>`}

        <div class="profile-actions">
          <button class="btn btn-primary btn-sm" id="edit-profile">Редактировать</button>
          <button class="btn btn-ghost btn-sm" id="go-achievements">Достижения</button>
          ${userInfo ? '<button class="btn btn-ghost btn-sm profile-logout" id="profile-logout">Выйти</button>' : ''}
        </div>

        <div class="profile-edit-form" id="profile-edit" hidden>
          <div id="profile-avatar-picker-wrap">
            ${renderAvatarPickerHtml(state.profile.avatarUrl || (selectedAvatar === 'letter' ? 'letter' : ''))}
          </div>
          <label>Имя</label>
          <input class="text-input" id="profile-name-input" value="${escapeHtml(state.profile.name)}" />
          <label style="margin-top:10px">О себе</label>
          <textarea class="text-input" id="profile-bio-input" rows="2">${escapeHtml(state.profile.bio || '')}</textarea>
          <button class="btn btn-primary" id="save-profile" style="width:100%;margin-top:12px">Сохранить</button>
        </div>
      </div>

      <div>
        <div class="stats-grid">
          <div class="stat-card"><strong>${state.stats.chaptersRead}</strong><span>Глав</span></div>
          <div class="stat-card"><strong>${state.stats.pagesRead}</strong><span>Страниц</span></div>
          <div class="stat-card"><strong>${state.favorites.length}</strong><span>Избранное</span></div>
          <div class="stat-card"><strong>${state.lists.reading.length}</strong><span>Читаю</span></div>
          <div class="stat-card"><strong>${state.stats.mangaOpened}</strong><span>Открыто</span></div>
          <div class="stat-card"><strong>${formatReadTime(state.stats.totalReadTime)}</strong><span>Чтение</span></div>
          <div class="stat-card"><strong>${unlockedCount}/${ACHIEVEMENTS.length}</strong><span>Достижений</span></div>
          <div class="stat-card"><strong>${state.stats.searchCount}</strong><span>Поисков</span></div>
        </div>

        <h3 class="section-title" style="margin-top:24px">Ближайшие достижения</h3>
        <div class="achievements-grid">
          ${ACHIEVEMENTS
            .filter(a => !state.achievements[a.id])
            .slice(0, 3)
            .map(ach => {
              const prog = getAchievementProgress(ach);
              return `
                <div class="achievement-card locked">
                  <div class="achievement-icon">${ach.icon}</div>
                  <div class="achievement-info">
                    <h4>${ach.title}</h4>
                    <p>${ach.desc}</p>
                    <div class="progress-bar-mini"><div style="width:${prog.progress}%"></div></div>
                    <div class="progress-text">${prog.current || 0} / ${prog.target}</div>
                  </div>
                </div>
              `;
            }).join('') || '<p style="color:var(--text-muted)">Все достижения получены! 🎉</p>'}
        </div>

        <h3 class="section-title" style="margin-top:24px">Быстрые ссылки</h3>
        <div class="quick-links">
          <button class="quick-link" data-go="library">📚 Библиотека</button>
          <button class="quick-link" data-go="browse">🔍 Каталог</button>
          <button class="quick-link" data-go="settings">⚙️ Настройки</button>
          <button class="quick-link" data-go="stats">📊 Статистика</button>
        </div>
      </div>
    </div>
  `;

  applyAvatarEl(document.getElementById('profile-avatar'), state.profile);

  let pendingAvatar = {
    avatarUrl: state.profile.avatarUrl || '',
    avatar: state.profile.avatar,
  };

  document.getElementById('edit-profile')?.addEventListener('click', () => {
    document.getElementById('profile-edit').hidden = false;
  });

  bindAvatarPicker(document.getElementById('profile-avatar-picker-wrap'), {
    previewEl: document.getElementById('profile-avatar'),
    onSelect: (patch) => {
      if (patch.error) {
        showToast(patch.error, 'error');
        return;
      }
      pendingAvatar = { avatarUrl: patch.avatarUrl ?? pendingAvatar.avatarUrl, avatar: patch.avatar };
    },
  });

  document.getElementById('save-profile')?.addEventListener('click', () => {
    const name = document.getElementById('profile-name-input').value.trim();
    const bio = document.getElementById('profile-bio-input').value.trim();
    if (!name) return;

    const updates = { name, bio, ...pendingAvatar };
    if (!updates.avatarUrl) {
      updates.avatar = name[0].toUpperCase();
    }
    updateProfile(updates);
    document.getElementById('profile-name-display').textContent = name;
    document.getElementById('user-name').textContent = name;
    applyAvatarEl(document.getElementById('profile-avatar'), getState().profile);
    refreshAllAvatars();
    document.getElementById('profile-edit').hidden = true;
    showToast('Профиль сохранён', 'success');
  });

  document.getElementById('go-achievements')?.addEventListener('click', () => navigate('achievements'));
  document.getElementById('go-login')?.addEventListener('click', () => navigate('login'));
  document.getElementById('go-register')?.addEventListener('click', () => navigate('register'));
  document.getElementById('profile-logout')?.addEventListener('click', () => {
    logout().then(() => {
      updateAuthMenu();
      updateSidebar();
      showToast('Вы вышли из аккаунта');
      navigate('home');
    });
  });
  container.querySelectorAll('[data-go]').forEach(btn => {
    btn.addEventListener('click', () => navigate(btn.dataset.go));
  });
}
