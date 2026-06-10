import { defineConfig } from 'vite';
import https from 'node:https';

function mangadexImageProxy() {
  return {
    name: 'mangadex-image-proxy',
    configureServer(server) {
      server.middlewares.use('/mangadex-img', (req, res) => {
        const target = new URL(req.url || '', 'http://localhost').searchParams.get('url');
        if (!target || !/\.mangadex\.network\//.test(target)) {
          res.statusCode = 400;
          res.end('Invalid url');
          return;
        }

        const request = https.get(target, {
          headers: {
            Referer: 'https://mangadex.org/',
            'User-Agent': 'ViolenceMangaReader/1.0',
          },
        }, (upstream) => {
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

        req.on('close', () => request.destroy());
      });
    },
  };
}

export default defineConfig({
  server: {
    port: 5173,
    strictPort: true,
    open: true,
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/mangadex-api': {
        target: 'https://api.mangadex.org',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/mangadex-api/, ''),
      },
    },
  },
  plugins: [mangadexImageProxy()],
});
