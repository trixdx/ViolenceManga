import https from 'node:https';
import http from 'node:http';

const ALLOWED = /(\.mangadex\.network\/|uploads\.mangadex\.org\/)/;

export function isAllowedImageUrl(url) {
  return ALLOWED.test(url);
}

export function proxyHeaders() {
  return { Referer: 'https://mangadex.org/', 'User-Agent': 'ViolenceMangaReader/1.0' };
}

export function streamImage(target, res) {
  const client = target.startsWith('https') ? https : http;
  const request = client.get(target, { headers: proxyHeaders() }, (upstream) => {
    if (upstream.statusCode && upstream.statusCode >= 400) {
      res.statusCode = upstream.statusCode;
      upstream.resume();
      res.end();
      return;
    }
    res.statusCode = 200;
    res.setHeader('Content-Type', upstream.headers['content-type'] || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    upstream.pipe(res);
  });

  request.on('error', () => {
    if (!res.headersSent) {
      res.statusCode = 502;
      res.end('Proxy error');
    }
  });

  return request;
}
