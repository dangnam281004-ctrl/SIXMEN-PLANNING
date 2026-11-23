# Server nhỏ để mở các trang Planning ở http://localhost:8080
# Dữ liệu chính nằm trong thư mục du-lieu\ (mỗi phần 1 file, có số phiên bản) + du-lieu\lich-su\ (bản lưu cũ).
# Lưu kèm X-Base-Rev: nếu thư mục đã có bản mới hơn thì từ chối (409) để tab cũ không ghi đè dữ liệu mới.
# Lịch sử: tên file có số phiên bản (không bao giờ ghi đè); giữ đủ 2 ngày, 30 ngày mỗi giờ 1 bản, sau đó mỗi ngày 1 bản.
# Bản nháp xung đột (thay đổi bị từ chối vì nơi khác vừa lưu) cất riêng *-xungdot.json, giữ 90 ngày.
# Tài khoản: du-lieu\tai-khoan.json (mật khẩu băm PBKDF2-SHA256, không lưu dạng chữ), phiên đăng nhập bằng cookie "sid".
# Mọi API dữ liệu cần đăng nhập; danh mục mã và thông tin xưởng chỉ Admin được sửa. Mỗi lần lưu ghi kèm người lưu ("by").
param([int]$Port = 8080, [string]$DataDir = "", [switch]$Secure)   # V5.2: -Secure khi chạy sau HTTPS (web) → cookie đăng nhập chỉ gửi qua HTTPS
$Root = $PSScriptRoot
if (-not $DataDir) { $DataDir = Join-Path $Root "du-lieu" }
$HistDir = Join-Path $DataDir "lich-su"
New-Item -ItemType Directory -Force $HistDir | Out-Null
$Keys = @("checkhero-v3", "kehoach-sx-v3", "nvl-v3", "xuong-v3", "danhmuc-v1")
$AdminKeys = @("danhmuc-v1", "xuong-v3")
$utf8 = New-Object System.Text.UTF8Encoding($false)
$types = @{ ".html"="text/html; charset=utf-8"; ".js"="text/javascript; charset=utf-8"; ".css"="text/css; charset=utf-8"; ".png"="image/png"; ".jpg"="image/jpeg"; ".jpeg"="image/jpeg"; ".svg"="image/svg+xml"; ".ico"="image/x-icon"; ".webp"="image/webp"; ".woff"="font/woff"; ".woff2"="font/woff2" }
$lastPrune = @{}
Add-Type -AssemblyName System.Web.Extensions
$JS = New-Object System.Web.Script.Serialization.JavaScriptSerializer
$JS.MaxJsonLength = [int]::MaxValue
$UsersFile = Join-Path $DataDir "tai-khoan.json"
$SessFile = Join-Path $DataDir "phien.json"
$SessDays = 7
# Mã khởi tạo dữ liệu: mỗi lần làm sạch (thư mục du-lieu mới) có mã mới → trình duyệt bỏ bản dữ liệu cũ nó còn giữ, không gửi ngược lên
$EpochFile = Join-Path $DataDir "khoi-tao.json"
if (-not (Test-Path $EpochFile)) { [System.IO.File]::WriteAllText($EpochFile, '{"id":"' + [guid]::NewGuid().ToString("N").Substring(0, 12) + '","at":' + [DateTimeOffset]::Now.ToUnixTimeMilliseconds() + '}', (New-Object System.Text.UTF8Encoding($false))) }
$Epoch = [regex]::Match([System.IO.File]::ReadAllText($EpochFile), '"id":"([^"]+)"').Groups[1].Value
$Fails = @{}

function Send($res, [int]$code, [string]$text, [string]$type = "application/json; charset=utf-8") {
  $bytes = $utf8.GetBytes($text)
  $res.StatusCode = $code
  $res.ContentType = $type
  $res.Headers.Add("Cache-Control", "no-store")
  $res.ContentLength64 = $bytes.Length
  $res.OutputStream.Write($bytes, 0, $bytes.Length)
}
function NowMs() { return [int64][DateTimeOffset]::Now.ToUnixTimeMilliseconds() }
function WriteFileSafe([string]$file, [string]$text) { [System.IO.File]::WriteAllText("$file.tmp", $text, $utf8); Move-Item "$file.tmp" $file -Force }
function CurrentRev($file) {
  if (-not (Test-Path $file)) { return 0 }
  $head = [System.IO.File]::ReadAllText($file, $utf8)
  if ($head -match '^\{"rev":(\d+)') { return [int64]$Matches[1] }
  return 0
}
function ReadText($req) { $reader = New-Object System.IO.StreamReader($req.InputStream, $utf8); $t = $reader.ReadToEnd(); $reader.Close(); return $t }
function ReadBody($req) {
  $body = ReadText $req
  $null = $JS.DeserializeObject($body)   # chỉ nhận JSON hợp lệ. Không dùng ConvertFrom-Json: nó coi khoá "c" và "C" là trùng (VD lần chuyển size từ Phân tích nhu cầu có c = màu, C = đã đặt) → lỗi 500
  return $body
}
function ReadObj($req) { $t = ReadText $req; if (-not $t) { return @{} }; return $JS.DeserializeObject($t) }
function Stamp() { return (Get-Date -Format "yyyyMMdd-HHmmss") }
function TimeOf($name) {
  if ($name -match '-(\d{8})-(\d{6})') { return [datetime]::ParseExact($Matches[1] + $Matches[2], 'yyyyMMddHHmmss', $null) }
  return $null
}
# Chính sách giữ lịch sử của 1 phần: trong 48 giờ giữ hết; 48 giờ - 30 ngày giữ bản cuối mỗi giờ; sau 30 ngày giữ bản cuối mỗi ngày.
# Không đụng bản nháp xung đột (giữ 90 ngày). Bản mới nhất luôn nằm trong 48 giờ nên không bao giờ bị xoá.
function Prune([string]$key, [datetime]$now) {
  $all = Get-ChildItem $HistDir -Filter "$key-*.json" | Where-Object { $_.Name -match ('^' + [regex]::Escape($key) + '-\d{8}-\d{6}') }
  $hourSeen = @{}; $daySeen = @{}; $removed = 0
  $snaps = $all | Where-Object { $_.Name -notmatch 'xungdot' } | ForEach-Object { [pscustomobject]@{ F = $_; T = (TimeOf $_.Name) } } | Where-Object { $_.T } | Sort-Object T -Descending
  foreach ($x in $snaps) {
    $age = $now - $x.T
    if ($age.TotalHours -le 48) { continue }
    if ($age.TotalDays -le 30) { $b = $x.T.ToString('yyyyMMddHH'); if ($hourSeen[$b]) { Remove-Item $x.F.FullName -Force; $removed++ } else { $hourSeen[$b] = 1 }; continue }
    $b = $x.T.ToString('yyyyMMdd'); if ($daySeen[$b]) { Remove-Item $x.F.FullName -Force; $removed++ } else { $daySeen[$b] = 1 }
  }
  $all | Where-Object { $_.Name -match 'xungdot' } | ForEach-Object { $t = TimeOf $_.Name; if ($t -and ($now - $t).TotalDays -gt 90) { Remove-Item $_.FullName -Force; $removed++ } }
  return $removed
}
# Lưu 1 phần dữ liệu (đã kiểm tra quyền + phiên bản ở nơi gọi): ghi file chính + 1 bản lịch sử
function SaveKey([string]$key, [string]$body, [int64]$rev, [string]$pg, [string]$by) {
  $file = Join-Path $DataDir "$key.json"
  $stamp = NowMs
  $wrapped = '{"rev":' + $rev + ',"savedAt":' + $stamp + ',"page":"' + $pg + '","by":"' + $by + '","value":' + $body + '}'
  WriteFileSafe $file $wrapped
  Copy-Item $file (Join-Path $HistDir ("$key-" + (Stamp) + "-r$rev.json"))   # tên có số phiên bản → 2 lần lưu cùng giây vẫn là 2 file
  if (-not $lastPrune[$key] -or ((Get-Date) - $lastPrune[$key]).TotalMinutes -ge 10) { $lastPrune[$key] = Get-Date; $null = Prune $key (Get-Date) }
  return $stamp
}

# ===== Tài khoản và phiên đăng nhập =====
function LoadUsers() {
  # dấu phẩy: trả về nguyên danh sách (PowerShell không tự tách thành từng phần tử / $null khi rỗng)
  if (Test-Path $UsersFile) { $u = $JS.DeserializeObject([System.IO.File]::ReadAllText($UsersFile, $utf8)); return ,([System.Collections.ArrayList]@($u["users"])) }
  return ,([System.Collections.ArrayList]::new())
}
function SaveUsers($list) { WriteFileSafe $UsersFile ($JS.Serialize(@{ users = @($list) })) }
function NewSalt() { $b = New-Object byte[] 16; [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); return [Convert]::ToBase64String($b) }
function NewToken() { $b = New-Object byte[] 32; [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); return ([BitConverter]::ToString($b) -replace '-', '').ToLower() }
function HashPw([string]$pw, [string]$salt) {
  $k = New-Object System.Security.Cryptography.Rfc2898DeriveBytes($pw, [Convert]::FromBase64String($salt), 60000, [System.Security.Cryptography.HashAlgorithmName]::SHA256)
  return [Convert]::ToBase64String($k.GetBytes(32))
}
function SameHash([string]$a, [string]$b) { if ($a.Length -ne $b.Length) { return $false }; $d = 0; for ($i = 0; $i -lt $a.Length; $i++) { $d = $d -bor ([int][char]$a[$i] -bxor [int][char]$b[$i]) }; return $d -eq 0 }
function PublicUser($u) { return @{ id = [string]$u["id"]; username = [string]$u["username"]; name = [string]$u["name"]; role = [string]$u["role"]; active = [bool]$u["active"]; techpack = [bool]$u["techpack"] } }
function PublicUsers($list) { $a = [System.Collections.ArrayList]::new(); foreach ($x in $list) { $null = $a.Add((PublicUser $x)) }; return ,$a }
$Sessions = @{}
if (Test-Path $SessFile) { try { $s = $JS.DeserializeObject([System.IO.File]::ReadAllText($SessFile, $utf8)); foreach ($k in $s.Keys) { $Sessions[$k] = @{ u = $s[$k]["u"]; exp = [int64]$s[$k]["exp"] } } } catch {} }
function SaveSessions() { $now = NowMs; foreach ($k in @($Sessions.Keys)) { if ($Sessions[$k].exp -lt $now) { $Sessions.Remove($k) } }; WriteFileSafe $SessFile ($JS.Serialize($Sessions)) }
function StartSession($res, $u) {
  $tok = NewToken
  $Sessions[$tok] = @{ u = [string]$u["id"]; exp = [int64]((NowMs) + $SessDays * 86400000) }
  SaveSessions
  $res.Headers.Add("Set-Cookie", "sid=$tok; Path=/; HttpOnly; SameSite=Lax" + $(if ($Secure) { "; Secure" } else { "" }) + "; Max-Age=" + ($SessDays * 86400))
}
function CurrentUser($req) {
  $c = $req.Cookies["sid"]; if (-not $c) { return $null }
  $s = $Sessions[$c.Value]; if (-not $s) { return $null }
  $now = NowMs
  if ($s.exp -lt $now) { $Sessions.Remove($c.Value); return $null }
  $u = (LoadUsers) | Where-Object { $_["id"] -eq $s.u -and $_["active"] } | Select-Object -First 1
  if (-not $u) { return $null }
  if ($s.exp - $now -lt 3 * 86400000) { $s.exp = $now + $SessDays * 86400000; SaveSessions }   # còn dùng thì tự gia hạn
  return $u
}
function MeJson($u, $list) { return $JS.Serialize(@{ me = (PublicUser $u); users = (PublicUsers $list); epoch = $Epoch }) }
# Danh mục mã ban đầu: đúng 6 mã Hero đang dùng, người phụ trách = Admin đầu tiên
function CreateCatalog([string]$uid) {
  $file = Join-Path $DataDir "danhmuc-v1.json"
  if (Test-Path $file) { return }
  $today = [string](Get-Date -Format "yyyy-MM-dd"); $now = [int64](NowMs); $uid = [string]$uid
  $models = [System.Collections.ArrayList]::new()
  foreach ($r in @(@("mado","SXPL001","Polo Mã Đáo",1,0), @("basor","","Polo Basor",1,0), @("victory","","Polo Victory",1,0), @("marin","","Polo Marin",0,0), @("galio","SXPL012","Polo Galio",0,0), @("tron","","Polo Trơn",0,1))) {
    $null = $models.Add(@{ key = [string]$r[0]; code = [string]$r[1]; name = [string]$r[2]; group = "hero"; theu = [bool]$r[3]; phoi = [bool]$r[4]; owner = $uid; ownerSince = $today; status = "active" })
  }
  $log = [System.Collections.ArrayList]::new()
  $null = $log.Add(@{ at = $now; by = $uid; action = "khoi-tao"; note = "Khởi tạo danh mục từ 6 mã Hero, Admin phụ trách" })
  $cat = @{ models = $models; log = $log }
  $null = SaveKey "danhmuc-v1" ($JS.Serialize($cat)) 1 "khoi-tao" $uid
}

