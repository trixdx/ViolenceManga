import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import https from 'node:https';
import {
  lookupTitle,
  applyTermFixes,
  translateChapterTitleLocal,
  isMostlyRussian,
  GENRE_RU,
} from './manga-glossary.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_FILE = join(__dirname, 'translate-cache.json');
const MAX_CACHE = 8000;

/** @type {Map<string, string>} */
const memCache = new Map();
let dirty = false;
let saveTimer = null;

async function loadCache() {
  try {
    const raw = await readFile(CACHE_FILE, 'utf8');
    Object.entries(JSON.parse(raw)).forEach(([k, v]) => memCache.set(k, v));
  } catch { /* fresh cache */ }
}

function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(async () => {
    saveTimer = null;
    if (!dirty) return;
    dirty = false;
    const entries = [...memCache.entries()].slice(-MAX_CACHE);
    try {
      await writeFile(CACHE_FILE, JSON.stringify(Object.fromEntries(entries)));
    } catch { /* ignore disk errors */ }
  }, 1500);
}

function cacheGet(key) {
  return memCache.get(key) || null;
}

function cacheSet(key, value) {
  memCache.set(key, value);
  dirty = true;
  scheduleSave();
}

function httpsGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'ViolenceMangaReader/1.0', ...headers } }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        resolve(data);
      });
    }).on('error', reject);
  });
}

function splitForTranslate(text, maxLen = 4500) {
  if (text.length <= maxLen) return [text];
  const parts = text.match(/[^.!?\n]+[.!?\n]?/g) || [text];
  const chunks = [];
  let buf = '';
  for (const part of parts) {
    if ((buf + part).length > maxLen) {
      if (buf) chunks.push(buf);
      buf = part.length > maxLen ? part.slice(0, maxLen) : part;
    } else {
      buf += part;
    }
  }
  if (buf) chunks.push(buf);
  return chunks;
}

async function googleTranslate(text, target = 'ru', source = 'auto') {
  const url = new URL('https://translate.googleapis.com/translate_a/single');
  url.searchParams.set('client', 'gtx');
  url.searchParams.set('sl', source);
  url.searchParams.set('tl', target);
  url.searchParams.set('dt', 't');
  url.searchParams.set('q', text);

  const raw = await httpsGet(url.toString());
  const parsed = JSON.parse(raw);
  const out = parsed[0]?.map((seg) => seg[0]).join('') || '';
  if (!out.trim()) throw new Error('Empty google result');
  return out.trim();
}

async function myMemoryTranslate(text, langpair) {
  const url = new URL('https://api.mymemory.translated.net/get');
  url.searchParams.set('q', text);
  url.searchParams.set('langpair', langpair);
  const raw = await httpsGet(url.toString());
  const parsed = JSON.parse(raw);
  const out = parsed.responseData?.translatedText?.trim();
  if (!out || out.toUpperCase() === text.toUpperCase()) throw new Error('Empty mymemory result');
  return out;
}

const LANGPAIR_FALLBACK = {
  ru: ['en|ru', 'ja|ru', 'ko|ru', 'zh-CN|ru', 'aut|ru'],
  en: ['ja|en', 'ko|en', 'ru|en', 'zh|en', 'aut|en'],
};

async function translateWithFallback(text, target = 'ru', source = 'auto') {
  const chunks = splitForTranslate(text);
  const out = [];
  for (const chunk of chunks) {
    try {
      out.push(await googleTranslate(chunk, target, source));
      continue;
    } catch { /* fall through */ }

    const pairs = LANGPAIR_FALLBACK[target] || LANGPAIR_FALLBACK.ru;
    let translated = null;
    for (const pair of pairs) {
      try {
        translated = await myMemoryTranslate(chunk, pair);
        break;
      } catch { /* next pair */ }
    }
    if (!translated) throw new Error('All providers failed');
    out.push(translated);
  }
  return applyTermFixes(out.join('\n\n'));
}

/**
 * @param {string} text
 * @param {{ target?: string, source?: string, mangaId?: string, kind?: string }} opts
 */
export async function translateTextServer(text, opts = {}) {
  const target = opts.target || 'ru';
  const source = opts.source || 'auto';
  const trimmed = String(text || '').trim();
  if (!trimmed) return { translatedText: '', source: 'empty' };

  if (isMostlyRussian(trimmed) && target === 'ru') {
    return { translatedText: trimmed, source: 'native' };
  }

  const localChapter = opts.kind === 'chapter' ? translateChapterTitleLocal(trimmed) : null;
  if (localChapter) {
    return { translatedText: localChapter, source: 'pattern' };
  }

  const glossary = lookupTitle(trimmed, opts.mangaId);
  if (glossary && (opts.kind === 'title' || trimmed.length < 120)) {
    return { translatedText: glossary, source: 'glossary' };
  }

  const cacheKey = `${target}:${source}:${opts.mangaId || ''}:${opts.kind || ''}:${trimmed}`;
  const cached = cacheGet(cacheKey);
  if (cached) return { translatedText: cached, source: 'cache', cached: true };

  const translated = await translateWithFallback(trimmed, target, source);
  cacheSet(cacheKey, translated);
  return { translatedText: translated, source: 'engine' };
}

export function lookupGenreRu(name) {
  return GENRE_RU[name] || null;
}

await loadCache();
