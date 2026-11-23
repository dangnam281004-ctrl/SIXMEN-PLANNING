# CR-02: Cập nhật dữ liệu Cần đặt, phiên bản khoá (nhánh `cr02-cap-nhat-can-dat`, 23/11/2026)

Nền: nhánh `cr01-bo-tru-po` (CR-01 đã PASS, chưa merge).
Màn "Phân tích nhu cầu" chỉ nhận số Tồn kho / Cần đặt SIXMEN đã tính sẵn. Planning không tính lại, không trừ PO, không đổi số sau khi lưu.

## Thay đổi
| File | Nội dung |
|---|---|
| `server.ps1` | API mới `/api/can-dat/<mã>`: GET danh sách phiên bản · POST tạo phiên bản mới (khoá ngay) · GET `/<mã>/<n>` đọc 1 phiên bản. **Không có** đường sửa / xoá (PUT / DELETE / PATCH → 405). Mỗi phiên bản là file `du-lieu/can-dat/<mã>/V<n>.json`, tạo bằng CreateNew, đặt chỉ đọc, không bị dọn. Server tự kiểm lại trước khi lưu: quyền (Admin / người phụ trách mã), màu / size khớp danh mục, ô là số nguyên hoặc trống, tổng từng dòng / cột / toàn bảng khớp dòng Tổng SIXMEN, đã tick xác nhận, đúng phiên bản gốc (có người lưu trước → 409). Lưu xong server chép số vào `checkhero-v3` (bản "đang dùng") cho Kế hoạch và các màn khác đọc. Lưu thường `/api/data/checkhero-v3` không đổi được Tồn / Cần đặt / ngày còn bán (server giữ nguyên bản đang dùng). Bảng có sẵn trước khi khoá → V0 (giữ nguyên số). |
| `check-hero.html` | Làm lại thành 3 bước: **1 Cập nhật dữ liệu** (thẻ Phiên bản đang dùng + cảnh báo kỳ T2·T4·T6, chọn sản phẩm, giờ lấy số SIXMEN, 2 khung dán Tồn kho / Cần đặt, Nhập Excel, Tải mẫu, xem trước đúng số, ô trống ≠ 0) · **2 Kiểm tra & xác nhận** (4 thẻ: Tổng khớp, Mã khớp danh mục, Ô cần xem, Ô thay đổi; bảng thay đổi so với bản trước; khung tham khảo đơn chốt sau lần cập nhật trước, "Số Cần đặt không bị trừ"; xác nhận bắt buộc) · **3 Đã lưu & khoá** (banner, bảng phiên bản Đang dùng / Đã thay thế, Xem, So sánh 2 bản bất kỳ). Bỏ đọc từ ảnh. Bộ lọc Mã của tôi / Theo người / Ngành giữ như cũ. |
| `phan-tich-cu.html` | Bản sao màn phân tích cũ (Đặt gấp / Gom đơn / Nhận định / Đề xuất), giữ code để chuyển sang Lập kế hoạch. Không có trong menu, có dải ghi chú "không dùng để nhập số". |
| `lib/xlsx.full.min.js` | SheetJS 0.18.5 (Apache-2.0) để đọc / tạo file Excel, chạy không cần internet; chỉ tải khi bấm Nhập Excel / Tải mẫu. |

Không đổi: công thức Kế hoạch (CR-01), PO / ERP / QLVH, NVL, bàn giao, quyền, dữ liệu lịch sử (`du-lieu/phien-ban` cũ vẫn giữ).

## Lưu ý
- Giờ "cập nhật Cần đặt" mà Kế hoạch dùng (nhãn ⓘ CR-01) = giờ lưu phiên bản vào Planning; giờ lấy số SIXMEN lưu riêng.
- Kế hoạch vẫn coi ô trống là 0 khi cộng Còn phải đặt (như trước); số lưu vẫn là trống.
- Dán dạng chữ không có cấu trúc ô (không phải bảng / không có tab) bị từ chối, vì không phân biệt được ô trống.

## Kiểm thử (23/11/2026, dữ liệu mẫu, cổng tạm, không đụng bản chính)
| Bộ | Kết quả |
|---|---|
| Server phiên bản khoá (tcr02-api) | 21/21 |
| Màn Cập nhật dữ liệu Cần đặt (tcr02-ui) | 25/25 · quét JS 69 lượt (23 trang × 3 vai trò) 0 lỗi |
| CR-01 | 12/12 · quét JS 0 lỗi |
| Hồi quy bản hoàn thiện | 25/25 |
| Hồi quy Đợt 3 | 29/29 · JS 81 lượt 0 lỗi |
| Hồi quy Đợt 2 | 37/38 · JS 75 lượt 0 lỗi · NVL-03 sai từ trước CR-01 (ghi nhận riêng) |
