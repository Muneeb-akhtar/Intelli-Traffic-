@echo off
title Intelli Traffic - Starting All Services
color 0A
echo.
echo  ================================================
echo    INTELLI TRAFFIC - Starting All Services
echo  ================================================
echo.

:: ── Kill anything that might be using our ports ──────────────────────────
for %%p in (3000 5000 8081) do (
    for /f "tokens=5" %%i in ('netstat -aon ^| findstr :%%p ^| findstr LISTENING 2^>nul') do (
        taskkill /F /PID %%i >nul 2>&1
    )
)

echo  [1/4] Starting Express Backend  (port 5000)...
start "Backend - Express" cmd /k "cd /d "%~dp0backend" && node server.js"

echo  [2/4] Starting AI Vehicle Counter (port 8081)...
start "AI Counter - YOLO" cmd /k "cd /d "%~dp0" && .venv\Scripts\python.exe ai_module\vehicle_counter.py"

echo  [3/4] Waiting for backend services to initialise...
timeout /t 6 /nobreak >nul

echo  [4/4] Starting React Frontend   (port 3000)...
start "Frontend - React" cmd /k "cd /d "%~dp0frontend" && npm run dev"

echo.
echo  Waiting for frontend dev server...
timeout /t 10 /nobreak >nul

echo.
echo  Opening browser...
start "" "http://localhost:3000"

echo.
echo  ================================================
echo    All services are running!
echo.
echo    Website  : http://localhost:3000
echo    API      : http://localhost:5000
echo    AI Stream: http://localhost:8081/video
echo  ================================================
echo.
echo  Close this window only after stopping all other
echo  service windows first.
pause
