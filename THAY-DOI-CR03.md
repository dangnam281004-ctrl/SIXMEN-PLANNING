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
- (Đã thay bằng FIX-04 bên dưới) Nhóm chính để đếm chỉ số: Chưa bàn giao > Cần xử lý > Chờ tiếp nhận.
- Triển khai cần khởi động lại server vì có sửa `server.ps1`.

## Đợt hoàn thiện CR03 (FIX-01 → FIX-07, quản lý duyệt 24/11/2026)
| Nhóm | Đã có | Sửa / bổ sung trong đợt này | File |
|---|---|---|---|
| FIX-01 Kiểm soát chốt | Giữ NVL qua server, không vượt khả dụng (409); chốt ngoại lệ chỉ Admin | **Server kiểm NVL khi chốt gia công thường.** Trang gửi `nvlChk` gồm nhu cầu từng NVL, người kiểm và giờ kiểm (≤ 30 phút). Server đối chiếu nhu cầu với 4 nguồn: sổ phân bổ, phiếu xuất, tồn khả dụng và hàng đặt mua đang về của chính đơn. Server cũng bắt buộc đủ nhóm Vải / Bo / Nhãn sườn và tổng vải ≥ số cây. Thiếu thì trả 422. **Chốt ngoại lệ bắt buộc có lý do (server).** Phạm vi áp dụng: đơn vừa chốt có `closedTs` trong 1 ngày, kể cả đơn mới tạo đã chốt. | `server.ps1` (`NvlChotErr`, `GuardPlan`), `ke-hoach.html` |
| FIX-02 Bàn giao đặt NVL | Chốt nhu cầu mua → bàn giao → tiếp nhận / trả lại → PO ERP → QLVH → gửi NCC → nhận hàng → hồ sơ (`/api/nvl/ds-op`); trạng thái bàn giao tách riêng (`buyBg`) | **Hộp chọn người thực hiện** khi bàn giao yêu cầu đặt NVL và khi bàn giao đơn sản xuất. Mặc định là người thực thi trong Danh mục; server đã hỗ trợ `toUser`. | `khung.js` (`pickUser`), `nvl-trang.js`, `ke-hoach.html` |
| FIX-03 NVL ↔ KHTL | Lập yêu cầu đặt từ phần thiếu (tự điền), đặt trước rồi gắn sau (`du-kien`), một đơn mua cho nhiều kế hoạch, phân bổ không trùng, hàng chưa kiểm nhận không tính khả dụng, về một phần, cảnh báo đủ điều kiện (không tự chốt) | Thẻ KHTL hiện trạng thái bàn giao và người thực hiện của từng đơn mua NVL liên quan. Nút đổi tên thành "Lập yêu cầu đặt NVL thiếu". | `ke-hoach.html` |
| FIX-04 Bàn giao sản xuất & cần xử lý | Danh sách gộp mọi mã | Mỗi đơn hiện 4 trạng thái tách riêng (Kế hoạch · Bàn giao · NVL · Thực thi) và người phụ trách. Các vấn đề là cờ độc lập. **Nhóm chính để đếm: Chưa bàn giao > Cần xử lý > Chờ tiếp nhận**, nên đơn chốt ngoại lệ thiếu NVL chưa bàn giao vẫn ở "Đơn chờ bàn giao" và có nút bàn giao. Bộ lọc nhiều chiều: Chưa bàn giao, Chờ tiếp nhận, Bị trả lại, Vướng mắc, Thiếu NVL, Chốt ngoại lệ còn thiếu NVL. Cảnh báo thiếu NVL ngay từ lúc chốt ngoại lệ. | `ke-hoach.html` |
| FIX-05 Dữ liệu nhu cầu | Bảng so sánh / xác nhận phiên bản (CR03) | Chưa từng có số nhu cầu: Chưa đạt, cập nhật trước khi chốt. Đã có số nhưng cũ (quá kỳ / đến kỳ / chưa ghi giờ cập nhật): Cần kiểm tra, khi chốt bắt buộc xác nhận, lưu `dataAck {at, by, state}`. Áp dụng cả 4 loại hình. | `ke-hoach.html` |
| FIX-06 Giao diện | 4 tab, 6 chỉ số | Dòng **Bước · Còn thiếu · Phụ trách · Tiếp theo** trên thẻ kế hoạch đang lập, thẻ KHTL và thẻ đơn chờ bàn giao. Thao tác đặt mua / theo dõi NVL vẫn ở trang Đặt mua NVL. | `ke-hoach.html` |
| FIX-07 Kiểm thử | — | Bổ sung kịch bản NV-01 → NV-11, FIX-01 qua API, và nâng cấp / rollback trên bản sao dữ liệu thật. | (bộ kiểm thử) |

