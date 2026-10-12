@echo off
setlocal enabledelayedexpansion
title My Calendar (local test)
cd /d "%~dp0"

rem Keep this port fixed: the browser stores data per address,
rem so changing it starts with an empty calendar.
set "APP_PORT=8000"

rem --- Locate Python ----------------------------------------------------------
rem Run --version instead of "where": the Microsoft Store stub python.exe
rem is found by "where" even when Python isn't installed.
set "PY="
python --version >nul 2>nul && set "PY=python"
if not defined PY (
  py -3 --version >nul 2>nul && set "PY=py -3"
)
if not defined PY (
  echo [ERROR] Python was not found.
  echo         Install Python 3 from https://www.python.org and try again.
  pause
  exit /b 1
)

rem --- Check the port isn't already taken -------------------------------------
set "PORT_IN_USE="
for /f "tokens=5" %%A in ('netstat -ano ^| findstr /r /c:":%APP_PORT% .*LISTENING"') do set "PORT_IN_USE=%%A"

if defined PORT_IN_USE (
  echo.
  echo [ERROR] Port %APP_PORT% is already in use by process ID !PORT_IN_USE!.
  echo         The calendar may already be running - try http://localhost:%APP_PORT%/
  echo         Or stop that process first:   taskkill /PID !PORT_IN_USE! /F
  pause
  exit /b 1
)

echo.
echo ============================================================
echo   My Calendar - local test server
echo   URL:  http://localhost:%APP_PORT%/
echo   Press Ctrl+C to stop.
echo ============================================================
echo.

rem Open the browser after the server has had a moment to start.
start "" /b cmd /c "timeout /t 2 /nobreak >nul & start "" http://localhost:%APP_PORT%/"

%PY% -m http.server %APP_PORT% --bind 127.0.0.1

echo.
echo Server stopped.
pause
