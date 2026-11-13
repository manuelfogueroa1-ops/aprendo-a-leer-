@echo off
setlocal
cd /d "%~dp0"
title Aprendo a Leer - Crear instalador Windows

echo.
echo ================================================
echo   APRENDO A LEER - GENERADOR DEL INSTALADOR
 echo ================================================
echo.
where node >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js no esta instalado en este computador de desarrollo.
    echo Instala Node.js 24 desde https://nodejs.org/ y vuelve a abrir este archivo.
    goto :error
)
where npm >nul 2>&1
if errorlevel 1 (
    echo ERROR: No se encontro npm. Comprueba la instalacion de Node.js.
    goto :error
)

echo [1/2] Instalando las herramientas de compilacion...
call npm install --no-audit --no-fund
if errorlevel 1 goto :error

echo.
echo [2/2] Generando el instalador .exe...
call npm run dist:win
if errorlevel 1 goto :error

echo.
echo OK. Instalador generado en la carpeta dist.
explorer "%CD%\dist"
echo.
pause
exit /b 0

:error
echo.
echo No se pudo generar el instalador. Lee el error que aparece arriba.
echo No se han borrado tus archivos ni los datos guardados de la aplicacion.
echo.
pause
exit /b 1
