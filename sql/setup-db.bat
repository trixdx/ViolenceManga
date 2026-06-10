@echo off
chcp 65001 >nul
set SERVER=WINDOWTRAGIC\SQLEXPRESS
set SCRIPT=%~dp0sql\01_create_database.sql

echo Creating ViolenceManga on %SERVER% ...
echo.

where sqlcmd >nul 2>&1
if errorlevel 1 (
    echo sqlcmd not found. Open SSMS and run:
    echo   %SCRIPT%
    echo Server: %SERVER%
    pause
    exit /b 1
)

sqlcmd -S %SERVER% -E -i "%SCRIPT%"
if errorlevel 1 (
    echo.
    echo ERROR — check that SQL Server Express is running and SSMS can connect to %SERVER%
    pause
    exit /b 1
)

echo.
echo Done. In SSMS: connect to %SERVER% ^> Databases ^> ViolenceManga
pause
