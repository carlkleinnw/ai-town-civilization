@echo off
chcp 65001 >nul
cd /d "%~dp0"
:retry
node "%~dp0scripts\windows.mjs" --open
if not errorlevel 1 exit /b 0
echo 启动未完成，请先查看上方原因。详细记录在 .runtime\startup.json。
choice /C RQ /N /M "按 R 重试，按 Q 退出："
if errorlevel 2 exit /b 1
goto retry
