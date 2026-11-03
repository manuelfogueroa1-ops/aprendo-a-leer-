@echo off
setlocal
cd /d "%~dp0"
title Aprendo a Leer - Reiniciar cuentas docentes
if not exist "dist\win-unpacked\Aprendo a Leer.exe" (
 echo Antes debes generar el instalador con GENERAR_INSTALADOR_WINDOWS.bat
 pause
 exit /b 1
)
echo IMPORTANTE: cierra Aprendo a Leer antes de continuar.
echo Se pedira confirmacion para eliminar todas las cuentas docentes y guardar un respaldo.
pause
start "" "dist\win-unpacked\Aprendo a Leer.exe" --reiniciar-cuenta-docente