# ===== Quyền theo mã, tự gộp khi khác mã, nhật ký trước → sau =====
$LogDir = Join-Path $DataDir "nhat-ky"
New-Item -ItemType Directory -Force $LogDir | Out-Null
function J($o) { return $JS.Serialize($o) }
function Uniq($arr) { $h = [ordered]@{}; foreach ($x in $arr) { if ($null -ne $x) { $h[[string]$x] = 1 } }; return ,([string[]]@($h.Keys)) }   # lọc trùng, giữ chuỗi thuần (không bọc PSObject)
function Val([string]$text) { return $JS.DeserializeObject([regex]::Match($text, '"value":([\s\S]*)\}\s*$').Groups[1].Value) }
# Phần nào được chia theo mã (key con = mã sản phẩm)
$SplitBy = @{ "kehoach-sx-v3" = @("models", "catalog", "gapNames"); "checkhero-v3" = @("heroes") }
# Phần dùng chung nhân viên được sửa (ngoài các mã mình phụ trách)
$StaffFree = @{ "kehoach-sx-v3" = @("date", "active", "seq"); "checkhero-v3" = @("active") }
function Sections([string]$key, $v) {
  $h = [ordered]@{}
  if ($v -isnot [System.Collections.IDictionary]) { return $h }
  $split = $SplitBy[$key]
  foreach ($k in @($v.Keys)) {
    if ($split -and $split -contains $k -and $v[$k] -is [System.Collections.IDictionary]) { foreach ($m in @($v[$k].Keys)) { $h["$k.$m"] = $v[$k][$m] } }
    else { $h[$k] = $v[$k] }
  }
  return $h
}
function ChangedSections($a, $b) {
  $out = @(); $names = (Uniq (@($a.Keys) + @($b.Keys)))
  foreach ($n in $names) { if ((J $a[$n]) -ne (J $b[$n])) { $out += $n } }
  return ,$out
}
function OwnerMap() {
  $f = Join-Path $DataDir "danhmuc-v1.json"; $m = @{}
  if (Test-Path $f) { $c = Val ([System.IO.File]::ReadAllText($f, $utf8)); foreach ($x in @($c["models"])) { $m[[string]$x["key"]] = [string]$x["owner"] } }
  return $m
}
# Nhân viên chỉ được đổi phần của mã mình phụ trách + vài mục dùng chung; trả về danh sách phần bị cấm
function Forbidden([string]$key, $changed, $me) {
  if ($me["role"] -eq "admin") { return ,@() }
  if (-not $SplitBy[$key]) { return ,@() }   # tồn NVL dùng chung: ai cũng sửa được (ghi nhật ký)
  $own = OwnerMap; $bad = @()
  foreach ($n in $changed) {
    if ($n -match '^[^.]+\.(.+)$') { if ($own[$Matches[1]] -ne $me["id"]) { $bad += $n } }
    elseif ($StaffFree[$key] -notcontains $n) { $bad += $n }
  }
  return ,$bad
}
# ===== NVL: đề nghị mua / đơn mua NCC / nhận hàng / xác nhận dư ở xưởng =====
# Admin: mọi thứ. Kho: nhận hàng (thêm lần nhận + trạng thái phiếu mua), xác nhận dư ở xưởng.
# Nhân viên: tạo / sửa / huỷ đề nghị mua còn chờ duyệt của mã mình phụ trách. Hao hụt, quy cách mua, ngày QC / vận chuyển: chỉ Admin.
function ById($list) { $h = @{}; foreach ($x in @($list)) { if ($x -is [System.Collections.IDictionary]) { $h[[string]$x["id"]] = $x } }; return $h }
function Arr($v) { if ($null -eq $v) { return ,@() }; return ,@($v) }
# Có phần tử nào trong danh sách thoả điều kiện (không dùng "Arr x | Where-Object": cả mảng bị coi là 1 phần tử)
function Has($list, [scriptblock]$cond) { foreach ($it_ in (Arr $list)) { if (& $cond $it_) { return $true } }; return $false }
function Dict($v) { if ($v -is [System.Collections.IDictionary]) { return $v }; return @{} }
function Num($v) { if ($null -eq $v -or [string]$v -eq "") { return 0.0 }; $d = 0.0; if ([double]::TryParse([string]$v, [System.Globalization.NumberStyles]::Float, [System.Globalization.CultureInfo]::InvariantCulture, [ref]$d)) { return $d }; return 0.0 }
function NvlForbidden($base, $mine, $me) {
  $role = [string]$me["role"]; if ($role -eq "admin") { return ,@() }
  $b = Dict $base; $m = Dict $mine; $kho = ($role -eq "kho")
  $bad = @()
  foreach ($k in @("cfg", "lossGroup")) { if ((J $b[$k]) -ne (J $m[$k])) { $bad += $k } }
  if (-not $kho -and (J $b["factoryOk"]) -ne (J $m["factoryOk"])) { $bad += "factoryOk" }
  if (-not $kho -and (J $b["returns"]) -ne (J $m["returns"])) { $bad += "returns" }
  $bi = ById $b["items"]; $mi = ById $m["items"]
  foreach ($id in (Uniq (@($bi.Keys) + @($mi.Keys)))) {
    $x = $(if ($bi[$id]) { $bi[$id] } else { @{} }); $y = $mi[$id]; if (-not $y) { continue }
    foreach ($f in @("lossPct", "perHasLoss", "buy")) { if ((J $x[$f]) -ne (J $y[$f])) { $bad += "items[$id].$f" } }
  }
  $own = OwnerMap; $br = ById $b["requests"]; $mr = ById $m["requests"]
  foreach ($id in (Uniq (@($br.Keys) + @($mr.Keys)))) {
    $x = $br[$id]; $y = $mr[$id]
    if ((J $x) -eq (J $y)) { continue }
    $ok = ($role -eq "staff") -and $y -and ($own[[string]$y["model"]] -eq $me["id"]) -and (@("cho-duyet", "huy") -contains [string]$y["status"]) -and ((-not $x) -or (([string]$x["status"] -eq "cho-duyet") -and ([string]$x["model"] -eq [string]$y["model"])))
    if (-not $ok) { $bad += "requests[$id]" }
  }
  $bp = ById $b["pos"]; $mp = ById $m["pos"]
  foreach ($id in (Uniq (@($bp.Keys) + @($mp.Keys)))) {
    $x = $bp[$id]; $y = $mp[$id]
    if ((J $x) -eq (J $y)) { continue }
    $ok = $false
    if ($kho -and $x -and $y -and (@("nhan-mot-phan", "da-nhan") -contains [string]$y["status"])) {
      $ok = $true
      foreach ($f in (Uniq (@($x.Keys) + @($y.Keys)))) { if ((@("received", "status", "log") -notcontains $f) -and ((J $x[$f]) -ne (J $y[$f]))) { $ok = $false } }
      $rx = Arr $x["received"]; $ry = Arr $y["received"]
      if ($ry.Count -lt $rx.Count) { $ok = $false } else { for ($i = 0; $i -lt $rx.Count; $i++) { if ((J $rx[$i]) -ne (J $ry[$i])) { $ok = $false } } }
    }
    if (-not $ok) { $bad += "pos[$id]" }
  }
  # Danh sách đặt mua NVL: nhân viên lập / sửa / huỷ bản NHÁP của mã mình phụ trách; Admin xác nhận đặt (đã gửi NCC), sửa, huỷ;
  # Kho chỉ ghi nhận hàng về (thêm lần nhận theo dòng + trạng thái nhận). Không ai được xoá danh sách (huỷ thì giữ lại lịch sử).
  $bb = ById $b["buyLists"]; $mb = ById $m["buyLists"]
  foreach ($id in (Uniq (@($bb.Keys) + @($mb.Keys)))) {
    $x = $bb[$id]; $y = $mb[$id]
    if ((J $x) -eq (J $y)) { continue }
    $ok = $false
    if ($y -and $role -eq "staff") {
      $mods = Arr $y["models"]; $own2 = ($mods.Count -gt 0) -and (@($mods | Where-Object { $own[[string]$_] -ne $me["id"] }).Count -eq 0)
      $ok = $own2 -and (@("nhap", "huy") -contains [string]$y["status"]) -and ((-not $x) -or ([string]$x["status"] -eq "nhap")) -and (-not $y["free"]) -and (-not ($x -and $x["free"])) -and (-not ($x -and ($x["giao"] -or $x["chot"])))   # đơn mua ngoài kế hoạch: chỉ Admin · V5.3: đã chốt thì không sửa bằng lưu thường
      if ($ok -and -not $x) { foreach ($l in (Arr $y["lines"])) { if ((Arr $l["received"]).Count -gt 0) { $ok = $false } } }
      if ($ok -and $x) { $ok = -not (Has $y["lines"] { param($q) (Arr $q["received"]).Count -gt 0 }) }
    }
    if ($y -and $x -and $kho -and (@("nhan-mot-phan", "da-nhan") -contains [string]$y["status"]) -and (@("da-gui", "ncc-xac-nhan", "nhan-mot-phan") -contains [string]$x["status"])) {
      $ok = ((J (StripRecv $x $true)) -eq (J (StripRecv $y $true)))
      $lx = ById $x["lines"]
      foreach ($l in (Arr $y["lines"])) { $rx = Arr $lx[[string]$l["id"]]["received"]; $ry = Arr $l["received"]; if ($ry.Count -lt $rx.Count) { $ok = $false } else { for ($i = 0; $i -lt $rx.Count; $i++) { if ((J $rx[$i]) -ne (J $ry[$i])) { $ok = $false } } } }
    }
    if (-not $ok) { $bad += "buyLists[$id]" }
  }
  # Báo sai lệch tồn: nhân viên chỉ thêm báo cáo mới của chính mình; Kho / Admin xử lý
  $bs = ById $b["stockReports"]; $ms = ById $m["stockReports"]
  foreach ($id in (Uniq (@($bs.Keys) + @($ms.Keys)))) {
    $x = $bs[$id]; $y = $ms[$id]
    if ((J $x) -eq (J $y)) { continue }
    $ok = $kho -and $y
    if (-not $kho) { $ok = (-not $x) -and $y -and ([string]$y["by"] -eq [string]$me["id"]) -and ([string]$y["status"] -eq "mo") }
    if (-not $ok) { $bad += "stockReports[$id]" }
  }
  return ,$bad
}
# ===== Tồn kho NVL: mọi thay đổi số tồn phải có dòng sổ tồn (người, giờ, trước / sau, lý do, loại nghiệp vụ) =====
# Nhân viên: chỉ xuất NVL theo phiếu (xuat / huy-xuat). Nhập mua, nhận trả, điều chỉnh kiểm kê: Kho / Admin. Sổ tồn chỉ thêm, không sửa / xoá.
function StockErrors($base, $mine, $me) {
  $role = [string]$me["role"]; $err = @()
  $b = Dict $base; $m = Dict $mine
  $bl = ById $b["stockLog"]; $ml = ById $m["stockLog"]; $mi = ById $m["items"]; $bi = ById $b["items"]
  foreach ($id in @($bl.Keys)) { if ((J $bl[$id]) -ne (J $ml[$id])) { $err += "Sổ tồn là lịch sử, không được sửa / xoá (dòng $id)" } }
  $sum = @{}
  foreach ($id in @($ml.Keys)) {
    if ($bl.ContainsKey($id)) { continue }
    $e = $ml[$id]; $kd = [string]$e["kind"]
    if ([string]$e["by"] -ne [string]$me["id"]) { $err += "Dòng sổ tồn $id ghi sai người thực hiện"; continue }
    if (-not ([string]$e["reason"]).Trim()) { $err += "Dòng sổ tồn $id thiếu lý do"; continue }
    if ($role -eq "staff" -and (@("xuat", "huy-xuat") -notcontains $kd)) { $err += "Tài khoản nhân viên không được điều chỉnh tồn ($kd). Báo sai lệch để Kho / Admin xử lý"; continue }
    if ([math]::Abs((Num $e["after"]) - (Num $e["before"]) - (Num $e["delta"])) -gt 1e-6) { $err += "Dòng sổ tồn ${id}: trước / sau không khớp số thay đổi"; continue }
    $kk = [string]$e["item"] + "|" + [string]$e["field"]; $sum[$kk] = [double]$sum[$kk] + (Num $e["delta"])
  }
  foreach ($id in (Uniq (@($bi.Keys) + @($mi.Keys)))) {
    $x = $bi[$id]; $y = $mi[$id]
    $nm = $(if ($y) { [string]$y["name"] } elseif ($x) { [string]$x["name"] } else { $id })
    foreach ($f in @("stock", "stockCay")) {
      $before = $(if ($x) { Num $x[$f] } else { 0.0 }); $after = $(if ($y) { Num $y[$f] } else { 0.0 })
      if ($x -and -not $y) { if ([math]::Abs($before) -gt 1e-9) { $err += "Không xoá được $nm khi còn tồn. Điều chỉnh tồn về 0 (có lý do) trước" }; continue }
      $d = $after - $before; $s = [double]$sum["$id|$f"]
      if ([math]::Abs($d - $s) -gt 1e-6) { $err += ("Tồn $nm" + $(if ($f -eq "stockCay") { " (cây)" } else { "" }) + " đổi " + [math]::Round($before, 2) + " → " + [math]::Round($after, 2) + " nhưng sổ tồn ghi " + [math]::Round($s, 2) + ". Mọi thay đổi tồn phải qua nhập / xuất / điều chỉnh có lý do") }
    }
  }
  return ,(Uniq $err)
}
# Admin khôi phục bản lưu cũ: giữ toàn bộ sổ tồn hiện có và ghi thêm dòng "khôi phục" cho phần tồn thay đổi
function RestoreStockLog($cur, $mine, $me, [string]$reason) {
  $c = Dict $cur; $m = Dict $mine
  $log = [System.Collections.ArrayList]::new(); $have = @{}
  foreach ($e in (Arr $c["stockLog"])) { $null = $log.Add($e); $have[[string]$e["id"]] = 1 }
  foreach ($e in (Arr $m["stockLog"])) { if (-not $have[[string]$e["id"]]) { $null = $log.Add($e); $have[[string]$e["id"]] = 1 } }
  $ci = ById $c["items"]; $mi = ById $m["items"]; $now = NowMs; $n = 0
  foreach ($id in (Uniq (@($ci.Keys) + @($mi.Keys)))) {
    foreach ($f in @("stock", "stockCay")) {
      $a = $(if ($ci[$id]) { Num $ci[$id][$f] } else { 0.0 }); $z = $(if ($mi[$id]) { Num $mi[$id][$f] } else { 0.0 })
      if ([math]::Abs($z - $a) -gt 1e-9) { $n++; $null = $log.Add(@{ id = [string]("sl" + $now + "r" + $n); item = [string]$id; itemName = [string]$(if ($mi[$id]) { $mi[$id]["name"] } else { $ci[$id]["name"] }); field = $f; before = $a; after = $z; delta = ($z - $a); kind = "khoi-phuc"; reason = $reason; by = [string]$me["id"]; at = $now }) }
    }
  }
  $m["stockLog"] = $log
  return $m
}
# Bản danh sách bỏ phần nhận hàng / trạng thái / lịch sử (để biết Kho có sửa gì khác ngoài ghi nhận hàng về không)
function StripRecv($L, [bool]$all) {
  $c = $JS.DeserializeObject((J $L)); $null = $c.Remove("status"); $null = $c.Remove("log")
  foreach ($ln in (Arr $c["lines"])) { $null = $ln.Remove("received") }
  return $c
}
# Danh sách đặt mua trùng: cùng NVL + cùng nguồn (đơn sản xuất / Đơn tiếp theo) đã nằm trong danh sách khác chưa huỷ.
# Chỉ chặn dòng MỚI chưa được người lập xác nhận "vẫn đặt" (dupOk) — VD 2 người tạo cùng lúc
function ListDupErrors($base, $final) {
  $bl = ById (Dict $base)["buyLists"]; $err = @(); $all = Arr (Dict $final)["buyLists"]
  foreach ($lst in $all) {
    if ([string]$lst["status"] -eq "huy") { continue }
    $old = $bl[[string]$lst["id"]]; $oldKeys = @{}
    if ($old) { foreach ($oldLn in (Arr $old["lines"])) { foreach ($s in (Arr $oldLn["src"])) { $oldKeys[[string]$oldLn["item"] + "|" + [string]$s["id"]] = 1 } } }
    foreach ($ln in (Arr $lst["lines"])) {
      if ($ln["dupOk"]) { continue }
      foreach ($s in (Arr $ln["src"])) {
        $k = [string]$ln["item"] + "|" + [string]$s["id"]; if ($oldKeys[$k]) { continue }
        foreach ($other in $all) {
          if ([string]$other["id"] -eq [string]$lst["id"] -or [string]$other["status"] -eq "huy") { continue }
          if (-not $bl.ContainsKey([string]$other["id"]) -and [string]$other["id"] -gt [string]$lst["id"]) { continue }
          foreach ($oln in (Arr $other["lines"])) { if ([string]$oln["item"] -eq [string]$ln["item"] -and (Has $oln["src"] { param($q) [string]$q["id"] -eq [string]$s["id"] })) { $err += ("Đã có danh sách đặt mua " + [string]$other["no"] + " cho " + [string]$ln["itemName"] + " · " + $(if ($s["next"]) { "Đơn tiếp theo" } else { [string]$s["code"] }) + ". Tải số mới nhất để xem, nếu vẫn cần đặt thêm thì tạo lại và xác nhận") } }
        }
      }
    }
  }
  return ,(Uniq $err)
}
# Đề nghị mua trùng: cùng NVL cho cùng đơn sản xuất mà đã có đề nghị đang hiệu lực (chờ duyệt / đã duyệt / đã đặt)
function ReqDupErrors($base, $final) {
  $bi = ById (Dict $base)["requests"]; $err = @(); $act = @("cho-duyet", "da-duyet", "da-dat")
  $all = Arr (Dict $final)["requests"]
  foreach ($r in $all) {
    if ($bi.ContainsKey([string]$r["id"]) -or ($act -notcontains [string]$r["status"])) { continue }
    foreach ($o in $all) {
      if ((-not $bi.ContainsKey([string]$o["id"])) -and ([string]$o["id"] -gt [string]$r["id"])) { continue }   # 2 đề nghị mới cùng lúc: báo 1 lần
      if ([string]$o["id"] -eq [string]$r["id"] -or ($act -notcontains [string]$o["status"]) -or ([string]$o["item"] -ne [string]$r["item"])) { continue }
      $ro = Arr $r["orders"]; $oo = Arr $o["orders"]; $oc = Arr $o["orderCodes"]
      $same = @($ro | Where-Object { $oo -contains $_ })
      if ($same.Count -gt 0) { $err += ("Đã có đề nghị " + [string]$o["code"] + " (" + [string]$o["itemName"] + ") cho đơn " + ($oc -join ", ") + ". Không tạo trùng; tải số mới nhất để xem") }
    }
  }
  return ,(Uniq $err)
}
# Gộp danh sách theo id (đề nghị, đơn mua, sổ tồn, NVL…): thêm mới của hai bên đều giữ; cùng sửa 1 dòng → xung đột.
# $num: các trường số được gộp theo chênh lệch (tồn kho: bên kia nhập, bên này xuất → cộng cả hai)
function ListMerge($b, $m, $c, $num) {
  $bi = ById $b; $mi = ById $m; $ci = ById $c
  $out = [System.Collections.ArrayList]::new(); foreach ($x in (Arr $c)) { $null = $out.Add($x) }
  $at = { param($id) for ($i = 0; $i -lt $out.Count; $i++) { if ([string]$out[$i]["id"] -eq $id) { return $i } }; return -1 }
  foreach ($id in @($mi.Keys)) {
    $x = $bi[$id]; $y = $mi[$id]; $z = $ci[$id]
    if ($x -and (J $y) -eq (J $x)) { continue }
    if (-not $x) { if ($z) { if ((J $z) -ne (J $y)) { return $null }; continue }; $null = $out.Add($y); continue }
    if (-not $z) { return $null }
    if ((J $z) -eq (J $x)) { $out[(& $at $id)] = $y; continue }
    if ((J $z) -eq (J $y)) { continue }
    if (-not $num) { return $null }
    foreach ($f in (Uniq (@($x.Keys) + @($y.Keys)))) { if (($num -notcontains $f) -and ((J $x[$f]) -ne (J $y[$f]))) { return $null } }
    $w = $JS.DeserializeObject((J $z)); foreach ($f in $num) { if ((J $x[$f]) -ne (J $y[$f])) { $w[$f] = (Num $z[$f]) + (Num $y[$f]) - (Num $x[$f]) } }
    $out[(& $at $id)] = $w
  }
  foreach ($id in @($bi.Keys)) { if (-not $mi.ContainsKey($id)) { $z = $ci[$id]; if ($z) { if ((J $z) -ne (J $bi[$id])) { return $null }; $out.RemoveAt((& $at $id)) } } }
  return ,$out
}
$ListSecs = @{ "nvl-v3" = @{ items = @("stock", "stockCay"); requests = $null; pos = $null; stockLog = $null; stockReports = $null; returns = $null; buyLists = $null } }# Giữ NVL: tổng phần các đơn đang giữ (gia công, chưa xuất NVL, chưa huỷ) không được vượt tồn kho / dư ở xưởng đã xác nhận.
# Chỉ chặn khi lần lưu này làm tổng giữ TĂNG tới mức vượt (tồn giảm vì việc khác thì không chặn các lần lưu không liên quan).
function HoldSums($plan) {
  $k = @{}; $x = @{}
  if ($plan -isnot [System.Collections.IDictionary] -or $plan["models"] -isnot [System.Collections.IDictionary]) { return @{ kho = $k; xuong = $x } }
  foreach ($mk in @($plan["models"].Keys)) {
    $p = $plan["models"][$mk]; if ($p -isnot [System.Collections.IDictionary]) { continue }
    foreach ($o in (Arr $p["orders"])) {
      if ($o -isnot [System.Collections.IDictionary]) { continue }
      $h = $o["nvlHold"]
      if ($h -isnot [System.Collections.IDictionary] -or $o["nvlOut"] -or $o["cancelled"] -or (@("hoa", "mien") -notcontains [string]$o["xuong"])) { continue }
      if ($h["kho"] -is [System.Collections.IDictionary]) { foreach ($id in @($h["kho"].Keys)) { $k[$id] = [double]$k[$id] + [double]$h["kho"][$id] } }
      if ($h["xuong"] -is [System.Collections.IDictionary]) { foreach ($id in @($h["xuong"].Keys)) { $kk = [string]$o["xuong"] + "|" + $id; $x[$kk] = [double]$x[$kk] + [double]$h["xuong"][$id] } }
    }
  }
  return @{ kho = $k; xuong = $x }
}
function HoldErrors($old, $new) {
  $f = Join-Path $DataDir "nvl-v3.json"
  $nv = $(if (Test-Path $f) { Val ([System.IO.File]::ReadAllText($f, $utf8)) } else { @{} })
  $items = ById $nv["items"]; $okx = $nv["factoryOk"]
  $sa = HoldSums $old; $sb = HoldSums $new; $err = @()
  foreach ($id in @($sb.kho.Keys)) {
    $it = $items[$id]; $stock = 0.0
    if ($it) { if (([string]$it["type"] -eq "Vải") -and ($null -ne $it["stockCay"]) -and ([string]$it["stockCay"] -ne "")) { $stock = [double]$it["stockCay"] } else { $stock = [double]$it["stock"] } }
    if (($sb.kho[$id] -gt $stock + 1e-6) -and ($sb.kho[$id] -gt [double]$sa.kho[$id] + 1e-6)) { $err += ($(if ($it) { [string]$it["name"] } else { $id }) + ": tổng các đơn giữ " + [math]::Round($sb.kho[$id], 2) + ", tồn kho chỉ có " + [math]::Round($stock, 2)) }
  }
  foreach ($kk in @($sb.xuong.Keys)) {
    $cap = 0.0
    if (($okx -is [System.Collections.IDictionary]) -and ($okx[$kk] -is [System.Collections.IDictionary]) -and $okx[$kk]["usable"] -and $okx[$kk]["quality"]) { $cap = [double]$okx[$kk]["qty"] }
    if (($sb.xuong[$kk] -gt $cap + 1e-6) -and ($sb.xuong[$kk] -gt [double]$sa.xuong[$kk] + 1e-6)) { $it = $items[$kk.Split("|")[1]]; $err += ("Dư ở xưởng " + $(if ($it) { [string]$it["name"] } else { $kk }) + ": tổng giữ " + [math]::Round($sb.xuong[$kk], 2) + ", đã xác nhận dùng được " + [math]::Round($cap, 2)) }
  }
  return ,$err
}
# Gộp 3 bên theo từng phần: mine (người lưu) / base (bản họ dựa vào) / cur (bản mới nhất). Trùng phần mà khác nhau → $null (xung đột)
function Merge3([string]$key, $base, $mine, $cur) {
  $sb = Sections $key $base; $sm = Sections $key $mine; $sc = Sections $key $cur
  $names = (Uniq (@($sb.Keys) + @($sm.Keys) + @($sc.Keys)))
  $pick = @{}; $lists = @{}; $mods = @{}
  foreach ($n in $names) {
    $jb = J $sb[$n]; $jm = J $sm[$n]; $jc = J $sc[$n]
    if ($jm -eq $jb -or $jm -eq $jc) { continue }   # người lưu không đổi phần này (hoặc đổi giống hệt)
    if ($jc -ne $jb) {
      if ($ListSecs[$key] -and $ListSecs[$key].ContainsKey($n)) { $lm = ListMerge $sb[$n] $sm[$n] $sc[$n] $ListSecs[$key][$n]; if ($null -eq $lm) { return $null }; $lists[$n] = $lm; continue }
      if ($key -eq "kehoach-sx-v3" -and $n -match '^models\.(.+)$') { $mg = ModelMerge $sb[$n] $sm[$n] $sc[$n]; if ($null -eq $mg) { return $null }; $mods[$n] = $mg; continue }   # V5: khác đơn thì gộp
      return $null                                  # cả hai cùng đổi 1 phần → xung đột thật
    }
    $pick[$n] = $true
  }
  foreach ($n in $pick.Keys) {
    if ($n -match '^([^.]+)\.(.+)$' -and $SplitBy[$key] -and $SplitBy[$key] -contains $Matches[1]) {
      $top = $Matches[1]; $sub = $Matches[2]
      if (-not ($cur[$top] -is [System.Collections.IDictionary])) { $cur[$top] = New-Object 'System.Collections.Generic.Dictionary[string,object]' }
      if ($sm.Contains($n)) { $cur[$top][$sub] = $sm[$n] } else { $null = $cur[$top].Remove($sub) }
    } else {
      if ($sm.Contains($n)) { $cur[$n] = $sm[$n] } else { $null = $cur.Remove($n) }
    }
  }
  foreach ($n in $lists.Keys) { $cur[$n] = $lists[$n] }
  foreach ($n in $mods.Keys) { $sub = $n.Substring(7); $cur["models"][$sub] = $mods[$n] }
  return $cur
}
# So 2 bản, ghi từng trường thay đổi (tối đa 300 dòng / lần lưu)
function Short($o) { $s = J $o; if ($s.Length -gt 400) { return $s.Substring(0, 400) + "…" }; return $s }
function IsList($x) { return ($x -is [System.Collections.IList]) -and -not ($x -is [string]) }
function DiffV($a, $b, [string]$path, $ctx, $out) {
  if ($out.Count -ge 300) { return }
  if ((J $a) -eq (J $b)) { return }
  if ($a -is [System.Collections.IDictionary] -and $b -is [System.Collections.IDictionary]) {
    foreach ($k in (Uniq (@($a.Keys) + @($b.Keys)))) { DiffV $a[$k] $b[$k] ($(if ($path) { "$path.$k" } else { $k })) $ctx $out }
    return
  }
  if ((IsList $a) -and (IsList $b)) {
    # phần tử có mã nhận diện (id: đơn, lần nhận, NVL…; key: mã sản phẩm) → so theo mã, không theo vị trí
    $all = @(@($a) + @($b) | Where-Object { $null -ne $_ }); $idf = $null
    foreach ($f in @("id", "key")) { if ($all.Count -gt 0 -and @($all | Where-Object { $_ -is [System.Collections.IDictionary] -and $_.ContainsKey($f) }).Count -eq $all.Count) { $idf = $f; break } }
    if ($idf) {
      $ia = @{}; foreach ($x in $a) { $ia[[string]$x[$idf]] = $x }; $ib = @{}; foreach ($x in $b) { $ib[[string]$x[$idf]] = $x }
      foreach ($id in (Uniq (@($ia.Keys) + @($ib.Keys)))) {
        $el = $(if ($ib[$id]) { $ib[$id] } else { $ia[$id] }); $c2 = @{ oid = $ctx.oid; code = $ctx.code }
        if ($path -match '(orders|gapOrders)$') { $c2.oid = $id; $c2.code = [string]$el["code"] }
        if (-not $ia[$id] -or -not $ib[$id]) { $null = $out.Add(@{ path = "$path[$id]"; before = (Short $ia[$id]); after = (Short $ib[$id]); oid = $c2.oid; code = $c2.code }); continue }
        DiffV $ia[$id] $ib[$id] "$path[$id]" $c2 $out
      }
      return
    }
    if (@($a).Count -eq @($b).Count -and @($a).Count -gt 6) { for ($i = 0; $i -lt @($a).Count; $i++) { DiffV $a[$i] $b[$i] "$path[$i]" $ctx $out }; return }
  }
  $null = $out.Add(@{ path = $path; before = (Short $a); after = (Short $b); oid = $ctx.oid; code = $ctx.code })
}
function WriteLog($entries) {
  if (-not $entries -or $entries.Count -eq 0) { return }
  $file = Join-Path $LogDir ((Get-Date -Format "yyyy-MM") + ".jsonl")
  $sb = New-Object System.Text.StringBuilder
  foreach ($e in $entries) { $null = $sb.AppendLine((J $e)) }
  [System.IO.File]::AppendAllText($file, $sb.ToString(), $utf8)
}
function LogSave([string]$key, $old, $new, $me, [string]$pg, [int64]$rev, [string]$reason, [bool]$merged) {
  $d = [System.Collections.ArrayList]::new()
  DiffV $old $new "" @{ oid = $null; code = $null } $d
  $now = NowMs; $E = @()
  foreach ($x in $d) {
    $model = $null; if ($x.path -match '^(models|catalog|gapNames|heroes)\.([^.\[]+)') { $model = $Matches[2] } elseif ($key -eq "danhmuc-v1" -and $x.path -match '^models\[([^\]]+)\]') { $model = $Matches[1] }
    if ($key -eq "danhmuc-v1" -and $x.path -match '^log') { continue }   # lịch sử phân công đã có sẵn trong danh mục
    $E += @{ at = $now; by = [string]$me["id"]; key = $key; rev = $rev; page = $pg; model = $model; oid = $x.oid; code = $x.code; path = $x.path; before = $x.before; after = $x.after; reason = $reason; merged = $merged }
  }
  WriteLog $E
}
function LogEvent([string]$action, $me, [string]$note, $extra) {
  $e = @{ at = (NowMs); by = [string]$me["id"]; key = "he-thong"; action = $action; note = $note }
  if ($extra) { foreach ($k in $extra.Keys) { $e[$k] = $extra[$k] } }
  WriteLog @($e)
}
# ===== CR-02 (23/11/2026): phiên bản Cần đặt KHOÁ (Tồn kho + Cần đặt + ngày còn bán do SIXMEN tính sẵn) =====
# Mỗi lần lưu = 1 file du-lieu\can-dat\<mã>\V<n>.json, tạo mới (CreateNew), chỉ đọc; không có API sửa / xoá, không tự dọn.
# Bản "đang dùng" = phiên bản số lớn nhất; server chép số của bản đó vào checkhero-v3 (heroes.<mã>.ton/need/days) cho các màn khác ĐỌC.
# Lưu thường (/api/data) không đổi được các phần này (CdProtect). Bảng đang có trước khi khoá → V0 (giữ nguyên, không xoá).
$CdDir = Join-Path $DataDir "can-dat"
New-Item -ItemType Directory -Force $CdDir | Out-Null
$CdProt = @("ton", "need", "days", "at", "by", "ver", "cd", "updated", "updatedAt")
$PoloCl = @("TRG","XDE","DEN","GLA","DNI","NAU","VOD","DOD","CAC","REU","BEE")
function CdProtect($curVal, $mine) {
  if ($mine -isnot [System.Collections.IDictionary] -or $mine["heroes"] -isnot [System.Collections.IDictionary]) { return $false }
  $mh = $mine["heroes"]; $ch = Dict (Dict $curVal)["heroes"]; $fix = $false
  foreach ($m in (Uniq (@($mh.Keys) + @($ch.Keys)))) {
    $c = Dict $ch[$m]
    if ($mh[$m] -isnot [System.Collections.IDictionary]) {
      if (-not $mh.ContainsKey($m) -and @($CdProt | Where-Object { $c.ContainsKey($_) }).Count -eq 0) { continue }
      if ($mh.ContainsKey($m) -and $null -eq $mh[$m] -and $c.Count -eq 0) { continue }
      $mh[$m] = @{}; $fix = $true
    }
    $x = $mh[$m]
    foreach ($f in $CdProt) {
      if ((J $x[$f]) -ne (J $c[$f])) { $fix = $true; if ($c.ContainsKey($f)) { $x[$f] = $c[$f] } else { $null = $x.Remove($f) } }
    }
  }
  return $fix
}
function CdModel([string]$model) {
  $f = Join-Path $DataDir "danhmuc-v1.json"; if (-not (Test-Path $f)) { return $null }
  foreach ($x in @((Val ([System.IO.File]::ReadAllText($f, $utf8)))["models"])) { if ([string]$x["key"] -eq $model) { return $x } }
  return $null
}
function CdColors($m) { $c = @($m["colors"] | Where-Object { $_ }); if ($c.Count) { return ,([string[]]$c) }; return ,([string[]]$PoloCl) }
function CdNSz($m) { $s = @($m["sizes"] | Where-Object { $_ }); if ($s.Count -ge 1 -and $s.Count -le 5) { return $s.Count }; return 5 }
function CdFiles([string]$model) { $d = Join-Path $CdDir $model; if (-not (Test-Path $d)) { return ,@() }; return ,@(Get-ChildItem $d -Filter "V*.json" | Where-Object { $_.Name -match '^V(\d+)\.json$' } | Sort-Object { [int]($_.Name -replace '\D', '') }) }
function CdRead($f) { return $JS.DeserializeObject([System.IO.File]::ReadAllText($f.FullName, $utf8).TrimStart([char]0xFEFF)) }
function CdHasNum($g) { foreach ($k in @((Dict $g).Keys)) { foreach ($v in @($g[$k])) { if ($null -ne $v -and [string]$v -ne "") { return $true } } }; return $false }
function CdWrite([string]$model, [int]$n, $rec) {
  $d = Join-Path $CdDir $model; New-Item -ItemType Directory -Force $d | Out-Null
  $p = Join-Path $d "V$n.json"; $bytes = $utf8.GetBytes((J $rec))
  $fs = [System.IO.File]::Open($p, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)   # có file rồi → lỗi, không ghi đè
  try { $fs.Write($bytes, 0, $bytes.Length) } finally { $fs.Close() }
  (Get-Item $p).IsReadOnly = $true
}
# Bảng đang có (trước khi khoá phiên bản) → V0, chỉ 1 lần, không đổi số
function CdEnsureV0([string]$model) {
  if ((CdFiles $model).Count) { return }
  $hf = Join-Path $DataDir "checkhero-v3.json"; if (-not (Test-Path $hf)) { return }
  $h = Dict (Dict (Val ([System.IO.File]::ReadAllText($hf, $utf8)))["heroes"])[$model]
  if (-not ((CdHasNum $h["ton"]) -or (CdHasNum $h["need"]))) { return }
  $at = Dict $h["at"]; $by = Dict $h["by"]
  $t = $(if ($at["need"]) { [int64]$at["need"] } elseif ($at["ton"]) { [int64]$at["ton"] } elseif ($h["updatedAt"]) { [int64]$h["updatedAt"] } else { [int64](NowMs) })
  try { CdWrite $model 0 @{ n = 0; model = $model; legacy = $true; at = $t; by = [string]$(if ($by["need"]) { $by["need"] } else { $by["ton"] }); sixmenAt = $null; note = "Dữ liệu trước khi khoá phiên bản (giữ nguyên số đã có)"; ton = $h["ton"]; need = $h["need"]; days = $h["days"]; changed = $null; tot = $null; raw = $null } } catch {}
}
function CdOk($v) { return ($null -eq $v) -or ([string]$v -match '^-?\d+$') }   # trống hoặc số nguyên
function CdInt($v) { if ($null -eq $v -or [string]$v -notmatch '^-?\d+$') { return $null }; return [int64][string]$v }
function CdSum($arr) { $s = [int64]0; foreach ($v in @($arr)) { $x = CdInt $v; if ($null -ne $x) { $s += $x } }; return $s }
# Kiểm tra lại trên server (không tin trang): mã màu / size khớp danh mục, số nguyên hoặc trống, tổng từng dòng / cột / toàn bảng khớp dòng Tổng SIXMEN
function CdCheck($m, $b) {
  $err = [System.Collections.ArrayList]::new(); $cols = CdColors $m; $nsz = CdNSz $m
  foreach ($k in @("ton", "need")) {
    $nm = @{ ton = "Tồn kho"; need = "Cần đặt" }[$k]; $g = $b[$k]; $tt = Dict (Dict $b["tot"])[$k]
    if ($g -isnot [System.Collections.IDictionary] -or $g.Count -eq 0) { $null = $err.Add("$nm`: chưa có bảng"); continue }
    $rows = Dict $tt["rows"]; $colSum = @(0) * 5; $all = [int64]0
    foreach ($c in @($g.Keys)) {
      if ($cols -notcontains $c) { $null = $err.Add("$nm`: màu $c không có trong danh mục"); continue }
      $a = @($g[$c]); if ($a.Count -ne 5) { $null = $err.Add("$nm $c`: cần đúng 5 ô"); continue }
      for ($i = 0; $i -lt 5; $i++) { if (-not (CdOk $a[$i])) { $null = $err.Add("$nm $c ô $($i + 1): không phải số nguyên"); continue }; $v = CdInt $a[$i]; if ($i -ge $nsz -and $null -ne $v) { $null = $err.Add("$nm $c`: có số ở size không có trong danh mục"); continue }; if ($null -ne $v) { $colSum[$i] += $v; $all += $v } }
      $rt = $(if ($rows.ContainsKey($c)) { CdInt $rows[$c] } else { $null }); $rs = CdSum $a
      if ($null -eq $rt) { $null = $err.Add("$nm $c`: thiếu ô Tổng SIXMEN để đối chiếu") }
      elseif ($rs -ne $rt) { $null = $err.Add("$nm $c`: tổng dòng $rs ≠ Tổng SIXMEN $rt") }
    }
    $ga = CdInt $tt["all"]
    if ($null -eq $ga) { $null = $err.Add("$nm`: thiếu dòng Tổng cuối của SIXMEN để đối chiếu") } elseif ($ga -ne $all) { $null = $err.Add("$nm`: tổng bảng $all ≠ Tổng SIXMEN $ga") }
    $tc = @($tt["cols"]); if ($tc.Count) { for ($i = 0; $i -lt [Math]::Min($nsz, $tc.Count); $i++) { $v = CdInt $tc[$i]; if ($null -ne $v -and $v -ne $colSum[$i]) { $null = $err.Add("$nm`: tổng cột size $($i + 1) là $($colSum[$i]) ≠ Tổng SIXMEN $v") } } }
  }
  $dg = $b["days"]
  if ($dg -is [System.Collections.IDictionary]) { foreach ($c in @($dg.Keys)) { if ($cols -notcontains $c) { $null = $err.Add("Ngày còn bán: màu $c không có trong danh mục"); continue }; foreach ($v in @($dg[$c])) { if ($null -ne $v) { $d = 0.0; if (-not [double]::TryParse([string]$v, [System.Globalization.NumberStyles]::Float, [System.Globalization.CultureInfo]::InvariantCulture, [ref]$d)) { $null = $err.Add("Ngày còn bán $c`: không phải số") } } } } }
  return ,$err
}
function CdDiff($a, $b) {
  $n = 0
  foreach ($k in @("ton", "need")) { $x = Dict (Dict $a)[$k]; $y = Dict (Dict $b)[$k]
    foreach ($c in (Uniq (@($x.Keys) + @($y.Keys)))) { for ($i = 0; $i -lt 5; $i++) { $u = $(if ($x[$c]) { @($x[$c])[$i] } else { $null }); $v = $(if ($y[$c]) { @($y[$c])[$i] } else { $null }); if ((J $u) -ne (J $v)) { $n++ } } } }
  return $n
}
function CdSummary($r, $cur) {
  $t = { param($g) $s = [int64]0; foreach ($c in @((Dict $g).Keys)) { foreach ($v in @($g[$c])) { if ($null -ne $v -and [string]$v -match '^-?\d+$') { $s += [int64]$v } } }; $s }
  return @{ n = [int]$r["n"]; at = $r["at"]; by = $r["by"]; sixmenAt = $r["sixmenAt"]; note = $r["note"]; legacy = [bool]$r["legacy"]; changed = $r["changed"]; totTon = (& $t $r["ton"]); totNeed = (& $t $r["need"]); current = $cur }
}
# ===== Phiên bản dữ liệu Phân tích nhu cầu: mỗi lần dán bảng tồn / cần đặt / ngày còn bán lưu 1 file =====
# Giữ tối thiểu 90 ngày; bản đang được đơn sản xuất tham chiếu (id nằm trong dữ liệu kế hoạch) thì không bao giờ xoá.
$VerDir = Join-Path $DataDir "phien-ban"
New-Item -ItemType Directory -Force $VerDir | Out-Null
$VerKeepDays = 90
function PruneVersions([string]$model) {
  $dir = Join-Path $VerDir $model; if (-not (Test-Path $dir)) { return 0 }
  $plan = Join-Path $DataDir "kehoach-sx-v3.json"; $ref = $(if (Test-Path $plan) { [System.IO.File]::ReadAllText($plan, $utf8) } else { "" })
  $n = 0
  foreach ($f in Get-ChildItem $dir -Filter "*.json") {
    if (((Get-Date) - $f.LastWriteTime).TotalDays -le $VerKeepDays) { continue }
    if ($ref.Contains($f.BaseName)) { continue }   # đơn sản xuất đang dùng bản này làm căn cứ
    Remove-Item $f.FullName -Force; $n++
  }
  return $n
}
# ===== Sổ phân bổ NVL (nvl-v3.alloc) + phiếu xuất (nvl-v3.issues): chỉ server ghi, qua /api/nvl/op =====
# Server xử lý từng yêu cầu một (vòng GetContext tuần tự) → mỗi thao tác đọc tồn + sổ mới nhất trên file, kiểm tra, ghi 1 lần.
# Giữ: không vượt khả dụng (tồn − phần mọi đơn khác đang giữ). Nhả: không quá phần đang giữ. Xuất: trừ phần đơn đang giữ trước, phần vượt
# lấy từ khả dụng; ghi cùng lúc dòng "cấp" (sổ phân bổ) + dòng "xuất" (sổ tồn) + phiếu. Lưu thường (PUT) không sửa được 2 phần này.
function StockField($it) { if (([string]$it["type"] -eq "Vải") -and ($null -ne $it["stockCay"]) -and ([string]$it["stockCay"] -ne "")) { return "stockCay" }; return "stock" }
function HeldMap($alloc) {
  $byOrder = @{}
  foreach ($e in (Arr $alloc)) { $oid = [string]$e["oid"]; if (-not $byOrder[$oid]) { $byOrder[$oid] = @{} }; $byOrder[$oid][[string]$e["item"]] = [double]$byOrder[$oid][[string]$e["item"]] + (Num $e["qty"]) }
  return $byOrder
}
# Phần giữ kiểu cũ (o.nvlHold) của đơn chưa có dòng nào trong sổ: vẫn tính, chuyển vào sổ ở lần thao tác đầu
function LegacyHeld($plan, $byOrder) {
  $out = @{}
  if ($plan -isnot [System.Collections.IDictionary] -or $plan["models"] -isnot [System.Collections.IDictionary]) { return $out }
  foreach ($mk in @($plan["models"].Keys)) { foreach ($o in (Arr $plan["models"][$mk]["orders"])) {
    if ($o -isnot [System.Collections.IDictionary]) { continue }
    $hh = $o["nvlHold"]; $oid = [string]$o["id"]
    if ($byOrder.ContainsKey($oid) -or $hh -isnot [System.Collections.IDictionary] -or $o["nvlOut"] -or $o["cancelled"] -or (@("hoa", "mien") -notcontains [string]$o["xuong"])) { continue }
    if ($hh["kho"] -is [System.Collections.IDictionary]) { $out[$oid] = @{}; foreach ($id in @($hh["kho"].Keys)) { $out[$oid][[string]$id] = (Num $hh["kho"][$id]) } }
  } }
  return $out
}
function FindOrder($plan, [string]$model, [string]$oid) {
  if ($plan -isnot [System.Collections.IDictionary]) { return $null }
  $p = (Dict $plan["models"])[$model]; if ($p -isnot [System.Collections.IDictionary]) { return $null }
  foreach ($o in (Arr $p["orders"])) { if ($o -is [System.Collections.IDictionary] -and [string]$o["id"] -eq $oid) { return $o } }
  return $null
}
# ===== Gom mua vải cho nhiều KHTL + phân bổ theo cây (anh duyệt 07/11/2026) =====
# Dòng đặt mua nối nhiều KHTL qua src[]; src.plan = số dự kiến (chỉ theo dõi, không đụng tồn). Không tự chia, không tự giữ: chỉ ghi khi người có quyền xác nhận.
# Phần phân bổ là dòng "giu" trong sổ phân bổ, thêm ds / ln. Kiểm tra theo số mới nhất trên file: không vượt nhu cầu còn lại, tồn khả dụng, số đạt chưa chia.
function LineGot($ln) { $ok = 0.0; foreach ($r in (Arr $ln["received"])) { $k = [string]$r["kind"]; if ($k -eq "qc") { $ok += (Num $r["ok"]) } elseif ($k -ne "giao" -and $k -ne "kg") { $ok += (Num $r["qty"]) } }; return $ok }
function LineAlloc($alloc, [string]$lnId) { $by = @{}; $tot = 0.0; foreach ($e in (Arr $alloc)) { if ([string]$e["ln"] -eq $lnId -and $lnId) { $v = Num $e["qty"]; $by[[string]$e["oid"]] = [double]$by[[string]$e["oid"]] + $v; $tot += $v } }; return @{ by = $by; total = $tot } }
function PlanOf($s) { if ($null -ne $s["plan"] -and [string]$s["plan"] -ne "") { return (Num $s["plan"]) }; return (Num $s["short"]) }
function SrcLive($plan, $s) { if ($s["next"]) { return $true }; $o = FindOrder $plan ([string]$s["model"]) ([string]$s["id"]); return [bool]($o -and -not $o["cancelled"] -and -not $o["arrived"]) }
function FabricNeed($nv, $o, [string]$model, $it) {
  if ([string]$it["model"] -ne "*" -and [string]$it["model"] -ne $model) { return 0.0 }
  $base = 0.0; foreach ($ol in (Arr $o["lines"])) { if ([string]$it["color"] -eq "*" -or [string]$it["color"] -eq [string]$ol["color"]) { $base += (Num $ol["cay"]) } }
  $loss = 0.0
  if (-not $it["perHasLoss"]) { if ($null -ne $it["lossPct"] -and [string]$it["lossPct"] -ne "") { $loss = Num $it["lossPct"] } else { $loss = Num (Dict $nv["lossGroup"])["vai"] } }
  return $base * (1 + $loss / 100)
}
function IssuedQty($issues, $o, [string]$item) {
  $s = 0.0; $any = $false
  foreach ($p in (Arr $issues)) { if ([string]$p["oid"] -eq [string]$o["id"] -and -not $p["void"]) { $any = $true; foreach ($pl in (Arr $p["lines"])) { if ([string]$pl["item"] -eq $item) { $s += (Num $pl["qty"]) + (Num $pl["fromX"]) } } } }
  if (-not $any -and $o["nvlOut"] -and $o["ship"] -is [System.Collections.IDictionary]) { $s = Num $o["ship"][$item] }
  return $s
}
# Giữ từ thẻ KHTL: ghi nhận phần lấy từ dòng đặt mua có liên kết (còn số đạt chưa chia). Chỉ là ghi sổ, không thêm số giữ
function SplitHold($nv, $alloc, [string]$oid, [string]$item, [double]$qty) {
  $out = [System.Collections.ArrayList]::new(); $left = $qty
  foreach ($Ds in (Arr $nv["buyLists"])) { if ([string]$Ds["status"] -eq "huy") { continue }
    foreach ($Ln in (Arr $Ds["lines"])) { if ($left -le 1e-9) { break }
      if ([string]$Ln["item"] -ne $item -or -not (Has $Ln["src"] { param($z) [string]$z["id"] -eq $oid })) { continue }
      $room = (LineGot $Ln) - (LineAlloc $alloc ([string]$Ln["id"])).total; if ($room -le 1e-9) { continue }
      $t = [math]::Min($room, $left); $null = $out.Add(@{ ds = [string]$Ds["id"]; ln = [string]$Ln["id"]; qty = [double]$t }); $left -= $t } }
  return $out.ToArray()
}
# Nhả: trả phần đã phân bổ về đúng dòng đặt mua, dòng phân bổ sau trả trước; $pref = chỉ trả về dòng đó (Hủy phân bổ)
function SplitRelease($alloc, [string]$oid, [string]$item, [double]$qty, [string]$pref) {
  $net = [ordered]@{}; $dsOf = @{}
  foreach ($e in (Arr $alloc)) { if ([string]$e["oid"] -eq $oid -and [string]$e["item"] -eq $item -and $e["ln"]) { $k = [string]$e["ln"]; $net[$k] = [double]$net[$k] + (Num $e["qty"]); $dsOf[$k] = [string]$e["ds"] } }
  $keys = @($net.Keys); [array]::Reverse($keys); if ($pref) { $keys = @($pref) }
  $out = [System.Collections.ArrayList]::new(); $left = $qty
  foreach ($k in $keys) { if ($left -le 1e-9) { break }; $v = [double]$net[$k]; if ($v -le 1e-9) { continue }; $t = [math]::Min($v, $left); $null = $out.Add(@{ ds = $dsOf[$k]; ln = $k; qty = [double]$t }); $left -= $t }
  return $out.ToArray()
}
function AddListLog($Ds, [string]$act, [string]$note, $uid, $now) { $lg = [System.Collections.ArrayList]::new(); foreach ($e in (Arr $Ds["log"])) { $null = $lg.Add($e) }; $null = $lg.Add(@{ at = $now; by = $uid; act = $act; note = $note }); $Ds["log"] = $lg.ToArray() }
function NvlLine($me, $q) {
  $op = [string]$q["op"]; $role = [string]$me["role"]; $uid = [string]$me["id"]; $reason = ([string]$q["reason"]).Trim()
  $nf = Join-Path $DataDir "nvl-v3.json"; $pf = Join-Path $DataDir "kehoach-sx-v3.json"
  if (-not (Test-Path $nf)) { return @{ code = 409; body = @{ error = "Chưa có dữ liệu Tồn kho NVL" } } }
  $oldN = Val ([System.IO.File]::ReadAllText($nf, $utf8)); $nv = $JS.DeserializeObject((J $oldN)); $rev = (CurrentRev $nf) + 1
  $plan = $(if (Test-Path $pf) { Val ([System.IO.File]::ReadAllText($pf, $utf8)) } else { @{} })
  $owners = OwnerMap; $can = { param($m) ($role -eq "admin") -or ($owners[[string]$m] -eq $uid) }
  $items = ById $nv["items"]; $issues = Arr $nv["issues"]; $now = NowMs; $err = @(); $summary = @(); $evt = @{}
  $alloc = [System.Collections.ArrayList]::new(); foreach ($e in (Arr $nv["alloc"])) { $null = $alloc.Add($e) }
  if ($op -eq "doi-nguon") {
    # Bản nháp đợt sau chuyển thành KHTL: liên kết đặt mua đi theo kế hoạch mới
    $oid = [string]$q["oid"]; $model = [string]$q["model"]; $from = [string]$q["from"]; $cols = Arr $q["colors"]
    if (-not (& $can $model)) { return @{ code = 403; body = @{ error = "Tài khoản này không phụ trách mã này" } } }
    $o = FindOrder $plan $model $oid; if (-not $o) { return @{ code = 404; body = @{ error = "Không tìm thấy kế hoạch trên server" } } }
    $cd = $(if ($o["khtl"]) { [string]$o["khtl"]["code"] } else { [string]$o["code"] }); $cnt = 0
    foreach ($Ds in (Arr $nv["buyLists"])) { if ([string]$Ds["status"] -eq "huy") { continue }; $hit = $false
      foreach ($Ln in (Arr $Ds["lines"])) { if ($cols -notcontains [string]$Ln["color"] -and [string]$Ln["color"] -ne "*") { continue }
        foreach ($s in (Arr $Ln["src"])) { if ([string]$s["id"] -eq $from) { $s["id"] = $oid; $s["code"] = $cd; $null = $s.Remove("next"); $cnt++; $hit = $true } } }
      if ($hit) { AddListLog $Ds "sua" ("Bản nháp đợt sau chuyển thành " + $cd + ": liên kết đi theo kế hoạch") $uid $now } }
    if ($cnt -eq 0) { return @{ code = 400; body = @{ error = "Không có liên kết nào cần chuyển" } } }
    $summary += ("chuyển " + $cnt + " liên kết sang " + $cd); $evt = @{ oid = $oid; code = [string]$o["code"]; model = $model }
  } else {
    $Ds = $null; $Ln = $null
    foreach ($x in (Arr $nv["buyLists"])) { if ([string]$x["id"] -eq [string]$q["ds"]) { $Ds = $x } }
    if ($Ds) { foreach ($y in (Arr $Ds["lines"])) { if ([string]$y["id"] -eq [string]$q["ln"]) { $Ln = $y } } }
    if (-not $Ln) { return @{ code = 404; body = @{ error = "Không tìm thấy dòng đặt mua" } } }
    if ([string]$Ds["status"] -eq "huy") { return @{ code = 409; body = @{ error = "Danh sách " + [string]$Ds["no"] + " đã huỷ" } } }
    $id = [string]$Ln["item"]; $it = $items[$id]
    $isF = [bool]($it -and (StockField $it) -eq "stockCay")
    if (-not $it) { return @{ code = 404; body = @{ error = "Không tìm thấy NVL của dòng này" } } }
    if ($op -eq "phan-bo" -and -not $isF) { return @{ code = 400; body = @{ error = "Phân bổ theo cây chỉ áp dụng cho Vải" } } }
    $fld = "stockCay"; $byOrder = HeldMap $alloc; $legacy = LegacyHeld $plan $byOrder
    $heldAll = 0.0; foreach ($k in @($byOrder.Keys)) { $heldAll += [double]$byOrder[$k][$id] }; foreach ($k in @($legacy.Keys)) { $heldAll += [double]$legacy[$k][$id] }
    $la = LineAlloc $alloc ([string]$Ln["id"])
    if ($op -eq "phan-bo") {
      if ([string]$Ds["status"] -eq "nhap") { return @{ code = 409; body = @{ error = "Danh sách chưa gửi NCC, chưa có hàng để phân bổ" } } }
      $rq = [string]$q["reqId"]
      if ($rq) { foreach ($e in $alloc) { if ([string]$e["reqId"] -eq $rq) { return @{ code = 409; body = @{ error = "Lần phân bổ này đã được ghi trước đó, không ghi lại"; dup = $true } } } } }
      if ($null -ne $q["lineExp"] -and [math]::Abs((Num $q["lineExp"]) - $la.total) -gt 1e-6) { return @{ code = 409; body = @{ error = "Dòng này vừa có người phân bổ (đang là " + [math]::Round($la.total, 2) + " cây). Tải lại số mới rồi thao tác lại."; stale = $true } } }
      $rows = Arr $q["rows"]; $total = 0.0; $seen = @{}; $todo = [System.Collections.ArrayList]::new()
      foreach ($r in $rows) {
        $oid = [string]$r["oid"]; $model = [string]$r["model"]; $qty = Num $r["qty"]
        if ($qty -le 1e-9) { continue }
        if ($seen[$oid]) { $err += "Trùng kế hoạch trong cùng lần phân bổ"; continue }; $seen[$oid] = 1
        if (-not (& $can $model)) { return @{ code = 403; body = @{ error = "Tài khoản này không có quyền phân bổ cho kế hoạch thuộc mã $model" } } }
        $o = FindOrder $plan $model $oid
        if (-not $o) { $err += "Không tìm thấy kế hoạch $oid trên server"; continue }
        $cd = $(if ($o["khtl"] -and -not $o["closed"]) { [string]$o["khtl"]["code"] } else { [string]$o["code"] })
        if ($o["cancelled"] -or $o["arrived"] -or (@("hoa", "mien") -notcontains [string]$o["xuong"])) { $err += "$cd không còn nhận phân bổ"; continue }
        if (-not (Has $Ln["src"] { param($z) [string]$z["id"] -eq $oid })) { $err += "$cd chưa liên kết dòng đặt mua này"; continue }
        $mine = [double](Dict $byOrder[$oid])[$id] + [double](Dict $legacy[$oid])[$id]
        if ($null -ne $r["exp"] -and [math]::Abs((Num $r["exp"]) - $mine) -gt 1e-6) { $err += "$cd vừa đổi số giữ (đang là " + [math]::Round($mine, 2) + " cây). Tải lại số mới rồi thao tác lại."; continue }
        $rest = (FabricNeed $nv $o $model $it) - $mine - (IssuedQty $issues $o $id)
        if ($qty -gt $rest + 1e-6) { $err += "${cd}: phân bổ " + [math]::Round($qty, 2) + " cây, nhu cầu còn lại " + [math]::Round([math]::Max(0, $rest), 2); continue }
        $total += $qty; $null = $todo.Add(@{ oid = $oid; model = $model; qty = $qty; code = [string]$o["code"]; show = $cd })
      }
      if ($err.Count -eq 0 -and $todo.Count -eq 0) { return @{ code = 400; body = @{ error = "Chưa nhập số phân bổ" } } }
      $free = (Num $it[$fld]) - $heldAll; $room = (LineGot $Ln) - $la.total
      if ($total -gt $free + 1e-6) { $err += ([string]$it["name"] + ": phân bổ " + [math]::Round($total, 2) + " cây, tồn khả dụng còn " + [math]::Round([math]::Max(0, $free), 2)) }
      if ($total -gt $room + 1e-6) { $err += ("Dòng này đạt kiểm nhận chưa chia còn " + [math]::Round([math]::Max(0, $room), 2) + " cây, không phân bổ được " + [math]::Round($total, 2)) }
      if ($err.Count -eq 0) {
        $n3 = 0; $why = $(if ($reason) { $reason } else { "Phân bổ từ " + [string]$Ds["no"] })
        foreach ($t in $todo) { $n3++
          $null = $alloc.Add(@{ id = [string]("al" + $now + "-p" + $n3); at = $now; by = $uid; oid = $t.oid; code = $t.code; model = $t.model; item = $id; itemName = [string]$it["name"]; kind = "giu"; qty = [double]$t.qty; reason = $why; ref = [string]$Ds["id"]; ds = [string]$Ds["id"]; ln = [string]$Ln["id"]; via = "ds"; reqId = $rq })
          $summary += ($t.show + " +" + [math]::Round($t.qty, 2)) }
        AddListLog $Ds "phan-bo" ([string]$it["name"] + ": " + ($summary -join ", ") + " cây") $uid $now
        $evt = @{ oid = $todo[0].oid; code = $todo[0].code; model = $todo[0].model }
      }
    }
    elseif ($op -eq "bo-lien-ket") {
      # Bỏ liên kết gắn thêm (mua trước, KHTL sau) khi chưa phân bổ từ dòng này. Không đụng tồn, không đổi số đặt
      $oid = [string]$q["oid"]; $model = [string]$q["model"]
      if (-not (& $can $model)) { return @{ code = 403; body = @{ error = "Tài khoản này không phụ trách kế hoạch thuộc mã $model" } } }
      $cur = $null; $sl = [System.Collections.ArrayList]::new(); foreach ($s in (Arr $Ln["src"])) { if ([string]$s["id"] -eq $oid) { $cur = $s } else { $null = $sl.Add($s) } }
      if (-not $cur -or -not $cur["linkedAt"]) { return @{ code = 409; body = @{ error = "Chỉ bỏ được liên kết gắn thêm từ đơn mua" } } }
      if ([double]$la.by[$oid] -gt 1e-9) { return @{ code = 409; body = @{ error = "Đã phân bổ từ dòng này. Hủy phân bổ trước." } } }
      $Ln["src"] = $sl.ToArray(); AddListLog $Ds "bo-lien-ket" ("Bỏ liên kết " + [string]$cur["code"] + " khỏi " + [string]$it["name"]) $uid $now
      $summary += ("bỏ " + [string]$cur["code"]); $evt = @{ oid = $oid; code = [string]$cur["code"]; model = $model }
    }
    elseif ($op -eq "du-kien") {
      $oid = [string]$q["oid"]; $model = [string]$q["model"]; $want = Num $q["plan"]
      if (-not (& $can $model)) { return @{ code = 403; body = @{ error = "Tài khoản này không phụ trách kế hoạch thuộc mã $model" } } }
      $o = FindOrder $plan $model $oid; if (-not $o) { return @{ code = 404; body = @{ error = "Không tìm thấy kế hoạch trên server" } } }
      $cd = $(if ($o["khtl"] -and -not $o["closed"]) { [string]$o["khtl"]["code"] } else { [string]$o["code"] })
      if ($o["cancelled"] -or $o["arrived"]) { return @{ code = 409; body = @{ error = "$cd không còn nhận liên kết" } } }
      $fit = FabricNeed $nv $o $model $it
      if ($fit -le 1e-9) { return @{ code = 409; body = @{ error = "$cd không dùng " + [string]$it["name"] } } }
      $nd = $(if ($isF) { $fit } else { [double]::MaxValue })   # Bo / nhãn: nhu cầu tính theo số áo ở trang; server chặn theo số đặt của dòng
      if ($want -lt 0 -or $want -gt $nd + 1e-6) { $err += "${cd}: dự kiến phải từ 0 tới nhu cầu " + [math]::Round($nd, 2) + " cây" }
      $mineLn = [double]$la.by[$oid]
      if ($want -lt $mineLn - 1e-6) { $err += "${cd}: đã phân bổ " + [math]::Round($mineLn, 2) + " cây từ dòng này, dự kiến không được thấp hơn. Hủy phân bổ trước." }
      $others = 0.0; $cur = $null
      foreach ($s in (Arr $Ln["src"])) { if ([string]$s["id"] -eq $oid) { $cur = $s } elseif (SrcLive $plan $s) { $others += (PlanOf $s) } }
      if ($null -ne $q["exp"] -and $cur -and [math]::Abs((Num $q["exp"]) - (PlanOf $cur)) -gt 1e-6) { $err += "Số dự kiến của $cd vừa đổi. Tải lại số mới rồi thao tác lại." }
      if ($others + $want -gt (Num $Ln["qty"]) + 1e-6) { $err += "Tổng dự kiến " + [math]::Round($others + $want, 2) + " vượt số đặt " + [math]::Round((Num $Ln["qty"]), 2) + " cây của dòng này" }
      if ($err.Count -eq 0) {
        if ($cur) { $old = PlanOf $cur; $cur["plan"] = [double]$want; AddListLog $Ds "du-kien" ($cd + " · " + [string]$it["name"] + ": dự kiến " + [math]::Round($old, 2) + " → " + [math]::Round($want, 2) + " cây") $uid $now }
        else {
          $sl = [System.Collections.ArrayList]::new(); foreach ($s in (Arr $Ln["src"])) { $null = $sl.Add($s) }
          $null = $sl.Add(@{ id = $oid; code = $cd; model = $model; need = [math]::Round($nd, 2); short = 0; plan = [double]$want; linkedAt = $now; linkedBy = $uid }); $Ln["src"] = $sl.ToArray()
          $mods = [System.Collections.ArrayList]::new(); foreach ($m in (Arr $Ds["models"])) { $null = $mods.Add($m) }; if ($mods -notcontains $model) { $null = $mods.Add($model) }; $Ds["models"] = $mods.ToArray()
          AddListLog $Ds "lien-ket" ("Gắn " + $cd + " vào " + [string]$it["name"] + ": dự kiến " + [math]::Round($want, 2) + " cây") $uid $now }
        $summary += ($cd + " dự kiến " + [math]::Round($want, 2) + " cây"); $evt = @{ oid = $oid; code = [string]$o["code"]; model = $model }
      }
    }
    else { return @{ code = 400; body = @{ error = "Thao tác không hợp lệ" } } }
  }
  if ($err.Count -gt 0) {
    LogEvent "tu-choi" $me ("Phân bổ vải: " + ($err -join "; ")) @{ ds = [string]$q["ds"] }
    return @{ code = 409; body = @{ error = ($err -join "`n"); parts = $err } }
  }
  $nv["alloc"] = $alloc.ToArray(); $body = J $nv
  $stamp = SaveKey "nvl-v3" $body $rev "nvl-op" $me["id"]
  LogSave "nvl-v3" $oldN $nv $me "nvl-op" $rev $reason $false
  LogEvent ("nvl-" + $op) $me (@{ "phan-bo" = "Phân bổ vải"; "du-kien" = "Dự kiến phân bổ vải"; "doi-nguon" = "Chuyển liên kết đặt mua"; "bo-lien-ket" = "Bỏ liên kết đơn mua" }[$op] + ": " + ($summary -join ", ") + $(if ($reason) { " · lý do: " + $reason } else { "" })) $evt
  return @{ code = 200; body = @{ ok = $true; rev = $rev; savedAt = $stamp; value = $nv } }
}
function NvlOp($me, $q) {
  if (@("phan-bo", "du-kien", "doi-nguon", "bo-lien-ket") -contains [string]$q["op"]) { return NvlLine $me $q }
  $op = [string]$q["op"]; $oid = [string]$q["oid"]; $model = [string]$q["model"]; $reason = ([string]$q["reason"]).Trim(); $role = [string]$me["role"]
  $nf = Join-Path $DataDir "nvl-v3.json"; $pf = Join-Path $DataDir "kehoach-sx-v3.json"
  if (-not (Test-Path $nf)) { return @{ code = 409; body = @{ error = "Chưa có dữ liệu Tồn kho NVL" } } }
  $nText = [System.IO.File]::ReadAllText($nf, $utf8); $oldN = Val $nText; $nv = $JS.DeserializeObject((J $oldN)); $rev = (CurrentRev $nf) + 1
  $plan = $(if (Test-Path $pf) { Val ([System.IO.File]::ReadAllText($pf, $utf8)) } else { @{} })
  $o = FindOrder $plan $model $oid
  if (-not $o) { return @{ code = 404; body = @{ error = "Không tìm thấy đơn trên server (đơn mới tạo phải được lưu trước)" } } }
  $code = [string]$o["code"]
  $own = (OwnerMap)[$model] -eq [string]$me["id"]
  $canHold = ($role -eq "admin") -or $own
  $canShip = $canHold -or ($role -eq "kho")
  if ((@("giu", "nha") -contains $op -and -not $canHold) -or (@("xuat", "huy-phieu") -contains $op -and -not $canShip)) { return @{ code = 403; body = @{ error = "Tài khoản này không có quyền với NVL của đơn $code" } } }
  if (($op -eq "giu" -or $op -eq "xuat") -and $o["cancelled"]) { return @{ code = 409; body = @{ error = "Đơn $code đã huỷ" } } }
  $items = ById $nv["items"]
  $alloc = [System.Collections.ArrayList]::new(); foreach ($e in (Arr $nv["alloc"])) { $null = $alloc.Add($e) }
  $issues = [System.Collections.ArrayList]::new(); foreach ($e in (Arr $nv["issues"])) { $null = $issues.Add($e) }
  $slog = [System.Collections.ArrayList]::new(); foreach ($e in (Arr $nv["stockLog"])) { $null = $slog.Add($e) }
  $now = NowMs
  $mk = { param($kind, $item, $qty, $why, $ref) $script:seqA++; $it0 = $items[[string]$item]; return @{ id = [string]("al" + $now + "-" + $script:seqA); at = $now; by = [string]$me["id"]; oid = $oid; code = $code; model = $model; item = [string]$item; itemName = [string]$(if ($it0) { $it0["name"] } else { $item }); kind = $kind; qty = [double]$qty; reason = $why; ref = $ref } }
  $script:seqA = 0
  $byOrder = HeldMap $alloc; $legacy = LegacyHeld $plan $byOrder
  # đơn còn giữ kiểu cũ: chuyển vào sổ trước (giữ nguyên số)
  if ($legacy.ContainsKey($oid)) { foreach ($id in @($legacy[$oid].Keys)) { if ((Num $legacy[$oid][$id]) -gt 1e-9) { $null = $alloc.Add((& $mk "khoi-tao" $id $legacy[$oid][$id] "Chuyển phần giữ cũ của đơn vào sổ phân bổ" $null)) } }; $legacy.Remove($oid); $byOrder = HeldMap $alloc }
  $heldOf = { param($ord, $item) [double](Dict $byOrder[$ord])[[string]$item] }
  $others = { param($item) $s = 0.0; foreach ($k in @($byOrder.Keys)) { if ($k -ne $oid) { $s += [double]$byOrder[$k][[string]$item] } }; foreach ($k in @($legacy.Keys)) { $s += [double]$legacy[$k][[string]$item] }; return $s }
  $err = @(); $avail = @{}; $summary = @()
  if ($op -eq "giu" -or $op -eq "nha") {
    if ($op -eq "nha" -and -not $reason) { return @{ code = 400; body = @{ error = "Nhả NVL phải ghi lý do" } } }
    $req = Arr $q["items"]
    if ($op -eq "nha" -and $q["all"]) { $req = @(); foreach ($id in @((Dict $byOrder[$oid]).Keys)) { $v = & $heldOf $oid $id; if ($v -gt 1e-9) { $req += @{ item = $id; qty = $v } } } }
    foreach ($r in $req) {
      $id = [string]$r["item"]; $qty = Num $r["qty"]; $it = $items[$id]
      if (-not $it) { $err += "Không có NVL $id"; continue }
      if ($qty -le 1e-9) { continue }
      $mine = & $heldOf $oid $id
      if ($op -eq "giu") {
        $free = (Num $it[(StockField $it)]) - (& $others $id) - $mine; $avail[$id] = [math]::Max(0, $free)
        if ($qty -gt $free + 1e-6) { $err += ([string]$it["name"] + ": xin giữ " + [math]::Round($qty, 2) + ", chỉ còn khả dụng " + [math]::Round([math]::Max(0, $free), 2)) ; continue }
        if ((StockField $it) -eq "stockCay") { $restQ = (FabricNeed $nv $o $model $it) - $mine - (IssuedQty $issues $o $id); if ($qty -gt $restQ + 1e-6) { $err += ([string]$it["name"] + ": xin giữ " + [math]::Round($qty, 2) + ", nhu cầu còn lại " + [math]::Round([math]::Max(0, $restQ), 2)); continue } }
        $whyG = $(if ($reason) { $reason } else { "Giữ NVL cho đơn" }); $leftG = $qty
        if ((StockField $it) -eq "stockCay") { foreach ($pt in (SplitHold $nv $alloc $oid $id $qty)) { $eg = & $mk "giu" $id $pt["qty"] $whyG $pt["ds"]; $eg["ds"] = $pt["ds"]; $eg["ln"] = $pt["ln"]; $null = $alloc.Add($eg); $leftG -= $pt["qty"] } }
        if ($leftG -gt 1e-9) { $null = $alloc.Add((& $mk "giu" $id $leftG $whyG $null)) }
        $summary += ([string]$it["name"] + " +" + [math]::Round($qty, 2))
      } else {
        if ($qty -gt $mine + 1e-6) { $err += ([string]$it["name"] + ": nhả " + [math]::Round($qty, 2) + ", đơn chỉ đang giữ " + [math]::Round($mine, 2)); continue }
        $prefL = [string]$r["ln"]
        if ($prefL) { $netL = [double](LineAlloc $alloc $prefL).by[$oid]; if ($qty -gt $netL + 1e-6) { $err += ([string]$it["name"] + ": hủy phân bổ " + [math]::Round($qty, 2) + ", dòng này chỉ phân bổ " + [math]::Round($netL, 2)); continue } }
        $leftN = $qty
        foreach ($pt in (SplitRelease $alloc $oid $id $qty $prefL)) { $en = & $mk "nha" $id (-$pt["qty"]) $reason $pt["ds"]; $en["ds"] = $pt["ds"]; $en["ln"] = $pt["ln"]; if ($prefL) { $en["via"] = "ds" }; $null = $alloc.Add($en); $leftN -= $pt["qty"]; foreach ($xd in (Arr $nv["buyLists"])) { if ([string]$xd["id"] -eq [string]$pt["ds"]) { AddListLog $xd "huy-pb" ($code + " · " + [string]$it["name"] + " −" + [math]::Round($pt["qty"], 2) + " cây · " + $reason) ([string]$me["id"]) $now } } }
        if ($leftN -gt 1e-9) { $null = $alloc.Add((& $mk "nha" $id (-$leftN) $reason $null)) }
        $summary += ([string]$it["name"] + " −" + [math]::Round($qty, 2))
      }
    }
  }
  elseif ($op -eq "xuat") {
    $ov = $q["override"]
    if ($ov -and $role -ne "admin") { return @{ code = 403; body = @{ error = "Chỉ Admin được xác nhận ngoại lệ xuất khi thiếu NVL" } } }
    if ($ov -and -not ([string]$ov["reason"]).Trim()) { return @{ code = 400; body = @{ error = "Ngoại lệ phải ghi lý do" } } }
    $live = 0; foreach ($x in $issues) { if ([string]$x["oid"] -eq $oid -and -not $x["void"]) { $live++ } }
    $no = "PX-" + ([string]($issues.Count + 1)).PadLeft(4, "0"); $pxId = [string]("px" + $now)
    $outLines = [System.Collections.ArrayList]::new()
    foreach ($r in (Arr $q["lines"])) {
      $id = [string]$r["item"]; $qty = Num $r["qty"]; $fx = Num $r["fromX"]; $it = $items[$id]
      if (-not $it) { $err += "Không có NVL $id"; continue }
      if ($qty -le 1e-9 -and $fx -le 1e-9) { continue }
      $mine = & $heldOf $oid $id; $fh = [math]::Min($mine, $qty); $extra = $qty - $fh
      $fld = StockField $it; $stock = Num $it[$fld]
      $free = $stock - (& $others $id) - $mine; $avail[$id] = [math]::Max(0, $free)
      if ($extra -gt $free + 1e-6) { $err += ([string]$it["name"] + ": xuất " + [math]::Round($qty, 2) + ", đơn giữ " + [math]::Round($mine, 2) + " + khả dụng " + [math]::Round([math]::Max(0, $free), 2) + " (không lấy vào phần đơn khác đang giữ)"); continue }
      $null = $outLines.Add(@{ item = $id; itemName = [string]$it["name"]; qty = [double]$qty; fromHold = [double]$fh; fromX = [double]$fx; field = $fld; unit = [string]$(if ($fld -eq "stockCay") { "cây" } else { $it["unit"] }) })
    }
    if ($err.Count -eq 0 -and $outLines.Count -eq 0) { $err += "Phiếu xuất chưa có số nào" }
    if ($err.Count -eq 0) {
      $n2 = 0
      foreach ($ln in $outLines) {
        $it = $items[$ln.item]
        if ($ln.qty -gt 1e-9) {
          $before = Num $it[$ln.field]; $after = [math]::Round($before - $ln.qty, 6); $it[$ln.field] = $after; $n2++
          $null = $slog.Add(@{ id = [string]("sl" + $now + "x" + $n2); item = $ln.item; itemName = $ln.itemName; field = $ln.field; before = $before; after = $after; delta = [math]::Round(-$ln.qty, 6); kind = "xuat"; reason = ("Phiếu xuất " + $no + " đơn " + $code + " (đợt " + ($live + 1) + ")"); ref = $pxId; by = [string]$me["id"]; at = $now })
        }
        if ($ln.fromHold -gt 1e-9) { $null = $alloc.Add((& $mk "cap" $ln.item (-$ln.fromHold) ("Cấp theo phiếu " + $no) $pxId)) }
        $summary += ($ln.itemName + " " + [math]::Round($ln.qty, 2) + " " + $ln.unit)
      }
      $null = $issues.Add(@{ id = $pxId; no = $no; oid = $oid; code = $code; model = $model; xuong = [string]$o["xuong"]; batch = ($live + 1); lines = $outLines.ToArray(); by = [string]$me["id"]; at = $now; date = [string](Get-Date -Format "yyyy-MM-dd"); doc = ([string]$q["doc"]).Trim(); note = ([string]$q["note"]).Trim(); override = $(if ($ov) { @{ by = [string]$me["id"]; at = $now; reason = ([string]$ov["reason"]).Trim(); detail = [string]$ov["detail"] } } else { $null }); void = $null })
    }
  }
  elseif ($op -eq "huy-phieu") {
    if (-not $reason) { return @{ code = 400; body = @{ error = "Huỷ phiếu xuất phải ghi lý do" } } }
    $px = $null; foreach ($x in $issues) { if ([string]$x["id"] -eq [string]$q["issue"] -and [string]$x["oid"] -eq $oid) { $px = $x } }
    if (-not $px -or $px["void"]) { return @{ code = 409; body = @{ error = "Không tìm thấy phiếu xuất còn hiệu lực" } } }
    $n2 = 0
    foreach ($ln in (Arr $px["lines"])) {
      $it = $items[[string]$ln["item"]]; if (-not $it) { continue }
      $fld = [string]$ln["field"]; if (-not $fld) { $fld = StockField $it }
      if ((Num $ln["qty"]) -gt 1e-9) { $before = Num $it[$fld]; $after = [math]::Round($before + (Num $ln["qty"]), 6); $it[$fld] = $after; $n2++
        $null = $slog.Add(@{ id = [string]("sl" + $now + "h" + $n2); item = [string]$ln["item"]; itemName = [string]$ln["itemName"]; field = $fld; before = $before; after = $after; delta = [math]::Round((Num $ln["qty"]), 6); kind = "huy-xuat"; reason = ("Huỷ phiếu " + [string]$px["no"] + " đơn " + $code + ": " + $reason); ref = [string]$px["id"]; by = [string]$me["id"]; at = $now }) }
      if ((Num $ln["fromHold"]) -gt 1e-9) { $null = $alloc.Add((& $mk "hoan" $ln["item"] (Num $ln["fromHold"]) ("Huỷ phiếu " + [string]$px["no"] + ": trả lại phần giữ") ([string]$px["id"]))) }
      $summary += ([string]$ln["itemName"] + " +" + [math]::Round((Num $ln["qty"]), 2))
    }
    $px["void"] = @{ at = $now; by = [string]$me["id"]; reason = $reason }
  }
  elseif (@("xn-de-nghi", "xn-ghi", "xn-tu-choi") -contains $op) {
    # V5.4 Đợt 3 (X4): xưởng xác nhận đã nhận theo từng phiếu xuất. Kho / Admin ghi xác nhận, từ chối; người thực thi đơn (hoặc Kho / Admin) gửi đề nghị kèm bằng chứng.
    # Chỉ ghi nhận để đối chiếu: KHÔNG đổi tồn, KHÔNG đổi sổ phân bổ, KHÔNG đổi công thức dư ở xưởng. Số nhận khác số xuất → giao diện hiện Lệch.
    $px = $null; foreach ($x in $issues) { if ([string]$x["id"] -eq [string]$q["issue"] -and [string]$x["oid"] -eq $oid) { $px = $x } }
    if (-not $px -or $px["void"]) { return @{ code = 409; body = @{ error = "Không tìm thấy phiếu xuất còn hiệu lực" } } }
    $isKho = ($role -eq "admin") -or ($role -eq "kho"); $isExO = (ExecOf $o) -eq [string]$me["id"]
    if ($op -eq "xn-de-nghi" -and -not ($isKho -or $isExO)) { return @{ code = 403; body = @{ error = "Chỉ người thực thi đơn $code (hoặc Kho / Admin) gửi đề nghị xác nhận" } } }
    if ($op -ne "xn-de-nghi" -and -not $isKho) { return @{ code = 403; body = @{ error = "Chỉ Kho / Admin ghi hoặc từ chối xác nhận xưởng đã nhận" } } }
    $pno = [string]$px["no"]; $rq = $px["recvReq"]
    if ($op -eq "xn-tu-choi") {
      if (-not ($rq -is [System.Collections.IDictionary] -and [string]$rq["state"] -eq "cho")) { return @{ code = 409; body = @{ error = "Phiếu $pno không có đề nghị đang chờ xác nhận"; dup = $true } } }
      if (-not $reason) { return @{ code = 400; body = @{ error = "Từ chối phải ghi lý do" } } }
      $rq["state"] = "tu-choi"; $rq["doneAt"] = $now; $rq["doneBy"] = [string]$me["id"]; $rq["reason"] = $reason
      $summary += ("từ chối đề nghị phiếu $pno · lý do: $reason")
    } else {
      $ev = ([string]$q["evidence"]).Trim(); if (-not $ev) { return @{ code = 400; body = @{ error = "Ghi nguồn / bằng chứng (VD ảnh biên bản, tin nhắn xưởng)" } } }
      $qm = Dict $q["qty"]; $got = @{}; $txt = @()
      foreach ($pl in (Arr $px["lines"])) { $iid = [string]$pl["item"]; $raw = $qm[$iid]
        if ($null -eq $raw -or [string]$raw -eq "" -or -not ([string]$raw -match '^\s*\d+([.,]\d+)?\s*$')) { return @{ code = 400; body = @{ error = ("Ghi số xưởng nhận (≥ 0) cho " + [string]$pl["itemName"]) } } }
        $v = [double]([string]$raw).Replace(",", "."); $got[$iid] = $v; $sent = (Num $pl["qty"]) + (Num $pl["fromX"]); $d = [math]::Round($v - $sent, 6)
        $txt += ([string]$pl["itemName"] + " " + [math]::Round($v, 2) + $(if ([math]::Abs($d) -gt 1e-9) { " (lệch " + $(if ($d -gt 0) { "+" } else { "" }) + [math]::Round($d, 2) + ")" } else { "" })) }
      if ($op -eq "xn-de-nghi") {
        if ($px["recv"]) { return @{ code = 409; body = @{ error = "Phiếu $pno đã được Kho / Admin xác nhận"; dup = $true } } }
        if ($rq -is [System.Collections.IDictionary] -and [string]$rq["state"] -eq "cho") { return @{ code = 409; body = @{ error = "Phiếu $pno đã có đề nghị đang chờ Kho xác nhận"; dup = $true } } }
        $px["recvReq"] = @{ state = "cho"; qty = $got; at = $now; by = [string]$me["id"]; evidence = $ev; note = ([string]$q["note"]).Trim() }
        $summary += ("đề nghị xác nhận phiếu $pno xưởng đã nhận: " + ($txt -join ", ") + " · bằng chứng: $ev")
      } else {
        $px["recv"] = @{ qty = $got; at = $now; by = [string]$me["id"]; src = $(if (([string]$q["src"]).Trim()) { ([string]$q["src"]).Trim() } elseif ($rq -is [System.Collections.IDictionary] -and [string]$rq["state"] -eq "cho") { "de-nghi" } else { "kho" }); evidence = $ev }
        if ($rq -is [System.Collections.IDictionary] -and [string]$rq["state"] -eq "cho") { $rq["state"] = "xn"; $rq["doneAt"] = $now; $rq["doneBy"] = [string]$me["id"] }
        $summary += ("xác nhận xưởng đã nhận phiếu ${pno}: " + ($txt -join ", ") + " · nguồn: $ev")
      }
    }
  }
  else { return @{ code = 400; body = @{ error = "Thao tác không hợp lệ" } } }
  if ($err.Count -gt 0) {
    LogEvent "tu-choi" $me ("NVL đơn " + $code + ": " + ($err -join "; ")) @{ oid = $oid; code = $code; model = $model }
    return @{ code = 409; body = @{ error = ($err -join "`n"); parts = $err; avail = $avail } }
  }
  if ($summary.Count -eq 0) { return @{ code = 400; body = @{ error = "Không có số nào thay đổi" } } }
  $nv["alloc"] = $alloc.ToArray(); $nv["issues"] = $issues.ToArray(); $nv["stockLog"] = $slog.ToArray()
  $body = J $nv
  $stamp = SaveKey "nvl-v3" $body $rev "nvl-op" $me["id"]
  LogSave "nvl-v3" $oldN $nv $me "nvl-op" $rev $reason $false
  LogEvent ("nvl-" + $op) $me (@{ giu = "Giữ NVL"; nha = "Nhả NVL"; xuat = "Xuất NVL"; "huy-phieu" = "Huỷ phiếu xuất"; "xn-de-nghi" = "Đề nghị xác nhận xưởng đã nhận"; "xn-ghi" = "Xác nhận xưởng đã nhận"; "xn-tu-choi" = "Từ chối đề nghị xác nhận" }[$op] + " đơn " + $code + ": " + ($summary -join ", ") + $(if ($reason) { " · lý do: " + $reason } else { "" })) @{ oid = $oid; code = $code; model = $model }
  return @{ code = 200; body = @{ ok = $true; rev = $rev; savedAt = $stamp; value = $nv } }
}
# ===== Đơn mua NVL · 1 PO ERP (VIKING → NCC NVL) + hồ sơ (anh yêu cầu 11/11/2026). Chỉ server ghi các bước, qua /api/nvl/ds-op =====
# Trạng thái gốc giữ nguyên (nhap → da-gui → ncc-xac-nhan → nhan-mot-phan → da-nhan / huy) để tính đang mua, KHTL không đổi.
# Bước thêm: giao (Đăng Nam chốt, giao người thực thi) → po (mã PO ERP) → qlvh (QLVH đã ký, duyệt) → gui (gửi NCC) → … → hồ sơ → bàn giao → xong (hoàn tất).
# Lưu thường (PUT) không thêm / sửa / xoá được các bước này, và không chuyển Nháp → Đã gửi NCC (phải qua PO + QLVH). Đơn đã gửi NCC từ trước giữ nguyên cách cũ.
$BuyKeepF = @("giao", "chot", "giaoLog", "flow", "po", "poLog", "qlvh", "qlvhLog", "docs", "docLog", "handovers", "doneAt", "doneBy", "sentBy", "sentAt", "editLog", "vuong", "bdocs", "bdocLog")   # UX V5: vướng mắc đơn mua NVL cũng chỉ server ghi
# UX V5 (anh duyệt 13/11/2026): "Báo vướng mắc" thêm loại vấn đề, mức ưu tiên; trạng thái mo (Chưa xử lý) → dang (Đang xử lý) → xong (Đã giải quyết). Dùng chung đơn sản xuất + đơn mua NVL
$VuongLoai = @{ "nvl" = "Thiếu / sai NVL"; "tre" = "NCC / xưởng trễ"; "so-lieu" = "Sai số liệu"; "ho-so" = "Chứng từ / hồ sơ"; "erp" = "PO / ERP"; "khac" = "Khác" }
$VuongUu = @{ "cao" = "Cao"; "tb" = "Trung bình"; "thap" = "Thấp" }
function VuongNew($vid, $now, $uid, $tx, $q) {
  $lo = ([string]$q["loai"]).Trim(); if (-not $VuongLoai.ContainsKey($lo)) { $lo = "khac" }
  $uu = ([string]$q["uu"]).Trim(); if (-not $VuongUu.ContainsKey($uu)) { $uu = "tb" }
  return @{ id = $vid; at = $now; by = $uid; text = $tx; can = ([string]$q["can"]).Trim(); loai = $lo; uu = $uu; state = "mo" }
}
function VuongTag($v) { return " · " + $VuongLoai[[string]$v["loai"]] + " · ưu tiên " + $VuongUu[[string]$v["uu"]].ToLower() }
$BuyDocs = [ordered]@{ dntt = "Giấy đề nghị thanh toán"; phieu = "Phiếu giao hàng / phiếu nhập NVL"; hd = "Hoá đơn VAT / chứng từ mua hàng hợp lệ" }
function BuyGuard($cur, $mine, $me) {
  $err = @(); $cl = ById (Dict $cur)["buyLists"]; $adm = $me["role"] -eq "admin"; $run = @("da-gui", "ncc-xac-nhan", "nhan-mot-phan")
  foreach ($Ls in (Arr (Dict $mine)["buyLists"])) {
    if ($Ls -isnot [System.Collections.IDictionary]) { continue }
    $c = $cl[[string]$Ls["id"]]; $no = [string]$Ls["no"]
    foreach ($fd in $BuyKeepF) { $cv = $null; if ($c) { $cv = $c[$fd] }; if ((J $Ls[$fd]) -ne (J $cv)) { if ($null -ne $cv) { $Ls[$fd] = $cv } else { $null = $Ls.Remove($fd) } } }   # không dùng $(...): mảng 1 phần tử bị mở thành đối tượng
    $ms = [string]$Ls["status"]
    if (-not $c) { if ($ms -ne "nhap") { $err += "Đơn mua $no mới phải bắt đầu ở Nháp" }; continue }
    $cs = [string]$c["status"]
    if ($c["doneAt"]) { if ((J $Ls) -ne (J $c)) { $err += "Đơn mua $no đã hoàn tất: không sửa được (Admin mở lại nếu cần)" }; continue }
    if (($c["giao"] -or $c["chot"]) -and (BuyDecis $Ls) -ne (BuyDecis $c)) { $err += "Đơn mua $no đã chốt nhu cầu: số đặt / NVL / NCC / mã NVL chỉ Admin sửa, ghi lý do (nút sửa trên đơn mua)" }
    if ($cs -eq $ms -or $ms -eq "huy") { continue }
    if ($cs -eq "nhap") { $err += "Đơn mua $no chỉ gửi NCC sau khi có mã PO ERP và xác nhận QLVH đã duyệt (làm theo các bước trên đơn mua)"; continue }
    if (($run -contains $cs) -and (($run + @("da-nhan")) -contains $ms)) { continue }
    $err += "Đơn mua ${no}: không chuyển được trạng thái $cs → $ms"
  }
  return ,(Uniq $err)
}
# Quyết định mua (anh duyệt 11/11): sau khi giao, chỉ Admin sửa qua /api/nvl/ds-op (cap-nhat, có lý do + nhật ký); lưu thường không đổi được
function BuyDecis($L) {
  $a = [System.Collections.ArrayList]::new()
  foreach ($l in (Arr $L["lines"])) { $null = $a.Add([ordered]@{ id = [string]$l["id"]; item = [string]$l["item"]; color = [string]$l["color"]; unit = [string]$l["unit"]; spec = [string]$l["spec"]; qty = (Num $l["qty"]) }) }
  return (J ([ordered]@{ ncc = [string]$L["ncc"]; code = [string]$L["code"]; lines = $a.ToArray() }))
}
function BuyHandPend($Ds) { foreach ($h in (Arr $Ds["handovers"])) { if ([string]$h["state"] -eq "cho") { return $h } }; return $null }
function BuyHandOk($Ds) { $H = Arr $Ds["handovers"]; if ($H.Count -eq 0) { return $false }; $h = $H[$H.Count - 1]; return (@("xn", "") -contains [string]$h["state"]) }
# Hồ sơ theo từng đợt (anh duyệt 13/11/2026): mỗi lần Kho kiểm nhận đạt (received kind "qc" có ok > 0; bản ghi cũ không có kind) = 1 đợt, mã = id lần kiểm nhận.
# Phiếu giao / nhập (phieu) và hoá đơn (hd) ghi theo đợt ở bdocs: {id, t, no, note, batches[], by, at} hoặc {id, t, na, reason, batches[]} (không áp dụng, chỉ Admin).
# Một chứng từ gắn được nhiều đợt (NCC xuất gộp): ghi trùng loại + số → gắn thêm đợt vào chứng từ đã có, không tạo chứng từ mới. Không đụng tồn kho.
# Đề nghị thanh toán (dntt) vẫn theo cả đơn. Đơn cũ đã ghi phiếu / hoá đơn chung cả đơn (docs.phieu / docs.hd) thì coi như phủ mọi đợt.
$BuyDocT = [ordered]@{ phieu = "Phiếu giao hàng / phiếu nhập NVL"; hd = "Hoá đơn VAT / chứng từ mua hàng hợp lệ" }
function BuyBatches($Ds) {
  $a = [System.Collections.ArrayList]::new()
  foreach ($l in (Arr $Ds["lines"])) { foreach ($r in (Arr $l["received"])) {
    $k = [string]$r["kind"]; $ok = $(if ($k -eq "qc") { Num $r["ok"] } elseif (-not $k) { Num $r["qty"] } else { 0 })
    if ($ok -gt 0 -and $r["id"]) { $null = $a.Add(@{ id = [string]$r["id"]; ln = [string]$l["id"]; item = [string]$l["itemName"]; at = $r["at"]; ok = $ok }) } } }
  return ,$a.ToArray()
}
function StrArr($v) { $a = [System.Collections.ArrayList]::new(); foreach ($y in (Arr $v)) { $s = ([string]$y).Trim(); if ($s -and -not $a.Contains($s)) { $null = $a.Add($s) } }; return ,$a.ToArray() }
function BuyBatchDoc($Ds, $bid, $t) { foreach ($x in (Arr $Ds["bdocs"])) { if ([string]$x["t"] -eq $t -and ((Arr $x["batches"]) -contains $bid)) { return $x } }; return $null }
function BuyDocsMissing($Ds) {
  $d = Dict $Ds["docs"]; $m = @(); if (-not $Ds["po"]) { $m += "PO mua NVL trên ERP" }
  if (-not $d["dntt"]) { $m += $BuyDocs["dntt"] }
  $B = BuyBatches $Ds
  foreach ($t in @($BuyDocT.Keys)) {
    if ($d[$t]) { continue }   # đơn cũ: đã ghi chung cả đơn
    if ($B.Count -eq 0) { $m += $BuyDocT[$t]; continue }
    $miss = @($B | Where-Object { -not (BuyBatchDoc $Ds $_["id"] $t) }); if ($miss.Count) { $m += ($BuyDocT[$t] + " (" + $miss.Count + "/" + $B.Count + " đợt chưa có)") }
  }
  return ,$m
}
function BuyOp($me, $q) {
  $op = [string]$q["op"]; $uid = [string]$me["id"]; $adm = $me["role"] -eq "admin"; $reason = ([string]$q["reason"]).Trim(); $now = NowMs
  $nf = Join-Path $DataDir "nvl-v3.json"; if (-not (Test-Path $nf)) { return @{ code = 409; body = @{ error = "Chưa có dữ liệu Tồn kho NVL" } } }
  $oldN = Val ([System.IO.File]::ReadAllText($nf, $utf8)); $nv = $JS.DeserializeObject((J $oldN)); $rev = (CurrentRev $nf) + 1
  $Ds = $null; foreach ($x in (Arr $nv["buyLists"])) { if ([string]$x["id"] -eq [string]$q["ds"]) { $Ds = $x } }
  if (-not $Ds) { return @{ code = 404; body = @{ error = "Không tìm thấy đơn mua NVL trên server (tải lại trang)" } } }
  $no = [string]$Ds["no"]; $st = [string]$Ds["status"]; $g = $Ds["giao"]; $ex = $(if ($g) { [string]$g["user"] } else { "" }); $isExRaw = $ex -and $ex -eq $uid
  # V5.3: đơn mua bàn giao theo V5.3 (giao.v = 2) chỉ được thực thi sau khi người thực thi tiếp nhận, chưa trả lại. Đơn giao trước đó giữ quy tắc cũ
  $gReady = $g -and -not $g["traAt"] -and ((Num $g["v"]) -ne 2 -or $g["ackAt"]); $isEx = $isExRaw -and $gReady
  $chot = $Ds["chot"] -or $g
  $own = OwnerMap; $mods = Arr $Ds["models"]; $isOwn = (-not $Ds["free"]) -and $mods.Count -gt 0 -and (@($mods | Where-Object { $own[[string]$_] -ne $uid }).Count -eq 0)
  $who = { param($id) $u = (LoadUsers) | Where-Object { $_["id"] -eq $id } | Select-Object -First 1; if ($u) { [string]$u["name"] } else { [string]$id } }
  $hm = { param($ms) [DateTimeOffset]::FromUnixTimeMilliseconds([int64]$ms).ToLocalTime().ToString("HH:mm dd/MM") }
  $no409 = { param($m) @{ code = 409; body = @{ error = $m } } }
  $deny = { param($m) @{ code = 403; body = @{ error = $m } } }
  $bad = { param($m) @{ code = 400; body = @{ error = $m } } }
  $exOk = $isEx -or $adm; $note = ""
  $addTo = { param($f, $e) $a = [System.Collections.ArrayList]::new(); foreach ($y in (Arr $Ds[$f])) { $null = $a.Add($y) }; $null = $a.Add($e); $Ds[$f] = $a.ToArray() }
  if ($st -eq "huy") { return (& $no409 "Đơn mua $no đã huỷ") }
  if ($Ds["doneAt"] -and $op -ne "mo-lai") { return (& $no409 "Đơn mua $no đã hoàn tất") }
  if ($op -eq "chot") {
    # V5.3: Chốt nhu cầu mua (khoá số đặt / NVL / NCC) — chưa giao ai. Bàn giao là bước riêng
    if (-not ($adm -or $isOwn)) { return (& $deny "Chỉ người quản lý kế hoạch của mã (hoặc Admin) chốt đơn mua") }
    if ($st -ne "nhap") { return (& $no409 "Đơn mua $no không còn ở Nháp") }
    if ($chot) { return @{ code = 409; body = @{ error = ("Đơn mua $no đã được chốt" + $(if ($Ds["chot"]) { " bởi " + (& $who $Ds["chot"]["by"]) + " lúc " + (& $hm $Ds["chot"]["at"]) } else { "" })); dup = $true } } }
    if (-not (Has $Ds["lines"] { param($l) (Num $l["qty"]) -gt 0 })) { return (& $bad "Đơn mua $no chưa có số đặt") }
    $Ds["chot"] = @{ at = $now; by = $uid }; $Ds["flow"] = 2
    AddListLog $Ds "chot" "Chốt nhu cầu mua · chờ bàn giao người thực thi" $uid $now; $note = "Chốt đơn mua $no · chờ bàn giao"
  }
  elseif ($op -eq "giao") {
    if (-not ($adm -or $isOwn)) { return (& $deny "Chỉ người quản lý kế hoạch của mã (hoặc Admin) bàn giao đơn mua") }
    if ($st -ne "nhap") { return (& $no409 "Đơn mua $no không còn ở Nháp") }
    if (-not $Ds["chot"] -and -not $g) { return (& $no409 "Đơn mua $no chưa chốt nhu cầu: chốt trước rồi mới bàn giao") }
    if ($g -and -not $g["traAt"]) { return @{ code = 409; body = @{ error = ("Đơn mua $no đã được " + (& $who $g["by"]) + " bàn giao cho " + (& $who $g["user"]) + " lúc " + (& $hm $g["at"]) + $(if ($g["ackAt"]) { " (đã tiếp nhận)" } else { " (chờ tiếp nhận)" })); dup = $true } } }
    $tu = ([string]$q["toUser"]).Trim(); if (-not $tu) { $tu = ExecDefault }
    $u = (LoadUsers) | Where-Object { $_["id"] -eq $tu -and $_["active"] } | Select-Object -First 1
    if (-not $u) { return (& $bad "Chưa có người thực thi (Danh mục mã & phân công) hoặc tài khoản không hoạt động") }
    $Ds["giao"] = @{ user = $tu; at = $now; by = $uid; v = 2 }; if ($g) { $Ds["giao"]["prev"] = $g }; $Ds["flow"] = 2
    & $addTo "giaoLog" @{ at = $now; by = $uid; act = "giao"; user = $tu }
    AddListLog $Ds "giao" ("Bàn giao " + [string]$u["name"] + " · chờ tiếp nhận" + $(if ($g) { " (giao lại sau khi trả lại)" } else { "" })) $uid $now; $note = "Bàn giao đơn mua $no cho " + [string]$u["name"]
  }
  elseif ($op -eq "nhan" -or $op -eq "tra-lai") {
    if (-not $g) { return (& $no409 "Đơn mua $no chưa được bàn giao") }
    if (-not ($isExRaw -or $adm)) { return (& $deny "Chỉ người được bàn giao (hoặc Admin)") }
    if ($g["traAt"]) { return @{ code = 409; body = @{ error = "Đơn mua $no đã được trả lại, chờ người quản lý kế hoạch xử lý"; dup = $true } } }
    if ($g["ackAt"]) { return @{ code = 409; body = @{ error = ("Đơn mua $no đã được " + (& $who $g["ackBy"]) + " tiếp nhận lúc " + (& $hm $g["ackAt"])); dup = $true } } }
    if ($op -eq "nhan") {
      $g["ackAt"] = $now; $g["ackBy"] = $uid; & $addTo "giaoLog" @{ at = $now; by = $uid; act = "nhan"; user = $ex }
      AddListLog $Ds "tiep-nhan" ("Tiếp nhận · chờ tạo PO ERP" + $(if (-not $isExRaw) { " (Admin thay " + (& $who $ex) + ")" } else { "" })) $uid $now; $note = "Tiếp nhận đơn mua $no"
    } else {
      if (-not $reason) { return (& $bad "Ghi lý do trả lại") }
      $g["traAt"] = $now; $g["traBy"] = $uid; $g["traReason"] = $reason; & $addTo "giaoLog" @{ at = $now; by = $uid; act = "tra"; user = $ex; reason = $reason }
      AddListLog $Ds "tra-lai" ("Trả lại người quản lý kế hoạch · " + $reason) $uid $now; $note = "Trả lại đơn mua $no · lý do: $reason"
    }
  }
  elseif ($op -eq "thu-hoi") {
    if (-not ($adm -or $isOwn -or $isEx)) { return (& $deny "Chỉ người quản lý kế hoạch, người thực thi hoặc Admin") }
    if ($st -ne "nhap" -or -not $chot) { return (& $no409 "Đơn mua $no chưa chốt hoặc đã gửi NCC") }
    if ($Ds["po"]) { return (& $no409 "Đơn mua $no đã có mã PO ERP: không trả về nháp được. Admin đính chính PO nếu sai") }
    if (-not $reason) { return (& $bad "Ghi lý do trả về nháp") }
    if ($g) { & $addTo "giaoLog" @{ at = $now; by = $uid; act = "thu-hoi"; prev = $g; reason = $reason } }
    $null = $Ds.Remove("giao"); $null = $Ds.Remove("chot"); AddListLog $Ds "thu-hoi" ("Trả về nháp để sửa nhu cầu · " + $reason) $uid $now; $note = "Trả đơn mua $no về nháp · lý do: $reason"
  }
  elseif ($op -eq "po" -or $op -eq "po-sua") {
    $code = ([string]$q["po"]).Trim(); if (-not $code) { return (& $bad "Nhập mã PO ERP") }
    foreach ($y in (Arr $nv["buyLists"])) { if ([string]$y["id"] -ne [string]$Ds["id"] -and [string]$y["status"] -ne "huy" -and $y["po"] -and ([string]$y["po"]["code"]).Trim().ToLower() -eq $code.ToLower()) { return (& $no409 ("Mã PO $code đã dùng cho đơn mua " + [string]$y["no"] + ". Mỗi đơn mua NVL một PO riêng")) } }
    if ($op -eq "po") {
      if (-not $exOk) { return (& $deny "Chỉ người thực thi đơn mua (hoặc Admin) nhập mã PO") }
      if (-not $g -or $g["traAt"] -or $st -ne "nhap") { return (& $no409 "Đơn mua $no chưa được bàn giao / đã trả lại, hoặc đã gửi NCC") }
      if (-not $gReady -and -not $adm) { return (& $deny "Tiếp nhận đơn mua $no trước rồi mới tạo PO") }
      if ($Ds["po"]) { return @{ code = 409; body = @{ error = ("Đơn mua $no đã có PO " + [string]$Ds["po"]["code"] + " (" + (& $who $Ds["po"]["by"]) + " nhập " + (& $hm $Ds["po"]["at"]) + "). Một đơn mua NVL chỉ có một PO ERP"); dup = $true } } }
      $Ds["po"] = @{ code = $code; at = $now; by = $uid }; & $addTo "poLog" @{ at = $now; by = $uid; act = "tao"; po = $code }
      AddListLog $Ds "po" ("Mã PO ERP " + $code + " (VIKING → NCC) · chờ QLVH ký, duyệt") $uid $now; $note = "Nhập mã PO ERP $code cho đơn mua $no"
    } else {
      if (-not $adm) { return (& $deny "Chỉ Admin đính chính mã PO") }
      if (-not $Ds["po"]) { return (& $no409 "Đơn mua $no chưa có mã PO") }
      if (-not $reason) { return (& $bad "Ghi lý do đính chính") }
      $from = [string]$Ds["po"]["code"]; if ($from -eq $code) { return (& $bad "Mã PO không đổi") }
      $Ds["po"] = @{ code = $code; at = $now; by = $uid }; if ($Ds["qlvh"]) { $Ds["qlvh"]["po"] = $code }
      & $addTo "poLog" @{ at = $now; by = $uid; act = "sua"; from = $from; po = $code; reason = $reason }
      AddListLog $Ds "po-sua" ("Đính chính PO " + $from + " → " + $code + " · " + $reason) $uid $now; $note = "Đính chính PO đơn mua ${no}: $from → $code · lý do: $reason"
    }
  }
  elseif ($op -eq "qlvh") {
    if (-not $exOk) { return (& $deny "Chỉ người thực thi đơn mua (hoặc Admin) xác nhận QLVH đã duyệt") }
    if (-not $Ds["po"]) { return (& $no409 "Đơn mua $no chưa có mã PO ERP") }
    if ($Ds["qlvh"]) { return @{ code = 409; body = @{ error = ("Đơn mua $no đã được " + (& $who $Ds["qlvh"]["by"]) + " xác nhận QLVH duyệt lúc " + (& $hm $Ds["qlvh"]["at"])); dup = $true } } }
    if ($q["ack"] -ne $true) { return (& $bad "Tick xác nhận đã kiểm tra PO được QLVH ký và duyệt trên ERP") }
    $Ds["qlvh"] = @{ at = $now; by = $uid; po = [string]$Ds["po"]["code"] }; & $addTo "qlvhLog" @{ at = $now; by = $uid; act = "duyet"; po = [string]$Ds["po"]["code"] }
    AddListLog $Ds "qlvh" ("QLVH đã ký, duyệt PO " + [string]$Ds["po"]["code"] + " trên ERP") $uid $now; $note = "QLVH đã duyệt PO " + [string]$Ds["po"]["code"] + " · đơn mua $no"
  }
  elseif ($op -eq "qlvh-bo") {
    if (-not $adm) { return (& $deny "Chỉ Admin bỏ xác nhận QLVH") }
    if (-not $Ds["qlvh"]) { return (& $no409 "Đơn mua $no chưa có xác nhận QLVH") }
    if ($st -ne "nhap") { return (& $no409 "Đơn mua $no đã gửi NCC: không bỏ xác nhận được") }
    if (-not $reason) { return (& $bad "Ghi lý do") }
    & $addTo "qlvhLog" @{ at = $now; by = $uid; act = "bo"; prev = $Ds["qlvh"]; reason = $reason }; $null = $Ds.Remove("qlvh")
    AddListLog $Ds "qlvh-bo" ("Bỏ xác nhận QLVH · " + $reason) $uid $now; $note = "Bỏ xác nhận QLVH đơn mua $no · lý do: $reason"
  }
  elseif ($op -eq "gui") {
    if (-not $exOk) { return (& $deny "Chỉ người thực thi đơn mua (hoặc Admin) gửi NCC") }
    if ($st -ne "nhap") { return @{ code = 409; body = @{ error = "Đơn mua $no đã gửi NCC"; dup = $true } } }
    if (-not $Ds["po"] -or -not $Ds["qlvh"]) { return (& $no409 "Đơn mua $no chưa có PO được QLVH duyệt: chưa gửi NCC được") }
    $Ds["status"] = "da-gui"; $Ds["sentBy"] = $uid; $Ds["sentAt"] = $now
    AddListLog $Ds "gui" ("PO " + [string]$Ds["po"]["code"]) $uid $now; $note = "Gửi NCC đơn mua $no (PO " + [string]$Ds["po"]["code"] + ")"
  }
  elseif ($op -eq "ncc") {
    if (-not $exOk) { return (& $deny "Chỉ người thực thi đơn mua (hoặc Admin)") }
    if ($st -ne "da-gui") { return (& $no409 "Đơn mua $no không ở bước Đã gửi NCC") }
    $Ds["status"] = "ncc-xac-nhan"; $tx = ([string]$q["note"]).Trim(); AddListLog $Ds "ncc" $tx $uid $now; $note = "NCC xác nhận đơn mua $no" + $(if ($tx) { ": $tx" } else { "" })
  }
  elseif ($op -eq "cap-nhat") {
    if (-not $exOk) { return (& $deny "Chỉ người thực thi đơn mua (hoặc Admin)") }
    if (-not $chot -or @("nhap", "da-gui", "ncc-xac-nhan", "nhan-mot-phan") -notcontains $st) { return (& $no409 "Đơn mua $no không cập nhật được ở bước này") }
    $fd = [string]$q["field"]; $v = ([string]$q["value"]).Trim(); if (-not $v) { $v = $null }
    # Anh duyệt 11/11: sau khi giao, NCC / mã NVL / số đặt là quyết định mua → chỉ Admin sửa, bắt buộc lý do, ghi nhật ký (đối chiếu PO ERP). Người thực thi chỉ cập nhật ngày về.
    if (@("ncc", "code", "qty") -contains $fd) {
      if (-not $adm) { return (& $deny "Sau khi giao, số đặt / NCC / mã NVL chỉ Admin sửa (ghi lý do, đối chiếu PO ERP). Cần đổi thì báo Admin hoặc trả về nháp khi chưa có PO") }
      if (-not $reason) { return (& $bad "Ghi lý do sửa") }
    }
    if ($fd -eq "ncc" -or $fd -eq "eta" -or $fd -eq "code") {
      if ($fd -eq "eta" -and $v -and $v -notmatch '^\d{4}-\d{2}-\d{2}$') { return (& $bad "Ngày không hợp lệ") }
      $from = $Ds[$fd]; if ([string]$from -eq [string]$v) { return (& $bad "Không có gì thay đổi") }
      if ($fd -eq "eta") { & $addTo "etaLog" @{ at = $now; by = $uid; from = $from; to = $v } } else { & $addTo "editLog" @{ at = $now; by = $uid; field = $fd; from = $from; to = $v; reason = $reason; po = $(if ($Ds["po"]) { [string]$Ds["po"]["code"] } else { $null }) } }
      $Ds[$fd] = $v; $lb = @{ ncc = "NCC"; eta = "Ngày về"; code = "Mã NVL" }[$fd]; $rs = $(if ($reason) { " · lý do: $reason" } else { "" })
      AddListLog $Ds "sua" ($lb + ": " + $(if ($from) { [string]$from } else { "—" }) + " → " + $(if ($v) { $v } else { "—" }) + $rs) $uid $now; $note = "Đơn mua ${no}: $lb " + $(if ($v) { $v } else { "—" }) + $rs
    } elseif ($fd -eq "qty") {
      if (@("nhap", "da-gui", "ncc-xac-nhan") -notcontains $st) { return (& $no409 "Đơn mua $no đã có hàng về: không sửa số đặt được") }
      $Ln = $null; foreach ($y in (Arr $Ds["lines"])) { if ([string]$y["id"] -eq [string]$q["ln"]) { $Ln = $y } }
      if (-not $Ln) { return @{ code = 404; body = @{ error = "Không tìm thấy dòng" } } }
      $d = 0.0; if (-not $v -or -not [double]::TryParse($v, [System.Globalization.NumberStyles]::Float, [System.Globalization.CultureInfo]::InvariantCulture, [ref]$d) -or $d -lt 0) { return (& $bad "Số đặt phải ≥ 0") }
      $from = Num $Ln["qty"]; if ([math]::Abs($from - $d) -lt 1e-9) { return (& $bad "Không có gì thay đổi") }
      if ($d -le 0 -and -not (Has $Ds["lines"] { param($l) [string]$l["id"] -ne [string]$Ln["id"] -and (Num $l["qty"]) -gt 0 })) { return (& $bad "Đơn mua phải còn ít nhất một dòng có số đặt") }
      $Ln["qty"] = $d; & $addTo "editLog" @{ at = $now; by = $uid; field = "qty"; ln = [string]$Ln["id"]; from = $from; to = $d; reason = $reason; po = $(if ($Ds["po"]) { [string]$Ds["po"]["code"] } else { $null }) }
      AddListLog $Ds "sua" ("Số đặt " + [string]$Ln["itemName"] + ": " + $from + " → " + $d + " · lý do: " + $reason) $uid $now; $note = "Đơn mua ${no}: số đặt " + [string]$Ln["itemName"] + " $from → $d · lý do: $reason"
    } elseif ($fd -eq "line-eta") {
      $Ln = $null; foreach ($y in (Arr $Ds["lines"])) { if ([string]$y["id"] -eq [string]$q["ln"]) { $Ln = $y } }
      if (-not $Ln) { return @{ code = 404; body = @{ error = "Không tìm thấy dòng" } } }
      if ($v -and $v -notmatch '^\d{4}-\d{2}-\d{2}$') { return (& $bad "Ngày không hợp lệ") }
      $from = $Ln["eta"]; if ([string]$from -eq [string]$v) { return (& $bad "Không có gì thay đổi") }
      $a = [System.Collections.ArrayList]::new(); foreach ($y in (Arr $Ln["etaLog"])) { $null = $a.Add($y) }; $null = $a.Add(@{ at = $now; by = $uid; from = $from; to = $v }); $Ln["etaLog"] = $a.ToArray()
      if ($v) { $Ln["eta"] = $v } else { $null = $Ln.Remove("eta") }
      AddListLog $Ds "sua" ("Ngày về " + [string]$Ln["itemName"] + ": " + $(if ($from) { [string]$from } else { "theo DS" }) + " → " + $(if ($v) { $v } else { "theo DS" })) $uid $now; $note = "Đơn mua ${no}: ngày về dòng " + [string]$Ln["itemName"]
    } else { return (& $bad "Trường không hợp lệ") }
  }
  elseif (@("hs", "hs-na", "hs-bo") -contains $op) {
    $t = [string]$q["type"]; if (-not $BuyDocs.Contains($t)) { return (& $bad "Loại hồ sơ không hợp lệ") }
    if (-not $g) { return (& $no409 "Đơn mua $no chưa theo quy trình PO (đơn cũ)") }
    if (-not $exOk) { return (& $deny "Chỉ người thực thi đơn mua (hoặc Admin) cập nhật hồ sơ") }
    $d = Dict $Ds["docs"]; if ($Ds["docs"] -isnot [System.Collections.IDictionary]) { $Ds["docs"] = $d }
    # 13/11/2026: phiếu nhập / hoá đơn ghi theo từng đợt kiểm nhận (op hsd). Chỉ còn bỏ được bản ghi chung cả đơn cũ
    if ($op -ne "hs-bo" -and $BuyDocT.Contains($t)) { return (& $no409 ($BuyDocT[$t] + " ghi theo từng đợt kiểm nhận (mục Hồ sơ từng đợt nhận)")) }
    if ($op -eq "hs") {
      $sn = ([string]$q["no"]).Trim(); $nt = ([string]$q["note"]).Trim(); if (-not $sn) { return (& $bad "Ghi số chứng từ (bằng chứng): chưa có chứng từ thì chưa ghi nhận") }
      if ($d[$t]) { return @{ code = 409; body = @{ error = ($BuyDocs[$t] + " đã được ghi nhận. Bỏ ghi nhận trước nếu cần sửa"); dup = $true } } }
      $d[$t] = @{ at = $now; by = $uid; no = $sn; note = $nt }; $lg = $BuyDocs[$t] + $(if ($sn) { " số $sn" } else { "" }) + $(if ($nt) { " · $nt" } else { "" })
    } elseif ($op -eq "hs-na") {
      if ($t -ne "dntt" -and -not $adm) { return (& $deny "Chỉ Admin đánh dấu không áp dụng cho loại hồ sơ này") }
      if (-not $reason) { return (& $bad "Ghi lý do không áp dụng") }
      if ($d[$t]) { return (& $no409 ($BuyDocs[$t] + " đã được ghi nhận")) }
      $d[$t] = @{ at = $now; by = $uid; na = $true; reason = $reason }; $lg = $BuyDocs[$t] + ": không áp dụng · " + $reason
    } else {
      if (-not $d[$t]) { return (& $no409 ($BuyDocs[$t] + " chưa ghi nhận")) }
      if ($d[$t]["na"] -and $t -ne "dntt" -and -not $adm) { return (& $deny "Chỉ Admin bỏ đánh dấu không áp dụng cho loại hồ sơ này") }
      if (BuyHandPend $Ds) { return (& $no409 "Đang chờ xác nhận bàn giao hồ sơ: huỷ ghi nhận bàn giao trước khi sửa hồ sơ") }
      if (-not $reason) { return (& $bad "Ghi lý do bỏ ghi nhận") }
      $prev = $d[$t]; $null = $d.Remove($t); $lg = "Bỏ ghi nhận " + $BuyDocs[$t] + " · " + $reason
    }
    & $addTo "docLog" @{ at = $now; by = $uid; act = $op; type = $t; no = ([string]$q["no"]).Trim(); note = ([string]$q["note"]).Trim(); reason = $reason }
    AddListLog $Ds $op $lg $uid $now; $note = "Hồ sơ đơn mua ${no}: $lg"
  }
  # Hồ sơ từng đợt kiểm nhận (anh duyệt 13/11/2026). Không đụng tồn kho, chỉ ghi chứng từ.
  elseif (@("hsd", "hsd-na", "hsd-bo") -contains $op) {
    $t = [string]$q["type"]; if (-not $BuyDocT.Contains($t)) { return (& $bad "Loại chứng từ không hợp lệ") }
    if (-not $g) { return (& $no409 "Đơn mua $no chưa theo quy trình PO (đơn cũ)") }
    if (-not $exOk) { return (& $deny "Chỉ người thực thi đơn mua (hoặc Admin) cập nhật hồ sơ") }
    if ((Dict $Ds["docs"])[$t]) { return (& $no409 ($BuyDocT[$t] + " của đơn này đã ghi chung cả đơn (cách cũ). Bỏ ghi nhận chung trước nếu muốn ghi theo đợt")) }
    $all = BuyBatches $Ds; $ids = StrArr (Arr $q["batches"])
    if (-not $ids.Count) { return (& $bad "Chọn ít nhất 1 đợt kiểm nhận") }
    foreach ($b in $ids) { if (-not (Has $all { param($x) $x["id"] -eq $b })) { return (& $bad "Không tìm thấy đợt kiểm nhận $b (chỉ đợt đã kiểm nhận đạt)") } }
    $code = { param($b) $i = 0; foreach ($x in ($all | Sort-Object { [double]$_["at"] })) { $i++; if ($x["id"] -eq $b) { return "$no-Đ$i" } }; return $b }
    $L = [System.Collections.ArrayList]::new(); foreach ($x in (Arr $Ds["bdocs"])) { $null = $L.Add($x) }
    if ($op -eq "hsd" -or $op -eq "hsd-na") {
      $sn = ([string]$q["no"]).Trim(); $nt = ([string]$q["note"]).Trim()
      if ($op -eq "hsd" -and -not $sn) { return (& $bad "Ghi số chứng từ (bằng chứng): chưa có chứng từ thì chưa ghi nhận") }
      if ($op -eq "hsd-na") { if (-not $adm) { return (& $deny "Chỉ Admin đánh dấu không áp dụng cho phiếu nhập / hoá đơn") }; if (-not $reason) { return (& $bad "Ghi lý do không áp dụng") } }
      $has = @($ids | Where-Object { BuyBatchDoc $Ds $_ $t })
      if ($has.Count) { $x0 = BuyBatchDoc $Ds $has[0] $t; return @{ code = 409; body = @{ error = ("Đợt " + (& $code $has[0]) + " đã có " + $BuyDocT[$t].ToLower() + $(if ($x0["na"]) { " (không áp dụng)" } else { " số " + [string]$x0["no"] }) + ". Bỏ ra khỏi đợt trước nếu cần sửa"); dup = $true } } }
      $ex0 = $null; if ($op -eq "hsd") { foreach ($x in $L) { if ([string]$x["t"] -eq $t -and -not $x["na"] -and ([string]$x["no"]).Trim().ToLower() -eq $sn.ToLower()) { $ex0 = $x } } }
      if ($ex0) {   # NCC xuất gộp: cùng số chứng từ → gắn thêm đợt, không tạo chứng từ mới
        $bs = [System.Collections.ArrayList]::new(); foreach ($y in (Arr $ex0["batches"])) { $null = $bs.Add([string]$y) }; foreach ($b in $ids) { $null = $bs.Add($b) }; $ex0["batches"] = $bs.ToArray()
        $lg = $BuyDocT[$t] + " số ${sn}: gắn thêm đợt " + (($ids | ForEach-Object { & $code $_ }) -join ", ") + " (chứng từ gộp)"
      } else {
        $e = @{ id = "bd" + $now; t = $t; batches = (StrArr $ids); by = $uid; at = $now }
        if ($op -eq "hsd") { $e["no"] = $sn; $e["note"] = $nt } else { $e["na"] = $true; $e["reason"] = $reason }
        $null = $L.Add($e); $lg = $BuyDocT[$t] + $(if ($op -eq "hsd") { " số $sn" + $(if ($nt) { " · $nt" } else { "" }) } else { ": không áp dụng · $reason" }) + " · đợt " + (($ids | ForEach-Object { & $code $_ }) -join ", ")
      }
    } else {
      if (BuyHandPend $Ds) { return (& $no409 "Đang chờ xác nhận bàn giao hồ sơ: huỷ ghi nhận bàn giao trước khi sửa hồ sơ") }
      if (-not $reason) { return (& $bad "Ghi lý do bỏ ghi nhận") }
      $parts = @()
      foreach ($b in $ids) { $x = BuyBatchDoc $Ds $b $t; if (-not $x) { continue }
        if ($x["na"] -and -not $adm) { return (& $deny "Chỉ Admin bỏ đánh dấu không áp dụng") }
        $keep = [System.Collections.ArrayList]::new(); foreach ($y in (Arr $x["batches"])) { if ([string]$y -ne $b) { $null = $keep.Add([string]$y) } }; $x["batches"] = $keep.ToArray(); $parts += (& $code $b) }
      if (-not $parts.Count) { return (& $no409 "Các đợt đã chọn chưa có chứng từ loại này") }
      $L = [System.Collections.ArrayList]::new(); foreach ($x in (Arr $Ds["bdocs"])) { if ((Arr $x["batches"]).Count) { $null = $L.Add($x) } }
      $lg = "Bỏ " + $BuyDocT[$t].ToLower() + " khỏi đợt " + ($parts -join ", ") + " · " + $reason
    }
    $Ds["bdocs"] = $L.ToArray()
    & $addTo "bdocLog" @{ at = $now; by = $uid; act = $op; type = $t; no = ([string]$q["no"]).Trim(); batches = (StrArr $ids); reason = $reason }
    AddListLog $Ds $op $lg $uid $now; $note = "Hồ sơ đợt đơn mua ${no}: $lg"
  }
  # Bàn giao hồ sơ 2 bước (anh duyệt 11/11, như đơn sản xuất): bước 1 người thực thi ghi nhận (người nhận, giờ, bằng chứng) →
  # bước 2 người nhận có tài khoản tự xác nhận; chưa có tài khoản thì Admin kiểm tra bằng chứng rồi xác nhận thay. Chỉ hoàn tất sau bước 2.
  elseif ($op -eq "bg") {
    if (-not $exOk) { return (& $deny "Chỉ người thực thi đơn mua (hoặc Admin) ghi nhận bàn giao hồ sơ") }
    if (-not $g) { return (& $no409 "Đơn mua $no chưa theo quy trình PO (đơn cũ)") }
    $hp = BuyHandPend $Ds; if ($hp) { return @{ code = 409; body = @{ error = ("Đơn mua $no đã được " + (& $who $hp["by"]) + " ghi nhận bàn giao cho " + [string]$hp["to"] + " lúc " + (& $hm $hp["at"]) + ", đang chờ xác nhận. Không ghi lại."); dup = $true } } }
    if ($st -ne "da-nhan") { return (& $no409 "Đơn mua $no chưa nhận đủ NVL (Kho kiểm nhận): chưa bàn giao hồ sơ được") }
    $mi = BuyDocsMissing $Ds; if ($mi.Count) { return (& $no409 ("Chưa đủ hồ sơ: " + ($mi -join ", "))) }
    $tu = ([string]$q["toUser"]).Trim(); $to = ([string]$q["to"]).Trim(); $ev = ([string]$q["evidence"]).Trim()
    if ($tu) { $u = (LoadUsers) | Where-Object { $_["id"] -eq $tu -and $_["active"] } | Select-Object -First 1
      if (-not $u) { return (& $bad "Không tìm thấy tài khoản người nhận") }
      if ($tu -eq $uid) { return (& $bad "Người nhận phải là người khác người giao") }
      $to = [string]$u["name"] }
    elseif (-not $to) { return (& $bad "Chọn tài khoản người nhận, hoặc ghi tên người / bộ phận nhận hồ sơ") }
    elseif (-not $ev) { return (& $bad "Người nhận chưa có tài khoản: ghi bằng chứng bàn giao (ảnh ký nhận, tin nhắn xác nhận…)") }
    & $addTo "handovers" @{ id = "bg" + $now; state = "cho"; at = $now; by = $uid; to = $to; toUser = $(if ($tu) { $tu } else { $null }); evidence = $ev }
    AddListLog $Ds "bg" ("Ghi nhận bàn giao hồ sơ cho " + $to + $(if ($tu) { " (tài khoản)" } else { "" }) + $(if ($ev) { " · " + $ev } else { "" }) + " · chờ xác nhận") $uid $now; $note = "Ghi nhận bàn giao hồ sơ đơn mua $no cho $to · chờ xác nhận"
  }
  elseif ($op -eq "bg-xn") {
    $hp = BuyHandPend $Ds; if (-not $hp) { return @{ code = 409; body = @{ error = "Đơn mua $no không có bàn giao đang chờ xác nhận (có thể vừa được xác nhận / huỷ)"; dup = $true } } }
    if ($hp["toUser"]) { if ([string]$hp["toUser"] -ne $uid) { return (& $deny ("Chỉ " + [string]$hp["to"] + " (người nhận) xác nhận được bằng tài khoản của mình")) } }
    elseif (-not $adm) { return (& $deny "Người nhận chưa có tài khoản: Admin kiểm tra bằng chứng rồi xác nhận") }
    $hp["state"] = "xn"; $hp["confirmAt"] = $now; $hp["confirmBy"] = $uid
    $why = @(); if ($st -ne "da-nhan") { $why += "chưa nhận đủ NVL" }; $mi = BuyDocsMissing $Ds; if ($mi.Count) { $why += "thiếu hồ sơ" }; if (-not $Ds["qlvh"]) { $why += "chưa có xác nhận QLVH" }
    $lb = $(if ($hp["toUser"]) { "Người nhận xác nhận đã nhận hồ sơ" } else { "Admin xác nhận bàn giao hợp lệ (người nhận chưa có tài khoản)" })
    if (-not $why.Count) { $Ds["doneAt"] = $now; $Ds["doneBy"] = $uid; $lb += " · Hoàn tất đơn mua" }
    AddListLog $Ds "bg-xn" $lb $uid $now; $note = "Xác nhận nhận hồ sơ đơn mua $no (" + [string]$hp["to"] + ")" + $(if ($Ds["doneAt"]) { " · Hoàn tất" } else { "" })
  }
  elseif ($op -eq "bg-huy") {
    $hp = BuyHandPend $Ds; if (-not $hp) { return (& $no409 "Không có bàn giao đang chờ xác nhận") }
    if (-not ($adm -or [string]$hp["by"] -eq $uid)) { return (& $deny "Chỉ người ghi nhận hoặc Admin huỷ được") }
    if (-not $reason) { return (& $bad "Ghi lý do huỷ ghi nhận") }
    $hp["state"] = "huy"; $hp["cancelAt"] = $now; $hp["cancelBy"] = $uid; $hp["reason"] = $reason
    AddListLog $Ds "bg-huy" ("Huỷ ghi nhận bàn giao cho " + [string]$hp["to"] + " · " + $reason) $uid $now; $note = "Huỷ ghi nhận bàn giao đơn mua $no · lý do: $reason"
  }
  elseif ($op -eq "xong") {
    if (-not $exOk) { return (& $deny "Chỉ người thực thi đơn mua (hoặc Admin)") }
    if (-not $g) { return (& $no409 "Đơn mua $no chưa theo quy trình PO (đơn cũ)") }
    $why = @(); if ($st -ne "da-nhan") { $why += "chưa nhận đủ NVL (Kho kiểm nhận)" }
    $mi = BuyDocsMissing $Ds; if ($mi.Count) { $why += ("thiếu hồ sơ: " + ($mi -join ", ")) }
    if (-not $Ds["qlvh"]) { $why += "chưa có xác nhận QLVH" }
    if (BuyHandPend $Ds) { $why += "bàn giao hồ sơ đang chờ người nhận xác nhận" } elseif (-not (BuyHandOk $Ds)) { $why += "chưa bàn giao hồ sơ (người nhận xác nhận)" }
    if ($why.Count) { return (& $no409 ("Chưa hoàn tất được đơn mua ${no}: " + ($why -join "; "))) }
    $Ds["doneAt"] = $now; $Ds["doneBy"] = $uid; AddListLog $Ds "xong" "Giao nhận + hồ sơ hợp lệ, đã xác nhận bàn giao" $uid $now; $note = "Hoàn tất đơn mua $no"
  }
  elseif ($op -eq "mo-lai") {
    if (-not $adm) { return (& $deny "Chỉ Admin mở lại đơn mua đã hoàn tất") }
    if (-not $Ds["doneAt"]) { return (& $no409 "Đơn mua $no chưa hoàn tất") }
    if (-not $reason) { return (& $bad "Ghi lý do mở lại") }
    $null = $Ds.Remove("doneAt"); $null = $Ds.Remove("doneBy"); AddListLog $Ds "mo-lai" $reason $uid $now; $note = "Mở lại đơn mua $no · lý do: $reason"
  }
  # UX V5 (anh duyệt 13/11/2026): tận dụng "Báo vướng mắc" cho đơn mua NVL. Không thêm bước duyệt, không đổi quyền:
  # người thực thi / người quản lý kế hoạch của mã / Admin báo; người quản lý kế hoạch hoặc Admin nhận xử lý và giải quyết
  elseif ($op -eq "vuong-bao") {
    if (-not ($exOk -or $isOwn)) { return (& $deny "Chỉ người thực thi, người quản lý kế hoạch của mã hoặc Admin") }
    $tx = ([string]$q["text"]).Trim(); if (-not $tx) { return (& $bad "Ghi nội dung vướng mắc") }
    $vid = "v" + $now; if (Has $Ds["vuong"] { param($e) [string]$e["id"] -eq $vid }) { $vid = $vid + "b" }
    $vx = VuongNew $vid $now $uid $tx $q; & $addTo "vuong" $vx
    AddListLog $Ds "vuong" ($tx + (VuongTag $vx)) $uid $now; $note = "Báo vướng mắc đơn mua ${no}: $tx" + (VuongTag $vx)
  }
  elseif ($op -eq "vuong-nhan" -or $op -eq "vuong-xong") {
    if (-not ($adm -or $isOwn)) { return (& $deny "Chỉ người quản lý kế hoạch (phụ trách mã) hoặc Admin xử lý vướng mắc") }
    $v = $null; foreach ($e in (Arr $Ds["vuong"])) { if ([string]$e["id"] -eq [string]$q["vid"]) { $v = $e } }
    if (-not $v) { return @{ code = 404; body = @{ error = "Không tìm thấy vướng mắc" } } }
    if ($op -eq "vuong-nhan") {
      if ([string]$v["state"] -ne "mo") { return @{ code = 409; body = @{ error = "Vướng mắc này đã được nhận xử lý hoặc đã giải quyết"; dup = $true } } }
      $v["state"] = "dang"; $v["nhanAt"] = $now; $v["nhanBy"] = $uid; AddListLog $Ds "vuong-nhan" ([string]$v["text"]) $uid $now; $note = "Đang xử lý vướng mắc đơn mua ${no}: " + [string]$v["text"]
    } else {
      if ([string]$v["state"] -eq "xong") { return @{ code = 409; body = @{ error = "Vướng mắc này đã được xử lý"; dup = $true } } }
      $v["state"] = "xong"; $v["doneAt"] = $now; $v["doneBy"] = $uid; $v["reply"] = ([string]$q["reply"]).Trim()
      AddListLog $Ds "vuong-xong" ([string]$v["text"] + $(if ($v["reply"]) { " → " + [string]$v["reply"] } else { "" })) $uid $now; $note = "Xử lý vướng mắc đơn mua ${no}: " + [string]$v["text"]
    }
  }
  else { return (& $bad "Thao tác không hợp lệ") }
  $body = J $nv
  $stamp = SaveKey "nvl-v3" $body $rev "ds-op" $uid
  LogSave "nvl-v3" $oldN $nv $me "ds-op" $rev $reason $false
  LogEvent ("ds-" + $op) $me $note @{ ds = [string]$Ds["id"]; code = $no }
  return @{ code = 200; body = @{ ok = $true; rev = $rev; savedAt = $stamp; value = $nv } }
}
# ===== V3 · QLVH duyệt PO (anh duyệt 30/10): chỉ server ghi o.qlvh / o.qlvhLog, qua /api/don/op =====
# Đơn chốt từ V3 (flow 3, cả gia công / FOB / thêu / phôi): Chốt → nhập mã PO ERP → Chờ QLVH duyệt → "QLVH đã duyệt" → Đang sản xuất.
# Planning chỉ GHI NHẬN việc QLVH đã duyệt PO trên ERP, không tạo / sửa PO. Lưu thường (PUT) không thêm / sửa / xoá được xác nhận này;
# đơn chưa được xác nhận thì không có gửi xưởng, xưởng xác nhận, bắt đầu, ghi nhận giao. Đơn chốt trước V3 (flow 2 / cũ) giữ nguyên.
$QlvhKeep = @("qlvh", "qlvhLog", "handover", "handoverLog", "doneAt", "doneBy", "exec", "vuong", "execLog")   # V5 (10/11/2026): người thực thi + vướng mắc cũng chỉ server ghi · V5.3: lịch sử bàn giao / tiếp nhận / trả lại
# ===== V5.3 (anh duyệt 14/11/2026): Chốt → Bàn giao → Tiếp nhận / Trả lại =====
# Chốt KHÔNG tự giao người thực thi. Người quản lý kế hoạch (phụ trách mã) / Admin bấm "Bàn giao" (op ban-giao) → o.exec = {user, at, by, v = 2}.
# Người thực thi bấm Tiếp nhận (nhan-viec) hoặc Trả lại có lý do (tra-lai). Đơn bàn giao theo V5.3 (v = 2) chỉ được thực thi sau khi đã tiếp nhận.
# Đơn giao trước V5.3 (không có v) giữ nguyên quy tắc cũ. Mã nhận diện trên giao diện = PO 2 (VIKING → Xưởng); o.code giữ làm mã nội bộ.
$XgName = @{ hoa = "Anh Hòa"; mien = "Anh Miên"; hoang = "Anh Hoàng"; hung = "Anh Hùng"; theu = "Thêu thành phẩm"; phoi = "Phôi" }
function OrdLbl($o, [string]$mk) {
  $p = ([string]$o["erpCode2"]).Trim(); if ($p) { return "PO $p" }
  $x = $(if ($o["type"]) { [string]$o["type"] } else { [string]$o["xuong"] }); $xn = $(if ($XgName.ContainsKey($x)) { $XgName[$x] } else { $x })
  $d = [string]$o["date"]; $dd = $(if ($d -match '^\d{4}-(\d{2})-(\d{2})$') { $Matches[2] + "/" + $Matches[1] } else { $d })
  return ("kế hoạch " + $(if ($mk) { "$mk · " } else { "" }) + $xn + $(if ($dd) { " · lập $dd" } else { "" }))
}
# Người thực thi đã được phép làm phần thực thi? (đơn V5.3: phải tiếp nhận, chưa trả lại)
# ===== V5.4 Đợt 3 · Báo cáo cuối ngày: nguyên nhân theo từng đơn trễ (X5, R2 = A có điều kiện: R2a, R2b) =====
# Đơn trễ của người gửi = đơn họ thực thi, đã chốt, chưa huỷ, chưa chốt giao nhận, đã qua ngày xưởng hẹn giao (so với ngày báo cáo).
# Nguyên nhân hợp lệ CHỈ: (1) vướng mắc đang mở của chính đơn đó (server tự ghi nguồn, khoá), hoặc (2) nguyên nhân người gửi nhập cho đúng mã đơn đó.
# Ghi chú gọi xưởng không bao giờ được tính; không dùng từ khoá; không lấy nguyên nhân báo cáo hôm trước; nguyên nhân của đơn A không dùng cho đơn B.
function CauseCheck([string]$uid, [string]$dt, $given) {
  $pf = Join-Path $DataDir "kehoach-sx-v3.json"; $plan = $(if (Test-Path $pf) { Val ([System.IO.File]::ReadAllText($pf, $utf8)) } else { @{} })
  $out = @{}; $miss = [System.Collections.ArrayList]::new(); $now = NowMs
  foreach ($mk in @((Dict $plan["models"]).Keys)) { $p = $plan["models"][$mk]; foreach ($o in ((Arr $p["orders"]) + (Arr $p["gapOrders"]))) {   # Arr trả mảng bọc 1 lớp: dùng thẳng, không @(…)
    if ($o -isnot [System.Collections.IDictionary]) { continue }
    if ((ExecOf $o) -ne $uid -or -not $o["closed"] -or $o["cancelled"] -or $o["arrived"] -or -not $o["dueDate"] -or [string]$o["dueDate"] -ge $dt) { continue }
    $id = [string]$o["id"]; $cd = $(if ($o["erpCode2"]) { "PO " + [string]$o["erpCode2"] } elseif ($o["code"]) { [string]$o["code"] } else { $id })
    $vo = $null; foreach ($e in (Arr $o["vuong"])) { if ($e -is [System.Collections.IDictionary] -and [string]$e["state"] -ne "xong" -and (-not $vo -or [int64]$e["at"] -gt [int64]$vo["at"])) { $vo = $e } }
    if ($vo) { $out[$id] = @{ src = "vuong"; vid = [string]$vo["id"]; text = [string]$vo["text"]; vAt = $vo["at"]; vBy = [string]$vo["by"]; code = $cd; due = [string]$o["dueDate"] }; continue }
    $g = (Dict $given)[$id]; $tx = $(if ($g -is [System.Collections.IDictionary]) { ([string]$g["text"]).Trim() } else { ([string]$g).Trim() })
    if ($tx) { $out[$id] = @{ src = "nv"; text = $tx; at = $now; by = $uid; code = $cd; due = [string]$o["dueDate"] } } else { $null = $miss.Add(@{ id = $id; code = $cd }) }
  } }
  return @{ causes = $out; miss = $miss }
}
# ===== V5.4 Đợt 3 (anh chốt 17/11/2026) =====
# Q7: trả lại phải chọn 1 trong 5 nhóm lý do + ghi chú. Q6 / UX3: checklist tiếp nhận chỉ gồm dữ liệu đầu vào, server tự lập theo đơn:
#   số lượng · xưởng & loại đơn · ngày hẹn · NVL (chỉ đơn gia công Hòa / Miên, không phải thêu / phôi) · chốt ngoại lệ (chỉ khi đơn có) · Tech Pack / mẫu & ghi chú.
#   Không mục nào là PO / gửi xưởng / chứng từ. Đơn mua NVL vẫn tiếp nhận 1 nút (X2).
$TraGroups = [ordered]@{ "so-luong" = "Sai số lượng"; "nvl" = "Thiếu NVL"; "techpack" = "Thiếu Tech Pack / mẫu"; "xuong-ngay" = "Sai xưởng / ngày hẹn"; "khac" = "Khác" }
$CheckT = @{ "so-luong" = "Số lượng màu × size và tổng áo đúng"; "xuong" = "Xưởng và loại đơn đúng"; "ngay" = "Ngày hẹn giao khả thi"; "nvl" = "NVL đủ / đã giữ"; "ngoai-le" = "Đã đọc chốt ngoại lệ thiếu NVL"; "techpack" = "Có Tech Pack / thông tin mẫu và ghi chú gửi xưởng" }
function CheckReq($o) {
  $L = [System.Collections.ArrayList]::new(); foreach ($k in @("so-luong", "xuong", "ngay")) { $null = $L.Add($k) }
  if ((@("hoa", "mien") -contains [string]$o["xuong"]) -and -not $o["type"]) { $null = $L.Add("nvl") }
  if ($o["chotOverride"] -is [System.Collections.IDictionary]) { $null = $L.Add("ngoai-le") }
  $null = $L.Add("techpack"); return ,$L.ToArray()
}
function ExecReady($o) { $e = $o["exec"]; if ($e -isnot [System.Collections.IDictionary]) { return $false }; if ($e["traAt"]) { return $false }; if ((Num $e["v"]) -eq 2 -and -not $e["ackAt"]) { return $false }; return $true }
function ExecLogAdd($o, $e) { $L = [System.Collections.ArrayList]::new(); foreach ($y in (Arr $o["execLog"])) { $null = $L.Add($y) }; $null = $L.Add($e); $o["execLog"] = $L.ToArray() }
# ===== V5 · Phân công theo công đoạn (anh duyệt 10/11/2026) =====
# Chốt đơn → server tự giao người thực thi mặc định (danh mục: exec.user). Người thực thi (nhân viên) được sửa PHẦN THỰC THI của đơn được giao
# (PO, gửi xưởng, tiến độ, giao nhận, QC, chứng từ), không sửa phần kế hoạch (số lượng, màu, size, xưởng…), không thêm / xoá đơn.
$ExecFields = @("check", "erpCode", "erpAt", "erpBy", "erpCode2", "erpAt2", "erpBy2", "sentAt", "sentBy", "ackAt", "ackBy", "ackNote", "startedAt", "startedBy", "dueDate", "calls", "receipts", "recvClose", "recvLog", "arrived", "ctu", "ctuLog", "sixmen")
function ExecDefault() {
  $f = Join-Path $DataDir "danhmuc-v1.json"; if (-not (Test-Path $f)) { return $null }
  $c = Val ([System.IO.File]::ReadAllText($f, $utf8)); $id = [string]((Dict (Dict $c)["exec"])["user"]); if (-not $id) { return $null }
  $u = (LoadUsers) | Where-Object { $_["id"] -eq $id -and $_["active"] } | Select-Object -First 1
  if ($u) { return $id } else { return $null }
}
function ExecOf($o) { return [string]((Dict $o["exec"])["user"]) }
# Thay đổi của 1 mã chỉ nằm trong phần thực thi của các đơn giao cho $uid?
function ExecOnly($b, $m, [string]$uid) {
  $b = Dict $b; $m = Dict $m
  foreach ($k in (Uniq (@($b.Keys) + @($m.Keys)))) { if (@("orders", "gapOrders") -contains $k) { continue }; if ((J $b[$k]) -ne (J $m[$k])) { return $false } }
  foreach ($sec in @("orders", "gapOrders")) {
    $bi = ById $b[$sec]; $mi = ById $m[$sec]
    if (((@($bi.Keys) | ForEach-Object { [string]$_ } | Sort-Object) -join "|") -ne ((@($mi.Keys) | ForEach-Object { [string]$_ } | Sort-Object) -join "|")) { return $false }   # không thêm / xoá đơn
    foreach ($id in @($mi.Keys)) {
      $x = $bi[$id]; $y = $mi[$id]; if ((J $x) -eq (J $y)) { continue }
      if ((ExecOf $x) -ne $uid -or -not (ExecReady $x) -or -not $x["closed"] -or $x["cancelled"]) { return $false }
      foreach ($f in (Uniq (@($x.Keys) + @($y.Keys)))) { if (($ExecFields -notcontains $f) -and ($QlvhKeep -notcontains $f) -and ((J $x[$f]) -ne (J $y[$f]))) { return $false } }
    }
  }
  return $true
}
# Gộp 1 mã khi 2 người cùng sửa: khác đơn / khác mục → gộp; cùng 1 đơn (hoặc cùng 1 mục) mà khác nhau → $null (xung đột)
function ModelMerge($b, $m, $c) {
  $b = Dict $b; $m = Dict $m; $w = $JS.DeserializeObject((J (Dict $c)))
  foreach ($k in (Uniq (@($b.Keys) + @($m.Keys) + @($w.Keys)))) {
    $jb = J $b[$k]; $jm = J $m[$k]; $jc = J $w[$k]
    if ($jm -eq $jb -or $jm -eq $jc) { continue }
    if ($jc -eq $jb) { if ($m.ContainsKey($k)) { $w[$k] = $m[$k] } else { $null = $w.Remove($k) }; continue }
    if (@("orders", "gapOrders") -contains $k) { $lm = ListMerge $b[$k] $m[$k] $w[$k] $null; if ($null -eq $lm) { return $null }; $w[$k] = $lm.ToArray(); continue }
    return $null
  }
  return $w
}   # V3 GĐ6: bàn giao hồ sơ / hoàn tất cũng chỉ server ghi
# ===== V3 GĐ6 · Chứng từ + bàn giao hồ sơ (anh duyệt 30/10) =====
# 4 loại chứng từ theo dõi riêng: PO ERP (lấy từ xác nhận QLVH, không tạo PO thứ hai) + o.ctu.{dntt, pgh, vat}.list[{id, status chua|dang|xong, ref, owner, doneDate, note}]
# Admin đánh dấu "Không áp dụng" (o.ctu.<loại>.na, bắt buộc lý do). 5 bước hoá đơn theo từng lần giao giữ nguyên.
# Bàn giao: ghi nhận (o.handover.state "cho") → bên nhận xác nhận bằng tài khoản, hoặc Admin xác nhận hợp lệ khi bên nhận chưa có tài khoản → mới Hoàn tất.
$DocKeys = @("bao_xuong", "hd_xuong", "nhan_hd", "bao_kt", "hd_viking")
$CtuTypes = [ordered]@{ dntt = "Giấy đề nghị thanh toán"; pgh = "Phiếu giao hàng"; vat = "Hoá đơn VAT" }
function FinishErr($o) {
  if ($o["cancelled"]) { return "Đơn đã huỷ" }
  if (-not $o["arrived"]) { return "Chưa chốt giao nhận" }
  $n = 0
  foreach ($r in (Arr $o["receipts"])) {
    if ($r -isnot [System.Collections.IDictionary] -or $r["void"]) { continue }; $n++
    foreach ($k in $DocKeys) { $d = (Dict $r["docs"])[$k]; if (-not ($d -is [System.Collections.IDictionary] -and $d["at"])) { return "Lần giao còn thiếu bước hoá đơn" } }
  }
  if ($n -eq 0) { return "Chưa có lần giao" }
  if ((Num $o["flow"]) -eq 3) {
    if (-not $o["qlvh"]) { return "Chưa có PO ERP đã được QLVH duyệt" }
    $ct = Dict $o["ctu"]
    foreach ($t in @($CtuTypes.Keys)) {
      $x = Dict $ct[$t]; if ($x["na"]) { continue }
      $L = Arr $x["list"]; if ($L.Count -eq 0) { return ($CtuTypes[$t] + " chưa có") }
      foreach ($i in $L) { if ([string]$i["status"] -ne "xong" -or -not $i["doneDate"]) { return ($CtuTypes[$t] + " chưa hoàn thành") } }
    }
  }
  return $null
}
function PlanOrders($plan) {
  $L = [System.Collections.ArrayList]::new()
  if ($plan -isnot [System.Collections.IDictionary] -or $plan["models"] -isnot [System.Collections.IDictionary]) { return ,$L }
  foreach ($mk in @($plan["models"].Keys)) { $p = $plan["models"][$mk]; if ($p -isnot [System.Collections.IDictionary]) { continue }
    foreach ($sec in @("orders", "gapOrders")) { foreach ($o in (Arr $p[$sec])) { if ($o -is [System.Collections.IDictionary]) { $null = $L.Add(@{ m = [string]$mk; o = $o; gap = ($sec -eq "gapOrders") }) } } } }
  return ,$L
}
function LiveRecv($o) { return Has $o["receipts"] { param($r) ($r -is [System.Collections.IDictionary]) -and -not $r["void"] } }
# Sửa bản sắp lưu cho đúng quy tắc QLVH; trả về lỗi (đơn chưa duyệt mà có tiến độ sản xuất) + có sửa gì không
function GuardPlan($cur, $final, $me) {
  $err = [System.Collections.ArrayList]::new(); $chg = $false
  $co = @{}; foreach ($x in (PlanOrders $cur)) { $co[[string]$x.o["id"]] = $x.o }
  foreach ($x in (PlanOrders $final)) {
    $o = $x.o; $c = $co[[string]$o["id"]]
    foreach ($f in $QlvhKeep) { $cv = $null; if ($c) { $cv = $c[$f] }; if ((J $o[$f]) -ne (J $cv)) { $chg = $true; if ($null -ne $cv) { $o[$f] = $cv } else { $null = $o.Remove($f) } } }   # 18/11/2026 (anh duyệt): không dùng $(...) — mảng 1 phần tử (qlvhLog, execLog, vuong…) bị mở thành đối tượng, giống lỗi đã sửa ở dòng 808
    # "Không áp dụng" một loại chứng từ: chỉ Admin
    if ($me -and $me["role"] -ne "admin") { foreach ($t in @($CtuTypes.Keys)) {
      $cn = $(if ($c) { (Dict (Dict $c["ctu"])[$t])["na"] } else { $null }); $on = (Dict (Dict $o["ctu"])[$t])["na"]
      if ((J $on) -ne (J $cn)) { $chg = $true
        if ($o["ctu"] -isnot [System.Collections.IDictionary]) { $o["ctu"] = @{} }; if ($o["ctu"][$t] -isnot [System.Collections.IDictionary]) { $o["ctu"][$t] = @{} }
        if ($null -ne $cn) { $o["ctu"][$t]["na"] = $cn } else { $null = $o["ctu"][$t].Remove("na") } } } }
    # V5.3 (anh duyệt 14/11): chốt ngoại lệ khi thiếu NVL gia công: chỉ Admin ghi / sửa
    if ($me -and $me["role"] -ne "admin") { $cv = $(if ($c) { $c["chotOverride"] } else { $null }); if ((J $o["chotOverride"]) -ne (J $cv)) { $chg = $true; if ($null -ne $cv) { $o["chotOverride"] = $cv } else { $null = $o.Remove("chotOverride") } } }
    if ($c -and $c["qlvh"]) { foreach ($f in @("erpCode", "erpAt", "erpBy", "erpCode2", "erpAt2", "erpBy2")) { if ((J $o[$f]) -ne (J $c[$f])) { $chg = $true; if ($null -ne $c[$f]) { $o[$f] = $c[$f] } else { $null = $o.Remove($f) } } } }   # mã PO đã duyệt: chỉ Admin đính chính
    # đơn vừa chốt (kể cả từ trang cũ chưa tải lại) / đơn gấp mới không ghi quy trình → luôn theo V3. Đơn mới ghi rõ quy trình cũ (dữ liệu nhập lại) giữ nguyên
    $justClosed = $o["closed"] -and (($c -and -not $c["closed"]) -or (-not $c -and $null -eq $o["flow"]))
    # V5.3 (14/11/2026): chốt KHÔNG tự giao người thực thi nữa — Đăng Nam bấm "Bàn giao" riêng (op ban-giao)
    if ($justClosed -and (Num $o["flow"]) -ne 3) { $o["flow"] = 3; $chg = $true }
    if ($c -and (Num $c["flow"]) -eq 3 -and (Num $o["flow"]) -ne 3) { $o["flow"] = 3; $chg = $true }     # không hạ quy trình
    if ((Num $o["flow"]) -eq 3 -and $o["closed"] -and -not $o["qlvh"] -and -not $o["cancelled"]) {
      $b = @(); if ($o["sentAt"]) { $b += "gửi xưởng" }; if ($o["ackAt"]) { $b += "xưởng xác nhận" }; if ($o["startedAt"]) { $b += "xưởng bắt đầu" }; if ((LiveRecv $o) -or $o["arrived"]) { $b += "ghi nhận giao" }
      if ($b.Count) { $null = $err.Add("Đơn " + (OrdLbl $o $x.m) + " chưa được xác nhận QLVH duyệt PO nên chưa " + ($b -join ", ")) }
    }
    # 2 PO ERP (anh yêu cầu 06/11): gửi xưởng mới phải đủ 2 mã PO; đơn đã gửi từ trước giữ nguyên
    if ((Num $o["flow"]) -eq 3 -and $o["sentAt"] -and -not ($c -and $c["sentAt"]) -and -not $o["cancelled"] -and -not (([string]$o["erpCode"]).Trim() -and ([string]$o["erpCode2"]).Trim())) { $null = $err.Add("Đơn " + (OrdLbl $o $x.m) + " chưa đủ 2 mã PO ERP nên chưa gửi xưởng") }
  }
  return @{ err = $err; changed = $chg }
}
function DonOp($me, $q) {
  $op = [string]$q["op"]; $oid = [string]$q["oid"]; $model = [string]$q["model"]; $reason = ([string]$q["reason"]).Trim(); $po = ([string]$q["po"]).Trim()
  $pf = Join-Path $DataDir "kehoach-sx-v3.json"
  if (-not (Test-Path $pf)) { return @{ code = 404; body = @{ error = "Chưa có dữ liệu Kế hoạch" } } }
  $old = Val ([System.IO.File]::ReadAllText($pf, $utf8)); $plan = $JS.DeserializeObject((J $old)); $rev = (CurrentRev $pf) + 1
  $o = $null; foreach ($x in (PlanOrders $plan)) { if ($x.m -eq $model -and [string]$x.o["id"] -eq $oid) { $o = $x.o } }
  if (-not $o) { return @{ code = 404; body = @{ error = "Không tìm thấy đơn trên server (đơn mới phải được lưu trước)" } } }
  $code = OrdLbl $o $model; $isAdm = $me["role"] -eq "admin"; $own = (OwnerMap)[$model] -eq [string]$me["id"]; $now = NowMs; $uid = [string]$me["id"]
  $q0 = $o["qlvh"]; $note = ""; $isExRaw = (ExecOf $o) -eq $uid; $isEx = $isExRaw -and (ExecReady $o)   # V5.3: thực thi chỉ sau khi đã tiếp nhận
  $who = { param($id) $u = (LoadUsers) | Where-Object { $_["id"] -eq $id } | Select-Object -First 1; if ($u) { [string]$u["name"] } else { [string]$id } }
  $logs = [System.Collections.ArrayList]::new(); foreach ($e in (Arr $o["qlvhLog"])) { $null = $logs.Add($e) }
  if ($op -eq "qlvh-duyet") {
    if (-not ($isAdm -or $own -or $isEx)) { return @{ code = 403; body = @{ error = "Chỉ người thực thi đơn, người phụ trách mã hoặc Admin được xác nhận QLVH đã duyệt" } } }
    if (-not $o["closed"]) { return @{ code = 409; body = @{ error = "Đơn $code chưa chốt" } } }
    if ($o["cancelled"]) { return @{ code = 409; body = @{ error = "Đơn $code đã huỷ" } } }
    if ((Num $o["flow"]) -ne 3) { return @{ code = 409; body = @{ error = "Đơn $code chốt trước quy trình V3, không cần bước này" } } }
    if ($q0) { return @{ code = 409; body = @{ error = ("Đơn $code đã được " + (& $who $q0["by"]) + " xác nhận QLVH duyệt lúc " + ([DateTimeOffset]::FromUnixTimeMilliseconds([int64]$q0["at"]).ToLocalTime().ToString("HH:mm dd/MM")) + " (PO " + [string]$q0["po"] + "). Không xác nhận lại."); dup = $true } } }
    $po2 = ([string]$q["po2"]).Trim()
    if (-not $po -or -not $po2) { return @{ code = 400; body = @{ error = "Nhập đủ 2 mã PO ERP trước khi xác nhận" } } }
    if ($po -eq $po2) { return @{ code = 400; body = @{ error = "2 mã PO phải khác nhau" } } }
    if ($q["ack"] -ne $true) { return @{ code = 400; body = @{ error = "Tick xác nhận đã kiểm tra 2 PO được QLVH ký và duyệt trên ERP" } } }
    if ([string]$o["erpCode"] -ne $po) { $o["erpCode"] = $po; $o["erpAt"] = $now; $o["erpBy"] = $uid }
    if ([string]$o["erpCode2"] -ne $po2) { $o["erpCode2"] = $po2; $o["erpAt2"] = $now; $o["erpBy2"] = $uid }
    $o["qlvh"] = @{ at = $now; by = $uid; po = $po; po2 = $po2 }
    $null = $logs.Add(@{ at = $now; by = $uid; act = "duyet"; po = $po; po2 = $po2 }); $note = "QLVH đã ký, duyệt 2 PO: PO 1 $po · PO 2 $po2 · đơn $code → Đang sản xuất"
  }
  elseif ($op -eq "qlvh-sua-po" -or $op -eq "qlvh-bo") {
    if (-not $isAdm) { return @{ code = 403; body = @{ error = "Chỉ Admin được đính chính xác nhận QLVH" } } }
    if (-not $q0) { return @{ code = 409; body = @{ error = "Đơn $code chưa có xác nhận QLVH (có thể người khác vừa đính chính)" } } }
    if (-not $reason) { return @{ code = 400; body = @{ error = "Ghi lý do đính chính" } } }
    if ($op -eq "qlvh-sua-po") {
      $po2 = $(if ($q.ContainsKey("po2")) { ([string]$q["po2"]).Trim() } else { [string]$q0["po2"] }); $from2 = [string]$q0["po2"]
      if (-not $po -or ($from2 -and -not $po2)) { return @{ code = 400; body = @{ error = "Nhập mã PO đúng" } } }
      if ($po2 -and $po -eq $po2) { return @{ code = 400; body = @{ error = "2 mã PO phải khác nhau" } } }
      if ($po -eq [string]$q0["po"] -and $po2 -eq $from2) { return @{ code = 400; body = @{ error = "Mã PO không đổi" } } }
      $null = $logs.Add(@{ at = $now; by = $uid; act = "sua-po"; from = [string]$q0["po"]; po = $po; from2 = $from2; po2 = $po2; reason = $reason })
      $q0["po"] = $po; $o["erpCode"] = $po; $o["erpAt"] = $now; $o["erpBy"] = $uid
      if ($po2 -and $po2 -ne $from2) { $q0["po2"] = $po2; $o["erpCode2"] = $po2; $o["erpAt2"] = $now; $o["erpBy2"] = $uid }
      $note = "Đính chính mã PO đơn ${code}: " + [string]$logs[$logs.Count - 1]["from"] + " → $po" + $(if ($po2 -ne $from2) { " · PO 2: " + $(if ($from2) { $from2 } else { "chưa có" }) + " → $po2" } else { "" }) + " · lý do: $reason"
    } else {
      if ($o["sentAt"] -or $o["ackAt"] -or $o["startedAt"] -or (LiveRecv $o) -or $o["arrived"]) { return @{ code = 409; body = @{ error = "Đơn $code đã gửi xưởng / có tiến độ sản xuất: không bỏ xác nhận được. Nếu chỉ sai mã PO, dùng Sửa mã PO." } } }
      $null = $logs.Add(@{ at = $now; by = $uid; act = "bo"; prev = $q0; reason = $reason }); $null = $o.Remove("qlvh"); $note = "Bỏ xác nhận QLVH đơn $code (về Chờ QLVH duyệt) · lý do: $reason"
    }
  }
  elseif (@("bg-ghi", "bg-xac-nhan", "bg-huy", "bg-mo-lai") -contains $op) {
    $hv = $o["handover"]; $pend = ($hv -is [System.Collections.IDictionary]) -and ([string]$hv["state"] -eq "cho")
    $hl = [System.Collections.ArrayList]::new(); foreach ($e in (Arr $o["handoverLog"])) { $null = $hl.Add($e) }
    if ($op -eq "bg-ghi") {
      if (-not ($isAdm -or $own -or $isEx)) { return @{ code = 403; body = @{ error = "Chỉ người thực thi đơn, người phụ trách mã hoặc Admin được ghi nhận bàn giao" } } }
      if ($o["doneAt"]) { return @{ code = 409; body = @{ error = "Đơn $code đã hoàn tất Planning" } } }
      if ($pend) { return @{ code = 409; body = @{ error = ("Đơn $code đã được " + (& $who $hv["by"]) + " ghi nhận bàn giao cho " + [string]$hv["to"] + ", đang chờ xác nhận. Không ghi lại."); dup = $true } } }
      $fe = FinishErr $o; if ($fe) { return @{ code = 409; body = @{ error = "Chưa bàn giao được đơn ${code}: $fe" } } }
      $tu = ([string]$q["toUser"]).Trim(); $tn = ([string]$q["toName"]).Trim(); $ev = ([string]$q["evidence"]).Trim()
      if ($tu) { $u = (LoadUsers) | Where-Object { $_["id"] -eq $tu -and $_["active"] } | Select-Object -First 1
        if (-not $u) { return @{ code = 400; body = @{ error = "Không tìm thấy tài khoản người nhận" } } }
        if ($tu -eq $uid) { return @{ code = 400; body = @{ error = "Người nhận phải là người khác người giao" } } }
        $tn = [string]$u["name"] }
      elseif (-not $tn) { return @{ code = 400; body = @{ error = "Ghi tên người / bộ phận nhận hồ sơ" } } }
      elseif (-not $ev) { return @{ code = 400; body = @{ error = "Người nhận chưa có tài khoản: ghi bằng chứng bàn giao (VD ảnh ký nhận, tin nhắn xác nhận…)" } } }
      $o["handover"] = @{ state = "cho"; to = $tn; toUser = $(if ($tu) { $tu } else { $null }); at = $now; by = $uid; evidence = $ev; note = ([string]$q["note"]).Trim() }
      $null = $hl.Add(@{ at = $now; by = $uid; act = "ghi"; to = $tn; toUser = $o["handover"]["toUser"]; evidence = $ev }); $note = "Ghi nhận bàn giao hồ sơ đơn $code cho $tn · chờ xác nhận"
    }
    elseif ($op -eq "bg-xac-nhan") {
      if (-not $pend) { return @{ code = 409; body = @{ error = "Đơn $code không có bàn giao đang chờ xác nhận (có thể vừa được xác nhận / huỷ)"; dup = $true } } }
      if ($hv["toUser"]) { if ([string]$hv["toUser"] -ne $uid) { return @{ code = 403; body = @{ error = ("Chỉ " + [string]$hv["to"] + " (người nhận) xác nhận được bằng tài khoản của mình") } } } }
      elseif (-not $isAdm) { return @{ code = 403; body = @{ error = "Người nhận chưa có tài khoản: Admin kiểm tra bằng chứng rồi xác nhận" } } }
      $fe = FinishErr $o; if ($fe) { return @{ code = 409; body = @{ error = "Chưa hoàn tất được đơn ${code}: $fe" } } }
      $hv["state"] = "xn"; $hv["confirmAt"] = $now; $hv["confirmBy"] = $uid
      $o["doneAt"] = [string](Get-Date -Format "yyyy-MM-dd"); $o["doneBy"] = $uid
      $null = $hl.Add(@{ at = $now; by = $uid; act = $(if ($hv["toUser"]) { "xac-nhan" } else { "xac-nhan-admin" }) }); $note = "Xác nhận nhận hồ sơ đơn $code (" + [string]$hv["to"] + ") · Hoàn tất Planning"
    }
    elseif ($op -eq "bg-huy") {
      if (-not $pend) { return @{ code = 409; body = @{ error = "Không có bàn giao đang chờ xác nhận" } } }
      if (-not ($isAdm -or [string]$hv["by"] -eq $uid)) { return @{ code = 403; body = @{ error = "Chỉ người ghi nhận hoặc Admin huỷ được" } } }
      if (-not $reason) { return @{ code = 400; body = @{ error = "Ghi lý do huỷ ghi nhận" } } }
      $null = $hl.Add(@{ at = $now; by = $uid; act = "huy-ghi"; reason = $reason; prev = $hv }); $null = $o.Remove("handover"); $note = "Huỷ ghi nhận bàn giao đơn $code · lý do: $reason"
    }
    else {
      if (-not $isAdm) { return @{ code = 403; body = @{ error = "Chỉ Admin mở lại đơn đã hoàn tất" } } }
      if (-not $o["doneAt"]) { return @{ code = 409; body = @{ error = "Đơn $code chưa hoàn tất" } } }
      if (-not $reason) { return @{ code = 400; body = @{ error = "Ghi lý do mở lại" } } }
      $null = $hl.Add(@{ at = $now; by = $uid; act = "mo-lai"; reason = $reason; prev = $hv; prevDone = [string]$o["doneAt"] }); $null = $o.Remove("handover"); $null = $o.Remove("doneAt"); $null = $o.Remove("doneBy"); $note = "Mở lại đơn $code đã hoàn tất · lý do: $reason"
    }
    $o["handoverLog"] = $hl.ToArray()
  }
  # V5: tiếp nhận việc / báo vướng mắc / xử lý vướng mắc / đổi người thực thi
  elseif ($op -eq "ban-giao") {
    # V5.3: bàn giao chủ động sau khi chốt. Đúng 1 người thực thi / đơn: đang chờ nhận hoặc đã nhận thì không giao lại (chặn bấm trùng)
    if (-not ($own -or $isAdm)) { return @{ code = 403; body = @{ error = "Chỉ người quản lý kế hoạch (phụ trách mã) hoặc Admin bàn giao" } } }
    if (-not $o["closed"]) { return @{ code = 409; body = @{ error = "Kế hoạch $code chưa chốt: chốt trước rồi mới bàn giao" } } }
    if ($o["cancelled"] -or $o["doneAt"]) { return @{ code = 409; body = @{ error = "Đơn $code đã huỷ hoặc đã hoàn tất" } } }
    $ex = $o["exec"]
    if ($ex -is [System.Collections.IDictionary] -and -not $ex["traAt"]) { return @{ code = 409; body = @{ error = ("Đơn $code đã được " + (& $who $ex["by"]) + " bàn giao cho " + (& $who $ex["user"]) + " lúc " + ([DateTimeOffset]::FromUnixTimeMilliseconds([int64]$ex["at"]).ToLocalTime().ToString("HH:mm dd/MM")) + $(if ($ex["ackAt"]) { " (đã tiếp nhận)" } else { " (chờ tiếp nhận)" }) + ". Không bàn giao lại."); dup = $true } } }
    $tu = ([string]$q["toUser"]).Trim(); if (-not $tu) { $tu = ExecDefault }
    $u = (LoadUsers) | Where-Object { $_["id"] -eq $tu -and $_["active"] } | Select-Object -First 1
    if (-not $u) { return @{ code = 400; body = @{ error = "Chưa có người thực thi (Danh mục mã & phân công) hoặc tài khoản không hoạt động" } } }
    $o["exec"] = @{ user = $tu; at = $now; by = $uid; v = 2 }; if ($ex) { $o["exec"]["prev"] = $ex }
    ExecLogAdd $o @{ at = $now; by = $uid; act = "giao"; user = $tu; note = ([string]$q["note"]).Trim() }
    $note = "Bàn giao đơn $code cho " + [string]$u["name"] + " · chờ tiếp nhận" + $(if ($ex) { " (giao lại sau khi trả lại)" } else { "" })
  }
  elseif ($op -eq "tra-lai") {
    $ex = $o["exec"]; if ($ex -isnot [System.Collections.IDictionary]) { return @{ code = 409; body = @{ error = "Đơn $code chưa được bàn giao" } } }
    if (-not ($isExRaw -or $isAdm)) { return @{ code = 403; body = @{ error = "Chỉ người được bàn giao (hoặc Admin) trả lại" } } }
    if ($ex["traAt"]) { return @{ code = 409; body = @{ error = ("Đơn $code đã được trả lại lúc " + ([DateTimeOffset]::FromUnixTimeMilliseconds([int64]$ex["traAt"]).ToLocalTime().ToString("HH:mm dd/MM"))); dup = $true } } }
    if ($ex["ackAt"]) { return @{ code = 409; body = @{ error = "Đơn $code đã được tiếp nhận: không trả lại được. Có vấn đề thì báo vướng mắc." } } }
    # V5.4 Đợt 3 (Q7): bắt buộc 1 trong 5 nhóm lý do + ghi chú cụ thể
    $grp = ([string]$q["group"]).Trim()
    if (-not $TraGroups.Contains($grp)) { return @{ code = 400; body = @{ error = "Chọn nhóm lý do trả lại (Sai số lượng · Thiếu NVL · Thiếu Tech Pack/mẫu · Sai xưởng/ngày hẹn · Khác)"; field = "group" } } }
    if (-not $reason) { return @{ code = 400; body = @{ error = "Ghi chú cụ thể lý do trả lại (bắt buộc)"; field = "reason" } } }
    $ex["traAt"] = $now; $ex["traBy"] = $uid; $ex["traReason"] = $reason; $ex["traGroup"] = $grp
    ExecLogAdd $o @{ at = $now; by = $uid; act = "tra"; user = (ExecOf $o); reason = $reason; group = $grp }
    $note = "Trả lại đơn $code cho người quản lý kế hoạch · nhóm: " + $TraGroups[$grp] + " · lý do: $reason" + $(if (-not $isExRaw) { " (Admin thay " + (& $who $ex["user"]) + ")" } else { "" })
  }
  elseif ($op -eq "nhan-viec") {
    $ex = $o["exec"]; if ($ex -isnot [System.Collections.IDictionary]) { return @{ code = 409; body = @{ error = "Đơn $code chưa được bàn giao" } } }
    if (-not ($isExRaw -or $isAdm)) { return @{ code = 403; body = @{ error = "Chỉ người thực thi đơn (hoặc Admin) tiếp nhận" } } }
    if ($ex["traAt"]) { return @{ code = 409; body = @{ error = "Đơn $code đã được trả lại, chờ người quản lý kế hoạch xử lý và bàn giao lại"; dup = $true } } }
    if (-not $o["closed"] -or $o["cancelled"]) { return @{ code = 409; body = @{ error = "Đơn $code đang được mở lại kế hoạch hoặc đã huỷ: chưa tiếp nhận được" } } }
    if ($ex["ackAt"]) { return @{ code = 409; body = @{ error = ("Đơn $code đã được " + (& $who $ex["ackBy"]) + " tiếp nhận lúc " + ([DateTimeOffset]::FromUnixTimeMilliseconds([int64]$ex["ackAt"]).ToLocalTime().ToString("HH:mm dd/MM"))); dup = $true } } }
    # V5.4 Đợt 3 (Q6, UX3): checklist dữ liệu đầu vào do server tự lập theo đơn; thiếu mục nào → 400 kèm tên mục. Admin tiếp nhận thay cũng phải đủ
    $req = CheckReq $o; $got = @(); foreach ($c0 in (Arr $q["check"])) { $got += [string]$c0 }
    # mảng chuỗi thuần (không qua pipeline: pipeline bọc PSObject → JavaScriptSerializer báo vòng lặp)
    $miss = [System.Collections.ArrayList]::new(); $missT = [System.Collections.ArrayList]::new(); $reqA = [System.Collections.ArrayList]::new()
    foreach ($r0 in $req) { $null = $reqA.Add([string]$r0); if ($got -notcontains [string]$r0) { $null = $miss.Add([string]$r0); $null = $missT.Add([string]$CheckT[[string]$r0]) } }
    if ($miss.Count -gt 0) { return @{ code = 400; body = @{ error = ("Chưa tiếp nhận được đơn ${code}: còn thiếu " + ($missT.ToArray() -join " · ")); missing = $miss.ToArray(); required = $reqA.ToArray() } } }
    $items = [System.Collections.ArrayList]::new(); foreach ($c1 in $req) { $null = $items.Add([string]$c1) }
    $ex["ackAt"] = $now; $ex["ackBy"] = $uid; $ex["ackCheck"] = @{ items = $items.ToArray(); at = $now; by = $uid }
    ExecLogAdd $o @{ at = $now; by = $uid; act = "nhan"; user = (ExecOf $o); check = $items.ToArray() }
    $itT = @(); foreach ($i0 in $items) { $itT += [string]$CheckT[[string]$i0] }
    $note = "Tiếp nhận thực hiện đơn $code · checklist " + $items.Count + "/" + $items.Count + ": " + ($itT -join " · ") + $(if (-not $isExRaw) { " (Admin thay người thực thi " + (& $who $ex["user"]) + ")" } else { "" })
  }
  elseif ($op -eq "doi-thuc-thi") {
    if (-not $isAdm) { return @{ code = 403; body = @{ error = "Chỉ Admin đổi người thực thi" } } }
    if (-not $o["closed"] -or $o["cancelled"]) { return @{ code = 409; body = @{ error = "Đơn $code chưa chốt hoặc đã huỷ" } } }
    $tu = ([string]$q["toUser"]).Trim(); $u = (LoadUsers) | Where-Object { $_["id"] -eq $tu -and $_["active"] } | Select-Object -First 1
    if (-not $u) { return @{ code = 400; body = @{ error = "Không tìm thấy tài khoản người thực thi" } } }
    if (-not $reason) { return @{ code = 400; body = @{ error = "Ghi lý do đổi người thực thi" } } }
    if (-not $o["exec"]) { return @{ code = 409; body = @{ error = "Đơn $code chưa bàn giao: dùng Bàn giao" } } }
    $prev = $o["exec"]; $o["exec"] = @{ user = $tu; at = $now; by = $uid; reason = $reason; prevUser = $(if ($prev) { ExecOf $prev } else { $null }) }
    if ((Num $prev["v"]) -eq 2) { $o["exec"]["v"] = 2; if ($prev["ackAt"] -and -not $prev["traAt"]) { $o["exec"]["ackAt"] = $now; $o["exec"]["ackBy"] = $uid } }   # V5.3: đổi người khi đơn đã tiếp nhận → người mới làm tiếp, không phải tiếp nhận lại
    ExecLogAdd $o @{ at = $now; by = $uid; act = "doi"; user = $tu; from = $o["exec"]["prevUser"]; reason = $reason }
    $note = "Đổi người thực thi đơn ${code}: " + $(if ($prev) { & $who (ExecOf $prev) } else { "chưa có" }) + " → " + [string]$u["name"] + " · lý do: $reason"
  }
  elseif ($op -eq "vuong-bao") {
    if (-not ($isExRaw -or $own -or $isAdm)) { return @{ code = 403; body = @{ error = "Chỉ người thực thi, người phụ trách mã hoặc Admin" } } }
    $tx = ([string]$q["text"]).Trim(); if (-not $tx) { return @{ code = 400; body = @{ error = "Ghi nội dung vướng mắc" } } }
    $L = [System.Collections.ArrayList]::new(); foreach ($e in (Arr $o["vuong"])) { $null = $L.Add($e) }
    $vid = "v" + $now; if (Has $L { param($e) [string]$e["id"] -eq $vid }) { $vid = $vid + "b" }
    $vx = VuongNew $vid $now $uid $tx $q; $null = $L.Add($vx); $o["vuong"] = $L.ToArray()
    $note = "Báo vướng mắc đơn ${code}: $tx" + (VuongTag $vx)
  }
  elseif ($op -eq "vuong-nhan") {
    # UX V5 (anh duyệt 13/11): Đăng Nam bấm "Đang xử lý" → người báo biết đã có người nhận; không thêm bước duyệt, không đổi quyền
    if (-not ($own -or $isAdm)) { return @{ code = 403; body = @{ error = "Chỉ người quản lý kế hoạch (phụ trách mã) hoặc Admin xử lý vướng mắc" } } }
    $v = $null; foreach ($e in (Arr $o["vuong"])) { if ([string]$e["id"] -eq [string]$q["vid"]) { $v = $e } }
    if (-not $v) { return @{ code = 404; body = @{ error = "Không tìm thấy vướng mắc" } } }
    if ([string]$v["state"] -ne "mo") { return @{ code = 409; body = @{ error = "Vướng mắc này đã được nhận xử lý hoặc đã giải quyết"; dup = $true } } }
    $v["state"] = "dang"; $v["nhanAt"] = $now; $v["nhanBy"] = $uid; $note = "Đang xử lý vướng mắc đơn ${code}: " + [string]$v["text"]
  }
  elseif ($op -eq "vuong-xong") {
    if (-not ($own -or $isAdm)) { return @{ code = 403; body = @{ error = "Chỉ người quản lý kế hoạch (phụ trách mã) hoặc Admin xử lý vướng mắc" } } }
    $v = $null; foreach ($e in (Arr $o["vuong"])) { if ([string]$e["id"] -eq [string]$q["vid"]) { $v = $e } }
    if (-not $v) { return @{ code = 404; body = @{ error = "Không tìm thấy vướng mắc" } } }
    if ($v["state"] -eq "xong") { return @{ code = 409; body = @{ error = "Vướng mắc này đã được xử lý"; dup = $true } } }
    $v["state"] = "xong"; $v["doneAt"] = $now; $v["doneBy"] = $uid; $v["reply"] = ([string]$q["reply"]).Trim()
    $note = "Xử lý vướng mắc đơn ${code}: " + [string]$v["text"] + $(if ($v["reply"]) { " → " + [string]$v["reply"] } else { "" })
  }
  else { return @{ code = 400; body = @{ error = "Thao tác không hợp lệ" } } }
  if ($op -like "qlvh-*") { $o["qlvhLog"] = $logs.ToArray() }
  $body = J $plan
  $stamp = SaveKey "kehoach-sx-v3" $body $rev "don-op" $uid
  LogSave "kehoach-sx-v3" $old $plan $me "don-op" $rev $reason $false
  LogEvent $op $me $note @{ oid = $oid; code = $code; model = $model }
  return @{ code = 200; body = @{ ok = $true; rev = $rev; savedAt = $stamp; value = $plan } }
}
# ===== Tech Pack (GĐ1): mỗi mã 1 file du-lieu\techpack\<id>.json, có số phiên bản riêng =====
# value = { id, createdAt, createdBy, src, draft:{data,status nhap|cho-duyet,fromVer,at,by,submit,ret} | null,
#           official:{ver,data,at,by,note,photo} | null, versions:[{ver,at,by,note,submitBy}] }
# Mỗi lần lưu cất 1 bản cũ vào techpack\lich-su; mỗi lần Admin duyệt lưu 1 file phiên bản trong techpack\phien-ban\<id>\ (không bao giờ xoá).
# Xoá mã = chuyển cả file + phiên bản vào techpack\thung-rac. Ảnh chưa lưu ở GĐ1: dữ liệu có ảnh nhúng (data:image) bị từ chối.
$TpDir = Join-Path $DataDir "techpack"; $TpVer = Join-Path $TpDir "phien-ban"; $TpHist = Join-Path $TpDir "lich-su"; $TpBin = Join-Path $TpDir "thung-rac"
New-Item -ItemType Directory -Force $TpDir, $TpVer, $TpHist, $TpBin | Out-Null
function TpCanEdit($me) { return ($me["role"] -eq "admin") -or ($me["role"] -eq "staff" -and [bool]$me["techpack"]) }
function TpCanRead($me) { return (TpCanEdit $me) -or ($me["role"] -eq "kho") }
function TpFile([string]$id) { return Join-Path $TpDir "$id.json" }
function TpLoad([string]$id) {
  $f = TpFile $id; if (-not (Test-Path $f)) { return $null }
  $t = [System.IO.File]::ReadAllText($f, $utf8)
  return @{ rev = (CurrentRev $f); text = $t; v = (Val $t) }
}
function TpSave([string]$id, $v, [int64]$rev, $me) {
  $f = TpFile $id; $stamp = NowMs
  WriteFileSafe $f ('{"rev":' + $rev + ',"savedAt":' + $stamp + ',"by":"' + $me["id"] + '","value":' + (J $v) + '}')
  Copy-Item $f (Join-Path $TpHist ("$id-" + (Stamp) + "-r$rev.json"))
  # giữ mọi bản trong 48 giờ + 100 bản gần nhất của mỗi mã (bản duyệt đã nằm riêng trong phien-ban)
  $old = @(Get-ChildItem $TpHist -Filter "$id-*.json" | Sort-Object LastWriteTime -Descending | Select-Object -Skip 100 | Where-Object { ((Get-Date) - $_.LastWriteTime).TotalHours -gt 48 })
  foreach ($x in $old) { Remove-Item $x.FullName -Force }
  return $stamp
}
function TpCode($v) { $d = $(if ($v["draft"]) { $v["draft"]["data"] } elseif ($v["official"]) { $v["official"]["data"] } else { $null }); if ($d) { return [string]$d["code"] }; return "" }
function TpSummary($v, [int64]$rev, $me) {
  $kho = ($me["role"] -eq "kho"); $o = $v["official"]; $d = $(if ($kho) { $null } else { $v["draft"] })
  $src = $(if ($d) { $d["data"] } elseif ($o) { $o["data"] } else { @{} })
  return @{ id = [string]$v["id"]; rev = $rev; code = [string]$src["code"]; name = [string]$src["name"]; line = [string]$src["line"]
    offVer = $(if ($o) { [int]$o["ver"] } else { 0 }); offAt = $(if ($o) { $o["at"] } else { $null })
    draft = $(if ($d) { [string]$d["status"] } else { "" }); draftAt = $(if ($d) { $d["at"] } else { $null }); draftBy = $(if ($d) { [string]$d["by"] } else { "" }) }
}
function TpCheckData($data) {
  if (-not ($data -is [System.Collections.IDictionary])) { return "Dữ liệu Tech Pack không hợp lệ" }
  if ((J $data) -match '"data:image/') { return "Ảnh chưa được lưu lên server ở giai đoạn này (GĐ2). Dữ liệu không được chứa ảnh." }
  if (@("polo", "somi", "jeans", "quantay", "khac") -notcontains [string]$data["line"]) { return "Thiếu dòng sản phẩm" }
  return $null
}
function TpOp($me, [string]$id, [string]$op, $b) {
  $now = NowMs; $uid = [string]$me["id"]
  if (-not (TpCanEdit $me)) { LogEvent "tu-choi" $me "Không có quyền Tech Pack ($op)" @{ tp = $id }; return @{ code = 403; body = @{ error = "Tài khoản này chưa có quyền Tech Pack" } } }
  $x = TpLoad $id; if (-not $x) { return @{ code = 404; body = @{ error = "Không tìm thấy mã Tech Pack" } } }
  $v = $x.v; $rev = $x.rev
  if ([int64]$b["rev"] -ne $rev) { return @{ code = 409; body = @{ error = "Mã này vừa được người khác thay đổi. Tải lại để xem bản mới nhất rồi làm lại."; rev = $rev } } }
  $d = $v["draft"]; $o = $v["official"]; $code = TpCode $v; $isAdm = ($me["role"] -eq "admin")
  $note = ([string]$b["note"]).Trim(); $msg = $null
  if ($op -eq "gui") {
    if (-not $d -or $d["status"] -ne "nhap") { return @{ code = 400; body = @{ error = "Chỉ gửi duyệt được bản nháp đang sửa" } } }
    $d["status"] = "cho-duyet"; $d["submit"] = @{ at = $now; by = $uid; note = $note }; $msg = "Gửi đề xuất duyệt"
  }
  elseif ($op -eq "rut") {
    if (-not $d -or $d["status"] -ne "cho-duyet") { return @{ code = 400; body = @{ error = "Không có đề xuất đang chờ duyệt" } } }
    if (-not $isAdm -and [string]$d["submit"]["by"] -ne $uid) { return @{ code = 403; body = @{ error = "Chỉ người gửi hoặc Admin rút được đề xuất" } } }
    $d["status"] = "nhap"; $d["submit"] = $null; $msg = "Rút đề xuất, mở lại bản nháp"
  }
  elseif ($op -eq "tra-lai") {
    if (-not $isAdm) { return @{ code = 403; body = @{ error = "Chỉ Admin trả lại đề xuất" } } }
    if (-not $d -or $d["status"] -ne "cho-duyet") { return @{ code = 400; body = @{ error = "Không có đề xuất đang chờ duyệt" } } }
    if (-not $note) { return @{ code = 400; body = @{ error = "Cần ghi lý do trả lại" } } }
    $d["status"] = "nhap"; $d["ret"] = @{ at = $now; by = $uid; reason = $note; submit = $d["submit"] }; $d["submit"] = $null; $msg = "Trả lại đề xuất · lý do: $note"
  }
  elseif ($op -eq "duyet") {
    if (-not $isAdm) { LogEvent "tu-choi" $me "Nhân viên không được duyệt Tech Pack" @{ tp = $id; code = $code }; return @{ code = 403; body = @{ error = "Chỉ Admin duyệt Tech Pack chính thức" } } }
    if (-not $d) { return @{ code = 400; body = @{ error = "Không có bản nháp để duyệt" } } }
    if (-not [bool]$b["ackPhoto"]) { return @{ code = 400; body = @{ error = "Cần xác nhận đã biết hồ sơ chưa có ảnh mẫu" } } }
    if (-not ([string]$d["data"]["code"]).Trim()) { return @{ code = 400; body = @{ error = "Cần có Mã hàng trước khi duyệt" } } }
    $ver = $(if ($o) { [int]$o["ver"] + 1 } else { 1 })
    $off = @{ ver = $ver; data = $d["data"]; at = $now; by = $uid; note = $note; photo = "chua-xac-dinh"; submit = $d["submit"]; fromVer = $d["fromVer"] }
    $vd = Join-Path $TpVer $id; New-Item -ItemType Directory -Force $vd | Out-Null
    $vf = Join-Path $vd "v$ver.json"
    if (Test-Path $vf) { return @{ code = 500; body = @{ error = "Phiên bản v$ver đã tồn tại, không ghi đè" } } }
    [System.IO.File]::WriteAllText($vf, (J @{ id = $id; ver = $ver; at = $now; by = $uid; note = $note; photo = "chua-xac-dinh"; submit = $d["submit"]; data = $d["data"] }), $utf8)
    $vs = [System.Collections.ArrayList]::new(); foreach ($y in @($v["versions"])) { if ($y) { $null = $vs.Add($y) } }
    $null = $vs.Add(@{ ver = $ver; at = $now; by = $uid; note = $note; submitBy = $(if ($d["submit"]) { [string]$d["submit"]["by"] } else { $uid }) })
    $v["versions"] = $vs.ToArray(); $v["official"] = $off; $v["draft"] = $null
    $msg = "Duyệt thành bản chính thức v$ver (chưa có ảnh mẫu)" + $(if ($note) { " · ghi chú: $note" } else { "" })
  }
  elseif ($op -eq "de-xuat-sua") {
    if ($d) { return @{ code = 400; body = @{ error = "Mã này đang có bản nháp, sửa tiếp trên bản nháp đó" } } }
    if (-not $o) { return @{ code = 400; body = @{ error = "Chưa có bản chính thức" } } }
    $v["draft"] = @{ data = $JS.DeserializeObject((J $o["data"])); status = "nhap"; fromVer = [int]$o["ver"]; at = $now; by = $uid; submit = $null; ret = $null }
    $msg = "Đề xuất chỉnh sửa từ bản chính thức v" + $o["ver"]
  }
  elseif ($op -eq "xoa") {
    if (-not $isAdm) { return @{ code = 403; body = @{ error = "Chỉ Admin xoá mã Tech Pack" } } }
    if (-not $note) { return @{ code = 400; body = @{ error = "Cần ghi lý do xoá" } } }
    $tag = "$id-" + (Stamp)
    Move-Item (TpFile $id) (Join-Path $TpBin "$tag.json")
    $vd = Join-Path $TpVer $id; if (Test-Path $vd) { Move-Item $vd (Join-Path $TpBin "$tag-phien-ban") }
    LogEvent "techpack-xoa" $me ("Tech Pack ${code}: chuyển vào thùng rác · lý do: $note") @{ tp = $id; code = $code }
    return @{ code = 200; body = @{ ok = $true; deleted = $true } }
  }
  else { return @{ code = 400; body = @{ error = "Thao tác không hợp lệ" } } }
  $rev2 = $rev + 1; $stamp = TpSave $id $v $rev2 $me
  LogEvent ("techpack-" + $op) $me ("Tech Pack ${code}: $msg") @{ tp = $id; code = $code }
  return @{ code = 200; body = @{ ok = $true; rev = $rev2; savedAt = $stamp; value = $v } }
}
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $req = $ctx.Request; $res = $ctx.Response
  try {
    $path = [System.Uri]::UnescapeDataString($req.Url.AbsolutePath.TrimStart('/'))
    $isApi = $path.StartsWith("api/")
    $me = $null
    if ($isApi) { $me = CurrentUser $req }

    # ----- Đăng nhập / tài khoản (không cần phiên) -----
    if ($path -eq 'api/setup-needed') { Send $res 200 ('{"needed":' + ((LoadUsers).Count -eq 0).ToString().ToLower() + '}') }
    elseif ($path -eq 'api/setup' -and $req.HttpMethod -eq "POST") {
      $list = LoadUsers
      if ($list.Count -gt 0) { Send $res 403 '{"error":"Đã có tài khoản Admin"}' }
      else {
        $b = ReadObj $req; $un = ([string]$b["username"]).Trim().ToLower(); $pw = [string]$b["password"]; $nm = ([string]$b["name"]).Trim()
        if ($un -notmatch '^[a-z0-9._-]{3,30}$') { Send $res 400 '{"error":"Tên đăng nhập 3-30 ký tự: chữ không dấu, số, . _ -"}' }
        elseif ($pw.Length -lt 6) { Send $res 400 '{"error":"Mật khẩu ít nhất 6 ký tự"}' }
        else {
          $salt = NewSalt
          $u = @{ id = [string]("u" + (NowMs)); username = [string]$un; name = [string]$(if ($nm) { $nm } else { "Admin" }); role = "admin"; salt = [string]$salt; hash = [string](HashPw $pw $salt); active = $true; created = [int64](NowMs) }
          $null = $list.Add($u); SaveUsers $list
          CreateCatalog $u["id"]
          StartSession $res $u
          Send $res 200 (MeJson $u $list)
        }
      }
    }
    elseif ($path -eq 'api/login' -and $req.HttpMethod -eq "POST") {
      $b = ReadObj $req; $un = ([string]$b["username"]).Trim().ToLower(); $pw = [string]$b["password"]
      $f = $Fails[$un]; $now = NowMs
      if ($f -and $f["until"] -gt $now) { Send $res 429 ('{"error":"Sai mật khẩu quá 5 lần. Thử lại sau ' + [math]::Ceiling(($f["until"] - $now) / 60000) + ' phút"}') }
      else {
        $list = LoadUsers
        $u = $list | Where-Object { $_["username"] -eq $un -and $_["active"] } | Select-Object -First 1
        if ($u -and (SameHash (HashPw $pw $u["salt"]) $u["hash"])) { $Fails.Remove($un); StartSession $res $u; Send $res 200 (MeJson $u $list) }
        else {
          if (-not $f -or ($f["until"] -gt 0 -and $f["until"] -le $now)) { $f = @{ n = 0; until = [int64]0 } }   # hết thời gian khoá thì đếm lại
          $f["n"] = $f["n"] + 1; if ($f["n"] -ge 5) { $f["until"] = [int64]($now + 15 * 60000) }; $Fails[$un] = $f
          Send $res 401 '{"error":"Sai tên đăng nhập hoặc mật khẩu"}'
        }
      }
    }
    elseif ($path -eq 'api/logout') {
      $c = $req.Cookies["sid"]; if ($c) { $Sessions.Remove($c.Value); SaveSessions }
      $res.Headers.Add("Set-Cookie", "sid=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0")
      Send $res 200 '{"ok":true}'
    }
    elseif ($isApi -and -not $me) { Send $res 401 '{"error":"login"}' }
    elseif ($path -eq 'api/me') { Send $res 200 (MeJson $me (LoadUsers)) }
    # /api/users (Admin): tạo tài khoản, đổi tên / vai trò / khóa, đặt lại mật khẩu
    elseif ($path -eq 'api/users' -and $req.HttpMethod -eq "POST") {
      if ($me["role"] -ne "admin") { Send $res 403 '{"error":"Chỉ Admin quản lý tài khoản"}' }
      else {
        $b = ReadObj $req; $list = LoadUsers; $act = [string]$b["action"]; $err = $null
        if ($act -eq "create") {
          $un = ([string]$b["username"]).Trim().ToLower(); $pw = [string]$b["password"]
          if ($un -notmatch '^[a-z0-9._-]{3,30}$') { $err = "Tên đăng nhập 3-30 ký tự: chữ không dấu, số, . _ -" }
          elseif ($list | Where-Object { $_["username"] -eq $un }) { $err = "Tên đăng nhập đã có" }
          elseif ($pw.Length -lt 6) { $err = "Mật khẩu ít nhất 6 ký tự" }
          else { $salt = NewSalt; $null = $list.Add(@{ id = [string]("u" + (NowMs)); username = [string]$un; name = [string](([string]$b["name"]).Trim()); role = [string]$(if (@("admin", "kho") -contains $b["role"]) { $b["role"] } else { "staff" }); salt = [string]$salt; hash = [string](HashPw $pw $salt); active = $true; created = [int64](NowMs); createdBy = [string]$me["id"]; techpack = [bool](([string]$b["role"] -notin @("admin", "kho")) -and [bool]$b["techpack"]) }) }
        } else {
          $u = $list | Where-Object { $_["id"] -eq $b["id"] } | Select-Object -First 1
          if (-not $u) { $err = "Không tìm thấy tài khoản" }
          elseif ($act -eq "password") { if (([string]$b["password"]).Length -lt 6) { $err = "Mật khẩu ít nhất 6 ký tự" } else { $u["salt"] = [string](NewSalt); $u["hash"] = [string](HashPw ([string]$b["password"]) $u["salt"]); foreach ($k in @($Sessions.Keys)) { if ($Sessions[$k].u -eq $u["id"] -and $u["id"] -ne $me["id"]) { $Sessions.Remove($k) } }; SaveSessions } }
          elseif ($act -eq "update") {
            $admins = @($list | Where-Object { $_["role"] -eq "admin" -and $_["active"] -and $_["id"] -ne $u["id"] }).Count
            $newRole = $(if (@("admin", "kho") -contains $b["role"]) { [string]$b["role"] } else { "staff" }); $newActive = [bool]$b["active"]
            if ($admins -eq 0 -and ($newRole -ne "admin" -or -not $newActive)) { $err = "Phải còn ít nhất 1 Admin đang hoạt động" }
            else {
              # Quyền Tech Pack chỉ có ở tài khoản Nhân viên; trang cũ không gửi ô này thì giữ nguyên giá trị đang có
              if ($newRole -ne "staff") { $u["techpack"] = $false } elseif ($b.ContainsKey("techpack")) { $u["techpack"] = [bool]$b["techpack"] }
              $u["name"] = ([string]$b["name"]).Trim(); $u["role"] = $newRole; $u["active"] = $newActive; if (-not $newActive) { foreach ($k in @($Sessions.Keys)) { if ($Sessions[$k].u -eq $u["id"]) { $Sessions.Remove($k) } }; SaveSessions } }
          }
          else { $err = "Thao tác không hợp lệ" }
        }
        if ($err) { Send $res 400 ($JS.Serialize(@{ error = $err })) } else { SaveUsers $list; LogEvent "tai-khoan" $me ("Tài khoản: " + (@{ create = "tạo"; update = "sửa vai trò / trạng thái"; password = "đặt lại mật khẩu" }[$act]) + " " + $(if ($act -eq "create") { [string]$b["username"] } else { [string]$b["id"] }) + $(if ($act -ne "password" -and $b.ContainsKey("techpack")) { " · quyền Tech Pack: " + $(if ([bool]$b["techpack"] -and [string]$b["role"] -notin @("admin", "kho")) { "có" } else { "không" }) } else { "" })) @{ target = [string]$b["id"]; role = [string]$b["role"] }; Send $res 200 ($JS.Serialize(@{ users = (PublicUsers $list) })) }
      }
    }

    # /api/techpack: GET danh sách, POST tạo mã. Kho chỉ thấy mã đã có bản chính thức, không thấy bản nháp.
    elseif ($path -eq 'api/techpack') {
      if (-not (TpCanRead $me)) { Send $res 403 '{"error":"Tài khoản này chưa có quyền Tech Pack"}' }
      elseif ($req.HttpMethod -eq "POST") {
        if (-not (TpCanEdit $me)) { LogEvent "tu-choi" $me "Không có quyền tạo Tech Pack" $null; Send $res 403 '{"error":"Tài khoản này chưa có quyền Tech Pack"}' }
        else {
          $b = ReadObj $req; $data = $b["data"]; $err = TpCheckData $data; $srcId = ([string]$b["src"]) -replace '[^a-zA-Z0-9:_-]', ''
          $dup = $null
          # chuyển từ trình duyệt: cùng 1 mã nguồn chỉ tạo 1 lần (bấm lại / máy khác cùng dữ liệu không nhân đôi)
          if (-not $err -and $srcId) { foreach ($f in Get-ChildItem $TpDir -Filter "*.json") { if ([System.IO.File]::ReadAllText($f.FullName, $utf8).Contains('"src":"' + $srcId + '"')) { $dup = [string]$f.BaseName; break } } }
          if ($err) { Send $res 400 (J @{ error = $err }) }
          elseif ($dup) { Send $res 200 (J @{ ok = $true; id = $dup; dup = $true }) }
          else {
            $rnd = -join ((48..57) + (97..122) | Get-Random -Count 5 | ForEach-Object { [char]$_ })
            $now = NowMs; $id = "tp" + $now + $rnd
            $v = @{ id = $id; createdAt = $now; createdBy = [string]$me["id"]; src = $srcId; draft = @{ data = $data; status = "nhap"; fromVer = 0; at = $now; by = [string]$me["id"]; submit = $null; ret = $null }; official = $null; versions = @() }
            $stamp = TpSave $id $v 1 $me
            LogEvent "techpack-tao" $me ("Tech Pack " + [string]$data["code"] + ": tạo mới" + $(if ($srcId) { " (chuyển từ trình duyệt)" } else { "" })) @{ tp = $id; code = [string]$data["code"] }
            Send $res 200 (J @{ ok = $true; id = $id; rev = 1; savedAt = $stamp; value = $v })
          }
        }
      }
      else {
        $rows = [System.Collections.ArrayList]::new()
        foreach ($f in Get-ChildItem $TpDir -Filter "*.json") {
          try { $v = Val ([System.IO.File]::ReadAllText($f.FullName, $utf8)); if ($me["role"] -eq "kho" -and -not $v["official"]) { continue }; $null = $rows.Add((TpSummary $v (CurrentRev $f.FullName) $me)) } catch {}
        }
        Send $res 200 (J @{ items = $rows.ToArray() })
      }
    }
    # /api/techpack/<id>: GET đọc; /nhap PUT lưu bản nháp (X-Base-Rev); /gui /rut /duyet /tra-lai /de-xuat-sua /xoa POST; /v/<n> đọc 1 phiên bản đã duyệt
    elseif ($path -match '^api/techpack/(tp\d{13}[a-z0-9]{5})(?:/([a-z-]+)(?:/(\d+))?)?$') {
      $id = $Matches[1]; $sub = [string]$Matches[2]; $num = [string]$Matches[3]
      if (-not (TpCanRead $me)) { Send $res 403 '{"error":"Tài khoản này chưa có quyền Tech Pack"}' }
      elseif (-not $sub -and $req.HttpMethod -eq "GET") {
        $x = TpLoad $id
        if (-not $x) { Send $res 404 '{"error":"Không tìm thấy mã Tech Pack"}' }
        elseif ($me["role"] -eq "kho") { if (-not $x.v["official"]) { Send $res 404 '{"error":"Mã này chưa có bản chính thức"}' } else { Send $res 200 (J @{ rev = $x.rev; value = @{ id = $id; official = $x.v["official"] } }) } }
        else { Send $res 200 $x.text }
      }
      elseif ($sub -eq "v" -and $num -and $req.HttpMethod -eq "GET") {
        $vf = Join-Path (Join-Path $TpVer $id) "v$num.json"
        if (-not (TpCanEdit $me)) { Send $res 403 '{"error":"Không có quyền xem phiên bản cũ"}' }
        elseif (Test-Path $vf) { Send $res 200 ([System.IO.File]::ReadAllText($vf, $utf8)) } else { Send $res 404 '{"error":"Không có phiên bản này"}' }
      }
      elseif ($sub -eq "nhap" -and $req.HttpMethod -eq "PUT") {
        $x = TpLoad $id; $base = 0; [int64]::TryParse([string]$req.Headers["X-Base-Rev"], [ref]$base) | Out-Null
        if (-not (TpCanEdit $me)) { LogEvent "tu-choi" $me "Không có quyền sửa Tech Pack" @{ tp = $id }; Send $res 403 '{"error":"Tài khoản này chưa có quyền Tech Pack"}' }
        elseif (-not $x) { Send $res 404 '{"error":"Không tìm thấy mã Tech Pack"}' }
        elseif ($base -ne $x.rev) { Send $res 409 $x.text }   # người khác vừa lưu → trang báo, không ghi đè
        else {
          $b = ReadObj $req; $data = $b["data"]; $err = TpCheckData $data; $d = $x.v["draft"]
          if ($err) { Send $res 400 (J @{ error = $err }) }
          elseif (-not $d) { Send $res 400 '{"error":"Mã này chưa có bản nháp. Bấm Đề xuất chỉnh sửa để tạo bản nháp từ bản chính thức."}' }
          elseif ([string]$d["status"] -ne "nhap") { Send $res 423 '{"error":"Bản nháp đang chờ Admin duyệt nên đã khoá sửa. Rút đề xuất hoặc chờ Admin trả lại."}' }
          else {
            $old = $d["data"]; $now = NowMs
            $d["data"] = $data; $d["at"] = $now; $d["by"] = [string]$me["id"]
            $rev = $x.rev + 1; $stamp = TpSave $id $x.v $rev $me
            $dl = [System.Collections.ArrayList]::new(); DiffV $old $data "" @{ oid = $null; code = [string]$data["code"] } $dl
            $E = @(); foreach ($y in $dl) { $E += @{ at = $now; by = [string]$me["id"]; key = "techpack"; rev = $rev; page = "techpack"; tp = $id; code = [string]$data["code"]; path = $y.path; before = $y.before; after = $y.after } }
            WriteLog $E
            Send $res 200 (J @{ ok = $true; rev = $rev; savedAt = $stamp })
          }
        }
      }
      elseif ($req.HttpMethod -eq "POST" -and @("gui", "rut", "duyet", "tra-lai", "de-xuat-sua", "xoa") -contains $sub) { $r = TpOp $me $id $sub (ReadObj $req); Send $res $r.code (J $r.body) }
      else { Send $res 404 '{"error":"api"}' }
    }
    # /api/data/<key>: GET đọc bản chính; PUT lưu nếu X-Base-Rev khớp phiên bản hiện tại
    elseif ($path -match '^api/data/([a-z0-9-]+)$') {
      $key = $Matches[1]
      if ($Keys -notcontains $key) { Send $res 404 '{"error":"key"}' }
      else {
        $file = Join-Path $DataDir "$key.json"
        if ($req.HttpMethod -eq "PUT" -or $req.HttpMethod -eq "POST") {
          if ($AdminKeys -contains $key -and $me["role"] -ne "admin") { LogEvent "tu-choi" $me "Không có quyền sửa $key" @{ key2 = $key }; Send $res 403 '{"error":"Chỉ Admin được sửa phần này"}' }
          else {
            $body = ReadBody $req
            $cur = CurrentRev $file
            $base = 0; [int64]::TryParse([string]$req.Headers["X-Base-Rev"], [ref]$base) | Out-Null
            $pg = ([string]$req.Headers["X-Page"]) -replace '[^a-z0-9.-]', ''
            $reason = [System.Uri]::UnescapeDataString([string]$req.Headers["X-Reason"])
            $mine = $JS.DeserializeObject($body)
            $curText = $(if (Test-Path $file) { [System.IO.File]::ReadAllText($file, $utf8) } else { $null })
            $curVal = $(if ($curText) { Val $curText } else { $null })
            # Sổ phân bổ + phiếu xuất NVL: chỉ /api/nvl/op ghi. Lưu thường luôn giữ đúng bản trên server (kể cả nút Ghi đè)
            if ($key -eq "nvl-v3" -and $mine -is [System.Collections.IDictionary]) {
              foreach ($sec in @("alloc", "issues")) { $cv = $null; if ($curVal -is [System.Collections.IDictionary]) { $cv = $curVal[$sec] }; if ($null -ne $cv) { $mine[$sec] = @($cv) } else { $null = $mine.Remove($sec) } }
              $body = J $mine
            }
            # CR-02: Tồn kho / Cần đặt / ngày còn bán chỉ ghi qua /api/can-dat (phiên bản khoá). Lưu thường luôn giữ đúng bản trên server
            $cdFix = $false
            if ($key -eq "checkhero-v3") { $cdFix = CdProtect $curVal $mine; if ($cdFix) { $body = J $mine } }
            $bgErr = @()
            if ($key -eq "nvl-v3" -and $mine -is [System.Collections.IDictionary] -and -not (($me["role"] -eq "admin") -and ($reason -like "Khôi phục*"))) { $bgErr = BuyGuard $curVal $mine $me; $body = J $mine }
            # bản người lưu dựa vào: bản hiện tại (nếu khớp) hoặc bản lịch sử đúng số phiên bản đó
            $baseVal = $null
            if ($base -eq $cur) { $baseVal = $curVal }
            else { $hf = Get-ChildItem $HistDir -Filter "$key-*-r$base.json" -ErrorAction SilentlyContinue | Where-Object { $_.Name -notmatch 'xungdot' } | Select-Object -First 1; if ($hf) { $baseVal = Val ([System.IO.File]::ReadAllText($hf.FullName, $utf8)) } }
            $changed = $(if ($null -ne $baseVal) { ChangedSections (Sections $key $baseVal) (Sections $key $mine) } else { ChangedSections (Sections $key $curVal) (Sections $key $mine) })
            $bad = Forbidden $key $changed $me
            # V5: nhân viên thực thi sửa phần thực thi của đơn được giao (mã người khác phụ trách) → không tính là sửa trái quyền
            if ($key -eq "kehoach-sx-v3" -and $bad.Count -gt 0 -and $me["role"] -eq "staff") {
              $ref = $(if ($null -ne $baseVal) { $baseVal } else { $curVal }); $rm = (Dict (Dict $ref)["models"]); $mm = (Dict (Dict $mine)["models"])
              $bad = [string[]]@($bad | Where-Object { -not ($_ -match '^models\.(.+)$' -and $rm.ContainsKey($Matches[1]) -and $mm.ContainsKey($Matches[1]) -and (ExecOnly $rm[$Matches[1]] $mm[$Matches[1]] ([string]$me["id"]))) })
            }
            if ($key -eq "nvl-v3") { $nb = NvlForbidden $(if ($null -ne $baseVal) { $baseVal } else { $curVal }) $mine $me; $bad = [string[]]@(@($bad) + @($nb | Where-Object { $_ })) }
            $holdErr = @()
            if ($key -eq "kehoach-sx-v3" -and $bad.Count -eq 0) {
              $after = $mine
              if ($base -ne $cur -and $null -ne $baseVal -and $null -ne $curVal) { $after = Merge3 $key $baseVal $mine ($JS.DeserializeObject((J $curVal))) }
              if ($null -ne $after) { $holdErr = HoldErrors $curVal $after }
            }
            if ($key -eq "nvl-v3" -and $bad.Count -eq 0) {
              $ref = $(if ($null -ne $baseVal) { $baseVal } else { $curVal })
              if (($me["role"] -eq "admin") -and ($reason -like "Khôi phục*")) { $mine = RestoreStockLog $curVal $mine $me $reason; $body = J $mine }
              else {
                $holdErr = StockErrors $ref $mine $me
                if ($holdErr.Count -eq 0) {
                  $after = $mine
                  if ($base -ne $cur -and $null -ne $baseVal -and $null -ne $curVal) { $after = Merge3 $key $baseVal $mine ($JS.DeserializeObject((J $curVal))) }
                  if ($null -ne $after) { $holdErr = ReqDupErrors $ref $after; if ($holdErr.Count -eq 0) { $holdErr = ListDupErrors $ref $after } }
                }
              }
            }
            if ($bad.Count -gt 0) {
              LogEvent "tu-choi" $me ("Không có quyền sửa: " + ($bad -join ", ")) @{ key2 = $key }
              Send $res 403 ($JS.Serialize(@{ error = "Tài khoản này không có quyền sửa: " + ($bad -join ", "); parts = $bad }))
            } elseif ($bgErr.Count -gt 0) {
              LogEvent "tu-choi" $me ("Đơn mua NVL: " + ($bgErr -join "; ")) @{ key2 = $key }
              Send $res 422 ($JS.Serialize(@{ error = "Không lưu được đơn mua NVL: " + ($bgErr -join "; "); parts = $bgErr }))
            } elseif ($holdErr.Count -gt 0) {
              $why = $(if ($key -eq "kehoach-sx-v3") { "Không giữ được NVL vì vượt số khả dụng (có thể đơn khác vừa giữ trước): " } else { "Không lưu được Tồn kho NVL: " })
              LogEvent "tu-choi" $me ($why + ($holdErr -join "; ")) @{ key2 = $key }
              Send $res 422 ($JS.Serialize(@{ error = $why + ($holdErr -join "; "); parts = $holdErr }))
            } elseif ($base -eq $cur) {
              # V3 QLVH: xác nhận duyệt PO luôn lấy bản server; đơn chưa duyệt không có tiến độ sản xuất
              $restore = ($me["role"] -eq "admin") -and ($reason -like "Khôi phục*")   # Admin khôi phục bản lưu cũ: lấy nguyên bản cũ (kể cả xác nhận QLVH đã ghi lúc đó)
              $gd = $(if ($key -eq "kehoach-sx-v3" -and $mine -is [System.Collections.IDictionary] -and -not $restore) { GuardPlan $curVal $mine $me } else { @{ err = @(); changed = $false } })
              if ($gd.err.Count -gt 0) {
                LogEvent "tu-choi" $me ("QLVH: " + ($gd.err -join "; ")) @{ key2 = $key }
                Send $res 422 ($JS.Serialize(@{ error = (($gd.err -join "; ") + ". Xác nhận QLVH đã duyệt ở Chi tiết đơn trước."); parts = $gd.err }))
              } else {
              if ($gd.changed) { $body = J $mine }
              $rev = $cur + 1
              $stamp = SaveKey $key $body $rev $pg $me["id"]
              if ($null -ne $curVal) { LogSave $key $curVal $mine $me $pg $rev $reason $false }
              if ($gd.changed -or $cdFix) { Send $res 200 ('{"ok":true,"merged":true,"guard":true,"rev":' + $rev + ',"savedAt":' + $stamp + ',"value":' + $body + '}') }   # server đã sửa theo quy tắc → trang nhận bản server
              else { Send $res 200 ('{"ok":true,"rev":' + $rev + ',"savedAt":' + $stamp + '}') }
              }
            } else {
              $merged = $(if ($null -ne $baseVal -and $null -ne $curVal) { Merge3 $key $baseVal $mine ($JS.DeserializeObject((J $curVal))) } else { $null })
              $gd = $(if ($key -eq "kehoach-sx-v3" -and $null -ne $merged) { GuardPlan $curVal $merged $me } else { @{ err = @(); changed = $false } })
              if ($null -eq $merged) { Send $res 409 $curText }   # cùng sửa 1 phần → trang báo xung đột, giữ bản nháp
              elseif ($gd.err.Count -gt 0) {
                LogEvent "tu-choi" $me ("QLVH: " + ($gd.err -join "; ")) @{ key2 = $key }
                Send $res 422 ($JS.Serialize(@{ error = (($gd.err -join "; ") + ". Xác nhận QLVH đã duyệt ở Chi tiết đơn trước."); parts = $gd.err }))
              }
              else {
                $rev = $cur + 1; $mtext = J $merged
                $stamp = SaveKey $key $mtext $rev $pg $me["id"]
                LogSave $key $curVal $merged $me $pg $rev $reason $true
                Send $res 200 ('{"ok":true,"merged":true,"rev":' + $rev + ',"savedAt":' + $stamp + ',"value":' + $mtext + '}')   # người khác vừa sửa mã khác → đã gộp, trang nhận bản gộp
              }
            }
          }
        } else {
          if (Test-Path $file) { Send $res 200 ([System.IO.File]::ReadAllText($file, $utf8)) } else { Send $res 404 '{"error":"empty"}' }
        }
      }
    }
    # V5 · Báo cáo cuối ngày: GET ?date= (Admin xem mọi người, nhân viên xem của mình) · POST {date, text{...}, auto{...}} gửi / gửi lại báo cáo của chính mình
    elseif ($path -eq 'api/baocao') {
      $bf = Join-Path $DataDir "baocao-v1.json"; $bv = $(if (Test-Path $bf) { Val ([System.IO.File]::ReadAllText($bf, $utf8)) } else { @{ reports = @{} } }); if ($bv["reports"] -isnot [System.Collections.IDictionary]) { $bv["reports"] = @{} }
      $isA = ($me["role"] -eq "admin"); $uid = [string]$me["id"]
      if ($req.HttpMethod -eq "POST") {
        $b = ReadObj $req; $dt = [string]$b["date"]
        if ($dt -notmatch '^\d{4}-\d{2}-\d{2}$') { Send $res 400 '{"error":"Ngày báo cáo không hợp lệ"}' }
        elseif ($me["role"] -eq "kho") { Send $res 403 '{"error":"Tài khoản Kho không gửi báo cáo vận hành"}' }
        elseif (($cz = CauseCheck $uid $dt (Dict (Dict $b["text"])["causes"])).miss.Count -gt 0) { Send $res 400 (J @{ error = ("Đơn trễ chưa có nguyên nhân: " + (($cz.miss | ForEach-Object { $_.code }) -join ", ") + ". Ghi nguyên nhân cho đúng từng đơn (hoặc báo vướng mắc trên đơn đó)."); missing = @($cz.miss | ForEach-Object { $_.id }) }) }
        else {
          $b["text"] = Dict $b["text"]; $b["text"]["causes"] = $cz.causes
          $k = "$dt|$uid"; $old = $bv["reports"][$k]; $now = NowMs
          $hist = [System.Collections.ArrayList]::new(); if ($old) { foreach ($e in (Arr $old["history"])) { $null = $hist.Add($e) }; $null = $hist.Add(@{ at = $old["at"]; text = $old["text"]; auto = $old["auto"] }) }
          # 13/11/2026: giữ cố định thời điểm gửi ĐẦU TIÊN (firstAt) để xét Gửi trễ; gửi lại chỉ thêm lịch sử
          $first = $now; if ($old) { if ($old["firstAt"]) { $first = $old["firstAt"] } elseif ((Arr $old["history"]).Count) { $first = (Arr $old["history"])[0]["at"] } elseif ($old["at"]) { $first = $old["at"] } }
          $bv["reports"][$k] = @{ date = $dt; by = $uid; at = $now; firstAt = $first; text = (Dict $b["text"]); auto = (Dict $b["auto"]); history = $hist.ToArray() }
          $rev = (CurrentRev $bf) + 1; $body = J $bv; $null = SaveKey "baocao-v1" $body $rev "bao-cao" $uid
          LogEvent "bao-cao" $me ("Gửi báo cáo cuối ngày " + $dt + $(if ($old) { " (gửi lại)" } else { "" })) @{ date = $dt }
          Send $res 200 (J @{ ok = $true; report = $bv["reports"][$k] })
        }
      } else {
        $out = @{}; foreach ($k in @($bv["reports"].Keys)) { $r = $bv["reports"][$k]; if ($isA -or [string]$r["by"] -eq $uid) { $out[$k] = $r } }
        Send $res 200 (J @{ reports = $out })
      }
    }
    # /api/nvl/op: giữ / nhả / xuất / huỷ phiếu xuất NVL (giao dịch do server ghi)
    elseif ($path -eq 'api/nvl/op' -and $req.HttpMethod -eq "POST") {
      $r = NvlOp $me (ReadObj $req)
      Send $res $r.code (J $r.body)
    }
    # /api/nvl/ds-op: đơn mua NVL · chốt giao, PO ERP, QLVH, gửi NCC, hồ sơ, hoàn tất (11/11/2026, server ghi)
    elseif ($path -eq 'api/nvl/ds-op' -and $req.HttpMethod -eq "POST") {
      $r = BuyOp $me (ReadObj $req)
      if ($r.code -ne 200) { LogEvent "tu-choi" $me ("Đơn mua NVL: " + [string]$r.body.error) @{ key2 = "nvl-v3"; ds = [string]$r.ds } }
      Send $res $r.code (J $r.body)
    }
    # /api/don/op: xác nhận QLVH đã duyệt PO / Admin đính chính (V3, server ghi, xử lý từng yêu cầu một)
    elseif ($path -eq 'api/don/op' -and $req.HttpMethod -eq "POST") {
      $r = DonOp $me (ReadObj $req)
      if ($r.code -ne 200) { LogEvent "tu-choi" $me ("Đơn: " + [string]$r.body.error) @{ key2 = "kehoach-sx-v3" } }
      Send $res $r.code (J $r.body)
    }
    # /api/draft/<key>: cất bản nháp bị xung đột (không đổi bản chính)
    elseif ($path -match '^api/draft/([a-z0-9-]+)$' -and ($req.HttpMethod -eq "PUT" -or $req.HttpMethod -eq "POST")) {
      $key = $Matches[1]
      if ($Keys -notcontains $key) { Send $res 404 '{"error":"key"}' }
      else {
        $body = ReadBody $req
        $base = 0; [int64]::TryParse([string]$req.Headers["X-Base-Rev"], [ref]$base) | Out-Null
        $pg = ([string]$req.Headers["X-Page"]) -replace '[^a-z0-9.-]', ''
        $stamp = NowMs
        $name = "$key-" + (Stamp) + "-r$base-xungdot.json"
        $wrapped = '{"rev":' + $base + ',"savedAt":' + $stamp + ',"page":"' + $pg + '","by":"' + $me["id"] + '","draft":true,"value":' + $body + '}'
        [System.IO.File]::WriteAllText((Join-Path $HistDir $name), $wrapped, $utf8)
        Send $res 200 ('{"ok":true,"file":"' + $name + '"}')
      }
    }
    # /api/history: danh sách bản lưu cũ; /api/history/<tên file>: đọc 1 bản
    elseif ($path -eq 'api/history') {
      $list = Get-ChildItem $HistDir -Filter "*.json" | Sort-Object Name -Descending | ForEach-Object { '{"file":"' + $_.Name + '","size":' + $_.Length + '}' }
      Send $res 200 ('[' + ($list -join ',') + ']')
    }
    elseif ($path -match '^api/history/([a-z0-9-]+-\d{8}-\d{6}(?:-r\d+)?(?:-xungdot)?\.json)$') {
      $f = Join-Path $HistDir $Matches[1]
      if (Test-Path $f) { Send $res 200 ([System.IO.File]::ReadAllText($f, $utf8)) } else { Send $res 404 '{"error":"missing"}' }
    }
    # /api/log: nhật ký (Admin xem hết; nhân viên xem việc của mình và các mã mình phụ trách). ?oid= ?model= ?limit=
    elseif ($path -eq 'api/log') {
      $q = $req.QueryString; $lim = 500; [int]::TryParse([string]$q["limit"], [ref]$lim) | Out-Null
      $own = OwnerMap; $isAdm = $me["role"] -eq "admin"; $rows = [System.Collections.ArrayList]::new()
      # V5 (10/11/2026): người thực thi xem đủ nhật ký các đơn giao cho mình (kể cả bước Admin làm thay)
      $myEx = New-Object 'System.Collections.Generic.HashSet[string]'
      if (-not $isAdm) { $kf = Join-Path $DataDir "kehoach-sx-v3.json"
        if (Test-Path $kf) { $kv = Dict (Val ([System.IO.File]::ReadAllText($kf, $utf8))); $kms = Dict $kv["models"]
          foreach ($mk in @($kms.Keys)) { $pm = Dict $kms[$mk]; foreach ($sec in @("orders", "gapOrders")) { foreach ($o in @($pm[$sec])) { if ($o -and (ExecOf $o) -eq [string]$me["id"]) { $null = $myEx.Add([string]$o["id"]) } } } } }
        $nf2 = Join-Path $DataDir "nvl-v3.json"; if (Test-Path $nf2) { foreach ($Dx in (Arr (Dict (Val ([System.IO.File]::ReadAllText($nf2, $utf8))))["buyLists"])) { if ($Dx -and $Dx["giao"] -and ([string]$Dx["giao"]["user"] -eq [string]$me["id"] -or (Has $Dx["handovers"] { param($h) [string]$h["toUser"] -eq [string]$me["id"] }))) { $null = $myEx.Add("ds:" + [string]$Dx["id"]) } } } }
      foreach ($f in (Get-ChildItem $LogDir -Filter "*.jsonl" | Sort-Object Name -Descending | Select-Object -First 3)) {
        $lines = [System.IO.File]::ReadAllLines($f.FullName, $utf8)
        for ($i = $lines.Length - 1; $i -ge 0 -and $rows.Count -lt $lim; $i--) {
          if (-not $lines[$i]) { continue }
          $e = $JS.DeserializeObject($lines[$i])
          if ($q["oid"] -and $e["oid"] -ne $q["oid"]) { continue }
          if ($q["model"] -and $e["model"] -ne $q["model"]) { continue }
          if (-not $isAdm -and $e["by"] -ne $me["id"] -and -not ($e["model"] -and $own[[string]$e["model"]] -eq $me["id"]) -and -not ($e["oid"] -and $myEx.Contains([string]$e["oid"])) -and -not ($e["ds"] -and $myEx.Contains("ds:" + [string]$e["ds"]))) { continue }
          $null = $rows.Add($lines[$i])
        }
        if ($rows.Count -ge $lim) { break }
      }
      Send $res 200 ('[' + ($rows -join ',') + ']')
    }    # CR-02: /api/can-dat/<mã>: GET danh sách phiên bản · POST tạo phiên bản mới (khoá ngay) · /api/can-dat/<mã>/<n>: GET 1 phiên bản. Không có đường sửa / xoá
    elseif ($path -match '^api/can-dat/([a-z0-9]+)(?:/(\d+))?$') {
      $model = $Matches[1]; $vn = $Matches[2]; $mdl = CdModel $model
      if (-not $mdl) { Send $res 404 '{"error":"Không có mã này trong danh mục"}' }
      elseif ($req.HttpMethod -eq "POST" -and -not $vn) {
        $own = OwnerMap
        if ($me["role"] -ne "admin" -and $own[$model] -ne $me["id"]) { LogEvent "tu-choi" $me "Không có quyền lưu phiên bản Cần đặt $model" @{ model = $model }; Send $res 403 '{"error":"Tài khoản này không được lưu dữ liệu Cần đặt của mã này"}' }
        else {
          $b = Dict (ReadObj $req); $err = CdCheck $mdl $b
          if (-not $b["confirm"]) { $null = $err.Add("Chưa xác nhận đã đối chiếu số liệu với SIXMEN") }
          CdEnsureV0 $model
          $fs = CdFiles $model; $last = $(if ($fs.Count) { $fs[$fs.Count - 1] } else { $null })
          $curN = $(if ($last) { [int]($last.Name -replace '\D', '') } else { -1 })
          $baseN = $(if ($null -ne $b["base"] -and [string]$b["base"] -ne "") { [int]$b["base"] } else { -1 })
          if ($err.Count) { LogEvent "tu-choi" $me ("Không lưu phiên bản Cần đặt $model`: " + ($err -join "; ")) @{ model = $model }; Send $res 422 (J @{ error = "Không lưu được: " + ($err -join "; "); parts = @($err) }) }
          elseif ($baseN -ne $curN) { Send $res 409 (J @{ error = "Vừa có phiên bản V$curN được lưu sau khi bắt đầu kiểm tra. Tải lại và kiểm tra lại trước khi lưu."; current = $curN }) }
          else {
            $now = [int64](NowMs); $n = $curN + 1; if ($n -lt 1) { $n = 1 }
            $grid = { param($g, $isDay) $o = [ordered]@{}; foreach ($c in @((Dict $g).Keys)) { $a = @($g[$c]); $o[$c] = @(0..4 | ForEach-Object { $v = $(if ($_ -lt $a.Count) { $a[$_] } else { $null }); if ($null -eq $v) { $null } elseif ($isDay) { [double]$v } else { CdInt $v } }) }; $o }
            $rec = [ordered]@{ n = $n; model = $model; at = $now; by = [string]$me["id"]; sixmenAt = [string]$b["sixmenAt"]; note = [string]$b["note"]; base = $(if ($curN -ge 0) { $curN } else { $null })
              ton = (& $grid $b["ton"] $false); need = (& $grid $b["need"] $false); days = (& $grid $b["days"] $true); tot = $b["tot"]; sizes = $b["sizes"]; raw = $b["raw"]; changed = $null }
            if ($last) { $rec["changed"] = CdDiff (CdRead $last) $rec }
            try { CdWrite $model $n $rec; $okW = $true } catch { $okW = $false }
            if (-not $okW) { Send $res 409 '{"error":"Phiên bản này vừa được người khác lưu. Tải lại và kiểm tra lại."}' }
            else {
              $rec = $JS.DeserializeObject((J $rec))   # về dạng Dictionary / mảng thường như mọi dữ liệu khác (nhật ký so trước → sau đọc được)
              $hf = Join-Path $DataDir "checkhero-v3.json"; $hrev = CurrentRev $hf
              $hv = $(if (Test-Path $hf) { Val ([System.IO.File]::ReadAllText($hf, $utf8)) } else { $null }); if ($hv -isnot [System.Collections.IDictionary]) { $hv = @{ active = $model } }
              $old = $JS.DeserializeObject((J $hv)); if ($hv["heroes"] -isnot [System.Collections.IDictionary]) { $hv["heroes"] = @{} }
              $hx = Dict $hv["heroes"][$model]; if (-not $hv["heroes"].ContainsKey($model) -or $hv["heroes"][$model] -isnot [System.Collections.IDictionary]) { $hx = @{}; $hv["heroes"][$model] = $hx }
              $hx["ton"] = $rec["ton"]; $hx["need"] = $rec["need"]; $hx["days"] = $rec["days"]
              $hx["at"] = @{ ton = $now; need = $now; days = $now }; $hx["by"] = @{ ton = $rec["by"]; need = $rec["by"]; days = $rec["by"] }
              $hx["ver"] = @{ ton = "V$n"; need = "V$n"; days = "V$n" }; $hx["cd"] = @{ n = $n; at = $now; by = $rec["by"]; sixmenAt = $rec["sixmenAt"] }
              $hx["updatedAt"] = $now; $hx["updated"] = [string](Get-Date).ToString("HH:mm dd/MM")
              $hrev = $hrev + 1; $hb = J $hv
              $null = SaveKey "checkhero-v3" $hb $hrev "can-dat" ([string]$me["id"])
              LogSave "checkhero-v3" $old $hv $me "can-dat" $hrev ("Lưu và khoá phiên bản Cần đặt V$n") $false
              LogEvent "can-dat" $me ("Lưu và khoá phiên bản Cần đặt V$n · " + [string]$mdl["name"]) @{ model = $model; n = $n }
              Send $res 200 ('{"ok":true,"n":' + $n + ',"rev":' + $hrev + ',"value":' + $hb + '}')
            }
          }
        }
      }
      elseif ($req.HttpMethod -ne "GET") { Send $res 405 '{"error":"Phiên bản đã lưu không sửa / xoá được. Muốn điều chỉnh, tạo phiên bản mới."}' }
      elseif ($vn) { CdEnsureV0 $model; $f = Join-Path (Join-Path $CdDir $model) "V$([int]$vn).json"; if (Test-Path $f) { Send $res 200 ([System.IO.File]::ReadAllText($f, $utf8)) } else { Send $res 404 '{"error":"Không có phiên bản này"}' } }
      else {
        CdEnsureV0 $model; $fs = CdFiles $model; $rows = [System.Collections.ArrayList]::new(); $k = 0
        foreach ($f in $fs) { $k++; try { $null = $rows.Add((CdSummary (CdRead $f) ($k -eq $fs.Count))) } catch {} }
        $rows.Reverse()
        Send $res 200 (J @{ model = $model; current = $(if ($fs.Count) { [int]($fs[$fs.Count - 1].Name -replace '\D', '') } else { $null }); items = $rows })
      }
    }
    # /api/phien-ban/<mã>: POST lưu 1 phiên bản bảng (tồn / cần đặt / ngày còn bán); GET danh sách; /api/phien-ban/<mã>/<id>: đọc 1 bản
    elseif ($path -match '^api/phien-ban/([a-z0-9]+)(?:/([a-z]+-\d{8}-\d{6}-[a-z0-9]+))?$') {
      $model = $Matches[1]; $vid = $Matches[2]; $dir = Join-Path $VerDir $model
      if ($req.HttpMethod -eq "POST") {
        $own = OwnerMap
        if ($me["role"] -ne "admin" -and $own[$model] -ne $me["id"]) { LogEvent "tu-choi" $me "Không có quyền lưu phiên bản dữ liệu $model" @{ model = $model }; Send $res 403 '{"error":"Không có quyền với mã này"}' }
        else {
          $b = ReadObj $req; $kind = [string]$b["kind"]
          if (@("ton", "need", "days") -notcontains $kind) { Send $res 400 '{"error":"kind"}' }
          else {
            New-Item -ItemType Directory -Force $dir | Out-Null
            $rnd = -join ((48..57) + (97..122) | Get-Random -Count 4 | ForEach-Object { [char]$_ })
            $id = "$kind-" + (Stamp) + "-$rnd"
            $rec = @{ id = $id; model = $model; kind = $kind; at = [int64](NowMs); by = [string]$me["id"]; source = [string]$b["source"]; value = $b["grid"] }
            [System.IO.File]::WriteAllText((Join-Path $dir "$id.json"), (J $rec), $utf8)
            LogEvent "phien-ban" $me ("Lưu phiên bản " + @{ ton = "bảng tồn kho"; need = "bảng cần đặt"; days = "ngày còn bán" }[$kind]) @{ model = $model; vid = $id }
            $null = PruneVersions $model
            Send $res 200 ('{"ok":true,"id":"' + $id + '"}')
          }
        }
      }
      elseif ($vid) { $f = Join-Path $dir "$vid.json"; if (Test-Path $f) { Send $res 200 ([System.IO.File]::ReadAllText($f, $utf8)) } else { Send $res 404 '{"error":"missing"}' } }
      else {
        # file phiên bản hỏng thì bỏ qua, không làm lỗi cả danh sách
        $rows = [System.Collections.ArrayList]::new()
        if (Test-Path $dir) { foreach ($f in (Get-ChildItem $dir -Filter "*.json" | Sort-Object LastWriteTime -Descending)) { try { $o = $JS.DeserializeObject([System.IO.File]::ReadAllText($f.FullName, $utf8).TrimStart([char]0xFEFF)); $null = $rows.Add(@{ id = $o["id"]; kind = $o["kind"]; at = $o["at"]; by = $o["by"]; source = $o["source"]; size = $f.Length }) } catch {} } }
        Send $res 200 (J @{ items = $rows; keepDays = $VerKeepDays; totalBytes = [int64]$(if ($rows.Count) { ($rows | ForEach-Object { [int64]$_["size"] } | Measure-Object -Sum).Sum } else { 0 }) })
      }
    }    elseif ($isApi) { Send $res 404 '{"error":"api"}' }
    else {
      if ($path -eq '') { $path = $(if (Test-Path (Join-Path $Root 'tong-quan.html')) { 'tong-quan.html' } else { 'check-hero.html' }) }
      $file = [System.IO.Path]::GetFullPath((Join-Path $Root $path))
      if ($file.StartsWith([System.IO.Path]::GetFullPath($Root)) -and -not $file.StartsWith([System.IO.Path]::GetFullPath($DataDir)) -and $types.ContainsKey([System.IO.Path]::GetExtension($file).ToLower()) -and (Test-Path $file -PathType Leaf)) {
        $bytes = [System.IO.File]::ReadAllBytes($file)
        $ext = [System.IO.Path]::GetExtension($file).ToLower()
        $res.ContentType = if ($types.ContainsKey($ext)) { $types[$ext] } else { "application/octet-stream" }
        $res.Headers.Add("Cache-Control", "no-cache")
        $res.ContentLength64 = $bytes.Length
        $res.OutputStream.Write($bytes, 0, $bytes.Length)
      } else {
        $res.StatusCode = 404
      }
    }
  } catch {
    $err = $_.Exception.Message
    try { LogEvent "loi-server" $(if ($me) { $me } else { @{} }) ("Lỗi server " + $req.HttpMethod + " /" + $path + ": " + $err) $null } catch {}   # lỗi 500 trước đây không để lại dấu vết
    try { Send $res 500 ('{"error":"' + ($err -replace '"', "'") + '"}') } catch {}
  }
  $res.Close()
}