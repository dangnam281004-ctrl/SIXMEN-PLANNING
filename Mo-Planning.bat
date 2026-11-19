@echo off
rem Bam dup file nay de mo Planning san xuat (http://localhost:8080)
rem 10/11/2026: cho server san sang (toi da 30 giay) roi moi mo trinh duyet, tranh loi ket noi ngay sau khi khoi dong may
cd /d "%~dp0"
powershell -NoProfile -Command "try { Invoke-WebRequest http://localhost:8080/dang-nhap.html -UseBasicParsing -TimeoutSec 2 | Out-Null; exit 0 } catch { exit 1 }"
if errorlevel 1 (
  start "" powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0server.ps1"
  powershell -NoProfile -Command "$end=(Get-Date).AddSeconds(30); while((Get-Date) -lt $end){ try { Invoke-WebRequest http://localhost:8080/dang-nhap.html -UseBasicParsing -TimeoutSec 2 | Out-Null; exit 0 } catch { Start-Sleep -Milliseconds 500 } }; exit 1"
  if errorlevel 1 (
    echo Server chua chay duoc sau 30 giay. Bam lai file nay hoac bao Admin.
    pause
    exit /b 1
  )
)
start "" http://localhost:8080/
