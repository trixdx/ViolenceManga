import { getState } from './store.js';
import { wrapPageUrls } from './image-url.js';
import {
  translateManga, translateMangaList, translateChapterList, translateTagName,
} from './translate.js';

const API_BASE = 'https://api.mangadex.org';
const COVER_BASE = 'https://uploads.mangadex.org/covers';

const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000;
const CACHE_VERSION = 7;

const LANG_NAMES = {
  ru: 'Русский', en: 'English', uk: 'Украинский', es: 'Испанский',
  'pt-br': 'Португальский', fr: 'Французский', de: 'Немецкий', it: 'Итальянский',
  pl: 'Польский', ja: 'Японский', ko: 'Корейский', zh: 'Китайский', 'zh-hk': 'Китайский (HK)',
  id: 'Индонезийский', th: 'Тайский', vi: 'Вьетнамский', ar: 'Арабский',
  he: 'Иврит', ka: 'Грузинский',
};

const SEARCH_PINS = {
  'поднятие уровня': '32d76d19-8a05-4db0-9fc2-e0b0648fe9d0',
  'поднятие уровня в одиночку': '32d76d19-8a05-4db0-9fc2-e0b0648fe9d0',
  'solo leveling': '32d76d19-8a05-4db0-9fc2-e0b0648fe9d0',
  'na honjaman level-up': '32d76d19-8a05-4db0-9fc2-e0b0648fe9d0',
};

function normalizeQuery(query) {
  return query.trim().toLowerCase().replace(/\s+/g, ' ');
}

function getSettings() {
  return getState().settings;
}

function getLangParams() {
  const lang = getSettings().language || 'ru';
  const fallback = lang === 'ru' ? 'en' : 'ru';
  return [lang, fallback];
}

function getContentRatingFilter() {
  if (getSettings().showNsfw) return null;
  return ['safe', 'suggestive'];
}

const API_TIMEOUT_MS = 20000;
const API_RETRIES = 2;

function buildUrl(path, params = {}) {
  const url = new URL(`${API_BASE}${path}`);
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null) return;
    if (Array.isArray(v)) v.forEach(item => url.searchParams.append(k, item));
    else url.searchParams.append(k, v);
  });
  return url;
}

function friendlyFetchError(err) {
  const msg = err?.message || '';
  if (msg.includes('timed out') || err?.name === 'TimeoutError') {
    return new Error('Сервер MangaDex не отвечает — проверьте интернет и попробуйте снова');
  }
  if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
    return new Error('Нет соединения с MangaDex — проверьте интернет');
  }
  return err instanceof Error ? err : new Error(String(err));
}

function timeoutSignal(ms) {
  if (typeof AbortSignal?.timeout === 'function') {
    return AbortSignal.timeout(ms);
  }
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(new DOMException('Timeout', 'TimeoutError')), ms);
  return ctrl.signal;
}

