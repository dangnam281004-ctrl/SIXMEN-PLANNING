# SIXMEN Planning sản xuất (V5.4)

Ứng dụng web nội bộ lập kế hoạch sản xuất, theo dõi đơn, NVL. Server: Windows PowerShell 5.1 (`server.ps1`), dữ liệu là file JSON trong `du-lieu/` (không có trong repo).

## Chạy
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File server.ps1 -Port 8080
```
Lần đầu mở http://localhost:8080 sẽ tạo tài khoản Admin. Chạy sau HTTPS (Cloudflare Tunnel) thì thêm `-Secure`.

## Lưu ý
- Thư mục `du-lieu/` chứa tài khoản và dữ liệu thật: không commit (đã có trong .gitignore).
- Không mở thẳng cổng ra Internet; dùng tunnel có HTTPS.
