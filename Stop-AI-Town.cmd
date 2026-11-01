@echo off
cd /d "%~dp0"
node "%~dp0scripts\windows.mjs" --stop
if errorlevel 1 pause
