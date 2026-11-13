@echo off
setlocal
cd /d "%~dp0"
chcp 65001 >nul
where node >nul 2>&1
if errorlevel 1 (
    echo Instala Node.js 24 en el computador central del colegio.
    pause
    exit /b 1
)
if not exist "node_modules\express\package.json" (
    echo Ejecuta npm ci una vez para preparar el proyecto en este computador.
    pause
    exit /b 1
)
node servidor-central\iniciar-colegio.js "%~1"
set "resultado=%errorlevel%"
pause
exit /b %resultado%
