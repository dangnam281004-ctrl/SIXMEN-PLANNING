/* Phân tích nhu cầu (dùng chung; nạp sau so-luong.js, khung.js, don.js).
   4 chỉ tiêu tách riêng cho từng màu × size:
     A · Tồn kho mới nhất (SIXMEN)      B · Cần đặt theo SIXMEN (số gốc)
     C · Đã đặt trong Planning: đơn đã chốt = xưởng còn phải giao + xưởng đã giao mà chưa đối chiếu là tồn SIXMEN đã có (bỏ đơn huỷ)
         Không bao giờ cộng hàng đã giao vào tồn A (bản chốt kiến trúc V1, 27/10)
     D · Còn phải đặt = B, ĐÚNG số Cần đặt người quản lý cung cấp (CR-01, 20/11/2026): Planning KHÔNG đối trừ PO / đơn đã đặt,
         không bắt xác nhận "SIXMEN đã trừ / chưa trừ". Nhu cầu đặt hàng đã được xử lý ở hệ thống SIXMEN bên ngoài.
     Cảnh báo thông tin (không đổi số, không chặn chốt): size có đơn CHỐT SAU lần cập nhật bảng Cần đặt gần nhất → r.after (số áo) / r.afterO (đơn).
   reflCell / o.sxRefl (đối chiếu cũ) giữ lại để đọc lịch sử, không còn dùng trong phép tính.
   Nhóm: A1 đứt hàng trước khi lô đang về · A2 thiếu kể cả hàng đang về (đủ bán < lead time) · B gom đơn · C chưa cần · D cần kiểm tra. */
