-- Violence Manga Reader — SQL Server schema
-- Server: WINDOWTRAGIC\SQLEXPRESS
-- Run in SSMS or: sqlcmd -S WINDOWTRAGIC\SQLEXPRESS -E -i sql\01_create_database.sql

USE master;
GO

IF NOT EXISTS (SELECT 1 FROM sys.databases WHERE name = N'ViolenceManga')
BEGIN
    CREATE DATABASE ViolenceManga
    COLLATE Cyrillic_General_CI_AS;
END
GO

USE ViolenceManga;
GO

-- ── Users & auth ─────────────────────────────────────────────

IF OBJECT_ID(N'dbo.Users', N'U') IS NULL
CREATE TABLE dbo.Users (
    UserId          UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_Users PRIMARY KEY DEFAULT NEWID(),
    Login           NVARCHAR(24)     NOT NULL,
    Email           NVARCHAR(255)    NOT NULL,
    DisplayName     NVARCHAR(100)    NOT NULL,
    PasswordHash    NVARCHAR(64)     NOT NULL,
    Salt            NVARCHAR(36)     NOT NULL,
    CreatedAt       DATETIME2(3)     NOT NULL CONSTRAINT DF_Users_CreatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_Users_Login  UNIQUE (Login),
    CONSTRAINT UQ_Users_Email UNIQUE (Email)
);
GO

IF OBJECT_ID(N'dbo.Profiles', N'U') IS NULL
CREATE TABLE dbo.Profiles (
    UserId      UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_Profiles PRIMARY KEY,
    Name        NVARCHAR(100)    NOT NULL CONSTRAINT DF_Profiles_Name DEFAULT N'Гость',
    Avatar      NCHAR(1)         NOT NULL CONSTRAINT DF_Profiles_Avatar DEFAULT N'G',
    Bio         NVARCHAR(500)    NOT NULL CONSTRAINT DF_Profiles_Bio DEFAULT N'',
    Xp          INT              NOT NULL CONSTRAINT DF_Profiles_Xp DEFAULT 0,
    Level       INT              NOT NULL CONSTRAINT DF_Profiles_Level DEFAULT 1,
    JoinedAt    DATETIME2(3)     NOT NULL CONSTRAINT DF_Profiles_JoinedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_Profiles_Users FOREIGN KEY (UserId) REFERENCES dbo.Users(UserId) ON DELETE CASCADE
);
GO

IF OBJECT_ID(N'dbo.UserSettings', N'U') IS NULL
CREATE TABLE dbo.UserSettings (
    UserId          UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_UserSettings PRIMARY KEY,
    SettingsJson    NVARCHAR(MAX)    NOT NULL,
    UpdatedAt       DATETIME2(3)     NOT NULL CONSTRAINT DF_UserSettings_UpdatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_UserSettings_Users FOREIGN KEY (UserId) REFERENCES dbo.Users(UserId) ON DELETE CASCADE,
    CONSTRAINT CK_UserSettings_Json CHECK (ISJSON(SettingsJson) = 1)
);
GO

IF OBJECT_ID(N'dbo.UserStats', N'U') IS NULL
CREATE TABLE dbo.UserStats (
    UserId          UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_UserStats PRIMARY KEY,
    ChaptersRead    INT NOT NULL CONSTRAINT DF_UserStats_ChaptersRead DEFAULT 0,
    PagesRead       INT NOT NULL CONSTRAINT DF_UserStats_PagesRead DEFAULT 0,
    MangaOpened     INT NOT NULL CONSTRAINT DF_UserStats_MangaOpened DEFAULT 0,
    SearchCount     INT NOT NULL CONSTRAINT DF_UserStats_SearchCount DEFAULT 0,
    FavoritesCount  INT NOT NULL CONSTRAINT DF_UserStats_FavoritesCount DEFAULT 0,
    TotalReadTime   INT NOT NULL CONSTRAINT DF_UserStats_TotalReadTime DEFAULT 0,
    CONSTRAINT FK_UserStats_Users FOREIGN KEY (UserId) REFERENCES dbo.Users(UserId) ON DELETE CASCADE
);
GO

-- ── Library ──────────────────────────────────────────────────

IF OBJECT_ID(N'dbo.Favorites', N'U') IS NULL
CREATE TABLE dbo.Favorites (
    FavoriteId  BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Favorites PRIMARY KEY,
    UserId      UNIQUEIDENTIFIER     NOT NULL,
    MangaId     NVARCHAR(36)         NOT NULL,
    Title       NVARCHAR(500)        NOT NULL,
    CoverUrl    NVARCHAR(1000)       NULL,
    AddedAt     DATETIME2(3)         NOT NULL CONSTRAINT DF_Favorites_AddedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_Favorites_Users FOREIGN KEY (UserId) REFERENCES dbo.Users(UserId) ON DELETE CASCADE,
    CONSTRAINT UQ_Favorites_UserManga UNIQUE (UserId, MangaId)
);
GO

