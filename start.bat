@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ==============================
echo   Violence Manga Reader + API
echo ==============================
echo.

where npm.cmd >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js not found
    pause
    exit /b 1
)

for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5173" ^| findstr "LISTENING"') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3001" ^| findstr "LISTENING"') do taskkill /F /PID %%a >nul 2>&1

if not exist "node_modules\" (
    echo Installing frontend deps...
    call npm.cmd install
)

if not exist "server\node_modules\" (
    echo Installing API deps...
    call npm.cmd install --prefix server
)

echo Starting API on http://localhost:3001 ...
start "Violence API" cmd /k "cd /d %~dp0server && npm.cmd run dev"

timeout /t 2 /nobreak >nul

echo Starting frontend on https://localhost:5173 ...
call npm.cmd run dev
pause