async function fetchOnce(url) {
  const res = await fetch(url, { signal: timeoutSignal(API_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

async function fetchWithRetry(url) {
  let lastErr;
  for (let attempt = 0; attempt < API_RETRIES; attempt++) {
    try {
      return await fetchOnce(url);
    } catch (err) {
      lastErr = err;
      if (attempt < API_RETRIES - 1) {
        await new Promise(r => setTimeout(r, 800 * (attempt + 1)));
      }
    }
  }
  throw friendlyFetchError(lastErr);
}

async function fetchAPI(path, params = {}) {
  const url = buildUrl(path, params);
  const cacheKey = `v${CACHE_VERSION}:${url}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.time < CACHE_TTL) return cached.data;

  const data = await fetchWithRetry(url);
  cache.set(cacheKey, { data, time: Date.now() });
  return data;
}

function getTitle(manga) {
  const attrs = manga.attributes;
  const lang = getSettings().language || 'ru';
  if (attrs.title[lang]) return attrs.title[lang];
  if (attrs.title.ru) return attrs.title.ru;
  if (attrs.title.en) return attrs.title.en;

  const altMatch = attrs.altTitles?.find(t => t[lang])?.[lang]
    || attrs.altTitles?.find(t => t.ru)?.ru
    || attrs.altTitles?.find(t => t.en)?.en;
  if (altMatch) return altMatch;

  const keys = Object.keys(attrs.title);
  return keys.length ? attrs.title[keys[0]] : 'Без названия';
}

function getDescription(manga) {
  const desc = manga.attributes.description;
  if (!desc) return '';
  if (desc.ru) return desc.ru;
  if (desc.en) return desc.en;
  const keys = Object.keys(desc);
  return keys.length ? desc[keys[0]] : '';
}

function getCoverUrl(manga, size = 512) {
  const file = manga.relationships?.find(r => r.type === 'cover_art')?.attributes?.fileName;
  if (!file) return null;
  return `${COVER_BASE}/${manga.id}/${file}.${size}.jpg`;
}

function getAuthors(manga) {
  return manga.relationships
    ?.filter(r => r.type === 'author' || r.type === 'artist')
    .map(r => r.attributes?.name || '')
    .filter(Boolean) || [];
}

function mapManga(manga) {
  const rating = getContentRatingFilter();
  if (rating && !rating.includes(manga.attributes.contentRating)) return null;

  return {
    id: manga.id,
    title: getTitle(manga),
    description: getDescription(manga),
    cover: getCoverUrl(manga),
    status: manga.attributes.status,
    year: manga.attributes.year,
    tags: manga.attributes.tags
      ?.filter(t => t.attributes.group === 'genre')
      .map(t => ({
        id: t.id,
        name: t.attributes.name.en || t.attributes.name.ru || Object.values(t.attributes.name)[0],
      }))
      .slice(0, 8) || [],
    lastChapter: manga.attributes.lastChapter,
    contentRating: manga.attributes.contentRating,
    authors: getAuthors(manga),
  };
}

function buildMangaParams(extra = {}) {
  const params = {
    'includes[]': ['cover_art'],
    ...extra,
  };
  const rating = getContentRatingFilter();
  if (rating) params['contentRating[]'] = rating;
  return params;
}

export async function searchManga(query, limit = 24, offset = 0) {
  const normalized = normalizeQuery(query);
  const pinnedId = SEARCH_PINS[normalized];

  const data = await fetchAPI('/manga', buildMangaParams({
    title: pinnedId ? 'Solo Leveling' : query,
    limit,
    offset,
    'order[relevance]': 'desc',
  }));

  let results = data.data.map(mapManga).filter(Boolean);

  if (pinnedId && offset === 0) {
    const hasPinned = results.some(m => m.id === pinnedId);
    if (!hasPinned) {
      try {
        const pinned = await getMangaById(pinnedId);
        results = [pinned, ...results.filter(m => m.id !== pinnedId)];
      } catch { /* pinned manga unavailable */ }
    } else {
      results = [results.find(m => m.id === pinnedId), ...results.filter(m => m.id !== pinnedId)];
    }
  }

  return {
    results: await translateMangaList(results),
    total: data.total,
    offset: data.offset,
    limit: data.limit,
  };
}

export async function searchByTag(tagName, limit = 24, offset = 0) {
  const tagData = await fetchAPI('/manga/tag');
  const tag = tagData.data.find(t => {
    const names = t.attributes.name;
    return Object.values(names).some(n => n?.toLowerCase() === tagName.toLowerCase());
  });
  if (!tag) return { results: [], total: 0, offset: 0, limit };

  const data = await fetchAPI('/manga', buildMangaParams({
    'includedTags[]': [tag.id],
    limit,
    offset,
    'order[followedCount]': 'desc',
  }));
  const translatedTag = await translateTagName(tagName);
  return {
    results: await translateMangaList(data.data.map(mapManga).filter(Boolean)),
    total: data.total,
    tagName: translatedTag,
  };
}

export async function getTrending(limit = 12) {
  const data = await fetchAPI('/manga', buildMangaParams({
    limit,
    'order[followedCount]': 'desc',
  }));
  return translateMangaList(data.data.map(mapManga).filter(Boolean));
}

export async function getRecent(limit = 12) {
  const data = await fetchAPI('/manga', buildMangaParams({
    limit,
    'order[latestUploadedChapter]': 'desc',
  }));
  return translateMangaList(data.data.map(mapManga).filter(Boolean));
}

export async function getMangaById(id) {
  const data = await fetchAPI(`/manga/${id}`, { 'includes[]': ['cover_art', 'author', 'artist'] });
  const manga = mapManga(data.data);
  if (!manga) throw new Error('Контент недоступен (NSFW отключён в настройках)');
  return translateManga(manga);
}

function sortChapters(chapters) {
  const sort = getSettings().chapterSort || 'desc';
  return [...chapters].sort((a, b) => {
    const na = parseFloat(a.chapter) || 0;
    const nb = parseFloat(b.chapter) || 0;
    return sort === 'asc' ? na - nb : nb - na;
  });
}

function langScore(language, prefs) {
  if (language === prefs[0]) return 0;
  if (language === prefs[1]) return 1;
  const idx = Object.keys(LANG_NAMES).indexOf(language);
  return idx >= 0 ? idx + 2 : 99;
}

function preferLanguage(chapters) {
  const prefs = getLangParams();
  const byChapter = {};
  chapters.forEach(ch => {
    const key = ch.chapter || ch.id;
    const existing = byChapter[key];
    if (!existing || langScore(ch.language, prefs) < langScore(existing.language, prefs)) {
      byChapter[key] = ch;
    }
  });
  return Object.values(byChapter);
}

export function getLanguageName(code) {
  return LANG_NAMES[code] || code?.toUpperCase() || '?';
}

function mapChapter(ch) {
  const attrs = ch.attributes;
  const pages = attrs.pages || 0;
  const externalUrl = attrs.externalUrl || null;
  return {
    id: ch.id,
    chapter: attrs.chapter,
    title: attrs.title || `Глава ${attrs.chapter || '?'}`,
    pages,
    language: attrs.translatedLanguage,
    externalUrl,
    publishAt: attrs.publishAt,
    group: ch.relationships?.find(r => r.type === 'scanlation_group')?.attributes?.name || '',
    readable: pages > 0 && !externalUrl,
  };
}

async function fetchChapterFeed(mangaId, limit, offset) {
  return fetchAPI(`/manga/${mangaId}/feed`, {
    limit,
    offset,
    'order[chapter]': 'desc',
    'includes[]': ['scanlation_group'],
  });
}

function extractReadableChapters(data) {
  return data.data.map(mapChapter).filter(ch => ch.readable);
}

function extractExternalChapters(data) {
  return data.data.map(mapChapter).filter(ch => !ch.readable && ch.externalUrl);
}

async function fetchAllReadableChapters(mangaId, pageSize = 100) {
  const data = await fetchChapterFeed(mangaId, pageSize, 0);
  const allReadable = extractReadableChapters(data);
  const allExternal = extractExternalChapters(data);

  if (data.total > data.limit && allReadable.length === 0) {
    let offset = data.limit;
    while (offset < data.total) {
      const more = await fetchChapterFeed(mangaId, pageSize, offset);
      allReadable.push(...extractReadableChapters(more));
      allExternal.push(...extractExternalChapters(more));
      offset += more.limit;
      if (more.data.length === 0) break;
    }
  }

  return { readable: allReadable, external: allExternal, total: data.total };
}

export async function getChapters(mangaId, limit = 100, offset = 0) {
  const preferredLang = getSettings().language || 'ru';

  if (offset === 0) {
    const { readable, external, total } = await fetchAllReadableChapters(mangaId, Math.max(limit, 100));
    const chapters = sortChapters(preferLanguage(readable));
    const availableLanguages = [...new Set(readable.map(ch => ch.language))].sort();
    const hasPreferred = readable.some(ch => ch.language === preferredLang);

    const sliced = chapters.slice(0, limit);
    return {
      chapters: await translateChapterList(sliced),
      total,
      readableCount: chapters.length,
      hasExternalOnly: chapters.length === 0 && external.length > 0,
      externalCount: external.length,
      availableLanguages,
      noPreferredLang: chapters.length > 0 && !hasPreferred,
      preferredLang,
      offset: 0,
      limit,
      allLoaded: chapters.length <= limit,
    };
  }

  const { readable, external, total } = await fetchAllReadableChapters(mangaId, 100);
  const chapters = sortChapters(preferLanguage(readable));

  const sliced = chapters.slice(offset, offset + limit);
  return {
    chapters: await translateChapterList(sliced),
    total,
    readableCount: chapters.length,
    hasExternalOnly: chapters.length === 0 && external.length > 0,
    externalCount: external.length,
    availableLanguages: [...new Set(readable.map(ch => ch.language))].sort(),
    noPreferredLang: chapters.length > 0 && !readable.some(ch => ch.language === preferredLang),
    preferredLang,
    offset,
    limit,
    allLoaded: offset + limit >= chapters.length,
  };
}

export async function getChapterPages(chapterId) {
  const data = await fetchAPI(`/at-home/server/${chapterId}`);
  if (data.result && data.result !== 'ok') {
    throw new Error('Сервер MangaDex временно недоступен — попробуйте позже');
  }

  const { baseUrl, chapter } = data;

  if (!chapter?.hash) {
    throw new Error('Глава только на внешнем сайте — выберите другой перевод в списке глав');
  }

  const hasFull = chapter.data?.length > 0;
  const hasSaver = chapter.dataSaver?.length > 0;

  if (!hasFull && !hasSaver) {
    throw new Error('Глава только на внешнем сайте (MangaPlus и др.) — выберите другой перевод');
  }

  const files = hasFull ? chapter.data : chapter.dataSaver;
  const folder = hasFull ? 'data' : 'data-saver';

  const pages = files.map((file, i) => {
    const direct = `${baseUrl}/${folder}/${chapter.hash}/${file}`;
    return { index: i, url: direct, direct };
  });
  return wrapPageUrls(pages);
}

export const POPULAR_GENRES = [
  'Action', 'Romance', 'Comedy', 'Fantasy', 'Drama',
  'Adventure', 'Slice of Life', 'Horror', 'Sci-Fi', 'Mystery',
];
