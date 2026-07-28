@echo off
title Sticky Notes Launcher
echo ========================================
echo           Starting Sticky Notes...
echo ========================================
echo.
if exist dist便签-win32-x64便签.exe (
    echo [INFO] Starting packaged EXE application...
    start  dist便签-win32-x64便签.exe
    exit /b 0
)
echo [INFO] Starting in Node.js development mode...
call npx electron .
if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERROR] Launch failed, please check environment.
    pause
)