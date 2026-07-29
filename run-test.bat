@echo off
cd /d "%~dp0"

echo Trying npm...
call npm start
if %errorlevel% equ 0 goto :end

echo npm failed, trying npm.cmd...
call npm.cmd start
if %errorlevel% equ 0 goto :end

echo npm.cmd failed, trying pnpm...
call pnpm start
if %errorlevel% equ 0 goto :end

echo.
echo Failed to start with npm, npm.cmd, and pnpm.
pause

:end