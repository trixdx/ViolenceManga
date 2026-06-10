import sql from 'mssql/msnodesqlv8.js';
import { config } from './config.js';

let pool = null;

const ODBC_DRIVERS = [
  'ODBC Driver 18 for SQL Server',
  'ODBC Driver 17 for SQL Server',
  'SQL Server',
];

function buildConnectionString(driver, { server, database, user, password, trusted }) {
  const parts = [
    `Driver={${driver}}`,
    `Server=${server}`,
    `Database=${database}`,
    'TrustServerCertificate=yes',
  ];
  if (user && password) {
    parts.push(`UID=${user}`, `PWD=${password}`);
  } else if (trusted) {
    parts.push('Trusted_Connection=yes');
  }
  return parts.join(';') + ';';
}

async function connectPool() {
  const { server, database, user, password, trusted } = config.db;

  if (user && password) {
    return sql.connect({
      server,
      database,
      user,
      password,
      options: { trustServerCertificate: true, encrypt: false },
    });
  }

  let lastErr;
  for (const driver of ODBC_DRIVERS) {
    try {
      const connectionString = buildConnectionString(driver, { server, database, user, password, trusted });
      return await sql.connect({ connectionString, driver: 'msnodesqlv8' });
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('Cannot connect to SQL Server');
}

export async function getPool() {
  if (pool) return pool;
  pool = await connectPool();
  return pool;
}

export async function pingDb() {
  const p = await getPool();
  const r = await p.request().query('SELECT 1 AS ok');
  return r.recordset[0]?.ok === 1;
}

export { sql };
