@echo off
cd /d "%~dp0"
title StickyNotes-AI Launcher

echo Starting StickyNotes-AI...
echo Directory: %CD%
echo.

if exist node_modules\.bin\electron.cmd (
    call node_modules\.bin\electron.cmd .
    goto end
)

call npm.cmd start
if errorlevel 1 (
    echo.
    echo Primary launch failed, trying npx.cmd electron...
    call npx.cmd electron .
)

:end
if errorlevel 1 (
    echo.
    echo Failed to launch software. Please ensure Node.js and Electron dependencies are installed.
    pause
)
