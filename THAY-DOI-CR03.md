# CR03: Tái tổ chức Kế hoạch sản xuất (nhánh `cr03-ke-hoach`, 24/11/2026)

Nền: `cr02-cap-nhat-can-dat` (V5.4 + CR01 + CR02, chưa merge). Quản lý đã duyệt Giai đoạn A ngày 24/11/2026.

Các quyết định đã chốt:
- Thêu và phôi theo phương án A.
- Giữ danh sách xưởng hiện có.
- KHTL áp dụng cho cả 4 loại hình, được lưu khi chưa chọn xưởng.
- "Cần xử lý" gồm: đơn bị trả lại, vướng mắc, chốt ngoại lệ còn thiếu NVL, thiếu NVL có nguy cơ trễ hoặc đã quá hạn.
- Thứ tự ưu tiên giữ Nguy hiểm → Bán chạy → Bình thường.
- Phiên bản nhu cầu mới: bắt buộc xác nhận đã xem chênh lệch, không chặn chốt, không tự sửa số.

## Thay đổi theo nhóm

| Nhóm | Nội dung | File |
|---|---|---|
| B1 | **4 tab** ① Nhu cầu cần xử lý · ② Lập kế hoạch · ③ Kế hoạch tương lai · ④ Chờ bàn giao & Cần xử lý. **6 chỉ số** đầu trang, bấm vào thì mở đúng tab kèm bộ lọc. Mỗi hồ sơ chỉ được đếm ở một ô. Có link mới `?v=bg`; link cũ `#b1`–`#b5`, `?v=khtl`, `&bg=` vẫn mở đúng. | `ke-hoach.html` |
| B2 | **Tab Nhu cầu**: thêm cột Ưu tiên (Nguy hiểm / Bán chạy / Bình thường), Đã lập KH, Đã chốt (hai cột này chỉ để tham chiếu, không trừ Cần đặt) và Phiên bản (V<n> của CR02). Thêm bộ lọc theo ưu tiên và chip "Cần lập kế hoạch". Nút Lập kế hoạch đặt tại từng mã. | `ke-hoach.html` |
| B3 | **Lập kế hoạch**: chọn 1 · Loại hình, rồi 2 · Xưởng. Danh sách xưởng lọc từ danh sách hiện có, không thêm tên mới; thêu và phôi lấy NCC theo danh mục. Có ô xưởng trên kế hoạch chưa chốt và ô Ngày giao dự kiến. Lập thêm cho mã đã có hồ sơ thì hiện cảnh báo trùng, không chặn, không trừ Cần đặt. Có danh sách "Kế hoạch đang lập · mọi mã". Thêu và phôi (phương án A) vẫn 1 bảng đang lập mỗi mã, nhưng **chốt phải qua danh sách điều kiện**. Xưởng bắt buộc khi chốt. | `ke-hoach.html` |
| B4 | **Phiên bản nhu cầu**: kế hoạch lưu `needV`, tức V Cần đặt lúc lập. Khi có bản mới: nút So sánh hiện bảng V cũ / V mới / chênh lệch / số kế hoạch (đọc bản khoá CR02). Dòng điều kiện ở mức "Cần kiểm tra"; chốt bắt buộc tick xác nhận, lưu vào `needAck {v, from, at, by}`. Đơn chốt ghi thêm `basis.v`. **Server** từ chối (422) khi chốt mà chưa có xưởng, hoặc lập theo V cũ mà chưa xác nhận V đang dùng. | `ke-hoach.html`, `server.ps1` |
| B5 | **KHTL thống nhất**: áp dụng cho cả 4 loại hình, lưu được khi chưa có xưởng hoặc số lượng. Điều kiện còn thiếu tính theo loại hình: số lượng, xưởng, NVL (gia công). Lọc theo "Đủ điều kiện · chờ chốt" / "Chưa đủ". Không tự chốt; chốt trên chính hồ sơ, chọn xưởng ngay lúc chốt nếu chưa có. KHTL thêu / phôi khi chốt thành đơn thêu / phôi cùng mã hồ sơ, giữ lịch sử. **Bản nháp đợt sau gộp vào KHTL**: dữ liệu cũ tự chuyển một lần thành KHTL gia công chưa chọn xưởng, giữ đúng số, liên kết đặt mua đi theo. Khối Bản nháp không còn hiện. | `ke-hoach.html`, `nvl-core.js`, `server.ps1` |
| B6 | **Chờ bàn giao & Cần xử lý** gộp mọi mã theo bộ lọc. Mỗi đơn thuộc đúng một nhóm theo thứ tự: Cần xử lý (trả lại · vướng mắc · chốt ngoại lệ còn thiếu NVL · thiếu NVL nguy cơ trễ / quá hạn), rồi Chưa bàn giao, rồi Chờ tiếp nhận. Mỗi thẻ có lý do, dòng "Tiếp theo" và nút hành động (Bàn giao, Đặt mua NVL, Chi tiết đơn). Tiếp nhận xong và hết vấn đề thì đơn rời danh sách. Chốt ngoại lệ lưu thêm bảng NVL còn thiếu (`chotOverride.short`). Khi thiếu NVL, thẻ chốt hiện phương án A · Lưu KHTL và B · Chốt ngoại lệ (Admin). | `ke-hoach.html` |
| Chung | Xưởng trống không làm lỗi trang khác: `XUONG[o.xuong]` trả về "Chưa chọn xưởng" trong `don.js` và `nvl-trang.js`. `nvl-core.js` tính NVL cho kế hoạch gia công chưa chọn xưởng. Server cho kế hoạch đó nhận phân bổ vải. Nút tạo đơn theo tên xưởng cũ vẫn giữ trong trang (ẩn). | `don.js`, `nvl-trang.js`, `nvl-core.js`, `server.ps1` |

