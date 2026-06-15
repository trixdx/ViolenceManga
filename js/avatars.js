import { getState } from './store.js';

export const AVATAR_PRESETS = [
  { id: 'violet', bg: 'linear-gradient(135deg, #c084fc, #7c3aed)', emoji: '🦊' },
  { id: 'rose', bg: 'linear-gradient(135deg, #fb7185, #e11d48)', emoji: '🐱' },
  { id: 'cyan', bg: 'linear-gradient(135deg, #22d3ee, #0891b2)', emoji: '🐺' },
  { id: 'emerald', bg: 'linear-gradient(135deg, #34d399, #059669)', emoji: '🐉' },
  { id: 'amber', bg: 'linear-gradient(135deg, #fbbf24, #d97706)', emoji: '🦁' },
  { id: 'indigo', bg: 'linear-gradient(135deg, #818cf8, #4338ca)', emoji: '🦉' },
  { id: 'crimson', bg: 'linear-gradient(135deg, #f87171, #b91c1c)', emoji: '🐼' },
  { id: 'night', bg: 'linear-gradient(135deg, #6366f1, #0f172a)', emoji: '🌙' },
  { id: 'sakura', bg: 'linear-gradient(135deg, #f9a8d4, #db2777)', emoji: '🌸' },
  { id: 'ocean', bg: 'linear-gradient(135deg, #38bdf8, #1d4ed8)', emoji: '🐬' },
  { id: 'manga', bg: 'linear-gradient(135deg, #a855f7, #1a1230)', emoji: '📖' },
  { id: 'fire', bg: 'linear-gradient(135deg, #f97316, #dc2626)', emoji: '🔥' },
];

const MAX_UPLOAD_BYTES = 180_000;

export function resolveAvatar(profile = getState().profile) {
  const url = profile?.avatarUrl || '';
  if (url.startsWith('data:image')) return { kind: 'image', src: url };
  if (url.startsWith('preset:')) {
    const id = url.slice(7);
    const preset = AVATAR_PRESETS.find(p => p.id === id);
    if (preset) return { kind: 'preset', ...preset };
  }
  if (url.startsWith('emoji:')) {
    return { kind: 'emoji', emoji: url.slice(6), bg: 'linear-gradient(135deg, var(--accent-light), var(--accent-dark))' };
  }
  const letter = (profile?.avatar || profile?.name?.[0] || 'G').slice(0, 1).toUpperCase();
  return { kind: 'letter', letter, bg: 'linear-gradient(135deg, var(--accent-light), var(--accent-dark))' };
}

export function applyAvatarEl(el, profile) {
  if (!el) return;
  const av = resolveAvatar(profile);
  el.classList.add('avatar');
  el.innerHTML = '';
  el.style.background = '';
  el.removeAttribute('data-avatar-kind');

  if (av.kind === 'image') {
    el.dataset.avatarKind = 'image';
    const img = document.createElement('img');
    img.src = av.src;
    img.alt = '';
    el.appendChild(img);
    return;
  }

  el.dataset.avatarKind = av.kind;
  el.style.background = av.bg;
  if (av.kind === 'letter') {
    el.textContent = av.letter;
  } else {
    el.textContent = av.emoji;
    el.classList.add('avatar-emoji');
  }
}

export function renderAvatarPickerHtml(selectedUrl = '') {
  return `
    <div class="avatar-picker">
      <p class="avatar-picker-label">Выберите аватар</p>
      <div class="avatar-picker-grid">
        ${AVATAR_PRESETS.map(p => {
          const val = `preset:${p.id}`;
          const active = selectedUrl === val ? ' active' : '';
          return `
            <button type="button" class="avatar-pick${active}" data-avatar-value="${val}"
              style="background:${p.bg}" title="${p.emoji}">
              ${p.emoji}
            </button>`;
        }).join('')}
        <button type="button" class="avatar-pick avatar-pick-letter${selectedUrl === 'letter' ? ' active' : ''}"
          data-avatar-value="letter" title="Буква">
          A
        </button>
      </div>
      <div class="avatar-upload-row">
        <input type="file" id="avatar-file-input" accept="image/png,image/jpeg,image/webp,image/gif" hidden />
        <button type="button" class="btn btn-ghost btn-sm" id="avatar-upload-btn">📷 Загрузить фото</button>
        <button type="button" class="btn btn-ghost btn-sm" id="avatar-clear-btn">Сбросить</button>
      </div>
    </div>
  `;
}

export function bindAvatarPicker(container, { onSelect, previewEl }) {
  container.querySelectorAll('.avatar-pick').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.avatar-pick').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const val = btn.dataset.avatarValue;
      if (val === 'letter') {
        onSelect({ avatarUrl: '', avatar: getState().profile.name?.[0]?.toUpperCase() || 'G' });
        applyAvatarEl(previewEl, getState().profile);
        return;
      }
      onSelect({ avatarUrl: val, avatar: AVATAR_PRESETS.find(p => `preset:${p.id}` === val)?.emoji?.[0] || '?' });
      applyAvatarEl(previewEl, { ...getState().profile, avatarUrl: val });
    });
  });

  const fileInput = container.querySelector('#avatar-file-input');
  container.querySelector('#avatar-upload-btn')?.addEventListener('click', () => fileInput?.click());

  fileInput?.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) return;
    try {
      const dataUrl = await resizeImageFile(file, 128);
      if (dataUrl.length > MAX_UPLOAD_BYTES) {
        throw new Error('Файл слишком большой после сжатия');
      }
      container.querySelectorAll('.avatar-pick').forEach(b => b.classList.remove('active'));
      onSelect({ avatarUrl: dataUrl, avatar: '…' });
      applyAvatarEl(previewEl, { avatarUrl: dataUrl });
    } catch (err) {
      onSelect({ error: err.message });
    }
  });

  container.querySelector('#avatar-clear-btn')?.addEventListener('click', () => {
    container.querySelectorAll('.avatar-pick').forEach(b => b.classList.remove('active'));
    const letter = getState().profile.name?.[0]?.toUpperCase() || 'G';
    onSelect({ avatarUrl: '', avatar: letter });
    applyAvatarEl(previewEl, { ...getState().profile, avatarUrl: '', avatar: letter });
  });
}

function resizeImageFile(file, size) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      const min = Math.min(img.width, img.height);
      const sx = (img.width - min) / 2;
      const sy = (img.height - min) / 2;
      ctx.drawImage(img, sx, sy, min, min, 0, 0, size, size);
      resolve(canvas.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Не удалось прочитать изображение'));
    };
    img.src = url;
  });
}

export function refreshAllAvatars() {
  const profile = getState().profile;
  document.querySelectorAll('[data-user-avatar]').forEach(el => applyAvatarEl(el, profile));
}