IF OBJECT_ID(N'dbo.History', N'U') IS NULL
CREATE TABLE dbo.History (
    HistoryId   BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_History PRIMARY KEY,
    UserId      UNIQUEIDENTIFIER     NOT NULL,
    MangaId     NVARCHAR(36)         NOT NULL,
    Title       NVARCHAR(500)        NOT NULL,
    CoverUrl    NVARCHAR(1000)       NULL,
    ChapterTitle NVARCHAR(500)       NULL,
    ViewedAt    DATETIME2(3)         NOT NULL CONSTRAINT DF_History_ViewedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_History_Users FOREIGN KEY (UserId) REFERENCES dbo.Users(UserId) ON DELETE CASCADE
);
GO

IF OBJECT_ID(N'dbo.ReadChapters', N'U') IS NULL
CREATE TABLE dbo.ReadChapters (
    UserId      UNIQUEIDENTIFIER NOT NULL,
    ChapterId   NVARCHAR(36)     NOT NULL,
    ReadAt      DATETIME2(3)     NOT NULL CONSTRAINT DF_ReadChapters_ReadAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_ReadChapters PRIMARY KEY (UserId, ChapterId),
    CONSTRAINT FK_ReadChapters_Users FOREIGN KEY (UserId) REFERENCES dbo.Users(UserId) ON DELETE CASCADE
);
GO

IF OBJECT_ID(N'dbo.Bookmarks', N'U') IS NULL
CREATE TABLE dbo.Bookmarks (
    UserId          UNIQUEIDENTIFIER NOT NULL,
    MangaId         NVARCHAR(36)     NOT NULL,
    ChapterId       NVARCHAR(36)     NOT NULL,
    ChapterTitle    NVARCHAR(500)    NULL,
    MangaTitle      NVARCHAR(500)    NULL,
    PageIndex       INT              NOT NULL CONSTRAINT DF_Bookmarks_PageIndex DEFAULT 0,
    CoverUrl        NVARCHAR(1000)   NULL,
    UpdatedAt       DATETIME2(3)     NOT NULL CONSTRAINT DF_Bookmarks_UpdatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_Bookmarks PRIMARY KEY (UserId, MangaId),
    CONSTRAINT FK_Bookmarks_Users FOREIGN KEY (UserId) REFERENCES dbo.Users(UserId) ON DELETE CASCADE
);
GO

IF OBJECT_ID(N'dbo.ListItems', N'U') IS NULL
CREATE TABLE dbo.ListItems (
    ListItemId  BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_ListItems PRIMARY KEY,
    UserId      UNIQUEIDENTIFIER     NOT NULL,
    ListName    NVARCHAR(20)         NOT NULL,
    MangaId     NVARCHAR(36)         NOT NULL,
    Title       NVARCHAR(500)        NULL,
    CoverUrl    NVARCHAR(1000)       NULL,
    SortOrder   INT                  NOT NULL CONSTRAINT DF_ListItems_SortOrder DEFAULT 0,
    UpdatedAt   DATETIME2(3)         NOT NULL CONSTRAINT DF_ListItems_UpdatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_ListItems_Users FOREIGN KEY (UserId) REFERENCES dbo.Users(UserId) ON DELETE CASCADE,
    CONSTRAINT CK_ListItems_Name CHECK (ListName IN (N'reading', N'plan', N'completed', N'dropped')),
    CONSTRAINT UQ_ListItems_UserListManga UNIQUE (UserId, ListName, MangaId)
);
GO

-- ── Progress & gamification ──────────────────────────────────

IF OBJECT_ID(N'dbo.ReadingLog', N'U') IS NULL
CREATE TABLE dbo.ReadingLog (
    UserId      UNIQUEIDENTIFIER NOT NULL,
    LogDate     DATE             NOT NULL,
    Pages       INT              NOT NULL CONSTRAINT DF_ReadingLog_Pages DEFAULT 0,
    Chapters    INT              NOT NULL CONSTRAINT DF_ReadingLog_Chapters DEFAULT 0,
    CONSTRAINT PK_ReadingLog PRIMARY KEY (UserId, LogDate),
    CONSTRAINT FK_ReadingLog_Users FOREIGN KEY (UserId) REFERENCES dbo.Users(UserId) ON DELETE CASCADE
);
GO

IF OBJECT_ID(N'dbo.GenreStats', N'U') IS NULL
CREATE TABLE dbo.GenreStats (
    UserId      UNIQUEIDENTIFIER NOT NULL,
    GenreName   NVARCHAR(100)    NOT NULL,
    HitCount    INT              NOT NULL CONSTRAINT DF_GenreStats_HitCount DEFAULT 0,
    CONSTRAINT PK_GenreStats PRIMARY KEY (UserId, GenreName),
    CONSTRAINT FK_GenreStats_Users FOREIGN KEY (UserId) REFERENCES dbo.Users(UserId) ON DELETE CASCADE
);
GO

