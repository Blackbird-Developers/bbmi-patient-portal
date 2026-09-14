@echo off
REM Double-click this file to run the Beyond BMI patient portal prototype.
REM Uses npm.cmd, not npm.ps1, so PowerShell's execution policy cannot block it.
title Beyond BMI patient portal
cd /d "%~dp0"

if not exist "node_modules" (
  echo Installing dependencies, one moment...
  call npm.cmd install --no-audit --no-fund
)

echo.
echo   Beyond BMI patient portal
echo   Open  http://localhost:3050
echo   Stop  Ctrl+C, then close this window
echo.

start "" "http://localhost:3050"
call npm.cmd run dev -- --port 3050
pause
