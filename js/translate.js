import { getState } from './store.js';

const CACHE_KEY = 'violence_translate_v1';
const MAX_CACHE = 800;
const CHUNK_SIZE = 420;

const memory = new Map();
let persistTimer = null;

const GENRE_RU = {
  Action: 'Экшен', Romance: 'Романтика', Comedy: 'Комедия', Fantasy: 'Фэнтези',
  Drama: 'Драма', Adventure: 'Приключения', 'Slice of Life': 'Повседневность',
  Horror: 'Ужасы', 'Sci-Fi': 'Sci-Fi', Mystery: 'Мистика', Isekai: 'Исекай',
  'Supernatural': 'Сверхъестественное', Psychological: 'Психология',
  'School Life': 'Школа', Sports: 'Спорт', Historical: 'История',
  Mecha: 'Меха', Music: 'Музыка', Thriller: 'Триллер', Tragedy: 'Трагедия',
  Ecchi: 'Этти', Harem: 'Гарем', Shounen: 'Сёнэн', Shoujo: 'Сёдзё',
  Seinen: 'Сэйнэн', Josei: 'Дзёсэй', 'Martial Arts': 'Боевые искусства',
  'Video Games': 'Видеоигры', 'Magical Girls': 'Магические девочки',
};

const STATUS_RU = {
  ongoing: 'Выходит',
  completed: 'Завершена',
  hiatus: 'Пауза',
  cancelled: 'Отменена',
};

function loadCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return;
    const obj = JSON.parse(raw);
    Object.entries(obj).forEach(([k, v]) => memory.set(k, v));
  } catch { /* ignore */ }
}

function schedulePersist() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    const entries = [...memory.entries()].slice(-MAX_CACHE);
    localStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(entries)));
  }, 1200);
}

loadCache();

export function shouldAutoTranslate() {
  const s = getState().settings;
  return s.autoTranslate !== false && (s.language || 'ru') === 'ru';
}

export function isMostlyCyrillic(text) {
  if (!text?.trim()) return true;
  const cyrillic = (text.match(/[\u0400-\u04FF]/g) || []).length;
  const latin = (text.match(/[a-zA-Z]/g) || []).length;
  if (cyrillic === 0 && latin === 0) return true;
  return cyrillic >= latin;
}

function cacheKey(text, target) {
  return `${target}:${text}`;
}

const queue = [];
let active = 0;
const MAX_CONCURRENT = 3;

function runQueue() {
  while (active < MAX_CONCURRENT && queue.length) {
    const job = queue.shift();
    active++;
    job().finally(() => {
      active--;
      runQueue();
    });
  }
}

function enqueue(fn) {
  return new Promise((resolve, reject) => {
    queue.push(() => fn().then(resolve, reject));
    runQueue();
  });
}

async function fetchTranslation(text, target = 'ru') {
  const pairs = ['en|ru', 'aut|ru', 'ja|ru', 'ko|ru'];
  for (const pair of pairs) {
    try {
      const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${pair}`;
      const res = await fetch(url);
      if (!res.ok) continue;
      const data = await res.json();
      const translated = data.responseData?.translatedText?.trim();
      if (translated && translated.toUpperCase() !== text.toUpperCase()) {
        return translated;
      }
    } catch { /* try next */ }
  }
  return text;
}

async function translateChunk(text, target = 'ru') {
  const key = cacheKey(text, target);
  if (memory.has(key)) return memory.get(key);
  if (isMostlyCyrillic(text)) {
    memory.set(key, text);
    return text;
  }

  const result = await enqueue(() => fetchTranslation(text, target));
  memory.set(key, result);
  schedulePersist();
  return result;
}

export async function translateText(text, target = 'ru') {
  if (!text?.trim() || !shouldAutoTranslate()) return text || '';
  if (isMostlyCyrillic(text)) return text;

  if (text.length <= CHUNK_SIZE) {
    return translateChunk(text, target);
  }

  const parts = text.match(/[^.!?\n]+[.!?\n]?/g) || [text];
  const chunks = [];
  let buf = '';
  for (const part of parts) {
    if ((buf + part).length > CHUNK_SIZE) {
      if (buf) chunks.push(buf);
      buf = part;
    } else {
      buf += part;
    }
  }
  if (buf) chunks.push(buf);

  const translated = await Promise.all(chunks.map(c => translateChunk(c.trim(), target)));
  return translated.join(' ').replace(/\s+/g, ' ').trim();
}

export function translateGenre(name) {
  if (!name || !shouldAutoTranslate()) return name;
  if (GENRE_RU[name]) return GENRE_RU[name];
  return name;
}

export async function translateGenreAsync(name) {
  if (!name || !shouldAutoTranslate()) return name;
  if (GENRE_RU[name]) return GENRE_RU[name];
  if (isMostlyCyrillic(name)) return name;
  return translateText(name);
}

export function translateStatus(status) {
  if (!status || !shouldAutoTranslate()) return status;
  return STATUS_RU[status] || status;
}

export async function translateManga(manga) {
  if (!manga || !shouldAutoTranslate()) return manga;

  const [title, description] = await Promise.all([
    translateText(manga.title),
    manga.description ? translateText(manga.description) : Promise.resolve(''),
  ]);

  const tags = await Promise.all(
    (manga.tags || []).map(async tag => ({
      ...tag,
      name: await translateGenreAsync(tag.name),
    }))
  );

  return {
    ...manga,
    title,
    description,
    tags,
    status: translateStatus(manga.status),
  };
}

export async function translateMangaList(list) {
  if (!list?.length || !shouldAutoTranslate()) return list;
  return Promise.all(list.map(translateManga));
}

export async function translateChapter(chapter) {
  if (!chapter || !shouldAutoTranslate()) return chapter;
  const title = await translateText(chapter.title);
  return { ...chapter, title };
}

export async function translateChapterList(chapters) {
  if (!chapters?.length || !shouldAutoTranslate()) return chapters;
  return Promise.all(chapters.map(translateChapter));
}

export async function translateTagName(tagName) {
  return translateGenreAsync(tagName);
}
