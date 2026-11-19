/* Số áo từng size của 1 dòng đơn xưởng — dùng chung cho Kế hoạch, Tồn kho NVL, Theo dõi để mọi màn hình ra cùng một số.
   - Dòng đã lưu cố định (l.sizes, lưu khi Chốt đơn / Xác nhận xuất NVL / Lưu điều chỉnh): dùng đúng số đó,
     không tính lại khi đổi tỉ lệ size hay định mức áo/cây.
   - Đơn cũ đã chốt / đã xuất NVL nhưng chưa có số cố định: giữ cách tính lúc đó (làm tròn từng size như ROUND),
     chờ đối chiếu với bảng đã gửi xưởng, KHÔNG tự đổi.
   - Đơn chưa chốt / đơn mới / đang điều chỉnh: tổng = số cây × định mức, chia theo tỉ lệ bằng phần dư lớn nhất
     (tổng luôn đúng bằng số cây × định mức). Phần lẻ bằng nhau → size có tỉ lệ lớn hơn; vẫn bằng → size đứng trước. */
(function(){
  var num = function(v){ var x = parseFloat(String(v == null ? "" : v).replace(",", ".")); return isFinite(x) && x > 0 ? x : 0; };

  function alloc(total, ratio){
    var r = ratio.map(num), s = r.reduce(function(a, b){ return a + b; }, 0);
    total = Math.max(0, Math.round(total));
    if (!s || !total) return r.map(function(){ return 0; });
    var raw = r.map(function(x){ return total * x / s; });
    var out = raw.map(function(x){ return Math.floor(x + 1e-9); });
    var left = total - out.reduce(function(a, b){ return a + b; }, 0);
    raw.map(function(x, i){ return {f: x - out[i], r: r[i], i: i}; })
      .filter(function(x){ return x.r > 0; })
      .sort(function(a, b){ return Math.abs(b.f - a.f) > 1e-9 ? b.f - a.f : (b.r !== a.r ? b.r - a.r : a.i - b.i); })
      .slice(0, left).forEach(function(x){ out[x.i]++; });
    return out;
  }
  /* Cách tính trước đây (và công thức ROUND trong bảng Excel): làm tròn riêng từng size */
  function roundEach(total, ratio){
    var r = ratio.map(num), s = r.reduce(function(a, b){ return a + b; }, 0);
    return s ? r.map(function(x){ return Math.round(total * x / s + 1e-9); }) : r.map(function(){ return 0; });
  }
  var frozen = function(l){ return Array.isArray(l.sizes) && l.sizes.length === 5; };
  /* Đơn đã chốt / đã xuất NVL / đã có số lưu cố định (kể cả đơn mở lại từ Theo dõi) → khóa, trừ khi đang điều chỉnh */
  var locked = function(o){ return !!o && !o.adjust && (!!o.closed || !!o.nvlOut || (o.lines || []).some(frozen)); };
  var oldRule = function(o){ return !!o && !o.adjust && (!!o.closed || !!o.nvlOut); };
  var legacy = function(l){ return !frozen(l) && oldRule(l._o); };   // đơn cũ đã gửi nhưng chưa lưu số size

  /* Định mức áo / cây: đơn đã lưu định mức riêng (o.perRoll, lưu khi chốt / xuất NVL / nâng cấp) dùng đúng số đó;
     còn lại theo định mức của mã sản phẩm (S.perRollBy), chưa cài thì định mức chung (S.perRoll, mặc định 65) */
  function rollOf(S, m, o){ return (o && num(o.perRoll)) || num(((S && S.perRollBy) || {})[m]) || num(S && S.perRoll) || 65; }
  function lineSizes(l, perRoll){
    if (frozen(l)) return l.sizes.map(function(v){ return Math.max(0, Math.round(num(v))); });
    if (Array.isArray(l.q)) return [0, 1, 2, 3, 4].map(function(i){ return Math.round(num(l.q[i])); });   // mã quần (09/11/2026): nhập thẳng số từng size, không tỉ lệ, không số cây
    var o = l._o, pr = o && o._S ? rollOf(o._S, o._m, o) : perRoll;
    var total = num(l.cay) * pr;
    return legacy(l) ? roundEach(total, l.ratio) : alloc(total, l.ratio);
  }
  /* Gắn mỗi dòng với đơn của nó (thuộc tính ẩn, không ghi vào dữ liệu) để biết dòng thuộc đơn đã khóa hay chưa */
  function mark(S){
    Object.keys((S && S.models) || {}).forEach(function(m){
      ((S.models[m] || {}).orders || []).forEach(function(o){
        Object.defineProperty(o, "_S", {value: S, configurable: true, writable: true, enumerable: false});
        Object.defineProperty(o, "_m", {value: m, configurable: true, writable: true, enumerable: false});
        (o.lines || []).forEach(function(l){ Object.defineProperty(l, "_o", {value: o, configurable: true, writable: true, enumerable: false}); });
      });
    });
  }

  /* ===== Nhận hàng theo số lượng ===== */
  function addTo(g, c, arr){ g[c] = g[c] || [0, 0, 0, 0, 0]; (arr || []).forEach(function(v, i){ g[c][i] += Math.round(num(v)); }); }
  /* Số đặt của 1 đơn theo màu × size (đơn xưởng: theo dòng; đơn thêu/phôi: o.sizes) */
  function ordered(o, perRoll){
    var g = {};
    if (o.sizes) Object.keys(o.sizes).forEach(function(c){ addTo(g, c, o.sizes[c]); });
    else (o.lines || []).forEach(function(l){ addTo(g, l.color, lineSizes(l, perRoll)); });
    return g;
  }
  var validReceipts = function(o){ return (o.receipts || []).filter(function(r){ return !r.void; }); };
  /* Tổng đã nhận; after = chỉ tính các lần nhận chưa chắc đã có trong tồn kho lúc này.
     Giờ nhận chỉ tới phút → lần nhận cùng phút với lần cập nhật Phân tích nhu cầu vẫn coi là chưa có (tiếp tục trừ, tránh đặt trùng) */
  function received(o, after){
    var g = {};
    validReceipts(o).forEach(function(r){ if (after == null || r.at + 6e4 > after) Object.keys(r.sizes || {}).forEach(function(c){ addTo(g, c, r.sizes[c]); }); });
    return g;
  }
  var cell = function(g, c, i){ return g[c] ? g[c][i] : 0; };
  /* Giờ cập nhật Phân tích nhu cầu của 1 mẫu (ms). Bản cũ chỉ có chữ "13:41 23/10" (không có năm) → đọc theo năm hiện tại */
  function heroAt(d){
    if (!d) return null;
    if (d.at && d.at.ton) return d.at.ton;   // giờ dán riêng bảng tồn kho
    if (d.updatedAt) return d.updatedAt;
    var m = /(\d{1,2}):(\d{2})\D+(\d{1,2})\D+(\d{1,2})/.exec(d.updated || ""); if (!m) return null;
    var now = new Date(), t = new Date(now.getFullYear(), +m[4] - 1, +m[3], +m[1], +m[2]).getTime();
    return t > now.getTime() + 864e5 ? new Date(now.getFullYear() - 1, +m[4] - 1, +m[3], +m[1], +m[2]).getTime() : t;
  }
  /* Tách số của 1 đơn đã chốt (bản chốt kiến trúc V1, 27/10: SIXMEN → PLANNING; Planning KHÔNG tự cộng hàng xưởng giao vào tồn SIXMEN,
     không giả định bảng tồn mới đã có hàng vừa giao):
     open  = xưởng còn phải giao (đặt − đã giao; đơn đã giao đủ / lần giao cuối thì 0)
     del   = xưởng ĐÃ giao nhưng chưa đối chiếu là bảng tồn SIXMEN đang dùng đã có (chưa biết đã phản ánh hay chưa)
     Lần giao đã được người dùng đối chiếu "tồn SIXMEN đã có" (r.sixmen.tonAt) và bảng tồn đang dùng dán cùng lúc / sau đó: không tính nữa.
     Đơn huỷ, đơn chưa chốt: không tính. Đơn cũ bấm "Đã về kho" trước khi có ghi nhận giao theo số lượng: không tính (như trước). */
  function split(o, perRoll, at){
    var out = {open:{}, del:{}};
    if (o.cancelled || !o.closed) return out;
    var ord = ordered(o, perRoll), rec = received(o), any = false, del = {};
    validReceipts(o).forEach(function(r){ if (r.sixmen && r.sixmen.tonAt && at != null && r.sixmen.tonAt <= at) return; Object.keys(r.sizes || {}).forEach(function(c){ addTo(del, c, r.sizes[c]); }); });
    Object.keys(ord).forEach(function(c){ var a = [0, 1, 2, 3, 4].map(function(i){ return o.arrived ? 0 : Math.max(0, cell(ord, c, i) - cell(rec, c, i)); }); if (a.some(function(v){ return v; })){ out.open[c] = a; any = true; } });
    Object.keys(del).forEach(function(c){ if (del[c].some(function(v){ return v; })){ out.del[c] = del[c]; any = true; } });
    if (o.arrived && !validReceipts(o).length) return {open:{}, del:{}};
    return out;
  }
  /* Số áo của đơn còn tính vào Đã đặt (để không đặt trùng): còn phải giao + đã giao chưa đối chiếu với tồn SIXMEN */
  function counted(o, perRoll, at){
    var s = split(o, perRoll, at), out = {};
    [s.open, s.del].forEach(function(g){ Object.keys(g).forEach(function(c){ out[c] = out[c] || [0, 0, 0, 0, 0]; g[c].forEach(function(v, i){ out[c][i] += v; }); }); });
    return out;
  }
  /* Tóm tắt nhận hàng: tổng đặt, đã nhận, còn thiếu; full = mọi ô đã nhận đủ.
     Thiếu / dư tính theo TỪNG Ô màu × size: size giao dư không bù cho size khác còn thiếu
     → tổng đặt − đã nhận = còn thiếu − giao dư (VD đặt 780, nhận 749, thiếu 35, dư 4) */
  function receiptInfo(o, perRoll){
    var ord = ordered(o, perRoll), rec = received(o), tot = 0, got = 0, left = 0, over = 0, full = true, lack = {}, extra = {};
    Object.keys(ord).concat(Object.keys(rec)).forEach(function(c){ if (lack[c]) return; lack[c] = [0, 0, 0, 0, 0]; extra[c] = [0, 0, 0, 0, 0];
      [0, 1, 2, 3, 4].forEach(function(i){ var a = cell(ord, c, i), b = cell(rec, c, i); tot += a; got += b; lack[c][i] = Math.max(0, a - b); extra[c][i] = Math.max(0, b - a); left += lack[c][i]; over += extra[c][i]; if (b < a) full = false; }); });
    return {ordered: ord, received: rec, short: lack, over: extra, total: tot, got: got, left: left, overQty: over, full: full && tot > 0, count: validReceipts(o).length, final: validReceipts(o).some(function(r){ return r.final; })};
  }
  /* o.arrived = ngày CHỐT GIAO NHẬN (tên trường giữ nguyên để không đổi dữ liệu cũ; nghĩa là xưởng đã kết thúc giao, không phải nhập kho).
     Từ 29/10 chỉ đặt khi người dùng bấm Chốt giao nhận (o.recvClose); nhận đủ không tự chốt. Đơn chốt kiểu cũ (có arrived, không có recvClose): giữ nguyên */
  function syncArrived(o){ if (o.recvClose) o.arrived = o.recvClose.date; }
  window.SoLuong = {rollOf: rollOf, alloc: alloc, roundEach: roundEach, lineSizes: lineSizes, mark: mark, locked: locked, frozen: frozen, legacy: legacy,
    ordered: ordered, received: received, heroAt: heroAt, counted: counted, split: split, receiptInfo: receiptInfo, syncArrived: syncArrived, validReceipts: validReceipts};
})();
