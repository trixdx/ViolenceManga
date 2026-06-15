import { Client } from 'ssh2';
const c = new Client();
c.on('ready', () => {
  c.exec(`curl -s -o /dev/null -w '%{http_code}' 'https://api.mangadex.org/manga?limit=1'; echo ' direct';
curl -s -o /dev/null -w '%{http_code}' 'http://127.0.0.1/mangadex-api/manga?limit=1'; echo ' proxy';
tail -3 /var/log/nginx/error.log 2>/dev/null`, (e, s) => {
    s.on('data', d => process.stdout.write(d));
    s.stderr.on('data', d => process.stderr.write(d));
    s.on('close', () => c.end());
  });
}).connect({ host: '147.45.253.205', username: 'root', password: process.env.DEPLOY_PASSWORD });
