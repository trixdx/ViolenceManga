import crypto from 'node:crypto';
import { sql, getPool } from '../db.js';
import { defaultState } from '../config.js';

function mergeDefaults(parsed) {
  return {
    ...structuredClone(defaultState),
    ...parsed,
    settings: { ...defaultState.settings, ...parsed?.settings },
    lists: { ...defaultState.lists, ...parsed?.lists },
    listMeta: parsed?.listMeta || {},
    bookmarks: parsed?.bookmarks || {},
    readingLog: parsed?.readingLog || {},
    genreStats: parsed?.genreStats || {},
    stats: { ...defaultState.stats, ...parsed?.stats },
    profile: { ...defaultState.profile, ...parsed?.profile },
    achievements: parsed?.achievements || {},
    notifications: parsed?.notifications || [],
    readChapters: parsed?.readChapters || [],
    favorites: parsed?.favorites || [],
    history: parsed?.history || [],
  };
}

export async function loadState(userId) {
  const pool = await getPool();
  const uid = userId;

  const profileR = await pool.request()
    .input('uid', sql.UniqueIdentifier, uid)
    .query(`SELECT Name, Avatar, AvatarUrl, Bio, Xp, Level, JoinedAt FROM Profiles WHERE UserId = @uid`);

  if (!profileR.recordset.length) return null;

  const p = profileR.recordset[0];

  const settingsR = await pool.request()
    .input('uid', sql.UniqueIdentifier, uid)
    .query('SELECT SettingsJson FROM UserSettings WHERE UserId = @uid');

  let settings = defaultState.settings;
  if (settingsR.recordset[0]?.SettingsJson) {
    try {
      settings = { ...defaultState.settings, ...JSON.parse(settingsR.recordset[0].SettingsJson) };
    } catch { /* keep defaults */ }
  }

  const statsR = await pool.request()
    .input('uid', sql.UniqueIdentifier, uid)
    .query(`SELECT ChaptersRead, PagesRead, MangaOpened, SearchCount, FavoritesCount, TotalReadTime
            FROM UserStats WHERE UserId = @uid`);
  const s = statsR.recordset[0] || {};

  const favR = await pool.request()
    .input('uid', sql.UniqueIdentifier, uid)
    .query(`SELECT MangaId AS id, Title AS title, CoverUrl AS cover, AddedAt AS addedAt
            FROM Favorites WHERE UserId = @uid ORDER BY AddedAt DESC`);

  const histR = await pool.request()
    .input('uid', sql.UniqueIdentifier, uid)
    .query(`SELECT TOP 50 MangaId AS mangaId, Title AS title, CoverUrl AS cover,
            ChapterTitle AS chapter, DATEDIFF_BIG(ms, '1970-01-01', ViewedAt) AS at
            FROM History WHERE UserId = @uid ORDER BY ViewedAt DESC`);

  const readR = await pool.request()
    .input('uid', sql.UniqueIdentifier, uid)
    .query('SELECT ChapterId FROM ReadChapters WHERE UserId = @uid');

  const bmR = await pool.request()
    .input('uid', sql.UniqueIdentifier, uid)
    .query(`SELECT MangaId, ChapterId AS chapterId, ChapterTitle AS chapterTitle,
            MangaTitle AS mangaTitle, PageIndex AS pageIndex, CoverUrl AS cover,
            DATEDIFF_BIG(ms, '1970-01-01', UpdatedAt) AS updatedAt
            FROM Bookmarks WHERE UserId = @uid`);

  const bookmarks = {};
  bmR.recordset.forEach(row => {
    bookmarks[row.MangaId] = {
      chapterId: row.chapterId,
      chapterTitle: row.chapterTitle,
      mangaTitle: row.mangaTitle,
      pageIndex: row.pageIndex,
      cover: row.cover,
      updatedAt: Number(row.updatedAt),
    };
  });

  const listR = await pool.request()
    .input('uid', sql.UniqueIdentifier, uid)
    .query(`SELECT ListName, MangaId, Title, CoverUrl, SortOrder, UpdatedAt
            FROM ListItems WHERE UserId = @uid ORDER BY ListName, SortOrder`);

  const lists = { reading: [], plan: [], completed: [], dropped: [] };
  const listMeta = {};
  listR.recordset.forEach(row => {
    if (lists[row.ListName]) lists[row.ListName].push(row.MangaId);
    if (row.Title || row.CoverUrl) {
      listMeta[row.MangaId] = {
        title: row.Title,
        cover: row.CoverUrl,
        updatedAt: row.UpdatedAt ? new Date(row.UpdatedAt).getTime() : Date.now(),
      };
    }
  });

  const logR = await pool.request()
    .input('uid', sql.UniqueIdentifier, uid)
    .query('SELECT LogDate, Pages, Chapters FROM ReadingLog WHERE UserId = @uid');

  const readingLog = {};
  logR.recordset.forEach(row => {
    const key = row.LogDate.toISOString().slice(0, 10);
    readingLog[key] = { pages: row.Pages, chapters: row.Chapters };
  });

  const genreR = await pool.request()
    .input('uid', sql.UniqueIdentifier, uid)
    .query('SELECT GenreName, HitCount FROM GenreStats WHERE UserId = @uid');

  const genreStats = {};
  genreR.recordset.forEach(row => { genreStats[row.GenreName] = row.HitCount; });

  const achR = await pool.request()
    .input('uid', sql.UniqueIdentifier, uid)
    .query(`SELECT AchievementId, DATEDIFF_BIG(ms, '1970-01-01', UnlockedAt) AS unlockedAt
            FROM Achievements WHERE UserId = @uid`);

  const achievements = {};
  achR.recordset.forEach(row => {
    achievements[row.AchievementId] = { unlockedAt: Number(row.unlockedAt) };
  });

  const notifR = await pool.request()
    .input('uid', sql.UniqueIdentifier, uid)
    .query(`SELECT Type AS type, Message AS message, Detail AS detail,
            DATEDIFF_BIG(ms, '1970-01-01', CreatedAt) AS at
            FROM Notifications WHERE UserId = @uid ORDER BY CreatedAt DESC`);

  return mergeDefaults({
    profile: {
      name: p.Name,
      avatar: p.Avatar?.trim()?.slice(0, 1) || 'G',
      avatarUrl: p.AvatarUrl || '',
      bio: p.Bio || '',
      xp: p.Xp,
      level: p.Level,
      joinedAt: new Date(p.JoinedAt).getTime(),
    },
    settings,
    stats: {
      chaptersRead: s.ChaptersRead || 0,
      pagesRead: s.PagesRead || 0,
      mangaOpened: s.MangaOpened || 0,
      searchCount: s.SearchCount || 0,
      favoritesCount: s.FavoritesCount || 0,
      totalReadTime: s.TotalReadTime || 0,
    },
    favorites: favR.recordset.map(r => ({
      id: r.id,
      title: r.title,
      cover: r.cover,
      addedAt: new Date(r.addedAt).getTime(),
    })),
    history: histR.recordset.map(r => ({
      mangaId: r.mangaId,
      title: r.title,
      cover: r.cover,
      chapter: r.chapter,
      at: Number(r.at),
    })),
    readChapters: readR.recordset.map(r => r.ChapterId),
    bookmarks,
    lists,
    listMeta,
    readingLog,
    genreStats,
    achievements,
    notifications: notifR.recordset.map(r => ({
      type: r.type,
      message: r.message,
      detail: r.detail,
      at: Number(r.at),
    })),
  });
}

