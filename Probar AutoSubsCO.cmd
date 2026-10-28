@echo off
setlocal
cd /d "%~dp0"
set "ELECTRON_RUN_AS_NODE="
set "AUTOSUBSCO_DATA=%~dp0"
set "AUTOSUBSCO_WORKSPACE=%~dp0workspace-desarrollo"
if not exist "node_modules\electron\dist\electron.exe" (
  echo Falta el entorno de desarrollo de Electron.
  echo Consulta PRUEBA_LOCAL.md para preparar la prueba.
  pause
  exit /b 1
)
start "" "node_modules\electron\dist\electron.exe" .
exit /b 0
