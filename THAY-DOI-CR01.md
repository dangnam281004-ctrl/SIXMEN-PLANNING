# CR-01: Planning không đối trừ PO (nhánh `cr01-bo-tru-po`, 20/11/2026)

Quyết định của chủ hệ thống: Cần đặt do người quản lý cung cấp, đã được xử lý ở hệ thống SIXMEN bên ngoài. Planning chỉ tiếp nhận số này, tổ chức kế hoạch, bàn giao và theo dõi PO / tiến độ xưởng.
Phương án đã duyệt: **chỉ cảnh báo, không thay đổi số liệu**.

## Thay đổi
| File | Nội dung |
|---|---|
| `phan-tich.js` | Còn phải đặt (D) = đúng Cần đặt (B) người quản lý nhập. Bỏ phép trừ "phần đơn SIXMEN chưa tính" và trạng thái "chưa xác định / Cần đối chiếu". Thêm `closedAfter()`: đơn chốt sau lần cập nhật Cần đặt gần nhất → `r.after` / `r.afterO`, chỉ để cảnh báo. Đã đặt (C), số ngày đủ bán, nhóm Đặt gấp / Gom đơn / Cần kiểm tra dữ liệu giữ nguyên. |
| `check-hero.html` | Không nạp `doi-chieu.js`. Bỏ thanh cảnh báo + nút "Đối chiếu đơn đã đặt", link `?dc=`. Thay bằng dòng ⓘ liệt kê size / đơn chốt sau cập nhật Cần đặt. Sửa chú thích cách tính. |
| `ke-hoach.html` | Bỏ cột "Đối chiếu SIXMEN" (thay bằng cột Chốt + nhãn ⓘ), cảnh báo "chưa có số chính thức", khoảng "nếu đã trừ / chưa trừ". Bỏ chặn chốt Kế hoạch tương lai vì chưa đối chiếu. Ghi `closedTs` (giờ chốt) khi chốt đơn / đơn gấp. |
| `canh-bao.js` | Danh sách SKU: Còn phải đặt = Cần đặt; thêm `after` (chỉ để hiện nhãn). |

Nghiệm thu (phương án B, 20/11/2026): nhãn **"ⓘ Đã có đơn chốt sau lần cập nhật Cần đặt"** chỉ để thông tin. Không đổi số, công thức, trạng thái "Cần đặt", "Mã tiếp theo", điều kiện lập / chốt đơn. `don.js` giữ nguyên như trước CR-01.

Ghi nhận riêng (không sửa trong CR-01): bài hồi quy NVL-03 (nhãn cột Tại xưởng) sai từ trước CR-01.

Không đổi: `server.ps1`, PO / 2 PO ERP, QLVH, NVL, bàn giao / tiếp nhận, tiến độ xưởng, giao nhận, quyền. `doi-chieu.js` vẫn để trong thư mục (không nạp).
Dữ liệu cũ giữ nguyên: `o.sxRefl`, `o.sxReflLog`, `ptCfg.sixmenPO`, lịch sử chuyển Kế hoạch. Không xoá, không ghi đè.

## Kiểm thử (20/11/2026, dữ liệu mẫu, cổng tạm, không đụng bản chính) — PASS
| Bộ | Kết quả |
|---|---|
| CR-01 (Còn phải đặt = Cần đặt 85 size · nhãn ⓘ chỉ cho đơn chốt sau cập nhật · chốt không bị chặn, số trước = sau · trạng thái mã không đổi theo nhãn · bảng Cần đặt + dữ liệu đối chiếu cũ giữ nguyên) | 12/12 · quét JS 87 lượt (29 trang × 3 vai trò) 0 lỗi · chỉ mở trang dữ liệu không đổi |
| Hồi quy bản hoàn thiện (4 loại đơn, bàn giao → tiếp nhận, 2 PO ERP + QLVH, NVL, gửi xưởng) | 25/25 |
| Hồi quy Đợt 3 | 29/29 · JS 78 lượt 0 lỗi |
| Hồi quy Đợt 2 (KH-01 cập nhật theo CR-01) | 37/38 · JS 72 lượt 0 lỗi · NVL-03 sai từ trước CR-01 (đối chiếu trên commit d82cb84: cùng kết quả) |
