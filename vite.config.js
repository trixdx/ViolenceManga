import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

const REMOTE = process.env.VIOLENCE_PROXY || 'https://147.45.253.205';

const remoteProxy = {
  target: REMOTE,
  changeOrigin: true,
  secure: false,
};

export default defineConfig({
  plugins: [basicSsl()],
  server: {
    https: true,
    port: 5173,
    strictPort: true,
    open: true,
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3002',
        changeOrigin: true,
      },
      '/mangadex-api': remoteProxy,
      '/mangadex-img': remoteProxy,
      '/translate-proxy': remoteProxy,
    },
  },
  preview: {
    https: true,
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3002',
        changeOrigin: true,
      },
      '/mangadex-api': remoteProxy,
      '/mangadex-img': remoteProxy,
      '/translate-proxy': remoteProxy,
    },
  },
});
