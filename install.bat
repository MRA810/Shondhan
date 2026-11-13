@echo off
setlocal EnableExtensions
title Shondhan Dependency Installer

REM Shondhan installer for Windows 10/11.
REM Keep this file in the Shondhan project root beside backend\ and frontend\.

set "ROOT_DIR=%~dp0"
set "BACKEND_DIR=%ROOT_DIR%backend"
set "FRONTEND_DIR=%ROOT_DIR%frontend"

echo.
echo ==========================================
echo       SHONDHAN WINDOWS INSTALLER
echo ==========================================
echo.

if not exist "%BACKEND_DIR%\requirements.txt" (
    echo [ERROR] backend\requirements.txt was not found.
    echo Place install.bat in the Shondhan project root.
    goto :fail
)
if not exist "%FRONTEND_DIR%\package.json" (
    echo [ERROR] frontend\package.json was not found.
    echo Place install.bat in the Shondhan project root.
    goto :fail
)

where winget >nul 2>&1
if errorlevel 1 (
    echo [ERROR] winget is unavailable.
    echo Install or update "App Installer" from the Microsoft Store,
    echo then reopen Command Prompt and run this file again.
    goto :fail
)

echo [1/7] Installing/checking Python 3.12...
py -3.12 --version >nul 2>&1
if errorlevel 1 (
    winget install --id Python.Python.3.12 --exact --accept-package-agreements --accept-source-agreements
    if errorlevel 1 (
        echo [ERROR] Python installation failed.
        goto :fail
    )
)

echo [2/7] Installing/checking Node.js LTS...
where node >nul 2>&1
if errorlevel 1 (
    winget install --id OpenJS.NodeJS.LTS --exact --accept-package-agreements --accept-source-agreements
    if errorlevel 1 (
        echo [ERROR] Node.js installation failed.
        goto :fail
    )
)

echo [3/7] Installing/checking PostgreSQL 16...
where psql >nul 2>&1
if errorlevel 1 (
    winget install --id PostgreSQL.PostgreSQL.16 --exact --accept-package-agreements --accept-source-agreements
    if errorlevel 1 (
        echo [WARNING] PostgreSQL installation may have failed or requires manual setup.
        echo Continue only after PostgreSQL 16 is installed.
    )
)

echo [4/7] Installing/checking Git...
where git >nul 2>&1
if errorlevel 1 (
    winget install --id Git.Git --exact --accept-package-agreements --accept-source-agreements
    if errorlevel 1 (
        echo [WARNING] Git installation may have failed or requires a new terminal.
    )
)

echo.
echo [5/7] Creating Python virtual environment...
if not exist "%BACKEND_DIR%\venv\Scripts\python.exe" (
    py -3.12 -m venv "%BACKEND_DIR%\venv"
    if errorlevel 1 (
        echo [ERROR] Could not create the Python virtual environment.
        echo Restart your terminal if Python was just installed, then rerun.
        goto :fail
    )
)

echo [6/7] Installing Python dependencies...
"%BACKEND_DIR%\venv\Scripts\python.exe" -m pip install --upgrade pip
if errorlevel 1 goto :pipfail

"%BACKEND_DIR%\venv\Scripts\python.exe" -m pip install -r "%BACKEND_DIR%\requirements.txt"
if errorlevel 1 goto :pipfail

echo [7/7] Installing frontend dependencies...
pushd "%FRONTEND_DIR%"
call npm install
if errorlevel 1 (
    popd
    echo [ERROR] npm install failed.
    echo Check that Node.js and npm are installed, then rerun this installer.
    goto :fail
)
popd

if not exist "%BACKEND_DIR%\.env" (
    if exist "%BACKEND_DIR%\.env.example" (
        copy "%BACKEND_DIR%\.env.example" "%BACKEND_DIR%\.env" >nul
        echo [INFO] Created backend\.env from .env.example.
        echo        Review its database settings before starting Shondhan.
    ) else (
        echo [WARNING] No backend\.env or backend\.env.example was found.
        echo           Create backend\.env before starting Django.
    )
) else (
    echo [INFO] backend\.env already exists; leaving it unchanged.
)

echo.
echo ==========================================
echo       INSTALLATION STEPS COMPLETED
echo ==========================================
echo.
echo Detected versions:
py -3.12 --version
node --version
call npm --version
echo.
echo NEXT STEPS:
echo 1. Restart Command Prompt if Python, Node, or PostgreSQL was just installed.
echo 2. Review backend\.env and configure your database credentials.
echo 3. Create the PostgreSQL database and user matching backend\.env.
echo 4. Run your Windows server startup script.
echo.
echo NOTE:
echo PostgreSQL's installer may ask you to set the postgres administrator
echo password. Keep that password safe.
echo.
pause
exit /b 0

:pipfail
echo [ERROR] Python dependency installation failed.
goto :fail

:fail
echo.
echo Installation did not complete successfully.
pause
exit /b 1
