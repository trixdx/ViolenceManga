import express from 'express';
import https from 'node:https';
import http from 'node:http';
import { URL } from 'node:url';
import { translateTextServer, lookupGenreRu } from './translate-engine.js';

const PORT = process.env.PORT || 3001;
const MANGADEX_API = 'https://api.mangadex.org';

const app = express();
app.set('query parser', 'extended');
app.set('trust proxy', 1);

const rateBuckets = new Map();
function rateLimit(max = 120, windowMs = 60000) {
  return (req, res, next) => {
    const ip = req.ip || 'local';
    const now = Date.now();
    let bucket = rateBuckets.get(ip);
    if (!bucket || now - bucket.start > windowMs) bucket = { start: now, count: 0 };
    bucket.count += 1;
    rateBuckets.set(ip, bucket);
    if (bucket.count > max) return res.status(429).json({ error: 'Too many requests' });
    next();
  };
}

app.use(rateLimit());

function isMangadexImageUrl(url) {
  try {
    const { hostname, protocol } = new URL(url);
    if (protocol !== 'http:' && protocol !== 'https:') return false;
    return hostname === 'uploads.mangadex.org'
      || hostname.endsWith('.mangadex.network')
      || hostname === 'mangadex.network'
      || hostname.endsWith('.mangadex.org');
  } catch {
    return false;
  }
}

function readImageTarget(req) {
  const fromQuery = req.query?.url;
  if (typeof fromQuery === 'string' && fromQuery) return fromQuery;
  const raw = req.originalUrl || req.url || '';
  const qi = raw.indexOf('?');
  if (qi === -1) return null;
  return new URLSearchParams(raw.slice(qi + 1)).get('url');
}

function streamImage(target, res) {
  const client = target.startsWith('https') ? https : http;
  const request = client.get(target, {
    headers: { Referer: 'https://mangadex.org/', 'User-Agent': 'ViolenceMangaReader/1.0' },
  }, (upstream) => {
    if (upstream.statusCode >= 400) {
      res.status(upstream.statusCode).end();
      upstream.resume();
      return;
    }
    res.set('Content-Type', upstream.headers['content-type'] || 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=86400');
    upstream.pipe(res);
  });
  request.on('error', () => res.status(502).end('Proxy error'));
  return request;
}

function handleImgProxy(req, res) {
  const target = readImageTarget(req);
  if (!target || !isMangadexImageUrl(target)) {
    res.status(400).end('Invalid url');
    return;
  }
  const upstream = streamImage(target, res);
  req.on('close', () => upstream.destroy());
}

function proxyMangadexApi(req, res) {
  const path = req.url || '/';
  const target = new URL(path, MANGADEX_API);
  const ua = 'ViolenceMangaReader/1.0';

  const options = {
    hostname: target.hostname,
    port: 443,
    path: target.pathname + target.search,
    method: req.method,
    headers: {
      Host: 'api.mangadex.org',
      'User-Agent': ua,
      Accept: 'application/json',
    },
  };

  const upstream = https.request(options, (up) => {
    res.status(up.statusCode || 502);
    const ct = up.headers['content-type'];
    if (ct) res.set('Content-Type', ct);
    res.set('Cache-Control', 'public, max-age=60');
    res.set('Access-Control-Allow-Origin', '*');
    up.pipe(res);
  });

  upstream.on('error', () => res.status(502).json({ error: 'MangaDex proxy error' }));
  req.pipe(upstream);
}

async function handleTranslate(req, res) {
  const q = req.query?.q;
  if (typeof q !== 'string' || !q.trim()) {
    res.status(400).json({ error: 'Missing q' });
    return;
  }
  if (q.length > 12000) {
    res.status(400).json({ error: 'Text too long' });
    return;
  }

  const target = req.query?.tl || req.query?.target || 'ru';
  const source = req.query?.sl || req.query?.source || 'auto';
  const mangaId = typeof req.query?.mangaId === 'string' ? req.query.mangaId : undefined;
  const kind = typeof req.query?.kind === 'string' ? req.query.kind : undefined;

  try {
    const result = await translateTextServer(q, { target, source, mangaId, kind });
    res.set('Cache-Control', 'public, max-age=86400');
    res.json({
      translatedText: result.translatedText,
      source: result.source,
      cached: !!result.cached,
      responseData: { translatedText: result.translatedText },
    });
  } catch {
    res.status(502).json({ error: 'Translate failed' });
  }
}

app.get('/mangadex-img', handleImgProxy);
app.get('/api/img-proxy', handleImgProxy);
app.get('/translate-proxy', handleTranslate);
app.get('/translate-genre', (req, res) => {
  const name = req.query?.name;
  if (typeof name !== 'string') return res.status(400).json({ error: 'Missing name' });
  const ru = lookupGenreRu(name);
  res.json({ name, ru: ru || name });
});
app.use('/mangadex-api', proxyMangadexApi);
app.get('/health', (_req, res) => res.json({ ok: true }));

app.listen(PORT, '127.0.0.1', () => {
  console.log(`Violence proxy → http://127.0.0.1:${PORT}`);
});