**Không đổi:**
- Công thức Tồn kho / Cần đặt và nguyên tắc không trừ PO (CR01).
- Phiên bản khoá Cần đặt (CR02).
- Giữ / nhả / xuất NVL.
- PO ERP, QLVH, tiếp nhận, gửi xưởng, Giám sát.
- Quyền hiện hành.
- Dữ liệu lịch sử.

Không thêm trạng thái lưu mới. Các trạng thái được tính từ dữ liệu có sẵn; chỉ thêm các trường `kind`, `needV`, `needAck`, `basis.v`, `chotOverride.short` và `plan.gapDraft`.

## Ghi chú vận hành
- Thêu và phôi nay qua danh sách điều kiện như các loại khác. Nếu mã có "Dữ liệu nhu cầu" Chưa đạt (chưa cập nhật / lỗi) thì chưa chốt được; trước đây đơn thêu / phôi chốt thẳng.
- Đơn và KHTL lập trước CR03 không có `needV` nên không bị yêu cầu xác nhận phiên bản; dòng điều kiện ghi "lập trước khi có phiên bản".
- Thứ tự ưu tiên trong một tab: Cần xử lý trước, rồi Chưa bàn giao. Đơn vừa chưa bàn giao vừa thiếu NVL được xếp vào Cần xử lý, thẻ vẫn có nút Bàn giao.
- Triển khai cần khởi động lại server vì có sửa `server.ps1`.

## Kiểm thử (24/11/2026, dữ liệu mẫu đủ trạng thái, cổng tạm 8097, không đụng bản chính)
| Bộ | Kết quả |
|---|---|
| 20 kịch bản CR03 (tcr03, 28 kiểm tra trang + API + server) | 28/28 · 42 lượt mở trang 0 lỗi JS |
| CR02 server phiên bản khoá | 21/21 |
| CR02 màn Cập nhật Cần đặt | 25/25 |
| CR01 | 12/12 |
| Hồi quy V5.4 bản hoàn thiện | 25/25 |
| Hồi quy V5.4 Đợt 3 | 29/29 · JS 81 lượt 0 lỗi |
| Hồi quy V5.4 Đợt 2 | 37/38 · JS 75 lượt 0 lỗi · NVL-03 sai từ trước CR-01 (ghi nhận riêng) |

Bộ Đợt 2 cập nhật 2 kiểm tra theo thay đổi CR03 đã duyệt: tên dòng "SKU & loại hình" + dòng "Phiên bản nhu cầu"; so mã nguồn chotChecks nay yêu cầu khối NVL gia công và quy tắc chốt ngoại lệ giữ đúng từng ký tự V5.3.