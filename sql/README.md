# SQL Server — ViolenceManga

База данных для хранения пользователей, прогресса и библиотеки (вместо localStorage).

**Сервер:** `WINDOWTRAGIC\SQLEXPRESS`  
**База:** `ViolenceManga`

## Способ 1 — SSMS

1. Откройте **SQL Server Management Studio**
2. Подключитесь к `WINDOWTRAGIC\SQLEXPRESS` (Windows Authentication)
3. **File → Open →** `sql/01_create_database.sql`
4. Нажмите **Execute** (F5)
5. В Object Explorer: **Databases → ViolenceManga**

## Способ 2 — скрипт

```bat
sql\setup-db.bat
```

## Таблицы

| Таблица | Назначение |
|---------|------------|
| `Users` | Логин, email, пароль (hash) |
| `Profiles` | Имя, XP, уровень, bio |
| `UserSettings` | Настройки (JSON) |
| `UserStats` | Статистика чтения |
| `Favorites` | Избранное |
| `History` | История просмотров |
| `ReadChapters` | Прочитанные главы |
| `Bookmarks` | Закладки «продолжить» |
| `ListItems` | Списки (читаю, в планах…) |
| `ReadingLog` | Страницы/главы по дням |
| `GenreStats` | Жанры |
| `Achievements` | Достижения |
| `Notifications` | Уведомления |
| `OfflineChapters` | Метаданные офлайн-глав |
| `TranslationCache` | Кэш переводов |

Представление `vw_UserSummary` — сводка по пользователям.

## Проверка

```sql
USE ViolenceManga;
SELECT name FROM sys.tables ORDER BY name;
SELECT * FROM dbo.vw_UserSummary;
```

> Приложение пока использует **localStorage**. Подключение фронтенда к SQL потребует API-сервера (Node.js + `mssql`).

---

## Node.js API (реализовано)

Папка `server/` — Express API на порту **3001**.

```bat
start.bat          REM API + frontend
sql\setup-db.bat   REM создать БД
```

Проверка: http://localhost:3001/api/health

| Endpoint | Описание |
|----------|----------|
| `GET /api/health` | Статус + MSSQL |
| `POST /api/auth/register` | Регистрация |
| `POST /api/auth/login` | Вход |
| `POST /api/auth/logout` | Выход |
| `GET /api/auth/me` | Текущий пользователь |
| `GET /api/state` | Загрузить прогресс |
| `PUT /api/state` | Сохранить прогресс |

Конфиг: `server/.env` (сервер `WINDOWTRAGIC\SQLEXPRESS`, Windows Auth).
