@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
title Aprendo a Leer - Servidor central de PRUEBA

where node >nul 2>&1
if errorlevel 1 (
  echo No se encontro Node.js. Instalalo desde https://nodejs.org ^(version 22.5 o superior^).
  pause
  exit /b 1
)
if not exist node_modules (
  echo Instalando dependencias, solo la primera vez...
  call npm install --ignore-scripts
)

call npm run central:prueba
pause
