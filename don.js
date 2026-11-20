/* Nghiệp vụ đơn sản xuất dùng chung cho Tổng quan, Đơn sản xuất, Chi tiết đơn (nạp sau so-luong.js và khung.js):
   đọc / sửa 1 đơn, mốc gọi xưởng, trạng thái, việc tiếp theo, danh sách việc hôm nay, lịch 7 ngày.
   Đơn vẫn nằm trong dữ liệu Kế hoạch (kehoach-sx-v3): mỗi lần sửa chỉ đọc bản mới nhất rồi sửa đúng đơn đó. */
(function(){
  var KEY = "kehoach-sx-v3", IKEY = "xuong-v3", HKEY = "checkhero-v3";
  var SZ_LABEL = ["M","L","XL","2XL","3XL"];
  var COLOR_NAME = {TRG:"Trắng", XDE:"Xanh Đen", DEN:"Đen", GLA:"Xám Lam", DNI:"Denim", NAU:"Nâu", VOD:"Vỏ Đậu", DOD:"Đỏ Đô", CAC:"Cacao", REU:"Rêu", BEE:"Bee", XDM:"Xanh Đậm", XNH:"Xanh Nhạt", XDA:"Xám Đá"}; try { var _cn = window.Khung && Khung.colorNames ? Khung.colorNames() : {}; Object.keys(_cn).forEach(function(k){ if (!COLOR_NAME[k]) COLOR_NAME[k] = _cn[k]; }); } catch(e){}   // màu khai thêm ở Danh mục
  var XUONG = {hoa:{name:"Anh Hòa", type:"GC"}, mien:{name:"Anh Miên", type:"GC"}, hoang:{name:"Anh Hoàng", type:"FOB"}, hung:{name:"Anh Hùng", type:"FOB"}};
  var GAPX = {theu:{name:"Thêu thành phẩm", type:"GAP"}, phoi:{name:"Phôi anh Hoàng", type:"GAP"}};
  var n = function(x){ return x || 0; };
  var fmt = function(x){ return (x || 0).toLocaleString("vi-VN"); };
  var DAY = 864e5, D = function(s){ var p = s.split("-").map(Number); return Date.UTC(p[0], p[1] - 1, p[2]); };
  var iso = function(t){ return new Date(t).toISOString().slice(0, 10); };
  var addDays = function(s, k){ return iso(D(s) + k * DAY); };
  var diff = function(a, b){ return Math.round((D(b) - D(a)) / DAY); };
  var today = function(){ var d = new Date(); return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
  var dm = function(s){ if (!s) return "—"; var p = s.split("-"); return p[2] + "/" + p[1]; };
  var THU = ["CN","T2","T3","T4","T5","T6","T7"], thu = function(s){ return THU[new Date(D(s)).getUTCDay()]; };
  var hm = function(t){ return new Date(t).toLocaleString("vi-VN", {hour:"2-digit", minute:"2-digit", day:"2-digit", month:"2-digit"}); };
  var readJ = function(k, d){ try { return JSON.parse(localStorage.getItem(k)) || d; } catch(e){ return d; } };
  var readS = function(){ return readJ(KEY, {models:{}}); };
  var info = function(){ return readJ(IKEY, {}); };
  var heroes = function(){ return (readJ(HKEY, {}) || {}).heroes || {}; };
  var subs = [];

  /* Sửa 1 đơn: đọc bản mới nhất, fn(o,S,p) sửa đúng đơn đó; fn trả về false = huỷ thao tác, không lưu */
  function mutate(oid, fn){
    var S = readS(), keep = true, found = false;
    Object.keys(S.models || {}).forEach(function(k){ var p = S.models[k]; (p.orders || []).concat(p.gapOrders || []).forEach(function(o){ if (!found && o.id === oid){ found = true; SoLuong.mark(S); keep = fn(o, S, p) !== false; } }); });
    if (found && keep) localStorage.setItem(KEY, JSON.stringify(S));
    subs.forEach(function(f){ try { f(); } catch(e){ console.error(e); } });
    return found && keep;
  }
  function cfgOf(S){ var c = S.trackCfg || {}; return {every:c.every || 4, confirm:c.confirm == null ? 1 : c.confirm}; }
  /* Các mốc gọi: ngày thứ every, 2×every… (trước mốc xác nhận), mốc xác nhận = trước ngày giao "confirm" ngày.
     Tính từ ngày xưởng bắt đầu đã ghi nhận (anh duyệt 26/10); đơn chưa bắt đầu chưa có mốc. Đơn cũ (trước quy trình mới) tính từ ngày đặt như trước */
  var startOf = function(o){ return o.startedAt || (o.flow === 2 || o.flow === 3 ? null : o.date); };
  function milestones(o, c){
    var st = startOf(o);
    if (!st || !o.dueDate) return [];
    var total = diff(st, o.dueDate), fin = total - c.confirm, ms = [];
    for (var k = c.every; k < fin; k += c.every) ms.push({day:k, kind:"call", label:"Gọi hỏi tình hình (ngày " + k + ")"});
    if (fin > 0) ms.push({day:fin, kind:"confirm", label:"Gọi xác nhận ngày giao"});
    return ms.map(function(m){ m.date = addDays(st, m.day); return m; });
  }
  /* Trạng thái thực hiện đơn (anh duyệt 26/10), độc lập với trạng thái NVL:
     nhap (đang lập ở Kế hoạch) → da-chot (chốt số lượng, chưa gửi gì) → cho-trien-khai (đã bấm Gửi xưởng) → dang-sx (xưởng đã bắt đầu)
     → giao-mot-phan (đã nhận ≥ 1 lần, kể cả đã nhận đủ mà chưa chốt) → giao-du (đã bấm Chốt giao nhận: giao đủ / giao thiếu, 29/10) → hoan-tat; huy.
     Đơn chốt trước quy trình mới (không có flow) và đơn thêu / phôi: coi như đang sản xuất.
     V3 (anh duyệt 30/10, flow 3, cả 4 hình thức): da-chot → cho-po (chưa đủ 2 mã PO ERP) → cho-qlvh (đủ 2 mã PO, chờ QLVH ký, duyệt trên ERP)
     → bấm "QLVH đã duyệt" (server ghi o.qlvh) → dang-sx. Tiến độ sản xuất (gửi xưởng, xưởng xác nhận, bắt đầu) là mốc riêng: progress(o) */
  /* V5.3 (anh duyệt 14/11/2026): Chốt → Bàn giao → Tiếp nhận / Trả lại → mới tạo PO ERP. 3 trạng thái chen giữa "đã chốt" và "chờ PO" */
  var PHASE = {nhap:"Bản nháp", "da-chot":"Đã chốt", "chua-bg":"Đã chốt — Chưa bàn giao", "cho-nhan":"Đã bàn giao — Chờ tiếp nhận", "tra-lai":"Đã trả lại — Chờ xử lý", "cho-po":"Đã tiếp nhận — Chờ PO ERP", "cho-qlvh":"Chờ QLVH duyệt", "cho-trien-khai":"Chờ triển khai", "dang-sx":"Đang sản xuất", "giao-mot-phan":"Giao một phần", "giao-du":"Đã chốt giao nhận", "hoan-tat":"Hoàn tất Planning", huy:"Đã huỷ"};
  /* UX-1 (31/10) màu theo 5 nhóm: xám chưa thực hiện · xanh dương đang xử lý · cam cần chú ý · đỏ quá hạn / sự cố · xanh lá hoàn thành */
  var PHASE_PILL = {nhap:"p-mute", "da-chot":"p-info", "chua-bg":"p-warn", "cho-nhan":"p-info", "tra-lai":"p-warn", "cho-po":"p-warn", "cho-qlvh":"p-warn", "cho-trien-khai":"p-info", "dang-sx":"p-run", "giao-mot-phan":"p-run", "giao-du":"p-info", "hoan-tat":"p-ok", huy:"p-mute"};
  /* Chứng từ sau mỗi lần xưởng giao (bản chốt V1 27/10). Phạm vi Planning kết thúc ở bàn giao hồ sơ:
     KHÔNG có bước nhập kho ERP / Nhanh.vn / mở bán. Mỗi bước: người, giờ, mã chứng từ (nếu có), ghi chú; đi đúng thứ tự */
  var DOCS = [
    {k:"bao_xuong", t:"Báo xưởng xuất hoá đơn"},
    {k:"hd_xuong", t:"Xưởng xuất hoá đơn cho CTY VIKING", doc:true},
    {k:"nhan_hd", t:"Sản xuất nhận hoá đơn từ xưởng"},
    {k:"bao_kt", t:"Báo kế toán xuất hoá đơn"},
    {k:"hd_viking", t:"CTY VIKING xuất hoá đơn cho HKD Lê Trọng Khang", doc:true}];
  var docDone = function(r, k){ return !!((r.docs || {})[k] || {}).at; };
  /* V3 GĐ6 (anh duyệt 30/10): 4 loại chứng từ theo dõi riêng cho đơn chốt từ V3 (flow 3).
     PO ERP lấy từ xác nhận QLVH (không tạo PO thứ hai); 3 loại còn lại: o.ctu.<k>.list[{id, status, ref, owner, doneDate, note}], Admin "Không áp dụng" (na, có lý do) */
  var CTU = [{k:"po", t:"PO ERP"}, {k:"dntt", t:"Giấy đề nghị thanh toán"}, {k:"pgh", t:"Phiếu giao hàng"}, {k:"vat", t:"Hoá đơn VAT"}];
  var CT_ST = {chua:"Chưa có", dang:"Đang xử lý", xong:"Hoàn thành"};
  function ctuState(o){
    var T = CTU.map(function(c){
      if (c.k === "po") return {k:c.k, t:c.t, state:o.qlvh ? "xong" : po1(o) || po2(o) ? "dang" : "thieu", list:[]};
      var x = (o.ctu || {})[c.k] || {}, L = x.list || [];
      var st = x.na ? "na" : !L.length ? "thieu" : L.every(function(i){ return i.status === "xong" && i.doneDate; }) ? "xong" : "dang";
      return {k:c.k, t:c.t, state:st, list:L, na:x.na || null};
    });
    var done = T.filter(function(x){ return x.state === "xong" || x.state === "na"; }).length;
    return {types:T, done:done, total:T.length, all:done === T.length, next:T.filter(function(x){ return x.state !== "xong" && x.state !== "na"; })[0] || null};
  }
  /* Bàn giao hồ sơ: chua → cho (đã ghi nhận, chờ xác nhận) → xn (đã xác nhận nhận hồ sơ = Hoàn tất). Đơn hoàn tất trước V3 coi như đã xác nhận */
  var handState = function(o){ return o.doneAt ? "xn" : o.handover && o.handover.state === "cho" ? "cho" : "chua"; };
  var HAND = {chua:"Chưa bàn giao", cho:"Đã ghi nhận bàn giao — Chờ xác nhận", xn:"Đã xác nhận nhận hồ sơ"};
  /* Tình trạng chứng từ của 1 đơn: tổng bước / đã xong theo các lần giao còn hiệu lực (+ 4 loại chứng từ V3); bước kế tiếp */
  function docState(o){
    var R = SoLuong.validReceipts(o), total = R.length * DOCS.length, done = 0, next = null;
    R.forEach(function(r){ DOCS.forEach(function(d){ if (docDone(r, d.k)) done++; else if (!next) next = {r:r, d:d}; }); });
    if (o.flow === 3 && R.length){ var C = ctuState(o); total += C.total; done += C.done; if (!next && C.next) next = {r:null, d:{k:C.next.k, t:C.next.t}}; }
    var all = R.length > 0 && done === total, hs = handState(o);
    return {receipts:R.length, total:total, done:done, all:all, next:next,
      label:!R.length ? "Chưa có lần giao" : all ? (hs === "chua" ? "Đủ chứng từ · chờ bàn giao" : hs === "xn" && o.handover && !o.handover.state ? "Đã bàn giao hồ sơ" : HAND[hs]) : "Chứng từ " + done + "/" + total};   // đơn hoàn tất trước V3: giữ nhãn cũ (chưa có bước bên nhận xác nhận)
  }
  var docsComplete = function(o){ return docState(o).all; };
  /* Đủ điều kiện GHI NHẬN bàn giao: đã chốt giao nhận (giao đủ / giao thiếu), đủ chứng từ, chưa có bàn giao đang chờ. Hoàn tất khi bên nhận xác nhận (server ghi) */
  var canFinish = function(o){ return !o.cancelled && !!o.arrived && docState(o).all && handState(o) === "chua"; };
  /* Chốt giao nhận (anh duyệt 29/10): kind "du" / "thieu"; đơn chốt kiểu cũ (có arrived, không có recvClose) → "cu" */
  var closeKind = function(o){ return o.recvClose ? o.recvClose.kind : o.arrived ? "cu" : null; };
  /* Đã nhận đủ mọi ô màu × size nhưng chưa bấm chốt */
  var waitClose = function(o, S){ return !o.cancelled && !!o.closed && !o.arrived && SoLuong.validReceipts(o).length > 0 && SoLuong.receiptInfo(o, (S || {}).perRoll || 65).full; };
  function phase(o){
    if (o.cancelled) return "huy";
    if (o.doneAt) return "hoan-tat";
    if (o.arrived) return "giao-du";
    if (SoLuong.validReceipts(o).length) return "giao-mot-phan";
    if (!o.closed) return "nhap";
    var b = bgState(o); if (b && b !== "nhan" && !o.qlvh) return b;
    if (o.flow === 3) return o.qlvh ? "dang-sx" : poFull(o) ? "cho-qlvh" : "cho-po";
    if (o.startedAt || o.flow !== 2) return "dang-sx";
    return o.sentAt ? "cho-trien-khai" : "da-chot";
  }
  /* V3: đơn cần xác nhận QLVH / đã được xác nhận (đơn trước V3 coi như không cần) */
  /* V5.3: trạng thái bàn giao của đơn đã chốt: chua-bg (chưa bàn giao) · cho-nhan (chờ tiếp nhận) · tra-lai (bị trả lại) · nhan (đã tiếp nhận).
     Đơn chốt trước V5 không có người thực thi mà đã có PO / tiến độ: không xếp vào "chưa bàn giao" */
  var BGP = ["chua-bg", "cho-nhan", "tra-lai"];
  function bgState(o){
    if (!o || !o.closed || o.cancelled || o.doneAt) return null; var e = o.exec;
    if (!e) return o.flow === 3 && !o.qlvh && !o.sentAt && !o.arrived && !SoLuong.validReceipts(o).length ? "chua-bg" : null;
    return e.traAt ? "tra-lai" : !e.ackAt ? "cho-nhan" : "nhan";
  }
  /* V5.3: bỏ mã đơn Planning trên giao diện. Mã nhận diện = PO 2 (VIKING → Xưởng); chưa có PO thì nhận diện bằng sản phẩm · xưởng · loại · ngày lập.
     o.code vẫn giữ làm mã nội bộ (liên kết dữ liệu, lịch sử, KHTL) — không đổi, không xoá */
  var ma = function(o){ return po2(o) || po1(o) && poOld(o) && po1(o) || ""; };
  function label(o, m){
    var p = ma(o); if (p) return "PO " + p;
    var mm = m && m.name ? m : (m ? modelOf(m) : null);
    return (mm ? mm.name + " · " : "") + xOf(o).name + " · " + typeLabel(o).replace("đặt gấp qua anh Hoàng", "đặt gấp") + (o.date ? " · lập " + dm(o.date) : "");
  }
  /* Gửi xưởng đơn gia công / FOB: màn hình thực thi riêng (xuất NVL, việc gửi xưởng, nút Gửi xưởng), mở từ Đơn sản xuất — không nằm trong các thẻ Kế hoạch */
  /* V5.3 · đơn mua NVL: nhap (chưa chốt) · chua-bg (đã chốt, chưa bàn giao) · cho-nhan · tra-lai · nhan (đã tiếp nhận / đơn giao trước V5.3) */
  function buyBg(B){ var g = B && B.giao; if (!g) return B && B.chot ? "chua-bg" : "nhap"; if (g.traAt) return "tra-lai"; if (g.v === 2 && !g.ackAt) return "cho-nhan"; return "nhan"; }
  var buyReady = function(B){ return buyBg(B) === "nhan"; };
  /* V5.4 hoàn thiện: gửi xưởng làm ngay ở Chi tiết đơn (khung Chuẩn bị & gửi xưởng). ke-hoach.html?gui=<id> vẫn mở được như cũ */
  var guiHref = function(o, mk){ return "don-hang.html?id=" + encodeURIComponent(o.id) + "#gui-xuong"; };
  var guiFrame = function(o, mk){ return "ke-hoach.html?m=" + mk + "&gui=" + encodeURIComponent(o.id) + "&embed=1"; };
  var needQlvh = function(o){ return o.flow === 3 && !!o.closed && !o.qlvh && !o.cancelled; };
  var qlvhOk = function(o){ return o.flow !== 3 || !!o.qlvh; };
  /* 2 PO ERP (anh yêu cầu 06/11): PO 1 = o.erpCode (HKD đặt VIKING), PO 2 = o.erpCode2 (VIKING đặt Xưởng). Đơn đã duyệt trước khi áp dụng (qlvh không có PO 2) giữ 1 mã như cũ */
  var PO_T = {1:"PO 1 · HKD đặt VIKING", 2:"PO 2 · VIKING đặt Xưởng"};
  var po1 = function(o){ return (o.erpCode || "").trim(); }, po2 = function(o){ return (o.erpCode2 || "").trim(); };
  var poFull = function(o){ return !!po1(o) && !!po2(o); };
  var poOld = function(o){ return !po2(o) && (!!o.qlvh || (!!o.closed && o.flow !== 3)); };
  var poUnk = function(o){ return o.flow === 3 && !!o.qlvh && !po2(o); };   /* đơn duyệt với 1 mã: không mặc định mã cũ là PO 1 hay PO 2, chờ Admin đối chiếu ERP */
  var poTxt = function(o){ if (poOld(o)) return po1(o) ? "PO " + po1(o) + (poUnk(o) ? " (chưa phân loại)" : "") : ""; return [po1(o) ? "PO 1 " + po1(o) : "", po2(o) ? "PO 2 " + po2(o) : ""].filter(Boolean).join(" · "); };
  var sendOk = function(o){ return o.flow !== 3 || (!!o.qlvh && poFull(o)); };

  /* Tiến độ sản xuất, tách khỏi trạng thái duyệt PO: gửi xưởng → xưởng xác nhận nhận đơn → xưởng bắt đầu (đơn thêu / phôi không cần mốc bắt đầu) */
  function progress(o){
    if (o.startedAt) return {k:"bat-dau", t:"Xưởng bắt đầu " + dm(o.startedAt)};
    if (o.ackAt) return {k:"xac-nhan", t:"Xưởng đã xác nhận " + dm(o.ackAt)};
    if (o.sentAt) return {k:"da-gui", t:"Đã gửi xưởng " + dm(o.sentAt) + " · chờ xưởng xác nhận"};
    return {k:"chua-gui", t:"Chưa gửi xưởng"};
  }
  /* Trạng thái NVL của 1 đơn (cần nvl-core.js): đơn FOB / thêu / phôi không cần */
  function nvlOf(o, S, m){
    if (o.type || !window.NV || XUONG[o.xuong].type !== "GC") return {state:"khong-can"};
    var N = readJ("nvl-v3", {items:[]}); SoLuong.mark(S);
    var C = NV.check(N, S, m, o); return C;
  }
  var modelOf = function(key){ return Khung.models(true).filter(function(m){ return m.key === key; })[0] || {key:key, name:key, code:""}; };
  var xOf = function(o){ return o.type ? GAPX[o.type] : XUONG[o.xuong]; };
  var typeLabel = function(o){ return o.type ? "đặt gấp qua anh Hoàng" : XUONG[o.xuong].type === "GC" ? "gia công" : "FOB"; };
  function orderQty(o, S){ SoLuong.mark(S); var r = SoLuong.receiptInfo(o, S.perRoll || 65); return r.total; }
  var stage = function(o){ return o.cancelled ? "cancelled" : o.arrived ? "arrived" : o.closed ? "run" : "pending"; };
  function statusOf(o, S){
    var t = today(), r = SoLuong.receiptInfo(o, S.perRoll || 65);
    if (o.cancelled) return {cls:"p-mute", text:"Đã huỷ " + dm(o.cancelled.date), done:true};
    if (o.doneAt) return {cls:"p-ok", text:"Hoàn tất Planning " + dm(o.doneAt), done:true};
    if (o.arrived && (closeKind(o) === "thieu" || (r.count && r.left))) return {cls:"p-warn", text:"Chốt giao thiếu " + dm(o.arrived) + " · thiếu " + fmt(o.recvClose ? o.recvClose.short : r.left) + " · " + docState(o).label, done:true};
    if (o.arrived){ var took = diff(o.date, o.arrived), late = o.dueDate ? diff(o.dueDate, o.arrived) : 0;
      return {cls:"p-info", text:"Chốt giao đủ " + dm(o.arrived) + (o.dueDate ? (late > 0 ? " · trễ " + late + " ngày" : late < 0 ? " · sớm " + (-late) + " ngày" : " · đúng hẹn") : "") + " · " + docState(o).label, done:true}; }
    if (!o.closed) return {cls:"p-mute", text:"Chưa chốt" + (o.nvlOut ? " · đã xuất NVL" : "")};
    { var b0 = phase(o); if (BGP.indexOf(b0) >= 0) return {cls:PHASE_PILL[b0], text:PHASE[b0]}; }
    if (r.count && r.full) return {cls:"p-warn", text:"Đã nhận đủ · chờ chốt giao nhận"};
    var ph = phase(o); if (ph === "da-chot" || ph === "cho-trien-khai") return {cls:PHASE_PILL[ph], text:PHASE[ph]};
    if (ph === "cho-po") return {cls:"p-warn", text:"Chờ nhập đủ 2 mã PO ERP"};
    if (ph === "cho-qlvh") return {cls:"p-warn", text:"Chờ QLVH ký, duyệt 2 PO"};
    if (o.flow === 3 && !o.startedAt && !(o.type && o.ackAt)) return {cls:"p-info", text:progress(o).t};
    if (!o.dueDate) return {cls:"p-warn", text:"Chưa có ngày hẹn"};
    var left = diff(t, o.dueDate);
    if (left < 0) return {cls:"p-bad", text:"Trễ hẹn " + (-left) + " ngày", late:true};
    if (left === 0) return {cls:"p-warn", text:"Hôm nay hẹn giao"};
    return {cls:left <= 3 ? "p-warn" : "p-run", text:"Đang may · còn " + left + " ngày"};
  }
  /* UX V5 (anh duyệt 13/11/2026): 5 nhóm trạng thái chung toàn Planning, luôn kèm chữ — chỉ đọc, không đổi nghiệp vụ.
     Chưa bắt đầu (xám) · Đang xử lý (xanh dương) · Cần hành động (cam: chờ PO / QLVH, thiếu NVL, vướng mắc, chờ hồ sơ / bàn giao, việc đến hạn) · Quá hạn (đỏ) · Hoàn tất (xanh lá) */
  var UXCAT = {chua:["Chưa bắt đầu","g"], dang:["Đang xử lý","b"], can:["Cần hành động","o"], "qua-han":["Quá hạn","r"], xong:["Hoàn tất","k"], huy:["Đã huỷ","g"]};
  function uxCat(o, S, mk){
    var ph = phase(o), k;
    if (o.cancelled) k = "huy"; else if (o.doneAt || ph === "hoan-tat") k = "xong"; else if (!o.closed) k = "chua";
    else { var st = statusOf(o, S), nt = nextTask(o, S, mk), t = today();
      if (st.late || (nt && nt.date && nt.date < t)) k = "qua-han";
      else if (openIssues(o).length || BGP.indexOf(ph) >= 0 || ph === "cho-po" || ph === "cho-qlvh" || o.arrived || (nt && (nt.due || (nt.date && nt.date <= t))) || (ph === "da-chot" && mk && ["du", "khong-can"].indexOf(nvlOf(o, S, mk).state) < 0)) k = "can";
      else k = "dang"; }
    return {k:k, t:UXCAT[k][0], tone:UXCAT[k][1]};
  }
  /* Việc tiếp theo của 1 đơn */
  function nextTask(o, S, m){
    var st = stage(o), t = today(), ph = phase(o);
    if (st === "cancelled" || ph === "hoan-tat") return null;
    if (st === "arrived"){ var ds = docState(o), hs = handState(o);
      if (hs === "cho") return {date:null, label:"Chờ " + (o.handover.toUser ? o.handover.to + " xác nhận nhận hồ sơ" : "Admin xác nhận bàn giao hợp lệ")};
      return {date:null, label:ds.next ? ds.next.d.t + (ds.next.r ? " (lần giao " + dm(ds.next.r.date) + ")" : "") : "Ghi nhận bàn giao hồ sơ"}; }
    if (st === "pending") return {date:null, label:"Lập xong rồi chốt ở Kế hoạch"};
    if (ph === "chua-bg") return {date:null, label:"Bàn giao cho người thực thi (ở Kế hoạch › Kiểm tra & Chốt)"};
    if (ph === "cho-nhan") return {date:null, label:Khung.userName(execOf(o)) + " tiếp nhận hoặc trả lại"};
    if (ph === "tra-lai") return {date:null, label:"Xử lý đơn bị trả lại (" + (o.exec.traReason || "") + ") rồi bàn giao lại"};
    if (ph === "da-chot" || ph === "cho-trien-khai"){
      var C = m ? nvlOf(o, S, m) : {state:"khong-can"}, s = C.state;
      if (ph === "da-chot"){
        if (s === "chua-kiem-tra") return {date:null, label:"Bổ sung dữ liệu NVL (kho / định mức)"};
        if (s === "chua-giu") return {date:null, label:"Giữ NVL (đủ tồn)"};
        if (s === "thieu") return {date:null, label:"Đặt mua NVL còn thiếu"};
        if (s === "dang-mua") return {date:null, label:"Theo dõi NCC giao NVL"};
        if (s === "dang-nhan") return {date:null, label:"Kiểm nhận NVL, giữ cho đơn"};
        return {date:null, label:"Gửi xưởng"};
      }
      return {date:null, label:"Xác nhận xưởng bắt đầu"};
    }
    if (ph === "cho-po") return {date:null, label:"Lên 2 PO trên ERP rồi nhập đủ 2 mã PO", due:!!o.type};
    if (ph === "cho-qlvh") return {date:null, label:"Kiểm tra QLVH đã ký, duyệt 2 PO trên ERP · bấm QLVH đã ký & duyệt", due:!!o.type};
    if (o.flow === 3 && !SoLuong.validReceipts(o).length){
      if (!o.sentAt){
        if (o.type) return {date:null, label:"Gửi đơn cho xưởng (anh Hoàng)", due:true};
        var C3 = m ? nvlOf(o, S, m) : {state:"khong-can"}, s3 = C3.state;
        if (s3 === "chua-kiem-tra") return {date:null, label:"Bổ sung dữ liệu NVL (kho / định mức)"};
        if (s3 === "chua-giu") return {date:null, label:"Giữ NVL (đủ tồn)"};
        if (s3 === "thieu") return {date:null, label:"Đặt mua NVL còn thiếu"};
        if (s3 === "dang-mua") return {date:null, label:"Theo dõi NCC giao NVL"};
        if (s3 === "dang-nhan") return {date:null, label:"Kiểm nhận NVL, giữ cho đơn"};
        return {date:null, label:"Gửi xưởng"};
      }
      if (!o.ackAt) return {date:null, label:"Ghi nhận xưởng xác nhận nhận đơn"};
      if (!o.startedAt && !o.type) return {date:null, label:"Xác nhận xưởng bắt đầu sản xuất"};
    }
    if (waitClose(o, S)) return {date:null, label:"Chốt giao nhận (đã nhận đủ)", due:true};
    if (!o.dueDate) return {date:null, label:"Nhập ngày xưởng hẹn giao"};
    var ms = milestones(o, cfgOf(S)).filter(function(x){ return !((o.calls || {})[x.date] || {}).done; });
    if (ms.length) return {date:ms[0].date, label:(ms[0].kind === "confirm" ? "Gọi xác nhận" : "Gọi xưởng") + " " + dm(ms[0].date), due:ms[0].date <= t};
    return {date:o.dueDate, label:"Xưởng giao " + dm(o.dueDate), due:o.dueDate <= t};
  }
  /* ===== V5 (anh duyệt 10/11/2026): phân công theo công đoạn =====
     Người quản lý kế hoạch = người phụ trách mã. Người thực thi = o.exec.user (server tự giao khi chốt). Admin hỗ trợ thao tác thay, người thực thi giữ nguyên */
  var ME = function(){ return Khung.me && Khung.me.id; };
  var execOf = function(o){ return (o && o.exec && o.exec.user) || null; };
  var isMyExec = function(o){ return !!ME() && execOf(o) === ME() && !!o.closed && !o.cancelled; };
  /* V5.3: đơn bàn giao theo V5.3 (exec.v = 2) chỉ thực thi được sau khi tiếp nhận, chưa trả lại (server kiểm tra lại) */
  var execReady = function(o){ var e = o && o.exec; return !!e && !e.traAt && (e.v !== 2 || !!e.ackAt); };
  var canAct = function(o, mk){ return Khung.canEdit(mk) || (isMyExec(o) && execReady(o)); };
  var execTxt = function(o){ var u = execOf(o); return u ? Khung.userName(u) : "Chưa bàn giao"; };
  /* Ai thực sự làm từng bước (để biết bước nào Admin hỗ trợ) */
  function whoDid(o){
    var ex = execOf(o), L = [];
    var add = function(t, by, at){ if (by) L.push({t:t, by:by, at:at || null, help:!!ex && by !== ex}); };
    if (o.exec && o.exec.ackAt) add("Tiếp nhận", o.exec.ackBy, o.exec.ackAt);
    add("PO 1", o.erpBy, o.erpAt); add("PO 2", o.erpBy2, o.erpAt2);
    if (o.qlvh) add("QLVH đã ký, duyệt", o.qlvh.by, o.qlvh.at);
    add("Gửi xưởng", o.sentBy, null); add("Xưởng xác nhận", o.ackBy, null); add("Xưởng bắt đầu", o.startedBy, null);
    (o.receipts || []).filter(function(r){ return !r.void; }).forEach(function(r, i){ add("Ghi nhận giao lần " + (i + 1), r.by, r.at); });
    if (o.handover) add("Bàn giao hồ sơ", o.handover.by, o.handover.at);
    return L;
  }
  var openIssues = function(o){ return (o.vuong || []).filter(function(v){ return v.state !== "xong"; }); };
  /* Mọi đơn (đơn xưởng + đơn thêu/phôi) theo bộ lọc chung; người thực thi thấy thêm các đơn được giao (theo tab ngành) */
  function all(S, noFilter){
    var out = [], F = Khung.filter();
    Khung.models(true).forEach(function(m){
      /* V5: nhân viên không quản lý kế hoạch của mã chỉ thấy các đơn giao cho mình thực thi */
      var vis = noFilter || (Khung.visible(m.key) && !(Khung.me && Khung.me.role === "staff" && m.owner !== Khung.me.id)), ngOk = F.nganh === "all" || Khung.nganhOf(m) === F.nganh;
      var p = (S.models || {})[m.key] || {};
      (p.orders || []).concat(p.gapOrders || []).forEach(function(o){ if (!vis && !(ngOk && isMyExec(o))) return; if (noFilter || Khung.match(o.code, o.erpCode, o.erpCode2, m.name, m.code)) out.push({m:m, o:o}); });
    });
    return out;
  }
  /* Còn thiếu của 1 mã = Cần đặt (Phân tích nhu cầu) − mọi đơn còn phải trừ (đơn xưởng + đơn thêu/phôi đã chốt) */
  function shortOf(key, S){
    var h = heroes()[key], need = h && h.need; if (!need) return null;
    var p = (S.models || {})[key] || {}, at = SoLuong.heroAt(h), g = {};
    Object.keys(need).forEach(function(c){ g[c] = (need[c] || []).map(n); });
    (p.orders || []).concat(p.gapOrders || []).forEach(function(o){ var k = SoLuong.counted(o, S.perRoll || 65, at); Object.keys(k).forEach(function(c){ if (g[c]) k[c].forEach(function(v, i){ g[c][i] -= v; }); }); });
    var tot = 0, top = null, topV = 0;
    Object.keys(g).forEach(function(c){ var s = g[c].reduce(function(a, v){ return a + Math.max(0, v); }, 0); tot += s; if (s > topV){ topV = s; top = c; } });
    return {total:tot, top:top, topQty:topV};
  }
  var heroToday = function(h){ var at = SoLuong.heroAt(h); return at && iso(at - new Date().getTimezoneOffset() * 6e4) === today(); };
  /* V3 GĐ1 (anh duyệt 30/10): cập nhật Tồn kho + Cần đặt theo lịch thứ 2 – 4 – 6 (Admin chỉnh ở Phân tích nhu cầu › Cài đặt), ngày khác vẫn cập nhật bổ sung được.
     Dữ liệu còn dùng được tới lịch kế tiếp: chỉ báo "Dữ liệu cũ" khi chưa cập nhật từ ngày lịch gần nhất */
  var updDays = function(S){ var d = ((S || readS()).ptCfg || {}).updDays; return Array.isArray(d) && d.length ? d : [1, 3, 5]; };
  function updDue(S){ var D0 = updDays(S), t = today(); for (var k = 0; k < 7; k++){ var d = addDays(t, -k); if (D0.indexOf(new Date(D(d)).getUTCDay()) >= 0) return d; } return t; }
  function updNext(S){ var D0 = updDays(S), t = today(); for (var k = 1; k <= 7; k++){ var d = addDays(t, k); if (D0.indexOf(new Date(D(d)).getUTCDay()) >= 0) return d; } return null; }
  var heroSince = function(h, d){ var at = SoLuong.heroAt(h); return !!at && iso(at - new Date().getTimezoneOffset() * 6e4) >= d; };
  /* Kế hoạch tương lai (KHTL, anh duyệt 28/10): chưa phải đơn sản xuất → không hiện ở Đơn sản xuất, có việc riêng ở Tổng quan */
  var isPlan = function(o){ return !!(o.khtl && !o.closed); };
  function planTask(o, m, S, N, t){
    var C = NV.check(N, S, m.key, o), st = NV.planState(N, S, m.key, o, C), k = o.khtl, qty = fmt(orderQty(o, S));
    var base = {model:m, owner:m.owner, oid:o.id, code:k.code, label:k.code + " · " + m.name, href:"ke-hoach.html?m=" + m.key + "&khtl=" + encodeURIComponent(o.id) + "#khtl"};
    var eta = [], late = []; C.rows.forEach(function(r){ (r.eta || []).forEach(function(e){ if (e){ eta.push(e); if (e < t) late.push(e); } }); });
    var shortTxt = C.rows.filter(function(r){ return r.status === "thieu"; }).map(function(r){ return r.it.name + " " + NV.fmt(r.short) + " " + r.unit; }).join(", ");
    var sub = xOf(o).name + " · " + qty + " áo · ";
    if (st === "du-chua-giu" || st === "da-giu") return Object.assign({sev:2, tag:"Đủ NVL — Chờ chốt", sub:sub + NV.PLAN_STATE[st] + " · kiểm tra lại số SIXMEN rồi chốt", btn:"Kiểm tra lại & Chốt"}, base);
    if (st === "thieu-chua-mua") return Object.assign({sev:2, tag:"Thiếu NVL — Chưa đặt mua", sub:sub + "thiếu " + shortTxt, btn:"Đặt mua NVL"}, base, {href:"dat-mua.html?m=" + m.key + "&khtl=" + encodeURIComponent(o.id)});
    if (st === "chua-du-lieu") return Object.assign({sev:2, tag:"KHTL chưa đủ dữ liệu NVL", sub:sub + "bổ sung kho / định mức: " + C.missing.concat(C.noRate).join(", "), btn:"Mở kế hoạch"}, base);
    if (late.length) return Object.assign({sev:3, tag:"NCC trễ hẹn", sub:sub + NV.PLAN_STATE[st] + " · hẹn " + dm(late.sort()[0]) + ", chưa giao đủ", btn:"Mở kế hoạch"}, base);
    return Object.assign({sev:1, tag:NV.PLAN_STATE[st], sub:sub + (eta.length ? "NVL dự kiến về " + dm(eta.sort().pop()) : "chưa có ngày về"), btn:"Mở kế hoạch"}, base);
  }
  /* Việc cần làm hôm nay (sev: 3 gấp, 2 cần làm, 1 nên biết) */
  function tasks(S){
    S = S || readS(); SoLuong.mark(S);
    var t = today(), c = cfgOf(S), L = [], H = heroes(), N = window.NV ? readJ("nvl-v3", {items:[]}) : null;
    all(S).forEach(function(x){
      var o = x.o, m = x.m, st = stage(o), href = "don-hang.html?id=" + encodeURIComponent(o.id), base = {model:m, owner:m.owner, oid:o.id, code:o.code, href:href};
      if (isPlan(o)){ if (N && !o.cancelled) L.push(planTask(o, m, S, N, t)); return; }
      /* V5: đơn mới giao chưa tiếp nhận (việc của người thực thi) · vướng mắc người thực thi báo (việc của người quản lý kế hoạch / Admin) */
      /* V5.3: Chờ bàn giao / Bị trả lại = việc của người quản lý kế hoạch (làm ngay ở Kế hoạch); Chờ tiếp nhận = việc của người được bàn giao (Admin thấy để hỗ trợ) */
      var bg0 = phase(o), kh4 = "ke-hoach.html?m=" + m.key + "&bg=" + encodeURIComponent(o.id) + "#b4";
      if (bg0 === "cho-nhan" && (isMyExec(o) || Khung.isAdmin() || Khung.canEdit(m.key))) L.push(Object.assign({sev:isMyExec(o) ? 3 : 1, tag:"Chờ tiếp nhận", label:label(o, m), sub:m.name + " · " + xOf(o).name + " · " + typeLabel(o) + " · " + fmt(orderQty(o, S)) + " áo · " + Khung.userName(o.exec.by) + " bàn giao " + execTxt(o) + " lúc " + hm(o.exec.at), btn:isMyExec(o) ? "Tiếp nhận / Trả lại" : "Mở đơn", ownerText:execTxt(o)}, base, {href:isMyExec(o) ? "tong-quan.html#moi" : href}));
      openIssues(o).forEach(function(v){ if (Khung.canEdit(m.key) || isMyExec(o)) L.push(Object.assign({sev:Khung.canEdit(m.key) ? 3 : 1, tag:"Vướng mắc", label:label(o, m), sub:Khung.userName(v.by) + " báo " + hm(v.at) + ": " + v.text + (v.can ? " · cần: " + v.can : ""), btn:"Mở đơn", vuong:true}, base, {href:href + "#vuong"})); });
      if (bg0 === "chua-bg"){ if (Khung.canEdit(m.key)) L.push(Object.assign({sev:2, tag:"Chờ bàn giao", label:label(o, m), sub:m.name + " · " + xOf(o).name + " · " + fmt(orderQty(o, S)) + " áo · đã chốt " + dm(o.closed) + ", chưa bàn giao người thực thi", btn:"Bàn giao", ownerText:Khung.userName(m.owner)}, base, {href:kh4})); return; }
      if (bg0 === "tra-lai"){ if (Khung.canEdit(m.key) || isMyExec(o)) L.push(Object.assign({sev:Khung.canEdit(m.key) ? 3 : 1, tag:"Bị trả lại", label:label(o, m), sub:Khung.userName(o.exec.traBy) + " trả lại " + hm(o.exec.traAt) + " · lý do: " + (o.exec.traReason || ""), btn:"Xử lý & bàn giao lại", ownerText:Khung.userName(m.owner)}, base, {href:kh4})); return; }
      if (bg0 === "cho-nhan") return;
      if (st === "pending"){ L.push(Object.assign({sev:2, tag:"Chưa chốt", label:label(o, m), sub:m.name + " · " + xOf(o).name + " · " + fmt(orderQty(o, S)) + " áo · " + (o.nvlOut ? "đã xuất NVL" : "chưa xuất NVL"), btn:"Mở kế hoạch", href:"ke-hoach.html?m=" + m.key}, base, {href:"ke-hoach.html?m=" + m.key})); return; }
      /* Hàng xưởng đã giao: nhắc đối chiếu tồn SIXMEN (Planning không tự coi là đã vào tồn) */
      var delQ = 0, sp = SoLuong.split(o, S.perRoll || 65, SoLuong.heroAt(H[m.key])); Object.keys(sp.del).forEach(function(cc){ sp.del[cc].forEach(function(v){ delQ += v; }); });
      if (delQ && !o.cancelled) L.push(Object.assign({sev:1, tag:"Đối chiếu tồn", label:label(o, m), sub:fmt(delQ) + " áo xưởng đã giao, chưa đối chiếu với tồn SIXMEN", btn:"Mở đơn"}, base, {href:href + "#san-xuat"}));
      if (st === "arrived"){ if (!o.doneAt){ var ds = docState(o); L.push(Object.assign({sev:handState(o) === "cho" ? 1 : 2, tag:handState(o) === "cho" ? "Chờ xác nhận nhận hồ sơ" : ds.all ? "Chờ bàn giao hồ sơ" : "Chờ chứng từ", label:label(o, m), sub:m.name + " · " + xOf(o).name + " · " + (closeKind(o) === "thieu" ? "chốt giao thiếu " : "chốt giao nhận ") + dm(o.arrived) + " · " + ds.label + (ds.next ? " · tiếp: " + ds.next.d.t : ""), btn:"Mở đơn"}, base, {href:href + "#chung-tu"})); } return; }
      if (st !== "run") return;
      var ph = phase(o), gap = !!o.type, qty3 = fmt(orderQty(o, S)) + " áo";
      /* V3: chờ PO / chờ QLVH duyệt (đơn gấp xếp lên đầu, không bỏ bước duyệt) → sau duyệt: gửi xưởng, xưởng xác nhận, bắt đầu */
      if (ph === "cho-po"){ L.push(Object.assign({sev:gap ? 3 : 2, tag:gap ? "Đơn gấp · chờ mã PO" : "Chờ nhập mã PO", label:label(o, m), sub:m.name + " · " + xOf(o).name + " · " + qty3 + " · lên 2 PO trên ERP rồi nhập đủ 2 mã PO ở Chi tiết đơn", btn:"Mở đơn"}, base)); return; }
      if (ph === "cho-qlvh"){ L.push(Object.assign({sev:gap ? 3 : 2, tag:gap ? "Đơn gấp · chờ QLVH duyệt" : "Chờ QLVH duyệt", label:label(o, m), sub:m.name + " · " + xOf(o).name + " · " + poTxt(o) + " · QLVH ký, duyệt trên ERP rồi bấm QLVH đã ký & duyệt", btn:"Mở đơn"}, base)); return; }
      if (o.flow === 3 && !SoLuong.validReceipts(o).length && (!o.sentAt || !o.ackAt || (!o.startedAt && !gap))){
        if (!o.sentAt){ var C3 = gap ? {state:"khong-can"} : nvlOf(o, S, m.key), ok3 = C3.state === "du" || C3.state === "khong-can";
          L.push(Object.assign({sev:gap ? 3 : 2, tag:ok3 ? "Sẵn sàng gửi xưởng" : "Chờ NVL", label:label(o, m), sub:m.name + " · " + xOf(o).name + " · " + qty3 + " · QLVH đã duyệt " + poTxt(o) + (gap ? "" : " · NVL: " + (NV.STATE[C3.state] || "")) + " · " + nextTask(o, S, m.key).label, btn:"Mở đơn"}, base)); return; }
        L.push(Object.assign({sev:2, tag:!o.ackAt ? "Chờ xưởng xác nhận" : "Chờ xưởng bắt đầu", label:label(o, m), sub:m.name + " · " + xOf(o).name + " · " + progress(o).t, btn:"Mở đơn"}, base)); return;
      }
      if (ph === "da-chot"){ var C = nvlOf(o, S, m.key), ok = C.state === "du" || C.state === "khong-can";
        L.push(Object.assign({sev:2, tag:ok ? "Sẵn sàng gửi xưởng" : "Chờ NVL", label:label(o, m), sub:m.name + " · " + xOf(o).name + " · " + fmt(orderQty(o, S)) + " áo · NVL: " + (NV.STATE[C.state] || "") + " · " + nextTask(o, S, m.key).label, btn:"Mở đơn"}, base)); return; }
      if (ph === "cho-trien-khai"){ L.push(Object.assign({sev:2, tag:"Chờ triển khai", label:label(o, m), sub:m.name + " · " + xOf(o).name + " · đã gửi xưởng " + dm(o.sentAt) + ", chờ xưởng báo bắt đầu", btn:"Mở đơn"}, base)); return; }
      if (waitClose(o, S)){ L.push(Object.assign({sev:2, tag:"Chờ chốt giao nhận", label:label(o, m), sub:m.name + " · " + xOf(o).name + " · xưởng đã giao đủ " + fmt(orderQty(o, S)) + " áo · bấm Chốt giao nhận để sang chứng từ", btn:"Mở đơn"}, base, {href:href + "#san-xuat"})); return; }
      if (!o.dueDate){ L.push(Object.assign({sev:2, tag:"Chưa có ngày hẹn", label:label(o, m), sub:m.name + " · " + xOf(o).name + " · nhập ngày xưởng hẹn giao để có mốc gọi", btn:"Mở đơn"}, base)); return; }
      var left = diff(t, o.dueDate);
      if (left < 0) L.push(Object.assign({sev:3, tag:"Trễ hẹn", label:label(o, m), sub:m.name + " · " + xOf(o).name + " · hẹn " + dm(o.dueDate) + ", trễ " + (-left) + " ngày", btn:"Mở đơn"}, base));
      else if (left <= 3) L.push(Object.assign({sev:left === 0 ? 2 : 1, tag:left === 0 ? "Hôm nay giao" : "Sắp giao", label:label(o, m), sub:m.name + " · " + xOf(o).name + " · " + fmt(orderQty(o, S)) + " áo · hẹn " + dm(o.dueDate) + " (" + thu(o.dueDate) + ")", btn:"Mở đơn"}, base));
      milestones(o, c).forEach(function(ms){ var lg = (o.calls || {})[ms.date] || {}; if (ms.date <= t && !lg.done) L.push(Object.assign({sev:ms.date < t ? 3 : 2, tag:ms.date < t ? "Quá ngày gọi" : "Gọi xưởng", label:label(o, m), sub:ms.label + " · " + xOf(o).name + " · mốc " + dm(ms.date), call:ms.date, phone:((info().xuong || {})[o.type ? "hoang" : o.xuong] || {}).dien_thoai, btn:"Mở đơn"}, base)); });
      var ds2 = docState(o); if (ds2.receipts && !ds2.all) L.push(Object.assign({sev:1, tag:"Chứng từ lần giao", label:label(o, m), sub:ds2.label + (ds2.next ? " · tiếp: " + ds2.next.d.t + (ds2.next.r ? " (lần giao " + dm(ds2.next.r.date) + ")" : "") : ""), btn:"Mở đơn"}, base, {href:href + "#chung-tu"}));
    });
    /* Kế hoạch tương lai đã huỷ mà danh sách mua còn hiệu lực: việc của Admin (huỷ dòng / để thành tồn chung, không tự huỷ) → Admin luôn thấy, không theo bộ lọc mã */
    /* V3: đơn sản xuất thường bị huỷ khi đã có danh sách mua NVL cũng nhắc Admin như KHTL (không tự huỷ dòng mua, không tự giữ NVL) */
    if (N) all(S, true).forEach(function(x){ var o = x.o, kh = !!(o.khtl && !o.closed);
      if (!o.cancelled || !(Khung.isAdmin() || Khung.visible(x.m.key))) return;
      (N.buyLists || []).forEach(function(B){
        if (!(B.status === "nhap" || NV.LIST_OPEN.indexOf(B.status) >= 0) || !(B.lines || []).some(function(l){ return (l.src || []).some(function(s){ return s.id === o.id; }); })) return;
        L.push({sev:2, tag:kh ? "DS mua của KH đã huỷ" : "DS mua của đơn đã huỷ", label:B.no + " · " + (B.title || ""), sub:"nguồn " + (kh ? o.khtl.code : label(o, x.m)) + " đã huỷ (" + (o.cancelled.reason || "") + ") · Admin huỷ dòng hoặc để thành tồn chung", ownerText:"Admin", oid:B.id, href:"dat-mua.html#ds-" + B.id, btn:"Mở danh sách"});
      });
    });
    /* V3 · bàn giao hồ sơ đang chờ xác nhận: việc của người nhận (có tài khoản) hoặc Admin (người nhận chưa có tài khoản) → luôn thấy, không theo bộ lọc mã */
    var meId = Khung.me && Khung.me.id;
    all(S, true).forEach(function(x){ var o = x.o, h = o.handover; if (!h || h.state !== "cho" || o.doneAt || o.cancelled) return;
      if (h.toUser ? h.toUser === meId : Khung.isAdmin()) L.push({sev:2, tag:h.toUser ? "Xác nhận nhận hồ sơ" : "Xác nhận bàn giao hợp lệ", label:label(o, x.m), sub:x.m.name + " · " + Khung.userName(h.by) + " giao hồ sơ cho " + h.to + " lúc " + hm(h.at) + (h.evidence ? " · bằng chứng: " + h.evidence : ""), ownerText:h.toUser ? h.to : "Admin", oid:o.id, href:"don-hang.html?id=" + encodeURIComponent(o.id) + "#chung-tu", btn:"Mở đơn"}); });
    /* 11/11/2026 · Đơn mua NVL theo PO ERP: việc của người thực thi (Admin thấy để hỗ trợ, không đổi người thực thi) */
    if (N) (N.buyLists || []).forEach(function(B){
      /* V5.3: đơn mua đã chốt chưa bàn giao / bị trả lại → việc người quản lý kế hoạch; chờ tiếp nhận → việc người được bàn giao */
      if (B.status === "nhap" && !B.doneAt){ var ownB0 = !B.free && (B.models || []).length && (B.models || []).every(function(k){ return Khung.ownerOf(k) === meId; }), bs = buyBg(B), lb = B.no + " · " + (B.title || ""), hr = "dat-mua.html#ds-" + B.id;
        if (bs === "chua-bg" && (ownB0 || Khung.isAdmin())) { L.push({sev:2, tag:"NVL · chờ bàn giao", label:lb, sub:"đã chốt nhu cầu " + hm(B.chot.at) + " · bàn giao người thực thi tạo PO", ownerText:"Đăng Nam", oid:B.id, href:hr, btn:"Bàn giao"}); return; }
        if (bs === "tra-lai" && (ownB0 || Khung.isAdmin() || B.giao.user === meId)) { L.push({sev:ownB0 || Khung.isAdmin() ? 3 : 1, tag:"NVL · bị trả lại", label:lb, sub:Khung.userName(B.giao.traBy) + " trả lại " + hm(B.giao.traAt) + " · lý do: " + (B.giao.traReason || ""), ownerText:"Đăng Nam", oid:B.id, href:hr, btn:"Xử lý"}); return; }
        if (bs === "cho-nhan" && (B.giao.user === meId || Khung.isAdmin())) { L.push({sev:B.giao.user === meId ? 3 : 1, tag:"NVL · chờ tiếp nhận", label:lb, sub:Khung.userName(B.giao.by) + " bàn giao " + Khung.userName(B.giao.user) + " lúc " + hm(B.giao.at), ownerText:Khung.userName(B.giao.user), oid:B.id, href:B.giao.user === meId ? "tong-quan.html#moi" : hr, btn:"Tiếp nhận / Trả lại"}); return; } }
      if (!B.giao || B.status === "huy" || B.doneAt) return;
      if (B.giao.traAt || (B.giao.v === 2 && !B.giao.ackAt)) return;
      var hp = (B.handovers || []).filter(function(h){ return h.state === "cho"; })[0];   /* bàn giao 2 bước: bước 2 là việc của người nhận (hoặc Admin khi người nhận chưa có tài khoản) */
      if (hp && (hp.toUser ? hp.toUser === meId : Khung.isAdmin())) L.push({sev:2, tag:hp.toUser ? "NVL · xác nhận nhận hồ sơ" : "NVL · xác nhận bàn giao hợp lệ", label:B.no + " · " + (B.title || ""), sub:Khung.userName(hp.by) + " giao hồ sơ cho " + hp.to + " lúc " + hm(hp.at) + (hp.evidence ? " · bằng chứng: " + hp.evidence : ""), ownerText:hp.toUser ? hp.to : "Admin", oid:B.id, href:"dat-mua.html#ds-" + B.id, btn:"Mở đơn mua"});
      /* UX V5: vướng mắc đơn mua NVL chưa giải quyết → việc của người quản lý kế hoạch / Admin (gấp), người báo thấy để theo dõi; mỗi vướng mắc 1 dòng */
      var ownB = !B.free && (B.models || []).length && (B.models || []).every(function(k){ return Khung.ownerOf(k) === meId; });
      (B.vuong || []).filter(function(v){ return v.state !== "xong"; }).forEach(function(v){ var hd = Khung.isAdmin() || ownB; if (!hd && B.giao.user !== meId && v.by !== meId) return;
        L.push({sev:hd ? 3 : 1, tag:v.state === "dang" ? "Vướng mắc NVL · đang xử lý" : "Vướng mắc NVL", label:B.no + " · " + (B.title || ""), sub:Khung.userName(v.by) + " báo " + hm(v.at) + ": " + v.text + (v.can ? " · cần: " + v.can : ""), ownerText:hd ? "" : "Đăng Nam", oid:B.id, href:"dat-mua.html?w=ht#ds-" + B.id, btn:"Mở đơn mua", vuong:true}); });
      var mine = B.giao.user === meId; if (!mine && !Khung.isAdmin()) return;
      var tg = null, sb = "", sv = mine ? 2 : 1, pc = B.po ? "PO " + B.po.code : "";
      if (B.status === "nhap"){ if (!B.po){ tg = "NVL · chờ tạo PO"; sb = "lên 1 PO trên ERP (VIKING → NCC NVL) rồi nhập mã PO"; } else if (!B.qlvh){ tg = "NVL · chờ QLVH duyệt"; sb = pc + " · trình QLVH ký, duyệt trên ERP"; } else { tg = "NVL · sẵn sàng gửi NCC"; sb = pc + " đã duyệt · gửi NCC"; } }
      else if (B.status === "da-nhan"){ if (hp) return; var hq = buyHsLate(B); tg = hq ? "NVL · hồ sơ quá hạn" : "NVL · chờ hồ sơ"; sb = pc + " · đã nhận đủ" + (hq ? ", quá hạn hồ sơ " + hq + " ngày" : "") + " · hoàn thiện chứng từ, bàn giao hồ sơ"; if (hq) sv = mine ? 3 : 2; }
      else if (NV.LIST_OPEN.indexOf(B.status) >= 0 && (B.lines || []).some(function(l){ var e = l.eta || B.eta; return NV.lineLeft(l) > 1e-9 && e && e < t; })){ tg = "NVL · NCC trễ hẹn"; sb = pc + " · quá ngày về, còn hàng chưa về"; sv = mine ? 3 : 1; }
      if (tg) L.push({sev:sv, tag:tg, label:B.no + " · " + (B.title || ""), sub:sb + " · thực thi " + Khung.userName(B.giao.user), ownerText:Khung.userName(B.giao.user), oid:B.id, href:"dat-mua.html#ds-" + B.id, btn:"Mở đơn mua"});
      /* 13/11: đơn còn đang giao nhiều đợt mà đợt đã kiểm nhận quá 3 ngày chưa đủ chứng từ → nhắc riêng (không đợi nhận đủ) */
      if (NV.LIST_OPEN.indexOf(B.status) >= 0){ var bq = buyBatchState(B).filter(function(x){ return x.late > 0; });
        if (bq.length) L.push({sev:mine ? 3 : 2, tag:"NVL · hồ sơ đợt quá hạn", label:B.no + " · " + (B.title || ""), sub:bq.map(function(x){ return x.code + " (" + x.late + " ngày)"; }).join(", ") + " · ghi phiếu nhập / hoá đơn của đợt · thực thi " + Khung.userName(B.giao.user), ownerText:Khung.userName(B.giao.user), oid:B.id, href:"dat-mua.html?w=hsqh#ds-" + B.id, btn:"Mở đơn mua"}); }
    });
    /* V5: việc kế hoạch (Dữ liệu cũ, Lên đơn) chỉ cho người quản lý kế hoạch của mã */
    var ms = Khung.models().filter(function(m){ return Khung.visible(m.key) && Khung.match(m.name, m.code, Khung.aliasOf(m)) && !(Khung.me && Khung.me.role === "staff" && m.owner !== meId); });
    var due = updDue(S), lich = updDays(S).slice().sort(function(a, b){ return (a || 7) - (b || 7); }).map(function(d){ return THU[d]; }).join("·");
    var stale =ms.filter(function(m){ return !heroSince(H[m.key], due); });
    if (stale.length) L.push({sev:2, tag:"Dữ liệu cũ", label:stale.length + " mã chưa cập nhật " + (due === t ? "hôm nay" : "từ " + thu(due) + " " + dm(due)) + " (lịch " + lich + ")", sub:stale.map(function(m){ return m.name.replace(/^Polo\s+/, ""); }).join(", "), owner:stale.length === 1 ? stale[0].owner : null, ownerText:Array.from(new Set(stale.map(function(m){ return Khung.userName(m.owner); }))).join(", "), href:"check-hero.html?m=" + stale[0].key, btn:"Cập nhật dữ liệu"});
    ms.forEach(function(m){ if (!heroSince(H[m.key], due)) return; var sh = shortOf(m.key, S); if (sh && sh.total > 0) L.push({sev:1, tag:"Lên đơn", label:m.name + " còn thiếu " + fmt(sh.total) + " áo", sub:"sau mọi đơn đang chạy · nhiều nhất " + sh.top + " " + ((window.Khung && Khung.colorName ? Khung.colorName(sh.top, m.key) : null) || COLOR_NAME[sh.top] || "") + " (" + fmt(sh.topQty) + ")", model:m, owner:m.owner, href:"ke-hoach.html?m=" + m.key, btn:"Mở kế hoạch"}); });
    return L.sort(function(a, b){ return b.sev - a.sev; });
  }
  /* ===== UX V5 (anh chốt 13/11/2026): tình trạng DỮ LIỆU và tình trạng NGHIỆP VỤ của 1 mã — tách riêng, chỉ đọc, không đổi dữ liệu.
     Dữ liệu (theo kỳ bắt buộc T2–T4–T6, xác định theo kỳ gần nhất, không đếm số ngày):
       chua  = Chưa cập nhật (chưa từng có bảng) · ok = Đã cập nhật (đã dán từ ngày kỳ gần nhất) · den-ky = Đến kỳ cập nhật (hôm nay là ngày kỳ, chưa dán)
       qua-han = Quá hạn cập nhật (đã qua ngày kỳ mà chưa dán) · loi = Dữ liệu lỗi (thiếu size / màu bắt buộc, số âm, không đọc được). Tồn 0 hợp lệ.
     Nghiệp vụ: doi-chieu = Cần đối chiếu · can-dat = Cần đặt · da-xu-ly = Đã xử lý (đã lên đơn từ kỳ này, hết thiếu) · dang-don = Đang có đơn xử lý · binh-thuong ===== */
  var DSTATE = {chua:["Chưa cập nhật","g"], ok:["Đã cập nhật","k"], "den-ky":["Đến kỳ cập nhật","o"], "qua-han":["Quá hạn cập nhật","r"], loi:["Dữ liệu lỗi","r"]};
  var BSTATE = {"doi-chieu":["Cần đối chiếu","o"], "can-dat":["Cần đặt","r"], "da-xu-ly":["Đã xử lý","k"], "dang-don":["Đang có đơn xử lý","b"], "binh-thuong":["Bình thường","g"], "chua-du-lieu":["Chưa có dữ liệu","g"]};
  function mState(m, S, Hh){
    S = S || readS(); Hh = Hh || heroes(); var key = m.key, d = Hh[key] || {}, at = SoLuong.heroAt(d), due = updDue(S), t = today(), err = [];
    if (!Khung.ready(m)) err.push("chưa khai size / màu");
    ["ton", "need"].forEach(function(k){ var g = d[k] || {}; try { Object.keys(g).forEach(function(c){ (g[c] || []).forEach(function(v){ if (typeof v === "number" && v < 0) throw 1; }); }); } catch(e){ if (e === 1) err.push((k === "ton" ? "tồn" : "cần đặt") + " có số âm"); } });
    var dk = err.length ? "loi" : !at ? "chua" : heroSince(d, due) ? "ok" : due === t ? "den-ky" : "qua-han";
    var by = (d.by || {}).ton || (d.by || {}).need || null;
    var R = null; try { R = window.PT && Khung.ready(m) && at ? PT.analyze(key) : null; } catch(e){ R = null; }
    var p = (S.models || {})[key] || {}, os = (p.orders || []).concat(p.gapOrders || []).filter(function(o){ return !o.cancelled && !o.doneAt && !(o.khtl && !o.closed); });
    var since = new Date(due + "T00:00:00").getTime(), newO = os.some(function(o){ return (o.closedAt || o.createdAt || 0) >= since || (o.date && o.date >= due); });
    var bk = !R ? "chua-du-lieu" : R.rows.some(function(r){ return r.affected; }) ? "doi-chieu" : (R.A.length || R.B.length) ? "can-dat" : newO ? "da-xu-ly" : os.length ? "dang-don" : "binh-thuong";
    var age = at ? Math.max(0, Math.floor((Date.now() - at) / 36e5)) : null;
    return {key:key, data:dk, dataT:DSTATE[dk][0], dataTone:DSTATE[dk][1], err:err, at:at, by:by, age:age, ageT:age == null ? "" : age < 1 ? "vừa cập nhật" : age < 24 ? age + " giờ trước" : Math.floor(age / 24) + " ngày trước",
      biz:bk, bizT:BSTATE[bk][0], bizTone:BSTATE[bk][1], A:R ? R.A.length : 0, B:R ? R.B.length : 0, orders:os.length, due:due, next:updNext(S),
      need:dk !== "ok" || bk === "doi-chieu" || bk === "can-dat"};
  }
  /* UX V5 · cảnh báo đơn mua NVL (dùng chung Đặt mua + Tổng quan để số khớp):
     Trễ NCC = hôm nay đã qua ngày hẹn còn hiệu lực (ngày về dòng, không có thì của đơn) và còn số chưa nhận đạt (giao một phần vẫn tính phần còn lại)
     Hồ sơ quá hạn = quá 3 ngày kể từ lần kiểm nhận cuối (Kho xác nhận nhận đủ đạt) mà hồ sơ chưa hoàn tất */
  function buyLate(B){ if (!window.NV || NV.LIST_OPEN.indexOf(B.status) < 0) return null; var t = today(), days = 0, qty = 0;
    (B.lines || []).forEach(function(l){ var e = l.eta || B.eta; if (e && e < t && NV.lineLeft(l) > 1e-9){ days = Math.max(days, diff(e, t)); qty += Math.max(0, (+l.qty || 0) - NV.lineGot(l)); } });
    return days > 0 ? {days:days, qty:qty} : null; }
  function buyFullAt(B){ var m = 0; (B.lines || []).forEach(function(l){ (l.received || []).forEach(function(r){ if ((r.kind === "qc" || r.ok !== undefined) && r.at > m) m = r.at; }); }); return m; }
  /* Hồ sơ theo từng đợt (anh duyệt 13/11/2026), giống server: mỗi lần Kho kiểm nhận đạt = 1 đợt (mã <số đơn>-Đ<n> theo thứ tự thời gian).
     Phiếu giao / nhập + hoá đơn ghi theo đợt (B.bdocs, 1 chứng từ có thể gắn nhiều đợt); đơn cũ đã ghi chung cả đơn (B.docs.phieu / hd) thì phủ mọi đợt */
  var BDOC_T = [["phieu", "Phiếu giao hàng / phiếu nhập NVL"], ["hd", "Hoá đơn VAT / chứng từ mua hàng hợp lệ"]];
  function buyBatches(B){
    var a = [];
    (B.lines || []).forEach(function(l){ (l.received || []).forEach(function(r){ var ok = r.kind === "qc" ? (+r.ok || 0) : !r.kind ? (+r.qty || 0) : 0;
      if (ok > 0 && r.id) a.push({id:r.id, ln:l.id, color:l.color, item:l.itemName, unit:l.unit, at:r.at || 0, by:r.by, ok:ok, bad:+r.bad || 0, note:r.note || ""}); }); });
    a.sort(function(x, y){ return x.at - y.at; }); a.forEach(function(x, i){ x.n = i + 1; x.code = (B.no || "DS") + "-Đ" + (i + 1); });
    return a;
  }
  function batchDoc(B, bid, t){ return (B.bdocs || []).filter(function(x){ return x.t === t && (x.batches || []).indexOf(bid) >= 0; })[0] || null; }
  /* Từng đợt: chứng từ nào đã có / thiếu, quá hạn bao nhiêu ngày (sau 3 ngày kể từ lúc kiểm nhận đạt mà chưa đủ) */
  function buyBatchState(B){
    var legacy = B.docs || {};
    return buyBatches(B).map(function(x){ x.docs = {}; x.miss = [];
      BDOC_T.forEach(function(t){ var d = legacy[t[0]] ? Object.assign({legacy:true}, legacy[t[0]]) : batchDoc(B, x.id, t[0]); x.docs[t[0]] = d; if (!d) x.miss.push(t[0]); });
      var d = x.miss.length && x.at ? Math.floor((Date.now() - x.at) / 864e5) - 3 : 0; x.late = d > 0 ? d : 0; x.due = x.at ? iso(x.at + 3 * 864e5 - new Date().getTimezoneOffset() * 6e4) : null; return x; });
  }
  /* Hồ sơ còn thiếu của cả đơn (giống server BuyDocsMissing) */
  function buyDocsMissing(B){
    var m = [], d = B.docs || {}, S0 = buyBatchState(B); if (!B.po) m.push("PO mua NVL trên ERP"); if (!d.dntt) m.push("Giấy đề nghị thanh toán");
    BDOC_T.forEach(function(t){ if (d[t[0]]) return; if (!S0.length){ m.push(t[1]); return; } var k = S0.filter(function(x){ return !x.docs[t[0]]; }).length; if (k) m.push(t[1] + " (" + k + "/" + S0.length + " đợt chưa có)"); });
    return m;
  }
  /* Hồ sơ quá hạn = đợt kiểm nhận đạt quá 3 ngày mà chứng từ của đợt đó chưa đủ → số ngày quá lớn nhất (cảnh báo vận hành) */
  function buyHsLate(B){ if (!B.giao || B.doneAt || B.status === "huy") return 0; return buyBatchState(B).reduce(function(a, x){ return Math.max(a, x.late); }, 0); }
  /* Báo cáo cuối ngày: Chưa gửi / Đã gửi / Gửi trễ (gửi lần đầu sau ngày báo cáo). Giữ giờ nhắc 17:30, không đổi cách gửi V5 */
  function rptState(rep, day){
    if (!rep){ var now = new Date(), past = day < today() || (day === today() && now.getHours() * 60 + now.getMinutes() >= 17 * 60 + 30); return {k:"chua", t:past ? "Chưa gửi" : "Chưa gửi (nhắc lúc 17:30)", tone:past ? "r" : "g"}; }
    var first = rep.firstAt || ((rep.history || [])[0] || {}).at || rep.at, d0 = first ? iso(first - new Date().getTimezoneOffset() * 6e4) : day;
    return d0 > day ? {k:"tre", t:"Gửi trễ " + hm(first), tone:"o", at:first} : {k:"da", t:"Đã gửi " + hm(rep.at), tone:"k", at:rep.at};
  }
  var schedText = function(S){ return updDays(S).slice().sort(function(a, b){ return (a || 7) - (b || 7); }).map(function(d){ return THU[d]; }).join(" · "); };
  /* Lịch 7 ngày tới: mốc gọi chưa gọi + ngày hẹn giao */
  function week(S){
    S = S || readS(); var t = today(), end = addDays(t, 7), c = cfgOf(S), E = [];
    all(S).forEach(function(x){ var o = x.o; if (stage(o) !== "run" || waitClose(o, S)) return;
      milestones(o, c).forEach(function(ms){ if (ms.date > t && ms.date <= end && !((o.calls || {})[ms.date] || {}).done) E.push({date:ms.date, text:(ms.kind === "confirm" ? "Gọi xác nhận " : "Gọi ") + xOf(o).name + " · " + x.m.name.replace(/^Polo\s+/, ""), href:"don-hang.html?id=" + encodeURIComponent(o.id)}); });
      if (o.dueDate && o.dueDate > t && o.dueDate <= end) E.push({date:o.dueDate, text:"Xưởng giao: " + fmt(orderQty(o, S)) + " áo · " + xOf(o).name + " · " + x.m.name.replace(/^Polo\s+/, ""), href:"don-hang.html?id=" + encodeURIComponent(o.id), arrive:true});
    });
    return E.sort(function(a, b){ return a.date.localeCompare(b.date); });
  }
  /* Số đỏ cạnh menu: việc gấp / cần làm */
  function badges(){
    try { var T = tasks(); Khung.badge("tong-quan.html", T.filter(function(x){ return x.sev >= 2; }).length);
      Khung.badge("theo-doi.html", T.filter(function(x){ return x.sev >= 3 || x.call; }).length); } catch(e){ console.error(e); }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", badges); else badges();
  window.addEventListener("storage", function(e){ if (e.key === KEY || e.key === HKEY) badges(); });
  subs.push(badges);

  /* ===== Nhật ký (server ghi): đổi đường dẫn kỹ thuật thành tên dễ hiểu ===== */
  var FIELD = {dueDate:"Ngày xưởng hẹn giao", erpCode:"Mã PO ERP", erpAt:"Giờ nhập mã PO", erpBy:"Người nhập mã PO", erpCode2:"Mã PO 2 ERP", erpAt2:"Giờ nhập mã PO 2", erpBy2:"Người nhập mã PO 2", qlvh:"QLVH đã duyệt PO", qlvhLog:"Lịch sử xác nhận QLVH", po:"Mã PO", po2:"Mã PO 2", ctu:"Chứng từ", ctuLog:"Lịch sử chứng từ", dntt:"Giấy đề nghị thanh toán", pgh:"Phiếu giao hàng", vat:"Hoá đơn VAT", list:"Danh sách", ref:"Số / file tham chiếu", doneDate:"Ngày hoàn thành", na:"Không áp dụng", evidence:"Bằng chứng bàn giao", toUser:"Người nhận (tài khoản)", confirmAt:"Giờ xác nhận", confirmBy:"Người xác nhận", state:"Trạng thái bàn giao", handoverLog:"Lịch sử bàn giao", ackAt:"Xưởng xác nhận nhận đơn", ackBy:"Người ghi xưởng xác nhận", ackNote:"Ghi chú xưởng xác nhận", closed:"Chốt đơn", closedBy:"Người chốt", sentAt:"Gửi xưởng", sentBy:"Người gửi xưởng", sendOverride:"Ngoại lệ gửi thiếu NVL", startedAt:"Xưởng bắt đầu", startedBy:"Người xác nhận bắt đầu", nvlNeedDate:"Ngày cần NVL", flow:"Quy trình", alloc:"Sổ phân bổ NVL", issues:"Phiếu xuất NVL", qty:"Số lượng", eta:"Ngày về", etaLog:"Lịch sử ngày về", docs:"Chứng từ", docsLog:"Lịch sử chứng từ", bao_xuong:"Báo xưởng xuất HĐ", hd_xuong:"HĐ xưởng → VIKING", nhan_hd:"Nhận HĐ từ xưởng", bao_kt:"Báo kế toán xuất HĐ", hd_viking:"HĐ VIKING → HKD", handover:"Bàn giao hồ sơ", doneAt:"Hoàn tất Planning", doneBy:"Người hoàn tất", sixmen:"Đối chiếu tồn SIXMEN", nvlOut:"Xuất NVL", ship:"Phiếu xuất NVL", shipDate:"Ngày xuất NVL", shipBy:"Người xuất NVL", noDeduct:"Chưa trừ kho",
    receipts:"Xưởng giao", recvClose:"Chốt giao nhận", recvLog:"Lịch sử chốt giao nhận", cancelled:"Huỷ đơn", cancelLog:"Khôi phục đơn", calls:"Gọi xưởng", done:"Đã gọi", note:"Ghi chú", lines:"Dòng màu", ratio:"Tỉ lệ size", cay:"Số cây", sizes:"Số áo theo size", color:"Màu",
    check:"Việc gửi xưởng", code:"Mã đơn", date:"Ngày", sizeLog:"Điều chỉnh số lượng", adjust:"Đang điều chỉnh", reopenLog:"Mở lại kế hoạch", grids:"Bảng", theu:"Thêu thành phẩm", phoi:"Phôi", next:"Bản nháp đợt sau",
    nextLines:"Bản nháp đợt sau", gapOrders:"Đơn thêu / phôi", orders:"Đơn xưởng", ton:"Tồn kho", need:"Cần đặt", days:"Ngày còn bán", updated:"Giờ cập nhật", updatedAt:"Giờ cập nhật", items:"Tồn NVL", stock:"Tồn",
    stockCay:"Tồn (cây)", returns:"Nhận trả NVL", perRoll:"Định mức áo/cây", seq:"Số thứ tự mã đơn", trackCfg:"Cài đặt mốc gọi", every:"Gọi mỗi (ngày)", confirm:"Gọi xác nhận trước (ngày)", models:"Mã sản phẩm",
    owner:"Người phụ trách", ownerSince:"Phụ trách từ", status:"Trạng thái", log:"Lịch sử phân công", catalog:"Tên màu / đặc trưng", gapNames:"Tên màu đơn gấp", name:"Tên", feat:"Đặc trưng", img:"Ảnh",
    khtl:"Kế hoạch tương lai", snap:"Ảnh chụp nhu cầu lúc lập", planDate:"Ngày lập kế hoạch", planCode:"Mã lúc lập", orderCode:"Mã đơn khi chốt", closedAt:"Giờ chốt",
    nvl:"NVL xưởng", xuong:"Xưởng", giao:"Bên giao", heroes:"Phân tích nhu cầu", createdBy:"Người tạo", active:"Mẫu đang xem", group:"Nhóm"};
  var KEYNAME = {"kehoach-sx-v3":"Kế hoạch", "checkhero-v3":"Phân tích nhu cầu", "nvl-v3":"Tồn kho NVL", "xuong-v3":"Thông tin xưởng", "danhmuc-v1":"Danh mục mã", "techpack":"Tech Pack", "he-thong":"Hệ thống"};
  /* Tech Pack: tên trường trong bản nháp (server ghi key "techpack", đường dẫn kiểu bom[id].mat) */
  var TPF = {brand:"Thương hiệu", name:"Tên sản phẩm", code:"Mã hàng", line:"Dòng sản phẩm", sizes:"Nhóm size", designer:"Người thiết kế", created:"Ngày tạo", revised:"Ngày cập nhật", unit:"Đơn vị",
    bom:"NPL", cat:"Phân loại", mat:"Chất liệu", color:"Mã màu", sup:"Nhà cung cấp", pos:"Vị trí", note:"Ghi chú", pom:"Thông số", method:"Cách đo", tol:"Dung sai", vals:"Số đo",
    spi:"Mật độ mũi", seams:"Quy cách may", label:"Hạng mục", text:"Yêu cầu", pack:"Đóng gói", t:"Nội dung", aql:"AQL", crit:"Critical", maj:"Major", min:"Minor", qc:"Tiêu chí QC", season:"Mùa (ẩn)"};
  function logLabel(e){
    if (e.key === "he-thong") return e.action === "tu-choi" ? "Bị từ chối" : e.action === "tai-khoan" ? "Tài khoản" : ({"nvl-giu":"Giữ NVL", "nvl-nha":"Nhả NVL", "nvl-phan-bo":"Phân bổ vải", "nvl-du-kien":"Dự kiến phân bổ vải", "nvl-doi-nguon":"Chuyển liên kết đặt mua", "nvl-xuat":"Xuất NVL", "nvl-huy-phieu":"Huỷ phiếu xuất", "loi-server":"Lỗi server", "qlvh-duyet":"QLVH đã duyệt PO", "qlvh-sua-po":"Đính chính mã PO", "qlvh-bo":"Bỏ xác nhận QLVH", "bg-ghi":"Ghi nhận bàn giao hồ sơ", "bg-xac-nhan":"Xác nhận nhận hồ sơ", "bg-huy":"Huỷ ghi nhận bàn giao", "bg-mo-lai":"Mở lại đơn đã hoàn tất",
      "techpack-tao":"Tech Pack · tạo mã", "techpack-gui":"Tech Pack · gửi duyệt", "techpack-rut":"Tech Pack · rút đề xuất", "techpack-duyet":"Tech Pack · duyệt", "techpack-tra-lai":"Tech Pack · trả lại", "techpack-de-xuat-sua":"Tech Pack · đề xuất sửa", "techpack-xoa":"Tech Pack · xoá"})[e.action] || e.action;
    if (e.key === "techpack") return String(e.path || "").replace(/\[[^\]]+\]/g, "").split(".").filter(Boolean).map(function(s){ return /^\d+$/.test(s) ? "" : (TPF[s] || s); }).filter(Boolean).join(" › ") || "Tech Pack";
    var segs = String(e.path || "").replace(/\[([^\]]+)\]/g, ".[$1]").split(".").filter(Boolean), out = [];
    segs.forEach(function(s, i){
      if (s[0] === "[") return;                                                   // id phần tử (đơn, lần nhận…)
      if (i === 1 && /^(models|catalog|gapNames|heroes)$/.test(segs[0])) return;  // mã sản phẩm: đã có cột riêng
      if (i === 0 && s === "models" && e.key === "kehoach-sx-v3") return;          // kế hoạch: bỏ chữ "Mã sản phẩm" thừa
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)){ out.push("mốc " + dm(s)); return; }
      if (/^\d+$/.test(s)) return;
      if (COLOR_NAME[s]){ out.push(s); return; }
      out.push(FIELD[s] || s);
    });
    var L = out.filter(function(x, i){ return x !== out[i - 1]; });
    return L.slice(-3).join(" › ") || KEYNAME[e.key] || e.key;
  }
  function logVal(s){
    if (s == null || s === "") return "(trống)";
    var v; try { v = JSON.parse(s); } catch(err){ return String(s); }
    if (v === null) return "(trống)";
    if (v === true) return "có"; if (v === false) return "không";
    if (typeof v === "string") return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v.split("-").reverse().join("/") : /^u\d{12,}$/.test(v) ? Khung.userName(v) : v || "(trống)";
    if (typeof v === "number") return v > 1e12 ? hm(v) : fmt(v);
    if (Array.isArray(v)){ if (v.every(function(x){ return x == null || typeof x === "number"; })) return v.map(function(x){ return x == null ? "–" : x; }).join("/"); return v.length + " mục"; }
    if (v.sizes && typeof v.sizes === "object" && !Array.isArray(v.sizes)){ var q = 0; Object.keys(v.sizes).forEach(function(c){ (Array.isArray(v.sizes[c]) ? v.sizes[c] : []).forEach(function(x){ q += +x || 0; }); }); return fmt(q) + " áo" + (v.final ? " · lần giao cuối" : ""); }
    if (v.kind && v.total != null) return (v.kind === "du" ? "Chốt giao đủ " : "Chốt giao thiếu " + fmt(v.short) + " · ") + fmt(v.got) + "/" + fmt(v.total) + " áo" + (v.reason ? " · lý do: " + v.reason : "");
    if (v.reason) return "lý do: " + v.reason;
    if (v.code) return v.code;
    if (v.name) return v.name;
    return Object.keys(v).length + " trường";
  }
  /* Đọc nhật ký từ server: q = {oid, model, limit} */
  function fetchLog(q){
    var u = "/api/log?" + Object.keys(q || {}).filter(function(k){ return q[k] != null; }).map(function(k){ return k + "=" + encodeURIComponent(q[k]); }).join("&");
    return fetch(u, {cache:"no-store"}).then(function(r){ return r.ok ? r.json() : []; }).catch(function(){ return []; });
  }
  /* Thao tác đơn do server ghi (V3: QLVH đã duyệt / Admin đính chính): chờ trang lưu xong, gửi, nhận bản Kế hoạch mới của server.
     Server xử lý từng yêu cầu một nên hai người cùng bấm thì người sau được báo, không ghi đè */
  function waitClean(ms){
    var t0 = Date.now();
    return new Promise(function(res){ (function poll(){ var d = null; try { d = localStorage.getItem("_dirty_" + KEY) || localStorage.getItem("_conflict_" + KEY); } catch(e){} if (!d) return res(true); if (Date.now() - t0 > (ms || 6000)) return res(false); setTimeout(poll, 150); })(); });
  }
  function op(body){
    return waitClean().then(function(ok){
      if (!ok) return {status:0, j:{error:"Kế hoạch chưa lưu được lên server (xem dải cảnh báo dưới trang). Lưu xong rồi thử lại."}};
      return fetch("/api/don/op", {method:"POST", body:JSON.stringify(body), headers:{"Content-Type":"application/json"}})
        .then(function(r){ return r.json().then(function(j){ return {status:r.status, j:j}; }); })
        .then(function(x){
          if (x.status === 200 && x.j.value && window.DongBo){ if (!DongBo.take(KEY, x.j.value, x.j.rev)) DongBo.fresh(KEY); }
          else if (window.DongBo) DongBo.fresh(KEY);   // bị từ chối (VD người khác vừa xác nhận): lấy số mới nhất
          subs.forEach(function(f){ try { f(); } catch(e){ console.error(e); } });
          return x;
        }).catch(function(){ return {status:0, j:{error:"Không kết nối được server"}}; });
    });
  }
  /* ===== UX-1 (anh duyệt 31/10): hàm CHỈ HIỂN THỊ, không đổi trạng thái / điều kiện nghiệp vụ ===== */
  /* Tiến trình 1 đơn: chốt → mã PO → QLVH duyệt → gửi xưởng → sản xuất & giao → chốt giao nhận → chứng từ → bàn giao.
     Lấy từ các mốc đã lưu; đơn chốt trước V3 không có bước Mã PO / QLVH. tone: "" đang xử lý · "w" cần chú ý · "x" quá hạn */
  function steps(o, S){
    if (o.cancelled || !o.closed) return null;
    var v3 = o.flow === 3, R = SoLuong.validReceipts(o), info = SoLuong.receiptInfo(o, (S || {}).perRoll || 65), ds = docState(o), hs = handState(o), t0 = today();
    var L = [{k:"chot", t:"Chốt", done:true}], ph0 = phase(o);
    if (v3) L.push({k:"tn", t:"Bàn giao & tiếp nhận", done:BGP.indexOf(ph0) < 0});   // V5.3
    if (v3){ L.push({k:"po", t:"Mã PO", done:poFull(o) || !!o.qlvh}); L.push({k:"qlvh", t:"QLVH duyệt", done:!!o.qlvh}); }
    L.push({k:"gui", t:"Gửi xưởng", done:!!o.sentAt || (!v3 && o.flow !== 2) || R.length > 0 || !!o.arrived});
    L.push({k:"sx", t:"Sản xuất & giao", done:!!o.arrived || (R.length > 0 && info.full)});
    L.push({k:"giao", t:"Chốt giao nhận", done:!!o.arrived});
    L.push({k:"ct", t:"Chứng từ", done:!!o.arrived && ds.all});
    L.push({k:"bg", t:"Bàn giao", done:hs === "xn"});
    var ci = -1; for (var i = 0; i < L.length; i++){ if (!L[i].done){ ci = i; break; } }
    var cur = ci < 0 ? null : L[ci], tone = "", det = "";
    if (cur){
      if (cur.k === "tn"){ tone = "w"; det = PHASE[ph0] + " · " + nextTask(o, S, null).label; }
      else if (cur.k === "po"){ tone = "w"; det = "Lên 2 PO trên ERP rồi nhập đủ 2 mã PO"; }
      else if (cur.k === "qlvh"){ tone = "w"; det = poTxt(o) + " · chờ QLVH ký, duyệt trên ERP"; }
      else if (cur.k === "gui"){ det = progress(o).t; }
      else if (cur.k === "sx"){ var late = o.dueDate && o.dueDate < t0; tone = late ? "x" : (o.dueDate && diff(t0, o.dueDate) <= 3 ? "w" : "");
        det = "Xưởng đã giao " + fmt(info.got) + "/" + fmt(info.total) + (o.dueDate ? " · hẹn " + dm(o.dueDate) + (late ? " (trễ " + diff(o.dueDate, t0) + " ngày)" : "") : " · chưa có ngày hẹn") + " · " + progress(o).t; }
      else if (cur.k === "giao"){ tone = "w"; det = "Đã nhận đủ · chờ chốt giao nhận"; }
      else if (cur.k === "ct"){ tone = "w"; det = ds.label; }
      else if (cur.k === "bg"){ tone = hs === "cho" ? "" : "w"; det = hs === "cho" ? HAND.cho : "Đủ chứng từ · ghi nhận bàn giao hồ sơ"; }
    }
    return {list:L.map(function(s, i){ return {k:s.k, t:s.t, cls:i < ci || ci < 0 ? "d" : i === ci ? "c" + (tone ? " " + tone : "") : ""}; }), cur:cur, tone:tone, detail:det};
  }
  /* Việc ở Tổng quan: hạn (nếu có), nhóm Quá hạn / Hôm nay / Theo dõi, nút hành động đặt tên theo đúng việc.
     Chỉ đọc kết quả của tasks() (không đổi việc nào được tạo, mức gấp hay điều kiện) */
  var TASK_ACT = {"Chờ nhập mã PO":["Nhập mã PO","#qlvh"], "Đơn gấp · chờ mã PO":["Nhập mã PO","#qlvh"], "Chờ QLVH duyệt":["Xem & xác nhận QLVH","qlvh"], "Đơn gấp · chờ QLVH duyệt":["Xem & xác nhận QLVH","qlvh"],
    "Sẵn sàng gửi xưởng":["Gửi xưởng","KH"], "Chờ NVL":["Xem NVL","#nvl"], "Chờ xưởng xác nhận":["Ghi xưởng xác nhận",""], "Chờ xưởng bắt đầu":["Ghi ngày bắt đầu",""], "Chờ triển khai":["Ghi ngày bắt đầu",""],
    "Chờ chốt giao nhận":["Chốt giao nhận","#san-xuat"], "Chờ chứng từ":["Làm chứng từ","#chung-tu"], "Chứng từ lần giao":["Làm chứng từ","#chung-tu"], "Chờ bàn giao hồ sơ":["Ghi nhận bàn giao","#chung-tu"],
    "Chờ xác nhận nhận hồ sơ":["Xem bàn giao","#chung-tu"], "Xác nhận nhận hồ sơ":["Xác nhận nhận hồ sơ","#chung-tu"], "Xác nhận bàn giao hợp lệ":["Kiểm tra & xác nhận","#chung-tu"],
    "Trễ hẹn":["Ghi nhận giao","#san-xuat"], "Hôm nay giao":["Ghi nhận giao","#san-xuat"], "Sắp giao":["Xem đơn",""], "Đối chiếu tồn":["Đối chiếu tồn","#san-xuat"], "Chưa có ngày hẹn":["Nhập ngày hẹn",""],
    "Chưa chốt":["Chốt ở Kế hoạch","KH"], "Chờ bàn giao":["Bàn giao",null], "Bị trả lại":["Xử lý & bàn giao lại",null], "Chờ tiếp nhận":["Tiếp nhận / Trả lại",null], "Gọi xưởng":["Đã gọi","call"], "Quá ngày gọi":["Đã gọi","call"], "Dữ liệu cũ":["Cập nhật dữ liệu",null], "Lên đơn":["Lập đơn",null]};
  function taskView(x, S){
    S = S || readS(); var t0 = today(), o = null, mk = x.model ? x.model.key : null;
    if (x.oid) all(S, true).forEach(function(y){ if (y.o.id === x.oid){ o = y.o; mk = mk || y.m.key; } });
    var due = x.call || null;
    if (!due && o && /^(Trễ hẹn|Hôm nay giao|Sắp giao)$/.test(x.tag)) due = o.dueDate || null;
    if (!due && x.tag === "Dữ liệu cũ") due = updDue(S);
    var bucket = x.sev >= 3 || (due && due < t0) ? "qua-han" : (due && due > t0) ? (x.sev >= 2 ? "hom-nay" : "theo-doi") : (x.sev >= 2 ? "hom-nay" : "theo-doi");
    var a = TASK_ACT[x.tag], label = x.btn || "Mở", href = x.href, kind = "link";
    if (a && o){ label = a[0];
      if (a[1] === "KH") href = x.tag === "Sẵn sàng gửi xưởng" ? guiHref(o, mk) : "ke-hoach.html?m=" + mk + "#b4";
      else if (a[1] === "qlvh") { kind = "qlvh"; href = "don-hang.html?id=" + encodeURIComponent(o.id) + "#qlvh"; }
      else if (a[1] === "call") { kind = "call"; href = "don-hang.html?id=" + encodeURIComponent(o.id) + "#goi-xuong"; }
      else if (a[1] !== null) href = "don-hang.html?id=" + encodeURIComponent(o.id) + (a[1] || ""); }
    else if (a && a[1] === null) label = a[0];
    if (o && o.type && x.tag === "Sẵn sàng gửi xưởng"){ label = "Gửi đơn cho xưởng"; href = "don-hang.html?id=" + encodeURIComponent(o.id); }
    return {bucket:bucket, due:due, label:label, href:href, kind:kind, o:o, mk:mk};
  }
  /* Nút hành động chính của 1 đơn theo bước hiện tại (chỉ dẫn tới đúng chỗ làm, không tự làm gì) */
  function stepAction(o, mk, S){
    var href = "don-hang.html?id=" + encodeURIComponent(o.id), st = steps(o, S);
    if (o.cancelled) return {label:"Xem", href:href, main:false};
    if (!o.closed) return {label:"Mở ở Kế hoạch", href:"ke-hoach.html?m=" + mk, main:true};
    if (!st || !st.cur) return {label:"Xem", href:href, main:false};
    var k = st.cur.k, ph1 = phase(o);
    if (k === "tn") return ph1 === "cho-nhan" ? {label:isMyExec(o) ? "Tiếp nhận / Trả lại" : "Chờ tiếp nhận", href:href, main:isMyExec(o) || Khung.isAdmin()} : {label:ph1 === "tra-lai" ? "Xử lý & bàn giao lại" : "Bàn giao", href:"ke-hoach.html?m=" + mk + "&bg=" + encodeURIComponent(o.id) + "#b4", main:Khung.canEdit(mk)};
    if (k === "po") return {label:"Nhập mã PO", href:href + "#qlvh", main:true};
    if (k === "qlvh") return {label:"Xem & xác nhận QLVH", href:href + "#qlvh", main:true};
    if (k === "gui") return o.type ? {label:"Gửi đơn cho xưởng", href:href, main:true} : {label:"Gửi xưởng", href:guiHref(o, mk), main:true};
    if (k === "sx"){ if (o.flow === 3 && !o.ackAt && !SoLuong.validReceipts(o).length) return {label:"Ghi xưởng xác nhận", href:href, main:true};
      if (o.flow === 3 && !o.startedAt && !o.type && !SoLuong.validReceipts(o).length) return {label:"Ghi ngày bắt đầu", href:href, main:true};
      return {label:"Ghi nhận giao", href:href + "#san-xuat", main:true}; }
    if (k === "giao") return {label:"Chốt giao nhận", href:href + "#san-xuat", main:true};
    if (k === "ct") return {label:"Làm chứng từ", href:href + "#chung-tu", main:true};
    if (k === "bg") return {label:handState(o) === "cho" ? "Xem bàn giao" : "Ghi nhận bàn giao", href:href + "#chung-tu", main:true};
    return {label:"Xem", href:href, main:false};
  }
  window.Don = {uxCat:uxCat, UXCAT:UXCAT, mState:mState, DSTATE:DSTATE, BSTATE:BSTATE, schedText:schedText, buyLate:buyLate, buyFullAt:buyFullAt, buyHsLate:buyHsLate, buyBatches:buyBatches, buyBatchState:buyBatchState, buyDocsMissing:buyDocsMissing, batchDoc:batchDoc, BDOC_T:BDOC_T, rptState:rptState, KEY:KEY, op:op, steps:steps, taskView:taskView, stepAction:stepAction, updDays:updDays, updDue:updDue, updNext:updNext, THU:THU, needQlvh:needQlvh, qlvhOk:qlvhOk, PO_T:PO_T, po1:po1, po2:po2, poFull:poFull, poOld:poOld, poUnk:poUnk, poTxt:poTxt, sendOk:sendOk, progress:progress, CTU:CTU, CT_ST:CT_ST, ctuState:ctuState, handState:handState, HAND:HAND, docsComplete:docsComplete, SZ_LABEL:SZ_LABEL, COLOR_NAME:COLOR_NAME, XUONG:XUONG, GAPX:GAPX, n:n, fmt:fmt, today:today, dm:dm, thu:thu, hm:hm, diff:diff, addDays:addDays,
    readS:readS, info:info, heroes:heroes, mutate:mutate, onChange:function(f){ subs.push(f); }, cfgOf:cfgOf, milestones:milestones, modelOf:modelOf, xOf:xOf, typeLabel:typeLabel,
    execOf:execOf, isMyExec:isMyExec, execReady:execReady, bgState:bgState, buyBg:buyBg, buyReady:buyReady, BGP:BGP, ma:ma, label:label, guiHref:guiHref, guiFrame:guiFrame,canAct:canAct, execTxt:execTxt, whoDid:whoDid, openIssues:openIssues, op:op,
    orderQty:orderQty, stage:stage, isPlan:isPlan, statusOf:statusOf, phase:phase, DOCS:DOCS, docState:docState, docDone:docDone, canFinish:canFinish, closeKind:closeKind, waitClose:waitClose, PHASE:PHASE, PHASE_PILL:PHASE_PILL, nvlOf:nvlOf, startOf:startOf, nextTask:nextTask, all:all, shortOf:shortOf, tasks:tasks, week:week, badges:badges, logLabel:logLabel, logVal:logVal, fetchLog:fetchLog, KEYNAME:KEYNAME};
})();
