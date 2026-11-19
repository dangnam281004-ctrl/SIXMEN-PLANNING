# Cài / gỡ Planning tự khởi động cùng Windows (anh duyệt 10/11/2026, phương án A). Cần quyền Administrator (Cai-tu-khoi-dong.bat tự hỏi).
# Task chạy bằng tài khoản Admin, chế độ "không lưu mật khẩu" (S4U): chạy khi Windows khởi động, không cần đăng nhập, Windows không giữ mật khẩu.
# Trước khi cài: thử chạy server bằng task trên BẢN SAO dữ liệu (cổng 8095). Thử không đạt → không cài, giữ nguyên như cũ.
param([switch]$Huy)
$ErrorActionPreference = "Stop"
$BC = $PSScriptRoot; $LD = Join-Path $BC "nhat-ky-tu-chay"; New-Item -ItemType Directory -Force $LD | Out-Null
$OUT = Join-Path $LD "ket-qua-cai-dat.txt"
function O([string]$m) { $m; Add-Content -LiteralPath $OUT -Value ("{0:yyyy-MM-dd HH:mm:ss}  {1}" -f (Get-Date), $m) -Encoding UTF8 }
$NAME = "SIXMEN Planning - Tu khoi dong"; $PROBE = "SIXMEN Planning - Thu S4U"; $USER = "$env:COMPUTERNAME\Admin"
$adm = (New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $adm) { O "LỖI: cần chạy với quyền Administrator (bấm Cai-tu-khoi-dong.bat, chọn Yes)"; exit 1 }
if ($Huy) {
  if (Get-ScheduledTask -TaskName $NAME -ErrorAction SilentlyContinue) { Stop-ScheduledTask -TaskName $NAME -ErrorAction SilentlyContinue; Unregister-ScheduledTask -TaskName $NAME -Confirm:$false; O "Đã gỡ task tự khởi động. Server đang chạy giữ nguyên; lần sau mở bằng Mo-Planning.bat" }
  else { O "Không có task tự khởi động để gỡ" }
  exit 0
}
O "=== Cài tự khởi động (người chạy $env:USERNAME) ==="
if (-not (Test-Path (Join-Path $BC "tu-chay-server.ps1"))) { O "LỖI: thiếu tu-chay-server.ps1"; exit 1 }
$ps = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$pr = New-ScheduledTaskPrincipal -UserId $USER -LogonType S4U -RunLevel Limited

# 1. Thử: task S4U bật server trên bản sao dữ liệu, cổng 8095
$TD = Join-Path $LD "thu-s4u-du-lieu"; if (Test-Path $TD) { Remove-Item $TD -Recurse -Force }
Copy-Item (Join-Path $BC "du-lieu") $TD -Recurse; Remove-Item (Join-Path $TD "phien.json") -Force -ErrorAction SilentlyContinue
$a1 = New-ScheduledTaskAction -Execute $ps -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$BC\server.ps1`" -Port 8095 -DataDir `"$TD`"" -WorkingDirectory $BC
if (Get-ScheduledTask -TaskName $PROBE -ErrorAction SilentlyContinue) { Unregister-ScheduledTask -TaskName $PROBE -Confirm:$false }
Register-ScheduledTask -TaskName $PROBE -Action $a1 -Principal $pr -Settings (New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries) | Out-Null
Start-ScheduledTask -TaskName $PROBE; $ok = $false
for ($i = 0; $i -lt 60 -and -not $ok; $i++) { Start-Sleep -Milliseconds 500; try { $ok = (Invoke-WebRequest "http://localhost:8095/dang-nhap.html" -UseBasicParsing -TimeoutSec 2).StatusCode -eq 200 } catch { } }
$pp = @(Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.CommandLine -like "*-Port 8095*" })
$sess = ($pp | ForEach-Object { $_.SessionId }) -join ","
Stop-ScheduledTask -TaskName $PROBE -ErrorAction SilentlyContinue; $pp | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Unregister-ScheduledTask -TaskName $PROBE -Confirm:$false; Start-Sleep 1; Remove-Item $TD -Recurse -Force -ErrorAction SilentlyContinue
if (-not $ok) { O "THỬ KHÔNG ĐẠT: task S4U không bật được server trên bản sao → KHÔNG cài, mọi thứ giữ nguyên"; exit 2 }
O "1. Thử đạt: task S4U (không lưu mật khẩu) bật được server trên bản sao, chạy nền ở phiên $sess; đã dọn task thử + bản sao"

# 2. Task chính: khi Windows khởi động + mỗi 5 phút (bộ giám sát tự bỏ qua nếu đã chạy)
$a = New-ScheduledTaskAction -Execute $ps -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$BC\tu-chay-server.ps1`"" -WorkingDirectory $BC
$t1 = New-ScheduledTaskTrigger -AtStartup
$t2 = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 5)
$set = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
if (Get-ScheduledTask -TaskName $NAME -ErrorAction SilentlyContinue) { Unregister-ScheduledTask -TaskName $NAME -Confirm:$false; O "   (đã có task cũ cùng tên: thay bằng bản mới)" }
Register-ScheduledTask -TaskName $NAME -Description "Giữ server Planning sản xuất (localhost:8080) luôn chạy. Gỡ: Huy-tu-khoi-dong.bat" -Action $a -Trigger @($t1, $t2) -Principal $pr -Settings $set | Out-Null
$tk = Get-ScheduledTask -TaskName $NAME
O "2. Đã đăng ký task '$NAME': chạy bằng $($tk.Principal.UserId), kiểu đăng nhập $($tk.Principal.LogonType) (không lưu mật khẩu), khi Windows khởi động + mỗi 5 phút, không chạy trùng ($($tk.Settings.MultipleInstances))"

# 3. Bật ngay
Start-ScheduledTask -TaskName $NAME; Start-Sleep 8
$w = @(Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.CommandLine -like "*tu-chay-server.ps1*" -and $_.CommandLine -notlike "*-Port *" })
$up = $false; try { $up = (Invoke-WebRequest "http://localhost:8080/dang-nhap.html" -UseBasicParsing -TimeoutSec 5).StatusCode -eq 200 } catch { }
O "3. Bộ giám sát đang chạy: $($w.Count) tiến trình (phiên $(($w | ForEach-Object { $_.SessionId }) -join ',')) · trang Planning trả lời: $up · trạng thái task: $((Get-ScheduledTask -TaskName $NAME).State)"
O "XONG. Anh báo lại em để kiểm tra tiếp."