export async function saveState(userId, rawState) {
  const state = mergeDefaults(rawState);
  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  await tx.begin();

  try {
    const req = () => new sql.Request(tx);
    const uid = userId;

    await req()
      .input('uid', sql.UniqueIdentifier, uid)
      .input('name', sql.NVarChar(100), state.profile.name)
      .input('avatar', sql.NVarChar(8), (state.profile.avatar || 'G').slice(0, 8))
      .input('avatarUrl', sql.NVarChar(sql.MAX), state.profile.avatarUrl || null)
      .input('bio', sql.NVarChar(500), state.profile.bio || '')
      .input('xp', sql.Int, state.profile.xp || 0)
      .input('level', sql.Int, state.profile.level || 1)
      .input('joined', sql.DateTime2, new Date(state.profile.joinedAt || Date.now()))
      .query(`UPDATE Profiles SET Name=@name, Avatar=@avatar, AvatarUrl=@avatarUrl, Bio=@bio, Xp=@xp, Level=@level, JoinedAt=@joined
              WHERE UserId=@uid`);

    await req()
      .input('uid', sql.UniqueIdentifier, uid)
      .input('json', sql.NVarChar(sql.MAX), JSON.stringify(state.settings))
      .query(`MERGE UserSettings AS t USING (SELECT @uid AS UserId) AS s ON t.UserId = s.UserId
              WHEN MATCHED THEN UPDATE SET SettingsJson=@json, UpdatedAt=SYSUTCDATETIME()
              WHEN NOT MATCHED THEN INSERT (UserId, SettingsJson) VALUES (@uid, @json);`);

    await req()
      .input('uid', sql.UniqueIdentifier, uid)
      .input('cr', sql.Int, state.stats.chaptersRead || 0)
      .input('pr', sql.Int, state.stats.pagesRead || 0)
      .input('mo', sql.Int, state.stats.mangaOpened || 0)
      .input('sc', sql.Int, state.stats.searchCount || 0)
      .input('fc', sql.Int, state.stats.favoritesCount || 0)
      .input('tr', sql.Int, state.stats.totalReadTime || 0)
      .query(`UPDATE UserStats SET ChaptersRead=@cr, PagesRead=@pr, MangaOpened=@mo,
              SearchCount=@sc, FavoritesCount=@fc, TotalReadTime=@tr WHERE UserId=@uid`);

    await req().input('uid', sql.UniqueIdentifier, uid).query('DELETE FROM Favorites WHERE UserId=@uid');
    for (const f of state.favorites) {
      await req()
        .input('uid', sql.UniqueIdentifier, uid)
        .input('mid', sql.NVarChar(36), f.id)
        .input('title', sql.NVarChar(500), f.title || '')
        .input('cover', sql.NVarChar(1000), f.cover || null)
        .input('at', sql.DateTime2, new Date(f.addedAt || Date.now()))
        .query(`INSERT INTO Favorites (UserId, MangaId, Title, CoverUrl, AddedAt)
                VALUES (@uid, @mid, @title, @cover, @at)`);
    }

    await req().input('uid', sql.UniqueIdentifier, uid).query('DELETE FROM History WHERE UserId=@uid');
    for (const h of state.history.slice(0, 50)) {
      await req()
        .input('uid', sql.UniqueIdentifier, uid)
        .input('mid', sql.NVarChar(36), h.mangaId)
        .input('title', sql.NVarChar(500), h.title || '')
        .input('cover', sql.NVarChar(1000), h.cover || null)
        .input('ch', sql.NVarChar(500), h.chapter || null)
        .input('at', sql.DateTime2, new Date(h.at || Date.now()))
        .query(`INSERT INTO History (UserId, MangaId, Title, CoverUrl, ChapterTitle, ViewedAt)
                VALUES (@uid, @mid, @title, @cover, @ch, @at)`);
    }

    await req().input('uid', sql.UniqueIdentifier, uid).query('DELETE FROM ReadChapters WHERE UserId=@uid');
    for (const chId of state.readChapters) {
      await req()
        .input('uid', sql.UniqueIdentifier, uid)
        .input('cid', sql.NVarChar(36), chId)
        .query('INSERT INTO ReadChapters (UserId, ChapterId) VALUES (@uid, @cid)');
    }

    await req().input('uid', sql.UniqueIdentifier, uid).query('DELETE FROM Bookmarks WHERE UserId=@uid');
    for (const [mangaId, bm] of Object.entries(state.bookmarks)) {
      await req()
        .input('uid', sql.UniqueIdentifier, uid)
        .input('mid', sql.NVarChar(36), mangaId)
        .input('cid', sql.NVarChar(36), bm.chapterId)
        .input('ct', sql.NVarChar(500), bm.chapterTitle || null)
        .input('mt', sql.NVarChar(500), bm.mangaTitle || null)
        .input('pi', sql.Int, bm.pageIndex || 0)
        .input('cover', sql.NVarChar(1000), bm.cover || null)
        .input('at', sql.DateTime2, new Date(bm.updatedAt || Date.now()))
        .query(`INSERT INTO Bookmarks (UserId, MangaId, ChapterId, ChapterTitle, MangaTitle, PageIndex, CoverUrl, UpdatedAt)
                VALUES (@uid, @mid, @cid, @ct, @mt, @pi, @cover, @at)`);
    }

    await req().input('uid', sql.UniqueIdentifier, uid).query('DELETE FROM ListItems WHERE UserId=@uid');
    for (const [listName, ids] of Object.entries(state.lists)) {
      if (!Array.isArray(ids)) continue;
      for (let i = 0; i < ids.length; i++) {
        const mangaId = ids[i];
        const meta = state.listMeta[mangaId] || {};
        await req()
          .input('uid', sql.UniqueIdentifier, uid)
          .input('ln', sql.NVarChar(20), listName)
          .input('mid', sql.NVarChar(36), mangaId)
          .input('title', sql.NVarChar(500), meta.title || null)
          .input('cover', sql.NVarChar(1000), meta.cover || null)
          .input('ord', sql.Int, i)
          .query(`INSERT INTO ListItems (UserId, ListName, MangaId, Title, CoverUrl, SortOrder)
                  VALUES (@uid, @ln, @mid, @title, @cover, @ord)`);
      }
    }

    await req().input('uid', sql.UniqueIdentifier, uid).query('DELETE FROM ReadingLog WHERE UserId=@uid');
    for (const [day, log] of Object.entries(state.readingLog)) {
      await req()
        .input('uid', sql.UniqueIdentifier, uid)
        .input('day', sql.Date, day)
        .input('pages', sql.Int, log.pages || 0)
        .input('chapters', sql.Int, log.chapters || 0)
        .query('INSERT INTO ReadingLog (UserId, LogDate, Pages, Chapters) VALUES (@uid, @day, @pages, @chapters)');
    }

    await req().input('uid', sql.UniqueIdentifier, uid).query('DELETE FROM GenreStats WHERE UserId=@uid');
    for (const [name, count] of Object.entries(state.genreStats)) {
      await req()
        .input('uid', sql.UniqueIdentifier, uid)
        .input('name', sql.NVarChar(100), name)
        .input('cnt', sql.Int, count)
        .query('INSERT INTO GenreStats (UserId, GenreName, HitCount) VALUES (@uid, @name, @cnt)');
    }

    await req().input('uid', sql.UniqueIdentifier, uid).query('DELETE FROM Achievements WHERE UserId=@uid');
    for (const [achId, val] of Object.entries(state.achievements)) {
      await req()
        .input('uid', sql.UniqueIdentifier, uid)
        .input('aid', sql.NVarChar(50), achId)
        .input('at', sql.DateTime2, new Date(val.unlockedAt || Date.now()))
        .query('INSERT INTO Achievements (UserId, AchievementId, UnlockedAt) VALUES (@uid, @aid, @at)');
    }

    await req().input('uid', sql.UniqueIdentifier, uid).query('DELETE FROM Notifications WHERE UserId=@uid');
    for (const n of state.notifications) {
      await req()
        .input('uid', sql.UniqueIdentifier, uid)
        .input('type', sql.NVarChar(30), n.type || 'info')
        .input('msg', sql.NVarChar(500), n.message || '')
        .input('det', sql.NVarChar(1000), n.detail || null)
        .input('at', sql.DateTime2, new Date(n.at || Date.now()))
        .query('INSERT INTO Notifications (UserId, Type, Message, Detail, CreatedAt) VALUES (@uid, @type, @msg, @det, @at)');
    }

    await tx.commit();
    return state;
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}

export async function initUserRows(userId, profileName) {
  const pool = await getPool();
  const uid = userId;
  const name = profileName || 'User';

  await pool.request()
    .input('uid', sql.UniqueIdentifier, uid)
    .input('name', sql.NVarChar(100), name)
    .input('avatar', sql.NChar(1), name[0]?.toUpperCase() || 'U')
    .query(`INSERT INTO Profiles (UserId, Name, Avatar) VALUES (@uid, @name, @avatar)`);

  await pool.request()
    .input('uid', sql.UniqueIdentifier, uid)
    .input('json', sql.NVarChar(sql.MAX), JSON.stringify(defaultState.settings))
    .query('INSERT INTO UserSettings (UserId, SettingsJson) VALUES (@uid, @json)');

  await pool.request()
    .input('uid', sql.UniqueIdentifier, uid)
    .query('INSERT INTO UserStats (UserId) VALUES (@uid)');
}

export function hashPassword(password, salt) {
  return crypto.createHash('sha256').update(`${salt}:${password}`).digest('hex');
}

export function newUserId() {
  return crypto.randomUUID();
}

export function newSalt() {
  return crypto.randomUUID();
}
