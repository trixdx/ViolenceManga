@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ==============================
echo   Violence (без npm)
echo ==============================
echo.

where python >nul 2>&1
if not errorlevel 1 (
    echo Запуск через Python...
    echo Откройте: http://localhost:8080
    echo.
    start http://localhost:8080
    python -m http.server 8080
    pause
    exit /b 0
)

where py >nul 2>&1
if not errorlevel 1 (
    echo Запуск через Python...
    echo Откройте: http://localhost:8080
    echo.
    start http://localhost:8080
    py -m http.server 8080
    pause
    exit /b 0
)

echo [ОШИБКА] Python не найден.
echo Установите Python с https://python.org
echo Или запустите start.bat если есть Node.js
pause
