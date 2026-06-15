import { getState } from './store.js';
import {
  lookupTitle,
  translateChapterTitleLocal,
  applyTermFixes,
  isMostlyRussian,
  GENRE_RU,
  STATUS_RU,
} from './manga-glossary.js';

const CACHE_KEY = 'violence_translate_v3';
const MAX_CACHE = 1200;
const CHUNK_SIZE = 900;

const memory = new Map();
let persistTimer = null;

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

export function getTargetLanguage() {
  return getState().settings.language || 'ru';
}

export function shouldAutoTranslate() {
  return getState().settings.autoTranslate !== false;
}

export function isAlreadyInTargetLanguage(text, target = getTargetLanguage()) {
  if (!text?.trim()) return true;
  if (target === 'ru') return isMostlyRussian(text);
  const latin = (text.match(/[a-zA-Z]/g) || []).length;
  const cyrillic = (text.match(/[\u0400-\u04FF]/g) || []).length;
  const cjk = (text.match(/[\u3040-\u30FF\u4E00-\u9FFF\uAC00-\uD7AF]/g) || []).length;
  return latin >= cyrillic && latin >= cjk;
}

/** @deprecated use isAlreadyInTargetLanguage */
export function isMostlyCyrillic(text) {
  return isAlreadyInTargetLanguage(text, 'ru');
}

function cacheKey(text, target, kind = '', mangaId = '') {
  return `${target}:${kind}:${mangaId}:${text}`;
}

const queue = [];
let active = 0;
const MAX_CONCURRENT = 4;

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

async function fetchTranslation(text, target, opts = {}) {
  const params = new URLSearchParams({
    q: text,
    tl: target,
    sl: 'auto',
  });
  if (opts.kind) params.set('kind', opts.kind);
  if (opts.mangaId) params.set('mangaId', opts.mangaId);

  const res = await fetch(`/translate-proxy?${params}`);
  if (!res.ok) throw new Error(`Translate HTTP ${res.status}`);
  const data = await res.json();
  const translated = data.translatedText?.trim() || data.responseData?.translatedText?.trim();
  if (!translated) throw new Error('Empty translation');
  return applyTermFixes(translated);
}

async function translateChunk(text, target, opts = {}) {
  const key = cacheKey(text, target, opts.kind, opts.mangaId);
  if (memory.has(key)) return memory.get(key);

  if (isAlreadyInTargetLanguage(text, target)) {
    memory.set(key, text);
    return text;
  }

  const localChapter = opts.kind === 'chapter' ? translateChapterTitleLocal(text) : null;
  if (localChapter) {
    memory.set(key, localChapter);
    schedulePersist();
    return localChapter;
  }

  const glossary = lookupTitle(text, opts.mangaId);
  if (glossary && (opts.kind === 'title' || text.length < 140)) {
    memory.set(key, glossary);
    schedulePersist();
    return glossary;
  }

  const result = await enqueue(() => fetchTranslation(text, target, opts));
  memory.set(key, result);
  schedulePersist();
  return result;
}

export async function translateText(text, target = getTargetLanguage(), opts = {}) {
  if (!text?.trim() || !shouldAutoTranslate()) return text || '';
  if (isAlreadyInTargetLanguage(text, target)) return text;

  if (text.length <= CHUNK_SIZE) {
    return translateChunk(text, target, opts);
  }

  const paragraphs = text.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
  if (paragraphs.length > 1) {
    const translated = await Promise.all(
      paragraphs.map(p => translateChunk(p, target, { ...opts, kind: opts.kind || 'description' })),
    );
    return translated.join('\n\n');
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

  const translated = await Promise.all(
    chunks.map(c => translateChunk(c.trim(), target, { ...opts, kind: opts.kind || 'description' })),
  );
  return translated.join('\n\n').trim();
}

export function translateGenre(name, target = getTargetLanguage()) {
  if (!name || !shouldAutoTranslate()) return name;
  if (target === 'en') return name;
  return GENRE_RU[name] || name;
}

export async function translateGenreAsync(name, target = getTargetLanguage()) {
  if (!name || !shouldAutoTranslate()) return name;
  if (target === 'ru' && GENRE_RU[name]) return GENRE_RU[name];
  if (isAlreadyInTargetLanguage(name, target)) return name;
  return translateText(name, target, { kind: 'tag' });
}

export function translateStatus(status, target = getTargetLanguage()) {
  if (!status || !shouldAutoTranslate()) return status;
  return STATUS_RU[status] || status;
}

export async function translateManga(manga) {
  if (!manga || !shouldAutoTranslate()) return manga;
  const target = getTargetLanguage();

  const [title, description] = await Promise.all([
    translateText(manga.title, target, { kind: 'title', mangaId: manga.id }),
    manga.description
      ? translateText(manga.description, target, { kind: 'description', mangaId: manga.id })
      : Promise.resolve(''),
  ]);

  const tags = (manga.tags || []).map(tag => ({
    ...tag,
    name: translateGenre(tag.name, target),
  }));

  return {
    ...manga,
    title,
    description,
    tags,
    status: translateStatus(manga.status, target),
  };
}

export async function translateMangaList(list) {
  if (!list?.length || !shouldAutoTranslate()) return list;

  const titleCache = new Map();
  const descCache = new Map();

  async function titleFor(manga) {
    if (titleCache.has(manga.title)) return titleCache.get(manga.title);
    const t = await translateText(manga.title, getTargetLanguage(), {
      kind: 'title',
      mangaId: manga.id,
    });
    titleCache.set(manga.title, t);
    return t;
  }

  async function descFor(manga) {
    const desc = manga.description || '';
    if (!desc) return '';
    if (descCache.has(desc)) return descCache.get(desc);
    const d = await translateText(desc, getTargetLanguage(), {
      kind: 'description',
      mangaId: manga.id,
    });
    descCache.set(desc, d);
    return d;
  }

  return Promise.all(list.map(async (manga) => {
    const [title, description] = await Promise.all([titleFor(manga), descFor(manga)]);
    return {
      ...manga,
      title,
      description,
      tags: (manga.tags || []).map(tag => ({
        ...tag,
        name: translateGenre(tag.name),
      })),
      status: translateStatus(manga.status),
    };
  }));
}

export async function translateChapter(chapter, mangaId) {
  if (!chapter || !shouldAutoTranslate()) return chapter;
  const target = getTargetLanguage();
  // Scanlation titles must match page language — don't mask TR/EN as RU in UI
  if (chapter.language && chapter.language !== target) {
    return chapter;
  }
  if (isAlreadyInTargetLanguage(chapter.title, target)) return chapter;
  const local = translateChapterTitleLocal(chapter.title);
  if (local) return { ...chapter, title: local };
  const title = await translateText(chapter.title, target, { kind: 'chapter', mangaId });
  return { ...chapter, title };
}

export async function translateChapterList(chapters, mangaId) {
  if (!chapters?.length || !shouldAutoTranslate()) return chapters;
  const cache = new Map();
  return Promise.all(chapters.map(async (chapter) => {
    const key = chapter.title || chapter.id;
    if (cache.has(key)) return { ...chapter, title: cache.get(key) };
    const translated = await translateChapter(chapter, mangaId);
    cache.set(key, translated.title);
    return translated;
  }));
}

export async function translateTagName(tagName) {
  return translateGenreAsync(tagName, getTargetLanguage());
}
