@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Instala Node.js 24 desde https://nodejs.org/ y vuelve a abrir este acceso.
  pause
  exit /b 1
)
node scripts/prepare-app.mjs
if errorlevel 1 (
  echo La preparacion no termino. Revisa el mensaje anterior.
  pause
  exit /b 1
)
pause
