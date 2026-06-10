import { sql, getPool } from '../db.js';
import { hashPassword, newUserId, newSalt, initUserRows, saveState } from './stateService.js';

function normalizeLogin(login) {
  return login.trim().toLowerCase();
}

function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

export async function findUserByLoginOrEmail(identifier) {
  const id = identifier.trim().toLowerCase();
  const pool = await getPool();
  const r = await pool.request()
    .input('id', sql.NVarChar(255), id)
    .query(`SELECT UserId, Login, Email, DisplayName, PasswordHash, Salt, CreatedAt
            FROM Users WHERE Login = @id OR Email = @id`);
  return r.recordset[0] || null;
}

export async function findUserById(userId) {
  const pool = await getPool();
  const r = await pool.request()
    .input('uid', sql.UniqueIdentifier, userId)
    .query(`SELECT UserId, Login, Email, DisplayName, CreatedAt FROM Users WHERE UserId = @uid`);
  return r.recordset[0] || null;
}

export async function registerUser({ login, email, password, guestState }) {
  const displayLogin = login.trim();
  const normLogin = normalizeLogin(displayLogin);
  const normEmail = normalizeEmail(email);

  const pool = await getPool();

  const dup = await pool.request()
    .input('login', sql.NVarChar(24), normLogin)
    .input('email', sql.NVarChar(255), normEmail)
    .query('SELECT 1 FROM Users WHERE Login=@login OR Email=@email');

  if (dup.recordset.length) {
    const loginTaken = await pool.request()
      .input('login', sql.NVarChar(24), normLogin)
      .query('SELECT 1 FROM Users WHERE Login=@login');
    if (loginTaken.recordset.length) throw new Error('Этот логин уже занят');
    throw new Error('Этот email уже зарегистрирован');
  }

  const userId = newUserId();
  const salt = newSalt();
  const passwordHash = hashPassword(password, salt);

  await pool.request()
    .input('uid', sql.UniqueIdentifier, userId)
    .input('login', sql.NVarChar(24), normLogin)
    .input('email', sql.NVarChar(255), normEmail)
    .input('display', sql.NVarChar(100), displayLogin)
    .input('hash', sql.NVarChar(64), passwordHash)
    .input('salt', sql.NVarChar(36), salt)
    .query(`INSERT INTO Users (UserId, Login, Email, DisplayName, PasswordHash, Salt)
            VALUES (@uid, @login, @email, @display, @hash, @salt)`);

  await initUserRows(userId, displayLogin);

  if (guestState && typeof guestState === 'object') {
    guestState.profile = {
      ...guestState.profile,
      name: displayLogin,
      joinedAt: Date.now(),
    };
    await saveState(userId, guestState);
  }

  return findUserById(userId);
}

export async function loginUser(identifier, password) {
  const user = await findUserByLoginOrEmail(identifier);
  if (!user) throw new Error('Пользователь не найден');

  const hash = hashPassword(password, user.Salt);
  if (hash !== user.PasswordHash) throw new Error('Неверный пароль');

  return findUserById(user.UserId);
}

export function publicUser(row) {
  if (!row) return null;
  return {
    id: row.UserId,
    login: row.Login,
    displayName: row.DisplayName,
    email: row.Email,
    createdAt: new Date(row.CreatedAt).getTime(),
  };
}
