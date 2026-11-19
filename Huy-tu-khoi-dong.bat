@echo off
rem Go Planning tu khoi dong (xoa task). Server dang chay giu nguyen. Bam dup, chon Yes khi Windows hoi quyen.
cd /d "%~dp0"
net session >nul 2>&1
if errorlevel 1 (
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0cai-tu-khoi-dong.ps1" -Huy
echo.
pause
