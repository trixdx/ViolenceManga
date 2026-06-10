import { ACHIEVEMENTS, getAchievementProgress } from '../achievements.js';
import { getState } from '../store.js';

const FILTERS = [
  { id: 'all', label: 'Все' },
  { id: 'unlocked', label: 'Полученные' },
  { id: 'locked', label: 'Не полученные' },
];

export function renderAchievements(container, navigate, filter = 'all') {
  const state = getState();
  const unlocked = Object.keys(state.achievements).length;
  const totalXp = ACHIEVEMENTS.filter(a => state.achievements[a.id]).length * 25;

  const filtered = ACHIEVEMENTS.filter(ach => {
    const prog = getAchievementProgress(ach);
    if (filter === 'unlocked') return prog.unlocked;
    if (filter === 'locked') return !prog.unlocked;
    return true;
  });

  container.innerHTML = `
    <div class="page-header">
      <h2>Достижения</h2>
      <p>Разблокировано ${unlocked} из ${ACHIEVEMENTS.length}</p>
    </div>

    <div class="achievements-summary">
      <div class="ach-summary-card">
        <strong>${unlocked}</strong><span>Получено</span>
      </div>
      <div class="ach-summary-card">
        <strong>${ACHIEVEMENTS.length - unlocked}</strong><span>Осталось</span>
      </div>
      <div class="ach-summary-card">
        <strong>${Math.round((unlocked / ACHIEVEMENTS.length) * 100)}%</strong><span>Прогресс</span>
      </div>
    </div>

    <div class="xp-bar" style="margin:20px 0;height:12px">
      <div class="xp-bar-fill" style="width:${(unlocked / ACHIEVEMENTS.length) * 100}%"></div>
    </div>

    <div class="library-tabs">
      ${FILTERS.map(f => `
        <button class="tab-btn ${filter === f.id ? 'active' : ''}" data-filter="${f.id}">${f.label}</button>
      `).join('')}
    </div>

    <div class="achievements-grid" style="margin-top:20px">
      ${filtered.map(ach => {
        const prog = getAchievementProgress(ach);
        return `
          <div class="achievement-card ${prog.unlocked ? 'unlocked' : 'locked'}">
            <div class="achievement-icon">${ach.icon}</div>
            <div class="achievement-info">
              <h4>${ach.title}</h4>
              <p>${ach.desc}</p>
              ${prog.unlocked
                ? `<div class="progress-text">✓ ${new Date(state.achievements[ach.id].unlockedAt).toLocaleDateString('ru-RU')}</div>`
                : `<div class="progress-bar-mini"><div style="width:${prog.progress}%"></div></div>
                   <div class="progress-text">${prog.current || 0} / ${prog.target}</div>`
              }
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;

  container.querySelectorAll('[data-filter]').forEach(btn => {
    btn.addEventListener('click', () => navigate('achievements', { filter: btn.dataset.filter }));
  });
}
