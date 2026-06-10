import { getState, unlockAchievement } from './store.js';
import { showToast } from './ui.js';

export const ACHIEVEMENTS = [
  {
    id: 'first_read',
    icon: '📖',
    title: 'Первые шаги',
    desc: 'Прочитайте первую главу',
    check: (s) => s.stats.chaptersRead >= 1,
  },
  {
    id: 'reader_10',
    icon: '📚',
    title: 'Заядлый читатель',
    desc: 'Прочитайте 10 глав',
    check: (s) => s.stats.chaptersRead >= 10,
  },
  {
    id: 'reader_50',
    icon: '🏆',
    title: 'Манга-маньяк',
    desc: 'Прочитайте 50 глав',
    check: (s) => s.stats.chaptersRead >= 50,
  },
  {
    id: 'pages_100',
    icon: '📄',
    title: 'Страничный мастер',
    desc: 'Прочитайте 100 страниц',
    check: (s) => s.stats.pagesRead >= 100,
  },
  {
    id: 'first_fav',
    icon: '❤️',
    title: 'В закладки!',
    desc: 'Добавьте мангу в избранное',
    check: (s) => s.stats.favoritesCount >= 1,
  },
  {
    id: 'fav_5',
    icon: '💜',
    title: 'Коллекционер',
    desc: '5 манг в избранном',
    check: (s) => s.stats.favoritesCount >= 5,
  },
  {
    id: 'explorer',
    icon: '🔍',
    title: 'Исследователь',
    desc: 'Выполните 5 поисков',
    check: (s) => s.stats.searchCount >= 5,
  },
  {
    id: 'level_5',
    icon: '⭐',
    title: 'Восходящая звезда',
    desc: 'Достигните 5 уровня',
    check: (s) => s.profile.level >= 5,
  },
  {
    id: 'level_10',
    icon: '🌟',
    title: 'Легенда Violence',
    desc: 'Достигните 10 уровня',
    check: (s) => s.profile.level >= 10,
  },
  {
    id: 'manga_10',
    icon: '🎭',
    title: 'Разнообразие',
    desc: 'Откройте 10 разных манг',
    check: (s) => s.stats.mangaOpened >= 10,
  },
];

export function checkAchievements() {
  const state = getState();
  const newlyUnlocked = [];

  for (const ach of ACHIEVEMENTS) {
    if (state.achievements[ach.id]) continue;
    if (ach.check(state)) {
      if (unlockAchievement(ach.id, ach.title, ach.desc)) {
        newlyUnlocked.push(ach);
      }
    }
  }

  for (const ach of newlyUnlocked) {
    showToast(`🏆 ${ach.title}: ${ach.desc}`, 'achievement');
  }

  return newlyUnlocked;
}

export function getAchievementProgress(ach) {
  const state = getState();
  if (state.achievements[ach.id]) return { unlocked: true, progress: 100 };

  const checks = {
    first_read: () => Math.min(state.stats.chaptersRead, 1),
    reader_10: () => Math.min(state.stats.chaptersRead, 10),
    reader_50: () => Math.min(state.stats.chaptersRead, 50),
    pages_100: () => Math.min(state.stats.pagesRead, 100),
    first_fav: () => Math.min(state.stats.favoritesCount, 1),
    fav_5: () => Math.min(state.stats.favoritesCount, 5),
    explorer: () => Math.min(state.stats.searchCount, 5),
    level_5: () => Math.min(state.profile.level, 5),
    level_10: () => Math.min(state.profile.level, 10),
    manga_10: () => Math.min(state.stats.mangaOpened, 10),
  };

  const targets = {
    first_read: 1, reader_10: 10, reader_50: 50, pages_100: 100,
    first_fav: 1, fav_5: 5, explorer: 5, level_5: 5, level_10: 10, manga_10: 10,
  };

  const current = checks[ach.id]?.() ?? 0;
  const target = targets[ach.id] ?? 1;
  return { unlocked: false, progress: Math.round((current / target) * 100), current, target };
}
