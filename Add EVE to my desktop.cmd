@echo off
rem  Double-click this once to put EVE on your desktop and in the Start Menu.

setlocal
title Add EVE to my desktop
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

node tools\make-shortcut.js
pause
