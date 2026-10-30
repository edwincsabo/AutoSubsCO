@echo off
setlocal
cd /d "%~dp0"
set "ELECTRON_RUN_AS_NODE="
set "AUTOSUBSCO_DATA=%~dp0"
set "AUTOSUBSCO_WORKSPACE=%~dp0workspace-desarrollo"
if exist "release\AutoSubsCO-0.12.0-Windows\AutoSubsCO.exe" (
  start "" "%~dp0release\AutoSubsCO-0.12.0-Windows\AutoSubsCO.exe"
  exit /b 0
)
call "%~dp0Probar AutoSubsCO.cmd"
exit /b 0