(function(){
  var SZ = Khung.POLO_SZ, COLORS = Khung.COLORS_ALL;   // 09/11/2026: thêm màu quần; mỗi mã phân tích theo màu / size của mã đó
  var DAY = 864e5, n = function(x){ return x == null || x === "" ? 0 : +x; };
  var isNum = function(x){ return x !== null && x !== undefined && x !== "" && !isNaN(+x); };
  var fmt = function(x){ return Math.round(x || 0).toLocaleString("vi-VN"); };
  var readJ = function(k, d){ try { return JSON.parse(localStorage.getItem(k)) || d; } catch(e){ return d; } };
  var dmy = function(t){ var d = new Date(t); return ("0" + d.getDate()).slice(-2) + "/" + ("0" + (d.getMonth() + 1)).slice(-2); };
  var hmd = function(t){ return new Date(t).toLocaleString("vi-VN", {hour:"2-digit", minute:"2-digit", day:"2-digit", month:"2-digit"}); };
  var dayStart = function(t){ var d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
  var isoMs = function(s){ var p = s.split("-").map(Number); return new Date(p[0], p[1] - 1, p[2]).getTime(); };

  /* Cài đặt (Admin, lưu trong dữ liệu Kế hoạch: S.ptCfg) */
  function cfg(S){
    var c = (S && S.ptCfg) || {};
    return {lead: c.lead || 22, leadModel: c.leadModel || {}, leadXuong: c.leadXuong || {}, staleHours: c.staleHours || 24, gapHours: c.gapHours || 12, sixmenPO: c.sixmenPO || "chua-ro"};
  }
  var leadOf = function(C, key){ return +C.leadModel[key] || C.lead; };
  var hasAny = function(g){ return !!g && COLORS.some(function(c){ return (g[c] || []).some(isNum); }); };
  /* Giờ dán từng bảng. Dữ liệu cũ (trước khi ghi giờ riêng): tồn = giờ cập nhật chung; ngày còn bán đi kèm tồn; cần đặt = không rõ */
  function times(d){
    d = d || {}; var at = d.at || {}, by = d.by || {}, out = {};
    ["ton", "need", "days"].forEach(function(k){
      var t = at[k] || null, legacy = false;
      if (!t && (k === "ton" || k === "days") && d.updatedAt && hasAny(d[k])){ t = d.updatedAt; legacy = true; }
      out[k] = {at:t, by:by[k] || null, legacy:legacy, has:hasAny(d[k])};
    });
    return out;
  }
  /* SIXMEN đã phản ánh đơn này trong bảng Cần đặt chưa? "no" (chắc chắn chưa) | "yes" | "unknown" */
  function reflected(o, needAt, C){
    if (!o.erpCode) return {v:"no", why:"chưa lên ERP"};
    if (o.erpAt && needAt && o.erpAt > needAt) return {v:"no", why:"lên ERP " + hmd(o.erpAt) + ", sau giờ xuất bảng Cần đặt"};
    var when = o.erpAt ? "lên ERP " + hmd(o.erpAt) + (needAt ? ", trước giờ xuất bảng Cần đặt" : "") : "không rõ giờ lên ERP";
    if (C.sixmenPO === "tru") return {v:"yes", why:when + " · SIXMEN trừ PO đã lên ERP"};
    if (C.sixmenPO === "khong-tru") return {v:"no", why:when + " · SIXMEN không trừ PO"};
    return {v:"unknown", why:when + " · chưa rõ SIXMEN đã tính chưa"};
  }
  /* Phiên bản bảng Cần đặt đang dùng (xác nhận đối chiếu gắn với đúng bảng này) = theo NỘI DUNG bảng Cần đặt của mã:
     dán bảng Cần đặt có số khác → phiên bản mới → đối chiếu lại; chỉ cập nhật Tồn kho, hoặc dán lại đúng bảng cũ → giữ phiên bản, không bắt xác nhận lại.
     (Mã phiên bản server d.ver.need cấp sau vài giây, có thể không cấp được → chỉ lưu kèm để tra cứu) */
  var needVer = function(d){
    d = d || {}; var g = d.need || {}; if (!hasAny(g)) return null;
    /* luôn đủ 5 ô / màu: màu không có dòng và màu có dòng trống cho cùng một phiên bản (bản trên trang và bản đã lưu có thể khác cách ghi) */
    var s = COLORS.filter(function(c){ return Khung.POLO_CL.indexOf(c) >= 0 || (g[c] || []).some(isNum); }).map(function(c){ var a = g[c] || []; return c + ":" + [0, 1, 2, 3, 4].map(function(i){ return isNum(a[i]) ? +a[i] : ""; }).join(","); }).join(";"), h = 5381;
    for (var k = 0; k < s.length; k++) h = ((h * 33) ^ s.charCodeAt(k)) >>> 0;
    return "nd-" + h.toString(36) + "-" + s.length;
  };
  /* SIXMEN đã tính (đã trừ) 1 ô (đơn × màu × size) trong bảng Cần đặt chưa — CHỈ theo xác nhận của người lập kế hoạch (bản duyệt 28/10):
     xác nhận (o.sxRefl, Phân tích nhu cầu › Đối chiếu đơn đã đặt, doi-chieu.js) của ĐÚNG bảng Cần đặt đang dùng và đúng số còn hiệu lực lúc xác nhận → chắc chắn.
     Xác nhận theo bảng cũ / số còn hiệu lực đã đổi → chưa xác định; số cũ chỉ để tham khảo (tạm tính "theo xác nhận trước").
     Chưa xác nhận → chưa xác định, không tự coi là đã tính hay chưa tính (không suy từ mã ERP, ngày đặt, biến động Cần đặt).
     q = qo (xưởng còn phải giao) + qd (đã giao, chưa đối chiếu tồn).
     → {v:"no"|"yes"|"part"|"unknown", yes, no, unk: số áo SIXMEN đã tính / chưa tính / chưa xác định, prevNo: phần chưa tính theo xác nhận trước (null nếu chưa từng xác nhận), why} */
  function reflCell(o, c, i, qo, qd, ver){
    var q = qo + qd, x = o.sxRefl, R = x && x.cells && x.cells[c] ? x.cells[c][i] : null;
    var lab = function(y, z){ return y >= q ? "yes" : z >= q ? "no" : "part"; };
    if (!isNum(R)) return {v:"unknown", yes:0, no:0, unk:q, prevNo:null, why:"chưa đối chiếu SIXMEN đã trừ trong bảng Cần đặt chưa"};
    R = Math.min(q, Math.max(0, +R));
    var e = x.eff && x.eff[c] ? x.eff[c][i] : null, same = !!ver && x.needVer === ver;
    if (same && isNum(e) && +e === q) return {v:lab(R, q - R), yes:R, no:q - R, unk:0, prevNo:null, why:"đã xác nhận " + hmd(x.at)};
    return {v:"unknown", yes:0, no:0, unk:q, prevNo:q - R, prev:lab(R, q - R),
      why:(same ? "số còn hiệu lực đã đổi " + fmt(e) + " → " + fmt(q) : "xác nhận theo bảng Cần đặt trước") + ", cần xác nhận lại"};
  }
  /* CR-01: đơn chốt SAU lần cập nhật bảng Cần đặt đang dùng? (chỉ để cảnh báo, không đổi số)
     Giờ chốt chính xác (o.closedTs, ghi từ 20/11) → so thẳng; đơn chốt trước đó: căn cứ lúc chốt (o.basis.needAt) trùng bảng đang dùng
     = chốt khi bảng này đã có; không có căn cứ → so theo ngày chốt (sau ngày dán bảng). */
  function closedAfter(o, needAt){
    if (!needAt || !o.closed || o.cancelled) return false;
    var t = o.closedTs || (o.khtl && o.khtl.closedAt) || null;
    if (t) return t > needAt;
    if (o.basis && "needAt" in o.basis) return o.basis.needAt === needAt;
    return typeof o.closed === "string" && /^\d{4}-\d{2}-\d{2}$/.test(o.closed) && isoMs(o.closed) > dayStart(needAt);
  }
  /* Ngày dự kiến về của 1 đơn: ngày hẹn; chưa có thì ngày đặt + lead time xưởng */
  function arrival(o, C){
    if (o.dueDate) return {t:isoMs(o.dueDate), guess:false};
    var L = o.type ? 3 : (+C.leadXuong[o.xuong] || C.lead);
    return {t:isoMs(o.date) + L * DAY, guess:true};
  }

  /* Phân tích 1 mã. opt.ton / opt.need / opt.days: thay bảng (để so với phiên bản trước) */
  function analyze(key, opt){
    opt = opt || {};
    var S = opt.S || readJ("kehoach-sx-v3", {models:{}}), Hall = opt.H || readJ("checkhero-v3", {heroes:{}}), d = (Hall.heroes || {})[key] || {};
    var C = cfg(S), now = opt.now || Date.now(), T = times(d), lead = leadOf(C, key);
    var ton = opt.ton || d.ton || {}, need = opt.need || d.need || {}, days = opt.days || d.days || {};
    var tonAt = T.ton.at, needAt = T.need.at, ver = opt.need ? null : needVer(d);
    /* vấn đề cấp mã */
    var issues = [];
    if (!T.ton.has) issues.push({k:"ton", t:"Chưa có bảng tồn kho"});
    else if (!tonAt) issues.push({k:"tonUnknown", t:"Bảng tồn kho chưa rõ giờ dán — dán lại để phân tích chắc chắn"});
    else if (now - tonAt > C.staleHours * 3600e3 || dayStart(tonAt) < dayStart(now)) issues.push({k:"tonOld", t:"Bảng tồn kho dán lúc " + hmd(tonAt) + ", chưa cập nhật hôm nay"});
    if (!T.need.has) issues.push({k:"need", t:"Chưa có bảng cần đặt"});
    else if (!needAt) issues.push({k:"needUnknown", t:"Bảng cần đặt chưa rõ giờ dán (dán trước khi có ghi giờ riêng) — dán lại để phân tích chắc chắn"});
    else if (now - needAt > C.staleHours * 3600e3) issues.push({k:"needOld", t:"Bảng cần đặt dán lúc " + hmd(needAt) + ", cũ hơn " + C.staleHours + " giờ"});
    else if (tonAt && Math.abs(tonAt - needAt) > C.gapHours * 3600e3) issues.push({k:"gap", t:"Hai bảng dán cách nhau " + Math.round(Math.abs(tonAt - needAt) / 3600e3) + " giờ (tồn " + hmd(tonAt) + ", cần đặt " + hmd(needAt) + ")"});
    var needBad = issues.some(function(x){ return /^need|^gap/.test(x.k); }), tonBad = issues.some(function(x){ return /^ton/.test(x.k); });
    if (!hasAny(days) && T.ton.has) issues.push({k:"days", t:"Chưa có số ngày còn bán (dán bảng tồn từ hệ thống có dòng “35.2d”)"});
    var mdl = window.Khung && Khung.catalog().models.filter(function(x){ return x.key === key; })[0];
    if (mdl && !mdl.owner) issues.push({k:"owner", t:"Mã chưa có người phụ trách — Admin phân công ở Danh mục mã"});
    /* đơn còn hiệu lực theo SKU */
    var p = (S.models || {})[key] || {}, orders = (p.orders || []).concat(p.gapOrders || []);
    SoLuong.mark(S);
    var inc = {};   // "TRG|2" → [{o, q, arr, refl}]
    /* Mỗi đơn tách: xưởng còn phải giao (open) và xưởng đã giao chưa đối chiếu tồn SIXMEN (del, bản chốt V1 27/10: không giả định đã vào tồn) */
    orders.forEach(function(o){
      var sp = SoLuong.split(o, S.perRoll || 65, tonAt), a = arrival(o, C), r = {v:"none", why:""};
      Object.keys(sp.open).forEach(function(c){ sp.open[c].forEach(function(q, i){ if (q > 0) (inc[c + "|" + i] = inc[c + "|" + i] || []).push({o:o, q:q, arr:a, refl:r}); }); });
      Object.keys(sp.del).forEach(function(c){ sp.del[c].forEach(function(q, i){ if (q > 0) (inc[c + "|" + i] = inc[c + "|" + i] || []).push({o:o, q:q, arr:{t:now, guess:false}, refl:r, del:true}); }); });
    });
    var rows = [];
    Khung.colorsOfModel(key).forEach(function(c){ Khung.sizesOf(key).forEach(function(s, i){
      var A = (ton[c] || [])[i], B = (need[c] || [])[i], dy = (days[c] || [])[i], L = (inc[c + "|" + i] || []).slice().sort(function(x, y){ return x.arr.t - y.arr.t; });
      if (!isNum(A) && !isNum(B) && !L.length) return;
      var hasA = isNum(A), a = n(A), b = T.need.has ? n(B) : null;
      /* CR-01: Còn phải đặt = Cần đặt người quản lý cung cấp (B), KHÔNG trừ đơn đã đặt. Đã đặt (C) vẫn tính để theo dõi PO / tiến độ / số ngày đủ bán.
         Đơn chốt sau lần cập nhật Cần đặt gần nhất → chỉ cảnh báo (after / afterO). */
      var NOREFL = {v:"none", yes:0, no:0, unk:0, prevNo:null, why:""};
      var cAll = 0, cNo = 0, cYes = 0, cUnk = 0, cDel = 0, cGot = 0, after = 0, afterO = [], byO = new Map();
      L.forEach(function(x){ var e = byO.get(x.o) || {o:x.o, qo:0, qd:0}; if (x.del) e.qd += x.q; else e.qo += x.q; byO.set(x.o, e); });
      byO.forEach(function(e){ e.refl = NOREFL; cAll += e.qo + e.qd; cGot += e.qd; cDel += e.qd;
        if (closedAfter(e.o, needAt)){ after += e.qo + e.qd; afterO.push(e.o); } });
      L.forEach(function(x){ x.refl = NOREFL; });
      var D = b, dMax = b, dMin = b, dTmp = null, firm = true, affected = false;
      var dd = isNum(dy) ? +dy : (hasA && a === 0 ? 0 : null);
      var rate = hasA && a > 0 && dd > 0 ? a / dd : null, cover = rate ? (a + cAll) / rate : null;
      var first = L.filter(function(x){ return !x.del; })[0], arrDays = first ? Math.max(0, Math.round((first.arr.t - dayStart(now)) / DAY)) : null;
      var why = [], grp, dReasons = [];
      if (!hasA) dReasons.push("thiếu số tồn");
      if (tonBad) dReasons.push("bảng tồn chưa cập nhật hôm nay");
      if (hasA && a > 0 && dd == null) dReasons.push("thiếu số ngày còn bán");
      /* A1: đứt hàng trước khi lô gần nhất về (không cần bảng cần đặt) */
      /* chưa có bảng cần đặt (b == null) vẫn báo: hết hàng / đứt hàng là sự thật đọc từ bảng tồn + ngày hàng về */
      var out = hasA && a === 0, dem = b == null || n(B) > 0 || D > 0, a1 = !dReasons.length && dd != null && ((out && (dem || !L.length)) || (first && dd < arrDays && dem));
      if (a1){
        grp = "A1";
        if (out && !first) why.push(cDel ? "Tồn SIXMEN đang 0; xưởng đã giao " + fmt(cDel) + " áo nhưng chưa đối chiếu tồn đã có chưa (Chi tiết đơn › Sản xuất & Giao nhận)" : "Đã hết hàng, chưa có đơn nào đang về");   // chỉ còn lô đã giao, không có lô đang về
        else if (out) why.push("Đã hết hàng; lô gần nhất " + fmt(first.q) + " áo về " + dmy(first.arr.t) + " (" + arrDays + " ngày nữa)" + (first.arr.guess ? ", ngày về ước tính" : ""));
        else why.push("Còn khoảng " + dd + " ngày bán; lô gần nhất về sau " + arrDays + " ngày → đứt hàng khoảng " + Math.max(1, Math.round(arrDays - dd)) + " ngày");
      } else {
        if (b == null) dReasons.push("chưa có bảng cần đặt");
        else if (needBad) dReasons.push("bảng cần đặt chưa tin cậy");
        if (hasA && a < 0) dReasons.push("tồn âm");
        if (dReasons.length) grp = "D";
        else if (D > 0 && (cover == null || cover < lead)){ grp = "A2"; why.push("Thiếu " + fmt(D) + " áo; tính cả hàng đang về chỉ đủ bán " + (cover == null ? "?" : Math.round(cover)) + " ngày, ít hơn thời gian may " + lead + " ngày"); }
        else if (D > 0){ grp = "B"; why.push("Thiếu " + fmt(D) + " áo; tính cả hàng đang về đủ bán khoảng " + Math.round(cover) + " ngày (≥ " + lead + ") → có thể gom đơn"); }
        else { grp = "C"; why.push(cAll > b ? "Đã đặt " + fmt(cAll) + ", nhiều hơn Cần đặt SIXMEN " + fmt(cAll - b) + " áo" : b > 0 ? "Đơn đang về đủ cho Cần đặt" : "Không có nhu cầu đặt thêm"); }
      }
      if (grp === "D") why.unshift("Cần kiểm tra: " + dReasons.join("; "));
      rows.push({c:c, i:i, s:s, sku:c + " " + s, A:hasA ? a : null, B:b, C:cAll, cNo:cNo, cYes:cYes, cUnk:cUnk, cDel:cDel, cGot:cGot, D:D, after:after, afterO:afterO, dMin:dMin, dMax:dMax, dTmp:dTmp, firm:firm, affected:affected, refls:Array.from(byO.values()), days:dd, cover:cover, arrDays:arrDays, first:first, inc:L, grp:grp, why:why, over:b != null && cAll > b ? cAll - b : 0});
    }); });
    var by = function(g){ return rows.filter(function(r){ return r.grp === g || (g === "A" && /^A/.test(r.grp)); }); };
    var sum = function(L, f){ return L.reduce(function(x, r){ return x + (f(r) || 0); }, 0); };
    var res = {key:key, times:T, cfg:C, lead:lead, issues:issues, rows:rows, A:by("A"), B:by("B"), C:by("C"), D:by("D"),
      totals:{after:sum(rows, function(r){ return r.after; }), A:sum(rows, function(r){ return r.A; }), B:sum(rows, function(r){ return r.B; }), C:sum(rows, function(r){ return r.C; }), Dfirm:sum(rows, function(r){ return r.firm ? r.D : 0; }), Dmin:sum(rows, function(r){ return r.dMin; }), Dmax:sum(rows, function(r){ return r.dMax; }), over:sum(rows, function(r){ return r.over; })},
      hasData:T.ton.has || T.need.has, ver:ver};
    /* Từng đơn đang tính vào Đã đặt: ô màu × size, số còn hiệu lực, SIXMEN đã tính chưa (cho Kế hoạch › Đối chiếu đơn đã đặt) */
    var om = new Map();
    rows.forEach(function(r){ r.refls.forEach(function(e){ var x = om.get(e.o) || {o:e.o, cells:[]}; x.cells.push({c:r.c, i:r.i, s:r.s, qo:e.qo, qd:e.qd, q:e.qo + e.qd, refl:e.refl, B:r.B, dMin:r.dMin, dMax:r.dMax, affected:r.affected && e.refl.unk > 0}); om.set(e.o, x); }); });
    res.orders = Array.from(om.values());
    res.group = !res.hasData ? "D" : res.A.length ? "A" : (needBad || tonBad) ? "D" : res.B.length ? "B" : res.D.length ? "D" : "C";
    res.say = say(res, key);
    return res;
  }
  /* Màu mã này thực sự có: có số trong bảng tồn / cần đặt / ngày còn bán, hoặc có trong đơn, đơn thêu / phôi, bản nháp đợt sau.
     Mã chưa có dữ liệu màu nào → mọi màu (để nhập lần đầu) */
  function colorsOf(key, opt){
    opt = opt || {};
    var S = opt.S || readJ("kehoach-sx-v3", {models:{}}), Hh = opt.H || readJ("checkhero-v3", {heroes:{}}), d = (Hh.heroes || {})[key] || {}, p = (S.models || {})[key] || {}, has = {};
    ["ton", "need", "days"].forEach(function(k){ var g = d[k] || {}; COLORS.forEach(function(c){ if ((g[c] || []).some(isNum)) has[c] = 1; }); });
    (p.orders || []).forEach(function(o){ (o.lines || []).forEach(function(l){ has[l.color] = 1; }); });
    (p.gapOrders || []).forEach(function(o){ Object.keys(o.sizes || {}).forEach(function(c){ if ((o.sizes[c] || []).some(function(v){ return n(v) > 0; })) has[c] = 1; }); });
    var g = p.grids || {}; ["next", "theu", "phoi"].forEach(function(k){ COLORS.forEach(function(c){ if (((g[k] || {})[c] || []).some(function(v){ return n(v) > 0; })) has[c] = 1; }); });
    var base = Khung.colorsOfModel(key), L = base.filter(function(c){ return has[c]; });
    return L.length ? L : base;
  }
  /* Nhận định bằng lời */
  function say(r, key){
    var m = (window.Khung && Khung.models(true).filter(function(x){ return x.key === key; })[0]) || {name:key}, L = [];
    if (!r.hasData) return m.name + ": chưa có dữ liệu tồn kho và cần đặt. Bấm “Cập nhật & Phân tích lại” để dán bảng.";
    if (r.A.length){
      var a1 = r.A.filter(function(x){ return x.grp === "A1"; }), a2 = r.A.filter(function(x){ return x.grp === "A2"; });
      var outs = a1.filter(function(x){ return x.A === 0; }).map(function(x){ return x.sku; }), low = a1.filter(function(x){ return x.A > 0; }).map(function(x){ return x.sku + " (còn ~" + x.days + " ngày)"; });
      L.push("<b>" + m.name + " cần xử lý gấp " + r.A.length + " size</b>: " + [outs.length ? outs.join(", ") + " đã hết hàng" : "", low.length ? low.join(", ") : "", a2.length ? a2.map(function(x){ return x.sku; }).join(", ") + " thiếu kể cả khi hàng đang về" : ""].filter(Boolean).join("; ") + ".");
    }
    if (r.B.length){ var top = r.B.slice().sort(function(x, y){ return y.D - x.D; }).slice(0, 3); L.push("<b>" + r.B.length + " size còn thiếu " + fmt(r.B.reduce(function(x, y){ return x + y.D; }, 0)) + " áo</b> nhưng tính cả hàng đang về vẫn đủ bán ≥ " + r.lead + " ngày, có thể gom một đơn lớn, nhiều nhất " + top.map(function(x){ return x.sku + " " + fmt(x.D); }).join(", ") + "."); }
    if (r.D.length) L.push("<b>" + r.D.length + " size cần kiểm tra dữ liệu</b> trước khi kết luận.");
    if (r.totals.after) L.push("<span class=\"pt-warn\">ⓘ Có " + fmt(r.totals.after) + " áo đã chốt đặt sau lần cập nhật Cần đặt gần nhất (" + hmd(r.times.need.at) + "). Số Cần đặt giữ nguyên theo bảng quản lý cung cấp, kiểm tra trước khi đặt thêm.</span>");
    if (!r.A.length && !r.B.length && !r.D.length) L.push(m.name + " chưa cần đặt thêm theo dữ liệu hiện tại.");
    r.issues.forEach(function(x){ L.push("<span class=\"pt-warn\">⚠ " + x.t + ".</span>"); });
    return L.join(" ");
  }
  window.PT = {SZ:SZ, COLORS:COLORS, colorsOf:colorsOf, cfg:cfg, times:times, analyze:analyze, closedAfter:closedAfter, reflected:reflected, reflCell:reflCell, needVer:needVer, hmd:hmd, fmt:fmt,
    GROUP:{A1:"Đặt gấp", A2:"Đặt gấp", A:"Đặt gấp", B:"Có thể gom đơn", C:"Chưa cần đặt", D:"Cần kiểm tra"}};
})();