## Kiểm thử Giai đoạn B (24/11/2026, dữ liệu mẫu đủ trạng thái, cổng tạm 8097, không đụng bản chính)
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
## Kiểm thử trên commit cuối 9822f14 (24/11/2026, cổng tạm 8096–8099, bản sao dữ liệu, không đụng bản chính)
| Bộ | Kết quả |
|---|---|
| CR03 mở rộng (KH-01 → 20, NV-01/02/04/05/07/11, FIX-01/02/04) | 37/37 · 44 lượt mở trang 0 lỗi JS |
| Nâng cấp trên bản sao dữ liệu bản chính (NC-01, NC-02) | Đạt: 11 trang 0 lỗi JS, dữ liệu không đổi |
| Rollback về code V5.4 (NC-04) | Đạt: không mất dữ liệu |
| Rollback khi còn KHTL gia công chưa chọn xưởng (NC-03) | Code V5.4 lỗi JS ở 3 trang Kế hoạch (`XUONG[o.xuong].type`) → bắt buộc chạy `CR03-kiem-truoc-rollback.ps1` và gán xưởng / xoá bản nháp trước khi rollback |
| CR02 server phiên bản khoá | 21/21 |
| CR02 màn Cập nhật Cần đặt | 25/25 (lần chạy chung 23/25 do Chrome khởi động nguội ở trang đầu; chạy lại riêng đạt đủ) |
| CR01 | 12/12 · JS 90 lượt 0 lỗi |
| Hồi quy V5.4 bản hoàn thiện | 25/25 |
| Hồi quy V5.4 Đợt 3 | 29/29 · JS 81 lượt 0 lỗi |
| Hồi quy V5.4 Đợt 2 | 37/38 · JS 75 lượt 0 lỗi · NVL-03 sai từ trước CR-01 (chỉ là chữ nhãn cột, chức năng đã làm ở Đợt 3) |
## Giai đoạn B · giao diện theo mockup đã duyệt (D-1 → D-5), commit 2fd9ac4 (25/11/2026)
| Nhóm | Thay đổi | File |
|---|---|---|
| Đầu trang & thẻ | Dải kỳ cập nhật / phiên bản mới / dữ liệu cũ; đơn vị đếm; dòng phụ thẻ 1 (D-3) và thẻ KHTL chưa đủ: (a) gia công thiếu NVL chưa có đơn mua · (b) có đơn mua Nháp / chưa bàn giao / bị trả lại; thẻ 5 / 6 theo D-4 | `ke-hoach.html` |
| Tab Nhu cầu | 8 cột theo mockup; nhãn Chưa lập / Đã lập theo Vx có Vy / Đang lập cần xác nhận / Dữ liệu cũ; bộ lọc; dải cảnh báo | `ke-hoach.html` |
| Tab Lập kế hoạch | 4 ô bước; tóm tắt mã; ô tick xác nhận dữ liệu cũ cạnh nút Chốt (`dataAck.via=tick`); nút Lưu KHTL & lập đơn mua NVL thiếu | `ke-hoach.html` |
| Tab KHTL | Bảng 6 cột; lọc Đang chờ tôi / Đã giao nhân viên; đơn mua bị trả lại kèm lý do; gắn đơn mua có sẵn; chi tiết dưới dòng | `ke-hoach.html` |
| Tab Bàn giao | 3 bảng D-4 (Cần xử lý → Chưa bàn giao → Chờ tiếp nhận), 5 cột, tìm kiếm; Đổi người nhận chỉ Admin (D-5, `doi-thuc-thi` sẵn có) | `ke-hoach.html` |
| Quản lý NVL | `?plan=` lọc theo kế hoạch + chốt & bàn giao hàng loạt từng đơn (D-1), kết quả từng đơn + thử lại; `?gan=` gắn đơn mua đặt trước (`du-kien` sẵn có) | `nvl-trang.js` |
| Server | Không sửa | — |

Kiểm thử trên 2fd9ac4: Giai đoạn B 21/21 · CR03 37/37 · CR02 21/21 + 25/25 · CR01 12/12 · V5.4 27/27 · 29/29 · 37/38 (NVL-03 từ trước) · nâng cấp / rollback như ghi chú ở trên (NC-03 cần dọn KHTL chưa có xưởng trước khi rollback).