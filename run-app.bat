@echo off
rem Double-click to run 7Heaven CRM on Windows.
rem   run-app.bat        production-style: one server on http://localhost:5000 (web app + API)
rem   run-app.bat dev    development: API on :5000 and the web app with hot reload on http://localhost:5173
setlocal
cd /d "%~dp0"
title 7Heaven CRM

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 20 or newer is required. Install it from https://nodejs.org and run this again.
  pause
  exit /b 1
)

if not exist "backend\.env" (
  echo backend\.env is missing.
  echo Copy backend\.env.example to backend\.env, then set MONGODB_URI and JWT_SECRET.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Installing dependencies - first run only...
  call npm ci
  if errorlevel 1 (
    pause
    exit /b 1
  )
)

if /i "%~1"=="dev" (
  start "" "http://localhost:5173"
  call npm run dev
  pause
  exit /b 0
)

if not exist "frontend\dist\index.html" (
  echo Building the web app - first run only...
  call npm run build
  if errorlevel 1 (
    pause
    exit /b 1
  )
)

echo.
echo Starting 7Heaven CRM on http://localhost:5000  (press Ctrl+C to stop)
echo If you changed the code, delete frontend\dist and run this again to rebuild.
echo.
start "" "http://localhost:5000"
call npm start
pause
