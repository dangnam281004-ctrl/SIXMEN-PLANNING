# V5.4 hoàn thiện (nhánh `v5.4-hoan-thien`, 19/11/2026)

Nền: 12 yêu cầu V5.4 (Đợt 1–3) và bản vá `server.ps1` (danh sách 1 dòng bị đổi thành đối tượng khi lưu Kế hoạch) đã có trên `main`.
Nhánh này chỉ thêm phần còn thiếu của chỉ thị tổng hợp: công cụ người thực thi nằm trong **Chi tiết đơn**.

## Thay đổi
| File | Nội dung |
|---|---|
| `don-hang.html` | Nút **Chuẩn bị & gửi xưởng** (đơn gia công / FOB đã tiếp nhận, QLVH đã duyệt): mở khung ngay trên trang, nhúng đúng màn Gửi xưởng cũ (xuất NVL, việc gửi xưởng, kiểm NVL, ngoại lệ Admin). Gửi xong khung tự đóng, trang hiện bước tiếp. **Sao chép nội dung đơn** (bảng màu × size dạng tab). **Tech Pack · ảnh SP** (theo quyền Tech Pack hiện có). |
| `ke-hoach.html` | `?gui=<id>&embed=1`: chế độ nhúng của màn Gửi xưởng (ẩn menu / thanh trên / nút trùng, link mở ở cửa sổ chính, báo trang cha khi đã gửi). Không đổi logic gửi. |
| `don.js` | `Don.guiHref` → `don-hang.html?id=…#gui-xuong` (mọi nút "Gửi xưởng" ở Tổng quan / Quản lý đơn mở Chi tiết đơn). Link cũ `ke-hoach.html?gui=…` vẫn dùng được. |
| `Tech-Pack-Hang-Hoa.html` | `?ma=<mã SP>` mở đúng mã. |

Không đổi: `server.ps1`, công thức Tồn / Cần đặt / Đã đặt / Trụ, quyền, dữ liệu, checklist, PO / QLVH.

## Kiểm thử (dữ liệu mẫu, cổng tạm, không đụng bản chính)
- Bộ mới 25/0: gửi xưởng FOB và gia công trong Chi tiết đơn; NVL thiếu → nhân viên bị chặn, Admin gửi ngoại lệ phải có lý do; thêu / phôi không áp NVL; luồng đủ 4 loại đơn (bàn giao → tiếp nhận theo checklist của loại → 2 PO + QLVH → đúng nút gửi); mẫu gửi xưởng 4 loại; sao chép; Tech Pack.
- Mở 29 trang × 3 vai trò: 0 lỗi JS, dữ liệu không đổi khi chỉ mở trang.
- Hồi quy Đợt 3: 29/0 · Đợt 2: 37/1 (NVL-03: chênh lệch có chủ đích từ Đợt 3, giống trước khi sửa).