IF OBJECT_ID(N'dbo.Achievements', N'U') IS NULL
CREATE TABLE dbo.Achievements (
    UserId          UNIQUEIDENTIFIER NOT NULL,
    AchievementId   NVARCHAR(50)     NOT NULL,
    UnlockedAt      DATETIME2(3)     NOT NULL CONSTRAINT DF_Achievements_UnlockedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_Achievements PRIMARY KEY (UserId, AchievementId),
    CONSTRAINT FK_Achievements_Users FOREIGN KEY (UserId) REFERENCES dbo.Users(UserId) ON DELETE CASCADE
);
GO

IF OBJECT_ID(N'dbo.Notifications', N'U') IS NULL
CREATE TABLE dbo.Notifications (
    NotificationId  BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Notifications PRIMARY KEY,
    UserId          UNIQUEIDENTIFIER     NOT NULL,
    Type            NVARCHAR(30)         NOT NULL,
    Message         NVARCHAR(500)        NOT NULL,
    Detail          NVARCHAR(1000)       NULL,
    CreatedAt       DATETIME2(3)         NOT NULL CONSTRAINT DF_Notifications_CreatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_Notifications_Users FOREIGN KEY (UserId) REFERENCES dbo.Users(UserId) ON DELETE CASCADE
);
GO

-- ── Offline cache metadata (images stay in browser IndexedDB) ─

IF OBJECT_ID(N'dbo.OfflineChapters', N'U') IS NULL
CREATE TABLE dbo.OfflineChapters (
    UserId          UNIQUEIDENTIFIER NOT NULL,
    ChapterId       NVARCHAR(36)     NOT NULL,
    MangaId         NVARCHAR(36)     NOT NULL,
    Title           NVARCHAR(500)    NULL,
    MangaTitle      NVARCHAR(500)    NULL,
    PageCount       INT              NOT NULL CONSTRAINT DF_OfflineChapters_PageCount DEFAULT 0,
    CachedAt        DATETIME2(3)     NOT NULL CONSTRAINT DF_OfflineChapters_CachedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_OfflineChapters PRIMARY KEY (UserId, ChapterId),
    CONSTRAINT FK_OfflineChapters_Users FOREIGN KEY (UserId) REFERENCES dbo.Users(UserId) ON DELETE CASCADE
);
GO

-- ── Translation cache ────────────────────────────────────────

IF OBJECT_ID(N'dbo.TranslationCache', N'U') IS NULL
CREATE TABLE dbo.TranslationCache (
    CacheKey        CHAR(64)         NOT NULL CONSTRAINT PK_TranslationCache PRIMARY KEY,
    SourceText      NVARCHAR(MAX)    NOT NULL,
    TranslatedText  NVARCHAR(MAX)    NOT NULL,
    TargetLang      NCHAR(2)         NOT NULL CONSTRAINT DF_TranslationCache_Lang DEFAULT N'ru',
    CreatedAt       DATETIME2(3)     NOT NULL CONSTRAINT DF_TranslationCache_CreatedAt DEFAULT SYSUTCDATETIME()
);
GO

-- ── Indexes ──────────────────────────────────────────────────

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Favorites_UserId_AddedAt')
    CREATE INDEX IX_Favorites_UserId_AddedAt ON dbo.Favorites(UserId, AddedAt DESC);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_History_UserId_ViewedAt')
    CREATE INDEX IX_History_UserId_ViewedAt ON dbo.History(UserId, ViewedAt DESC);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_ListItems_UserId_ListName')
    CREATE INDEX IX_ListItems_UserId_ListName ON dbo.ListItems(UserId, ListName, SortOrder);
GO

-- ── Demo view ────────────────────────────────────────────────

IF OBJECT_ID(N'dbo.vw_UserSummary', N'V') IS NOT NULL
    DROP VIEW dbo.vw_UserSummary;
GO

CREATE VIEW dbo.vw_UserSummary AS
SELECT
    u.UserId,
    u.Login,
    u.Email,
    p.Name,
    p.Level,
    p.Xp,
    s.ChaptersRead,
    s.PagesRead,
    (SELECT COUNT(*) FROM dbo.Favorites f WHERE f.UserId = u.UserId) AS FavoriteCount
FROM dbo.Users u
LEFT JOIN dbo.Profiles p ON p.UserId = u.UserId
LEFT JOIN dbo.UserStats s ON s.UserId = u.UserId;
GO

PRINT N'База ViolenceManga создана успешно.';
GO
