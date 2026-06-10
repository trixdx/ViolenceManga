-- Avatar URL (presets, emoji, uploaded photo as data URL)
USE ViolenceManga;
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'dbo.Profiles') AND name = N'AvatarUrl'
)
BEGIN
  ALTER TABLE dbo.Profiles ADD AvatarUrl NVARCHAR(MAX) NULL;
END
GO

PRINT N'AvatarUrl column ready.';
GO
