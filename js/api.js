import { getState } from './store.js';
import { wrapPageUrls, resolveImageUrl } from './image-url.js';
import {
  translateManga, translateMangaList, translateChapterList, translateTagName,
} from './translate.js';

const API_BASE = '/mangadex-api';
const COVER_BASE = 'https://uploads.mangadex.org/covers';

const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000;
const CACHE_VERSION = 13;

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

const chaptersCache = new Map();
const CHAPTERS_CACHE_TTL = 5 * 60 * 1000;

function chaptersCacheKey(mangaId) {
  const s = getSettings();
  return `${mangaId}:${s.language || 'ru'}:${s.chapterSort || 'asc'}`;
}

export function invalidateChapterCache(mangaId) {
  for (const key of chaptersCache.keys()) {
    if (key.startsWith(`${mangaId}:`)) chaptersCache.delete(key);
  }
}

export function invalidateAllChapterCache() {
  chaptersCache.clear();
}

function getSettings() {
  return getState().settings;
}

function getChapterLangPriority() {
  const lang = getSettings().language || 'ru';
  const chain = [lang, 'ru', 'en'];
  return [...new Set(chain.filter(Boolean))];
}

function getContentRatingFilter() {
  if (getSettings().showNsfw) return null;
  return ['safe', 'suggestive'];
}

const API_TIMEOUT_MS = 20000;
const API_RETRIES = 2;

function buildUrl(path, params = {}) {
  const url = new URL(`${API_BASE}${path}`, location.origin);
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
    return new Error('Сервер не отвечает — проверьте интернет и попробуйте позже');
  }
  if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
    return new Error('Нет соединения с сервером — проверьте интернет');
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
  const lang = getSettings().language || 'ru';
  if (desc[lang]) return desc[lang];
  if (desc.ru) return desc.ru;
  if (desc.en) return desc.en;
  const keys = Object.keys(desc);
  return keys.length ? desc[keys[0]] : '';
}

function getTagName(tag) {
  const names = tag.attributes.name || {};
  const lang = getSettings().language || 'ru';
  return names[lang] || names.ru || names.en || Object.values(names)[0] || '';
}

function getCoverUrl(manga, size = 512) {
  const file = manga.relationships?.find(r => r.type === 'cover_art')?.attributes?.fileName;
  if (!file) return null;
  const direct = `${COVER_BASE}/${manga.id}/${file}.${size}.jpg`;
  return resolveImageUrl(direct);
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
        name: getTagName(t),
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
  const sort = getSettings().chapterSort || 'asc';
  return [...chapters].sort((a, b) => {
    const na = parseFloat(a.chapter) || 0;
    const nb = parseFloat(b.chapter) || 0;
    return sort === 'asc' ? na - nb : nb - na;
  });
}

function langScore(language, prefs) {
  const idx = prefs.indexOf(language);
  if (idx >= 0) return idx;
  const named = Object.keys(LANG_NAMES).indexOf(language);
  return named >= 0 ? named + prefs.length : 99;
}

/** One scanlation per chapter number — prefer configured languages, then newest upload. */
function pickBestPerChapter(chapters) {
  const prefs = getChapterLangPriority();
  const byChapter = {};
  chapters.forEach(ch => {
    const key = String(ch.chapter ?? ch.id);
    const existing = byChapter[key];
    if (!existing) {
      byChapter[key] = ch;
      return;
    }
    const scoreA = langScore(ch.language, prefs);
    const scoreB = langScore(existing.language, prefs);
    if (scoreA < scoreB) {
      byChapter[key] = ch;
      return;
    }
    if (scoreA > scoreB) return;
    const chTime = Date.parse(ch.publishAt || 0) || 0;
    const exTime = Date.parse(existing.publishAt || 0) || 0;
    if (chTime > exTime || (chTime === exTime && ch.pages > existing.pages)) {
      byChapter[key] = ch;
    }
  });
  return Object.values(byChapter);
}

