import { getState, getReadingLogDays, getTopGenres } from '../store.js';
import { formatReadTime } from '../ui.js';
import { t } from '../i18n.js';

export function renderStats(container) {
  const state = getState();
  const days = getReadingLogDays(7);
  const genres = getTopGenres(8);
  const maxPages = Math.max(1, ...days.map(d => d.pages));

  container.innerHTML = `
    <div class="page-header">
      <h2>${t('stats.title')}</h2>
      <p>${t('stats.subtitle')}</p>
    </div>

    <div class="stats-summary">
      <div class="stat-card"><strong class="stat-value">${state.stats.pagesRead}</strong><span>${t('stats.totalPages')}</span></div>
      <div class="stat-card"><strong class="stat-value">${state.stats.chaptersRead}</strong><span>${t('stats.totalChapters')}</span></div>
      <div class="stat-card"><strong class="stat-value">${formatReadTime(state.stats.totalReadTime)}</strong><span>${t('stats.readTime')}</span></div>
    </div>

    <div class="stats-charts">
      <div class="stats-chart-card">
        <h3 class="section-title">${t('stats.pages7d')}</h3>
        ${days.some(d => d.pages > 0)
          ? `<div class="bar-chart" role="img" aria-label="${t('stats.pages7d')}">
              ${days.map(d => `
                <div class="bar-chart-col">
                  <div class="bar-chart-bar" style="height:${Math.round((d.pages / maxPages) * 100)}%"
                    title="${d.label}: ${d.pages}"></div>
                  <span class="bar-chart-val">${d.pages || ''}</span>
                  <span class="bar-chart-label">${d.label}</span>
                </div>
              `).join('')}
            </div>`
          : `<p class="stats-empty">${t('stats.noData')}</p>`}
      </div>

      <div class="stats-chart-card">
        <h3 class="section-title">${t('stats.genres')}</h3>
        ${genres.length
          ? `<div class="genre-bars">
              ${genres.map(g => {
                const pct = Math.round((g.count / genres[0].count) * 100);
                return `
                  <div class="genre-bar-row">
                    <span class="genre-bar-name">${g.name}</span>
                    <div class="genre-bar-track">
                      <div class="genre-bar-fill" style="width:${pct}%"></div>
                    </div>
                    <span class="genre-bar-count">${g.count}</span>
                  </div>
                `;
              }).join('')}
            </div>`
          : `<p class="stats-empty">${t('stats.noData')}</p>`}
      </div>
    </div>
  `;
}
