@echo off
cd /d "%~dp0"
title StickyNotes-AI

:menu
cls
echo ===================================================
echo           StickyNotes-AI Test Console
echo ===================================================
echo.
echo  [1] Start Application (npm start / electron .)
echo  [2] Run Syntax Check (node --check)
echo  [3] Install Dependencies (npm install)
echo  [4] Exit
echo.
echo ===================================================
set choice=1
set /p choice=Select option [1-4] (Default is 1, press Enter directly): 

if "%choice%"=="1" goto opt1
if "%choice%"=="2" goto opt2
if "%choice%"=="3" goto opt3
if "%choice%"=="4" goto opt4
goto menu

:opt1
cls
echo Starting StickyNotes-AI...
echo Work Directory: %CD%
echo.

if exist node_modules\.bin\electron.cmd (
    echo Launching via local Electron binary...
    call node_modules\.bin\electron.cmd .
    goto done
)

echo Launching via npm.cmd start...
call npm.cmd start
if errorlevel 1 (
    echo.
    echo npm start failed, fallback to npx.cmd electron...
    call npx.cmd electron .
)

:done
echo.
echo Application process finished.
pause
goto menu

:opt2
cls
echo Checking JavaScript syntax...
echo.
call node --check main.js
call node --check preload.js
call node --check renderer.js
call node --check json-io.js
call node --check security.js
call node --check paths.js
call node --check logger.js
call node --check music-tab.js
call node --check radio-tab.js
call node --check main/protocol.js
call node --check main/popoutTemplate.js
echo.
echo Check finished! If no errors above, syntax is 100%% correct.
pause
goto menu

:opt3
cls
echo Installing dependencies...
echo.
call npm.cmd install
echo.
echo Dependencies processed.
pause
goto menu

:opt4
exit
