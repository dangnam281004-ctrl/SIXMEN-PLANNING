# CR-01: Planning không đối trừ PO (nhánh `cr01-bo-tru-po`, 20/11/2026)

Quyết định của chủ hệ thống: Cần đặt do người quản lý cung cấp, đã được xử lý ở hệ thống SIXMEN bên ngoài. Planning chỉ tiếp nhận số này, tổ chức kế hoạch, bàn giao và theo dõi PO / tiến độ xưởng.
Phương án đã duyệt: **chỉ cảnh báo, không thay đổi số liệu**.

## Thay đổi
| File | Nội dung |
|---|---|
| `phan-tich.js` | Còn phải đặt (D) = đúng Cần đặt (B) người quản lý nhập. Bỏ phép trừ "phần đơn SIXMEN chưa tính" và trạng thái "chưa xác định / Cần đối chiếu". Thêm `closedAfter()`: đơn chốt sau lần cập nhật Cần đặt gần nhất → `r.after` / `r.afterO`, chỉ để cảnh báo. Đã đặt (C), số ngày đủ bán, nhóm Đặt gấp / Gom đơn / Cần kiểm tra dữ liệu giữ nguyên. |
| `check-hero.html` | Không nạp `doi-chieu.js`. Bỏ thanh cảnh báo + nút "Đối chiếu đơn đã đặt", link `?dc=`. Thay bằng dòng ⓘ liệt kê size / đơn chốt sau cập nhật Cần đặt. Sửa chú thích cách tính. |
| `ke-hoach.html` | Bỏ cột "Đối chiếu SIXMEN" (thay bằng cột Chốt + nhãn ⓘ), cảnh báo "chưa có số chính thức", khoảng "nếu đã trừ / chưa trừ". Bỏ chặn chốt Kế hoạch tương lai vì chưa đối chiếu. Ghi `closedTs` (giờ chốt) khi chốt đơn / đơn gấp. "Mã tiếp theo" bỏ qua SKU đã có đơn chốt sau cập nhật Cần đặt. |
| `canh-bao.js` | Danh sách SKU: Còn phải đặt = Cần đặt; thêm `after`. |
| `don.js` | Trạng thái mã: bỏ "Cần đối chiếu"; size cần đặt mà đã có đơn chốt sau cập nhật Cần đặt → "Đã xử lý" (chỉ trạng thái, số không đổi). |

Không đổi: `server.ps1`, PO / 2 PO ERP, QLVH, NVL, bàn giao / tiếp nhận, tiến độ xưởng, giao nhận, quyền. `doi-chieu.js` vẫn để trong thư mục (không nạp).
Dữ liệu cũ giữ nguyên: `o.sxRefl`, `o.sxReflLog`, `ptCfg.sixmenPO`, lịch sử chuyển Kế hoạch. Không xoá, không ghi đè.

## Kiểm thử
Xem báo cáo nghiệm thu CR-01 (dữ liệu mẫu, cổng tạm 8096, không đụng bản chính).
