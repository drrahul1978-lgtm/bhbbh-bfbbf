@echo off
rem  EVE — double-click this file.
rem
rem  It starts her on this machine and opens her eye in your browser. Nothing is
rem  uploaded and nothing is installed; closing this window stops her.

setlocal
title EVE
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   EVE needs Node.js, which is not installed on this PC.
  echo.
  echo   Opening nodejs.org — download the LTS installer, click through it,
  echo   then double-click this file again.
  echo.
  start "" https://nodejs.org
  pause
  exit /b 1
)

echo.
echo   Starting EVE. Your browser will open in a moment.
echo   Leave this window open — closing it stops her.
echo.

node eve-proxy.js --open %*

echo.
echo   EVE has stopped.
pause