function dedupeSameLanguage(chapters) {
  const byChapter = {};
  chapters.forEach(ch => {
    const key = String(ch.chapter ?? ch.id);
    const existing = byChapter[key];
    if (!existing) {
      byChapter[key] = ch;
      return;
    }
    const chTime = Date.parse(ch.publishAt || 0) || 0;
    const exTime = Date.parse(existing.publishAt || 0) || 0;
    if (chTime > exTime || (chTime === exTime && ch.pages > existing.pages)) {
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

async function fetchChapterFeed(mangaId, { limit = 100, offset = 0, order = 'asc', languages = null } = {}) {
  const params = {
    limit,
    offset,
    'order[chapter]': order,
    'includes[]': ['scanlation_group'],
  };
  if (languages?.length) params['translatedLanguage[]'] = languages;
  return fetchAPI(`/manga/${mangaId}/feed`, params);
}

async function fetchAllPages(mangaId, pageSize, language) {
  let offset = 0;
  let feedTotal = Infinity;
  const allReadable = [];
  const allExternal = [];

  while (offset < feedTotal) {
    const data = await fetchChapterFeed(mangaId, {
      limit: pageSize,
      offset,
      order: 'asc',
      languages: language ? [language] : null,
    });
    feedTotal = data.total;
    allReadable.push(...extractReadableChapters(data));
    allExternal.push(...extractExternalChapters(data));
    offset += data.limit;
    if (!data.data.length) break;
  }

  return { readable: allReadable, external: allExternal, feedTotal };
}

async function fetchAllReadableChapters(mangaId, pageSize = 100) {
  const preferredLang = getSettings().language || 'ru';
  const langChain = getChapterLangPriority();

  for (const lang of langChain) {
    const batch = await fetchAllPages(mangaId, pageSize, lang);
    if (batch.readable.length > 0) {
      return {
        ...batch,
        activeLanguage: lang,
        preferredLang,
        usedFallback: lang !== preferredLang,
        noPreferredLang: lang !== preferredLang && lang !== 'en',
      };
    }
  }

  const any = await fetchAllPages(mangaId, pageSize, null);
  return {
    ...any,
    activeLanguage: null,
    preferredLang,
    usedFallback: true,
    noPreferredLang: true,
  };
}

function extractReadableChapters(data) {
  return data.data.map(mapChapter).filter(ch => ch.readable);
}

function extractExternalChapters(data) {
  return data.data.map(mapChapter).filter(ch => !ch.readable && ch.externalUrl);
}

export async function getChapters(mangaId, limit = 500, offset = 0) {
  const preferredLang = getSettings().language || 'ru';
  const cacheKey = chaptersCacheKey(mangaId);
  let bundle = chaptersCache.get(cacheKey);
  const stale = !bundle || Date.now() - bundle.at > CHAPTERS_CACHE_TTL;

  if (stale) {
    const fetched = await fetchAllReadableChapters(mangaId, 100);
    const normalized = fetched.activeLanguage
      ? dedupeSameLanguage(fetched.readable)
      : pickBestPerChapter(fetched.readable);
    const chapters = sortChapters(normalized);
    const availableLanguages = [...new Set(fetched.readable.map(ch => ch.language))].sort();
    const hasPreferred = chapters.some(ch => ch.language === preferredLang);
    bundle = {
      at: Date.now(),
      chapters,
      meta: {
        total: chapters.length,
        readableCount: chapters.length,
        hasExternalOnly: chapters.length === 0 && fetched.external.length > 0,
        externalCount: fetched.external.length,
        availableLanguages,
        activeLanguage: fetched.activeLanguage,
        usedFallback: fetched.usedFallback,
        noPreferredLang: fetched.noPreferredLang || (chapters.length > 0 && !hasPreferred),
        preferredLang,
      },
    };
    chaptersCache.set(cacheKey, bundle);
  }

  const sliced = bundle.chapters.slice(offset, offset + limit);
  return {
    chapters: await translateChapterList(sliced, mangaId),
    ...bundle.meta,
    offset,
    limit,
    allLoaded: offset + limit >= bundle.chapters.length,
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
