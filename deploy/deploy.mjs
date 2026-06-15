import { Client } from 'ssh2';
import { mkdirSync, cpSync, rmSync } from 'fs';
import { execSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const HOST = '147.45.253.205';
const USER = 'root';
const PASS = process.env.DEPLOY_PASSWORD;
if (!PASS) {
  console.error('Set DEPLOY_PASSWORD environment variable');
  process.exit(1);
}
const REMOTE = '/var/www/violence';
const ARCHIVE = join(ROOT, 'violence-deploy.tar.gz');

function run(cmd, cwd = ROOT) {
  console.log(`> ${cmd}`);
  execSync(cmd, { cwd, stdio: 'inherit', shell: true });
}

function buildArchive() {
  console.log('\n=== Building frontend ===');
  run('npm.cmd run build');

  const stage = join(ROOT, '.deploy-stage');
  rmSync(stage, { recursive: true, force: true });
  mkdirSync(join(stage, 'proxy'), { recursive: true });

  cpSync(join(ROOT, 'dist'), join(stage, 'dist'), { recursive: true });
  cpSync(join(ROOT, 'deploy', 'proxy-server.js'), join(stage, 'proxy', 'proxy-server.js'));
  cpSync(join(ROOT, 'deploy', 'translate-engine.js'), join(stage, 'proxy', 'translate-engine.js'));
  cpSync(join(ROOT, 'js', 'manga-glossary.js'), join(stage, 'proxy', 'manga-glossary.js'));
  cpSync(join(ROOT, 'deploy', 'package.json'), join(stage, 'proxy', 'package.json'));
  cpSync(join(ROOT, 'deploy', 'nginx-violence.conf'), join(stage, 'nginx-violence.conf'));
  cpSync(join(ROOT, 'deploy', 'setup-server.sh'), join(stage, 'setup-server.sh'));

  rmSync(ARCHIVE, { force: true });
  run(`tar -czf "${ARCHIVE}" -C "${stage}" .`);
  console.log(`Archive ready: ${ARCHIVE}`);
}

function sshExec(conn, cmd) {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      stream.on('data', d => process.stdout.write(d));
      stream.stderr.on('data', d => process.stderr.write(d));
      stream.on('close', code => {
        if (code !== 0) reject(new Error(`Remote command failed (${code})`));
        else resolve();
      });
    });
  });
}

function uploadAndDeploy() {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    conn.on('ready', async () => {
      try {
        console.log('\n=== Uploading ===');
        await new Promise((res, rej) => {
          conn.sftp((err, sftp) => {
            if (err) return rej(err);
            sshExec(conn, `mkdir -p ${REMOTE}`).then(() => {
              sftp.fastPut(ARCHIVE, `${REMOTE}/violence-deploy.tar.gz`, e => {
                if (e) rej(e);
                else res();
              });
            }).catch(rej);
          });
        });

        console.log('\n=== Installing on server ===');
        await sshExec(conn, `cd ${REMOTE} && tar -xzf violence-deploy.tar.gz && rm violence-deploy.tar.gz && sed -i 's/\\r$//' setup-server.sh && chmod +x setup-server.sh && bash setup-server.sh`);

        console.log(`\n✅ Готово: https://${HOST}`);
        conn.end();
        resolve();
      } catch (e) {
        conn.end();
        reject(e);
      }
    });
    conn.on('error', reject);
    conn.on('keyboard-interactive', (_n, _i, _l, prompts, finish) => {
      finish(prompts.map(() => PASS));
    });
    conn.connect({
      host: HOST,
      port: 22,
      username: USER,
      password: PASS,
      tryKeyboard: true,
      readyTimeout: 60000,
    });
  });
}

buildArchive();
uploadAndDeploy().catch(err => {
  console.error('\nDeploy failed:', err.message);
  process.exit(1);
});
