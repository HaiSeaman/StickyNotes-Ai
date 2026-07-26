@echo off
cd /d "%~dp0"
if not exist "node_modules\.bin\electron.cmd" (
    echo Error: Electron not found. Please run: npm install
    pause
    exit /b 1
)
echo Starting... (close this window after app appears)
node_modules\.bin\electron.cmd .
pause
