
@echo off
setlocal EnableExtensions
title Shondhan Server Launcher

REM Project directories
set "ROOT_DIR=%~dp0"
set "BACKEND_DIR=%ROOT_DIR%backend"
set "FRONTEND_DIR=%ROOT_DIR%frontend"
set "PYTHON_EXE=%BACKEND_DIR%\venv\Scripts\python.exe"

echo.
echo ========================================
echo       SHONDHAN SERVER LAUNCHER
echo ========================================

REM Check dependencies
if not exist "%BACKEND_DIR%\manage.py" (
    echo ERROR: Django manage.py not found.
    goto :fail
)

if not exist "%PYTHON_EXE%" (
    echo ERROR: Python virtual environment missing.
    echo Run install.bat first.
    goto :fail
)

if not exist "%BACKEND_DIR%\.env" (
    echo ERROR: backend\.env not found.
    goto :fail
)

if not exist "%FRONTEND_DIR%\node_modules" (
    echo ERROR: Frontend dependencies missing.
    echo Run install.bat first.
    goto :fail
)

where node >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js not found in PATH.
    goto :fail
)

where npm >nul 2>&1
if errorlevel 1 (
    echo ERROR: npm not found in PATH.
    goto :fail
)

REM Start PostgreSQL service
echo.
echo [1/3] Starting PostgreSQL...

powershell -NoProfile -Command ^
"$s = Get-Service -Name 'postgresql*' -ErrorAction SilentlyContinue | Select-Object -First 1; if (!$s) { Write-Host 'PostgreSQL service not found.'; exit 1 }; if ($s.Status -ne 'Running') { Start-Service $s.Name -ErrorAction Stop }; Write-Host 'PostgreSQL is running.'"

if errorlevel 1 (
    echo WARNING: Could not start PostgreSQL.
    echo Try running this script as Administrator.
    pause
    goto :eof
)

REM Apply migrations
echo.
echo [2/3] Applying Django migrations...

pushd "%BACKEND_DIR%"
"%PYTHON_EXE%" manage.py migrate

if errorlevel 1 (
    popd
    echo ERROR: Django migrations failed.
    goto :fail
)
popd

REM Launch Django backend
echo.
echo [3/3] Starting Django backend...

start "Shondhan Backend" cmd /k "cd /d ""%BACKEND_DIR%"" && call venv\Scripts\activate.bat && python manage.py runserver 127.0.0.1:8000"

REM Small delay
timeout /t 2 /nobreak >nul

REM Launch React frontend
echo Starting React frontend...

start "Shondhan Frontend" cmd /k "cd /d ""%FRONTEND_DIR%"" && npm run dev -- --host 127.0.0.1"

echo.
echo ========================================
echo       SHONDHAN IS STARTING
echo ========================================
echo.
echo Frontend: http://localhost:5173
echo Backend:  http://localhost:8000
echo Admin:    http://localhost:8000/admin/
echo.
echo Backend and frontend have separate terminals.
echo Close their terminals or press CTRL+C to stop.
echo ========================================

pause
exit /b 0

:fail
echo.
echo Shondhan could not start.
pause
exit /b 1
