# Giữ server Planning luôn chạy (anh duyệt 10/11/2026, phương án A). Task Scheduler gọi khi Windows khởi động và mỗi 5 phút.
# - Chỉ 1 bộ giám sát (khoá Global), không bật server thứ 2 khi đã có server đang chạy.
# - Server tắt → bật lại; server còn tiến trình nhưng không phản hồi ~2 phút → dừng rồi bật lại.
# - Bật lại quá 5 lần trong 10 phút → chờ 5 phút (tránh vòng lặp hỏng liên tục), ghi nhật ký.
# - Có file tam-dung-tu-chay.flag cạnh server.ps1 → không bật server (dùng khi triển khai bản mới).
# Không đụng dữ liệu, không đổi nghiệp vụ. Nhật ký: nhat-ky-tu-chay\tu-chay.log
param([int]$Port = 8080, [string]$DataDir = "", [int]$Every = 30)
$BC = $PSScriptRoot
$LD = Join-Path $BC "nhat-ky-tu-chay"; New-Item -ItemType Directory -Force $LD | Out-Null
$LF = Join-Path $LD ("tu-chay" + $(if ($Port -ne 8080) { "-$Port" } else { "" }) + ".log")
function L([string]$m) { try { if ((Test-Path $LF) -and (Get-Item $LF).Length -gt 1MB) { Move-Item $LF "$LF.cu" -Force }; Add-Content -LiteralPath $LF -Value ("{0:yyyy-MM-dd HH:mm:ss}  {1}" -f (Get-Date), $m) -Encoding UTF8 } catch { } }
$wm = New-Object System.Threading.Mutex($false, "Global\SixmenPlanningWatch-$Port"); $got = $false
try { $got = $wm.WaitOne(0) } catch [System.Threading.AbandonedMutexException] { $got = $true }
if (-not $got) { exit 0 }   # đã có bộ giám sát khác đang chạy
function Up() { try { $r = Invoke-WebRequest "http://localhost:$Port/dang-nhap.html" -UseBasicParsing -TimeoutSec 10; return $r.StatusCode -eq 200 } catch { return $false } }
$me = Join-Path $BC "server.ps1"
function Srv() { @(Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.CommandLine -and $_.CommandLine.Contains($me) -and $(if ($Port -eq 8080) { $_.CommandLine -notlike "*-Port *" } else { $_.CommandLine -like "*-Port $Port*" }) }) }
$starts = New-Object System.Collections.ArrayList
function StartSrv() {
  $now = Get-Date; foreach ($t in @($starts)) { if (($now - $t).TotalMinutes -gt 10) { $starts.Remove($t) } }
  if ($starts.Count -ge 5) { L "Đã bật lại 5 lần trong 10 phút mà server vẫn lỗi: chờ 5 phút rồi thử lại"; Start-Sleep 300; $starts.Clear() }
  $a = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-File", "`"$me`""); if ($Port -ne 8080) { $a += @("-Port", "$Port") }; if ($DataDir) { $a += @("-DataDir", "`"$DataDir`"") }
  $p = Start-Process powershell -ArgumentList $a -WorkingDirectory $BC -WindowStyle Hidden -PassThru; $null = $starts.Add((Get-Date))
  for ($i = 0; $i -lt 40; $i++) { Start-Sleep -Milliseconds 500; if (Up) { L "Đã bật server (pid $($p.Id)), trang trả lời bình thường"; return } }
  L "Đã bật server (pid $($p.Id)) nhưng sau 20 giây chưa trả lời"
}
$boot = try { (Get-CimInstance Win32_OperatingSystem).LastBootUpTime } catch { "?" }
L "Bộ giám sát bắt đầu (pid $PID, người chạy $env:USERNAME, máy khởi động lúc $boot)"
$miss = 0; $paused = $false
while ($true) {
  try {
    $flag = Test-Path (Join-Path $BC "tam-dung-tu-chay.flag")
    if ($flag -ne $paused) { $paused = $flag; L $(if ($flag) { "Tạm dừng tự bật (đang triển khai)" } else { "Hết tạm dừng" }) }
    if (-not $flag) {
      if (Up) { $miss = 0 }
      else {
        $p = @(Srv)
        if ($p.Count -eq 0) { L "Server không chạy → bật lại"; $miss = 0; StartSrv }
        else { $miss++; if ($miss -ge 4) { L "Server (pid $(($p | ForEach-Object { $_.ProcessId }) -join ',')) không trả lời $miss lần liên tiếp → dừng và bật lại"; $p | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }; Start-Sleep 3; $miss = 0; StartSrv } }
      }
    }
  } catch { L "Lỗi bộ giám sát: $($_.Exception.Message)" }
  Start-Sleep $Every
}
