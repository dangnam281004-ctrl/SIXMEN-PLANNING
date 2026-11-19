/* V5.4 · Đợt 1 (anh duyệt 17/11/2026): CHỈ TÍNH ĐỂ HIỂN THỊ — không ghi dữ liệu, không đổi trạng thái, không đổi công thức số lượng / NVL.
   Nạp sau don.js (và phan-tich.js nếu trang có). Gắn thêm vào window.Don:
   - issues / prioKey / prioSort: vấn đề của 1 đơn theo thứ tự Q8 (Quá hạn → Bị trả lại → Thiếu NVL → Thiếu PO → Vướng mắc → Thiếu chứng từ), hiện đủ mọi vấn đề
     + cảnh báo Sắp hạn / Chưa có hạn giao (X1: giờ đồng hồ, không báo quá hạn theo ngày dự kiến)
   - buyAlerts: cảnh báo đơn mua NVL (sắp đến ngày về ≤ 2 ngày, NCC trễ dùng lại Don.buyLate)
   - periodState / periodProgress: Đủ / Một phần / Chưa cập nhật theo kỳ cập nhật (R1 = A: KHÔNG đổi nhãn DỮ LIỆU và điều kiện chốt V5.3)
   - skuList: danh sách SKU mã·màu cần đặt (Q1), số lấy nguyên từ Phân tích nhu cầu (PT.analyze), không tính lại
   - timeline: mốc nghiệp vụ của 1 đơn theo thời gian (các khối lịch sử đã lưu + Nhật ký server); cảnh báo KHÔNG nằm trong timeline (UX4) */
(function(){
  if (!window.Don) return;
  var Don = window.Don;
  /* Ngưỡng mặc định X1. Đợt 2 (Q12): Admin sửa trong Danh mục › Ngưỡng cảnh báo (danhmuc-v1.alertCfg, server chỉ cho Admin ghi); chưa có thì dùng mặc định.
     CFG giữ nguyên 1 đối tượng (Don.CFG54), mỗi lần tính đọc lại Danh mục để đổi ngưỡng là cảnh báo đổi theo ngay */
  var DEF = {sxDays:3, nvlDays:2, nhanHours:4, poHours:24};
  var CFG = Object.assign({}, DEF);
  var LIM = {sxDays:[1, 30], nvlDays:[1, 30], nhanHours:[1, 72], poHours:[1, 240]};
  function syncCfg(){ var a = {}; try { a = (Khung.catalog() || {}).alertCfg || {}; } catch(e){}
    Object.keys(DEF).forEach(function(k){ var v = +a[k]; CFG[k] = isFinite(v) && v >= LIM[k][0] && v <= LIM[k][1] && Math.round(v) === v ? v : DEF[k]; }); return CFG; }
  syncCfg();
  /* R5: giờ server làm chuẩn — đọc header Date của 1 lần GET /api/me (chỉ đọc), lưu độ lệch trong phiên */
  var OFF = 0; try { OFF = +sessionStorage.getItem("_v54_off") || 0; } catch(e){}
  try { var t0 = Date.now(); fetch("/api/me", {cache:"no-store"}).then(function(r){ var d = Date.parse(r.headers.get("Date") || ""), t1 = Date.now(); if (d){ OFF = Math.round(d - (t0 + t1) / 2); if (Math.abs(OFF) < 1500) OFF = 0; try { sessionStorage.setItem("_v54_off", String(OFF)); } catch(e){} } }).catch(function(){}); } catch(e){}
  var now = function(){ return Date.now() + OFF; };
  var pad = function(x){ return (x < 10 ? "0" : "") + x; };
  var hmShort = function(t){ var d = new Date(t); return pad(d.getHours()) + ":" + pad(d.getMinutes()) + " " + pad(d.getDate()) + "/" + pad(d.getMonth() + 1); };
  var isoLocal = function(t){ return new Date(t - new Date(t).getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
  var userName = function(id){ return id ? Khung.userName(id) : ""; };

  /* ===== Vấn đề + cảnh báo của 1 đơn (Q8, X1, UX4) =====
     rank: 1 Quá hạn · 2 Bị trả lại · 3 Thiếu NVL · 4 Thiếu PO · 5 Vướng mắc · 6 Thiếu chứng từ · 7 Sắp hạn · 8 Chưa có hạn giao
     Mỗi mục: {k, rank, tone r|o|g, t (chữ trên chip), due (ms hoặc yyyy-mm-dd), cause (nguyên nhân / căn cứ), who (người chịu trách nhiệm)} */
  var RANK_T = {1:"Quá hạn", 2:"Bị trả lại", 3:"Thiếu NVL", 4:"Thiếu PO", 5:"Vướng mắc", 6:"Thiếu chứng từ", 7:"Sắp hạn", 8:"Chưa có hạn giao"};
  function callNote(o){ var best = null; Object.keys(o.calls || {}).forEach(function(d){ var c = o.calls[d] || {}; if (c.note && String(c.note).trim() && (!best || (c.at || d) > (best.at || best.d))) best = {d:d, at:c.at, note:String(c.note).trim()}; }); return best; }
  function issues(o, S, mk, atMs){   /* atMs: chỉ để kiểm thử mốc giờ (CB-01); bình thường lấy giờ server */
    if (!o || !o.closed || o.cancelled || o.doneAt) return [];
    syncCfg(); S = S || Don.readS(); var t = Don.today(), N = atMs != null ? atMs : now(), ph = Don.phase(o), m = Don.modelOf(mk), owner = m && m.owner, ex = Don.execOf(o), e = o.exec || {}, L = [];
    var execWho = ex && Don.BGP.indexOf(ph) < 0 ? ex : owner;
    var add = function(x){ L.push(x); };
    var cn = callNote(o), cnTxt = cn ? "Ghi chú gọi xưởng " + Don.dm(cn.at || cn.d) + " (tham khảo): " + cn.note : "";
    var vo = Don.openIssues(o);
    /* 1 · Quá hạn giao: đã qua ngày xưởng hẹn giao thật mà chưa chốt giao nhận */
    if (o.dueDate && !o.arrived){ var late = Don.diff(o.dueDate, t);
      if (late > 0) add({k:"qua-han-giao", rank:1, tone:"r", t:"Quá hạn giao " + late + " ngày", due:o.dueDate, cause:vo.length ? "Vướng mắc: " + vo[0].text : cnTxt || "Hẹn " + Don.dm(o.dueDate) + ", chưa chốt giao nhận", who:execWho});
      else if (late >= -CFG.sxDays) add({k:"sap-han-giao", rank:7, tone:"o", t:late === 0 ? "Hôm nay hẹn giao" : "Sắp hạn giao · còn " + (-late) + " ngày", due:o.dueDate, cause:"Hẹn " + Don.dm(o.dueDate) + " · ngưỡng " + CFG.sxDays + " ngày", who:execWho}); }
    /* 1 · Quá hạn tiếp nhận: giờ bàn giao + 4 giờ (giờ đồng hồ) */
    if (ph === "cho-nhan" && e.at){ var dl = e.at + CFG.nhanHours * 36e5;
      if (N >= dl) add({k:"qua-han-nhan", rank:1, tone:"r", t:"Quá hạn tiếp nhận", due:dl, cause:"Bàn giao " + hmShort(e.at) + ", quá " + CFG.nhanHours + " giờ chưa tiếp nhận", who:ex}); }
    /* 2 · Bị trả lại */
    if (ph === "tra-lai") add({k:"tra-lai", rank:2, tone:"r", t:"Bị trả lại", due:e.traAt || null, cause:(e.traGroup ? traName(e.traGroup) + ": " : "Lý do: ") + (e.traReason || "—") + " · " + userName(e.traBy) + " " + (e.traAt ? hmShort(e.traAt) : ""), who:owner});
    /* 3 · Thiếu NVL: đơn gia công chưa gửi xưởng, NVL chưa đủ (trạng thái V5.3 nvlOf, không tính lại) */
    if (!o.type && Don.XUONG[o.xuong] && Don.XUONG[o.xuong].type === "GC" && !o.sentAt && !o.arrived && !SoLuong.validReceipts(o).length && window.NV){
      var C = null; try { C = Don.nvlOf(o, S, mk); } catch(err){ C = null; }
      if (C && C.state && C.state !== "du" && C.state !== "khong-can"){ var w = (C.rows || []).filter(function(r){ return r.status !== "du"; }).sort(function(a, b){ return (b.short || 0) - (a.short || 0); })[0];
        add({k:"nvl", rank:3, tone:"r", t:"Thiếu NVL", due:o.nvlNeedDate || null, cause:(NV.STATE[C.state] || C.state) + (w && w.it ? " · " + w.it.name + (w.short ? " thiếu " + NV.fmt(w.short) + " " + (w.unit || "") : "") : ""), who:owner}); } }
    /* 4 · Thiếu PO: đã tiếp nhận, chưa đủ PO 1 + PO 2; quá tiếp nhận + 24 giờ thì thành Quá hạn */
    if (ph === "cho-po"){ var at0 = e.ackAt || null, dl2 = at0 ? at0 + CFG.poHours * 36e5 : null, miss = [Don.po1(o) ? "" : "PO 1", Don.po2(o) ? "" : "PO 2"].filter(Boolean).join(" + ");
      add({k:"po", rank:dl2 && N >= dl2 ? 1 : 4, tone:dl2 && N >= dl2 ? "r" : "o", t:dl2 && N >= dl2 ? "Thiếu PO · quá " + Math.round(CFG.poHours / 24) + " ngày" : "Thiếu PO", due:dl2, cause:"Chưa nhập " + (miss || "PO") + (at0 ? " · tiếp nhận " + hmShort(at0) : ""), who:ex || owner}); }
    /* 5 · Vướng mắc đang mở */
    if (vo.length) add({k:"vuong", rank:5, tone:"o", t:vo.length > 1 ? vo.length + " vướng mắc" : "Vướng mắc", due:vo[0].at || null, cause:vo.map(function(v){ return v.text; }).join(" · "), who:owner});
    /* 6 · Thiếu chứng từ: đã có lần giao còn hiệu lực mà chứng từ chưa đủ (docState V5.3) */
    if (SoLuong.validReceipts(o).length){ var ds = Don.docState(o); if (!ds.all) add({k:"chung-tu", rank:6, tone:"o", t:"Thiếu chứng từ", due:null, cause:ds.label + (ds.next ? " · tiếp: " + ds.next.d.t : ""), who:execWho}); }
    /* 8 · Chưa có hạn giao: chưa có ngày xưởng hẹn thật → không bao giờ báo quá hạn theo ngày dự kiến */
    if (!o.dueDate && !o.arrived) add({k:"chua-han", rank:8, tone:"g", t:"Chưa có hạn giao", due:null, cause:"Chưa nhập ngày xưởng hẹn giao", who:execWho});
    return L.sort(function(a, b){ return a.rank - b.rank; });
  }
  var dueMs = function(d){ return d == null ? Infinity : typeof d === "number" ? d : Date.parse(d + "T23:59:00"); };
  /* Khoá sắp xếp: hạng vấn đề cao nhất → hạn sớm nhất → ngày lập */
  function prioKey(o, S, mk, I){ I = I || issues(o, S, mk); var top = I[0], r = top ? top.rank : 9, d = top ? dueMs(top.due) : Infinity; return {r:r, d:d, date:o.date || ""}; }
  function prioCmp(a, b){ return a.r - b.r || a.d - b.d || (a.date < b.date ? -1 : a.date > b.date ? 1 : 0); }
  /* Sắp danh sách {o, m} theo Q8 (dùng chung Tổng quan, Đơn sản xuất, Công việc của tôi) */
  function prioSort(list, S){ list.forEach(function(x){ x.iss = x.iss || issues(x.o, S, x.m.key); x.pk = prioKey(x.o, S, x.m.key, x.iss); }); return list.sort(function(a, b){ return prioCmp(a.pk, b.pk); }); }
  var dueTxt = function(d){ if (d == null) return ""; if (typeof d === "number") return hmShort(d); return Don.dm(d); };
  var hasK = function(I, k){ return I.some(function(x){ return x.k === k || (k === "qua-han" && x.rank === 1); }); };

  /* ===== Đơn mua NVL: Sắp hạn về (≤ 2 ngày, còn hàng chưa nhận đạt) · NCC trễ (Don.buyLate V5.3) ===== */
  function buyAlerts(B){
    if (!B || !window.NV || B.status === "huy" || B.doneAt) return [];
    syncCfg(); var L = [], lt = Don.buyLate(B), t = Don.today(), soon = null;
    if (lt) L.push({k:"ncc-tre", rank:1, tone:"r", t:"NCC trễ " + lt.days + " ngày"});
    if (NV.LIST_OPEN.indexOf(B.status) >= 0) (B.lines || []).forEach(function(l){ var e = l.eta || B.eta; if (e && e >= t && Don.diff(t, e) <= CFG.nvlDays && NV.lineLeft(l) > 1e-9 && (!soon || e < soon)) soon = e; });
    if (soon) L.push({k:"ncc-sap", rank:7, tone:"o", t:soon === t ? "Hôm nay hàng về" : "Sắp hạn về · " + Don.dm(soon), due:soon});
    return L;
  }

  /* ===== Kỳ cập nhật (Q2, R1 = A): Đủ = cả Tồn kho và Cần đặt dán từ ngày kỳ gần nhất; Một phần = 1 trong 2; Chưa cập nhật = chưa có phần nào.
     Chỉ hiển thị. Nhãn DỮ LIỆU V5.3 (Don.mState) và điều kiện chốt giữ nguyên ===== */
  var PSTATE = {du:["Đủ","k"], "mot-phan":["Một phần","o"], chua:["Chưa cập nhật","g"]};
  function times(d){ if (window.PT && PT.times) return PT.times(d);
    d = d || {}; var at = d.at || {}, has = function(g){ return !!g && Object.keys(g).some(function(c){ return (g[c] || []).some(function(v){ return v !== null && v !== undefined && v !== "" && !isNaN(+v); }); }); };
    var o = {}; ["ton", "need", "days"].forEach(function(k){ var tt = at[k] || null; if (!tt && (k === "ton" || k === "days") && d.updatedAt && has(d[k])) tt = d.updatedAt; o[k] = {at:tt, by:(d.by || {})[k] || null, has:has(d[k])}; }); return o; }
  function periodState(m, S, Hh){
    S = S || Don.readS(); Hh = Hh || Don.heroes(); var key = m.key || m, d = Hh[key] || {}, due = Don.updDue(S), T = times(d);
    var tOk = !!T.ton.at && isoLocal(T.ton.at) >= due, nOk = !!T.need.at && isoLocal(T.need.at) >= due, k = tOk && nOk ? "du" : tOk || nOk ? "mot-phan" : "chua";
    var ver = d.ver || {};
    return {k:k, t:PSTATE[k][0], tone:PSTATE[k][1], due:due, ton:T.ton.at || null, need:T.need.at || null, tonOk:tOk, needOk:nOk, tonBy:T.ton.by, needBy:T.need.by, verTon:ver.ton || null, verNeed:ver.need || null,
      missing:k === "du" ? "" : !tOk && !nOk ? "Tồn kho và Cần đặt" : !nOk ? "Cần đặt" : "Tồn kho"};
  }
  /* x/N: mọi mã đang dùng trong Danh mục (không theo bộ lọc) */
  function periodProgress(S, Hh){
    S = S || Don.readS(); Hh = Hh || Don.heroes(); var ms = Khung.models(), r = {du:0, "mot-phan":0, chua:0, total:ms.length, due:Don.updDue(S), list:{}};
    ms.forEach(function(m){ var p = periodState(m, S, Hh); r[p.k]++; r.list[m.key] = p; }); return r;
  }

  /* ===== Danh sách SKU mã·màu (Q1, SKU-01/02). Số lấy nguyên từ PT.analyze (Phân tích nhu cầu) như màn Kế hoạch V5.3:
     Còn phải đặt chắc chắn = D khi size đã xác định (grp ≠ D, firm); size chưa xác định → "Cần đối chiếu"; Trụ = số ngày còn bán nhỏ nhất của màu (size hết hàng mà còn cần đặt = 0).
     Thứ tự: Nguy hiểm (Trụ < 7, mọi mã kể cả bán chậm) → Bán chạy → Bán bình thường, trong nhóm Trụ tăng dần. Mã Chưa cập nhật kỳ: nhóm riêng, không ẩn.
     opt.pt(key) / opt.agg(rows): trang Kế hoạch truyền hàm của chính trang để dùng đúng một phép tính ===== */
  var DANGER = 7;
  var sure = function(r){ return !!r && r.grp !== "D" && r.firm && r.D !== null && r.D !== undefined; };
  var uncRow = function(r){ return !!r && !sure(r) && (r.dMax === null || r.dMax === undefined || r.dMax > 0); };
  function aggLite(rows){ var a = {cert:0, unc:0}; rows.forEach(function(r){ if (sure(r)) a.cert += Math.max(0, r.D); else if (uncRow(r)) a.unc++; }); return a; }
  function skuList(models, S, opt){
    opt = opt || {}; S = S || Don.readS(); var Hh = Don.heroes(), pt = opt.pt || function(k){ return PT.analyze(k, {S:S}); }, ag = opt.agg || aggLite, due = Don.updDue(S), since = new Date(due + "T00:00:00").getTime(), out = [], noData = [];
    models.forEach(function(m){
      var ps = periodState(m, S, Hh), R = null; try { R = pt(m.key); } catch(e){ R = null; }
      var p = (S.models || {})[m.key] || {}, os = (p.orders || []).concat(p.gapOrders || []).filter(function(o){ return !o.cancelled; });
      var colors = []; (R ? R.rows : []).forEach(function(r){ if (colors.indexOf(r.c) < 0) colors.push(r.c); });
      var any = false;
      colors.forEach(function(c){
        var cr = R.rows.filter(function(r){ return r.c === c; }), a = ag(cr), tru = null, out0 = false;
        cr.forEach(function(r){ if (r.A === 0 && ((+r.B || 0) > 0 || (+r.D || 0) > 0)) out0 = true; if (r.days !== null && r.days !== undefined && (tru === null || r.days < tru)) tru = r.days; });
        if (out0) tru = 0;
        var con = Math.max(0, a.cert || 0), unc = a.unc || 0, danger = tru !== null && tru < DANGER;
        if (!(con > 0 || unc > 0 || danger)) return;
        any = true;
        var lineHas = function(o){ return (o.lines || []).some(function(l){ return l.color === c; }) || Object.keys(o.sizes || {}).some(function(k){ return k === c && (o.sizes[k] || []).some(function(v){ return +v > 0; }); }); };
        var draft = os.some(function(o){ return !o.closed && !(o.khtl && !o.closed) && lineHas(o); }), plan = os.some(function(o){ return o.khtl && !o.closed && lineHas(o); }),
          done = os.some(function(o){ return o.closed && ((o.closedAt || 0) >= since || (o.closed && o.closed >= due)) && lineHas(o); });
        var st = draft ? ["dang", "Đang lập"] : done ? ["chot", "Đã chốt kỳ này"] : plan ? ["khtl", "Có kế hoạch tương lai"] : ["chua", "Chưa lập"];
        var grp = danger ? "nguy" : ps.k === "chua" ? "chua" : Khung.nhomOf && Khung.nhomOf(m) === "chay" ? "chay" : (function(){ try { return Khung.sections([m])[0].nhom === "chay" ? "chay" : "thuong"; } catch(e){ return "thuong"; } })();
        var sizes = cr.slice().sort(function(x, y){ return x.i - y.i; }).map(function(r){ return {s:r.s, i:r.i, D:sure(r) ? Math.max(0, r.D) : uncRow(r) ? null : 0, days:r.days, A:r.A}; });
        out.push({key:m.key, m:m, c:c, sku:m.key + "|" + c, name:m.name, colorName:(Khung.colorName && Khung.colorName(c, m.key)) || Don.COLOR_NAME[c] || "", con:con, unc:unc, tru:tru, out:out0, danger:danger, grp:grp, period:ps, plan:st[0], planT:st[1], sizes:sizes});
      });
      if (!any && ps.k === "chua") noData.push({key:m.key, m:m, c:null, sku:m.key + "|", name:m.name, colorName:"", con:0, unc:0, tru:null, out:false, danger:false, grp:"chua", period:ps, plan:"chua", planT:"—", sizes:[], noData:!R || !R.hasData});
    });
    var G = {nguy:0, chay:1, thuong:2, chua:3}, tv = function(x){ return x.tru === null ? 1e9 : x.tru; };
    out.sort(function(a, b){ return G[a.grp] - G[b.grp] || tv(a) - tv(b) || b.con - a.con || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0); });
    return out.concat(noData);
  }
  var SKU_GRP = {nguy:["Nguy hiểm","r","Trụ < " + DANGER + " ngày, mọi mã"], chay:["Bán chạy","o","Trụ tăng dần"], thuong:["Bán bình thường","b","Trụ tăng dần"], chua:["Chưa cập nhật kỳ","g","chưa có Tồn kho / Cần đặt kỳ này"]};

  /* ===== Timeline 1 đơn: mọi mốc đã lưu, theo thời gian tăng dần. srv = nhật ký server (Don.fetchLog), N = Tồn kho NVL (phiếu xuất) =====
     Mốc chỉ có ngày (dữ liệu V5.3 lưu dạng ngày) ghi "chỉ có ngày" và xếp giữa ngày. Không có cảnh báo trong timeline */
  function timeline(o, srv, N){
    var E = [], esc = Khung.esc;
    var day = function(s){ return s ? Date.parse(s + "T12:00:00") : null; };
    var add = function(g, t, by, txt, dOnly){ if (t == null || isNaN(t)) return; E.push({g:g, t:t, by:by || null, txt:txt, d:!!dOnly}); };
    var CK = {giao:"Bàn giao cho ", nhan:"Tiếp nhận", tra:"Trả lại", doi:"Đổi người thực thi → "};
    if (o.date) add("Kế hoạch", o.createdAt || day(o.date), o.createdBy, "Lập kế hoạch · " + esc(Don.xOf(o).name) + " · " + esc(Don.typeLabel(o)), !o.createdAt);
    if (o.khtl) (o.khtl.log || []).forEach(function(e){ add("Kế hoạch", e.at, e.by, "Kế hoạch tương lai · " + esc(e.act) + (e.note ? " · " + esc(e.note) : "")); });
    (o.reopenLog || []).forEach(function(e){ add("Kế hoạch", e.at, e.by, "Mở lại kế hoạch"); });
    (o.sizeLog || []).forEach(function(e){ add("Kế hoạch", e.at, e.by, "Điều chỉnh số lượng · " + esc(e.reason || "")); });
    if (o.closed) add("Kế hoạch", o.closedAt || day(o.closed), o.closedBy, "Chốt kế hoạch" + (o.chotOverride ? " · chốt ngoại lệ thiếu NVL: " + esc(o.chotOverride.reason) : ""), !o.closedAt);
    (o.execLog || []).forEach(function(e){ add("Bàn giao", e.at, e.by, (CK[e.act] || esc(e.act)) + (e.act === "giao" || e.act === "doi" ? esc(userName(e.user)) : "")
      + (e.act === "nhan" ? (e.check ? " (checklist " + e.check.length + "/" + e.check.length + ")" : " (tiếp nhận trước khi có checklist)") : "")
      + (e.group ? " · nhóm: " + esc(traName(e.group)) : "") + (e.reason ? " · lý do: " + esc(e.reason) : "")); });
    if (o.exec && !(o.execLog || []).length && o.exec.at) add("Bàn giao", o.exec.at, o.exec.by, (o.exec.auto ? "Tự giao khi chốt (trước V5.3) cho " : "Bàn giao cho ") + esc(userName(o.exec.user)));
    if (o.erpCode) add("PO & QLVH", o.erpAt || null, o.erpBy, "Nhập PO 1 " + esc(o.erpCode));
    if (o.erpCode2) add("PO & QLVH", o.erpAt2 || null, o.erpBy2, "Nhập PO 2 " + esc(o.erpCode2));
    (o.qlvhLog || []).forEach(function(e){ add("PO & QLVH", e.at, e.by, ({duyet:"QLVH đã ký, duyệt", "sua-po":"Đính chính mã PO", bo:"Bỏ xác nhận QLVH"})[e.act] || esc(e.act)); });
    if (o.qlvh && !(o.qlvhLog || []).length) add("PO & QLVH", o.qlvh.at, o.qlvh.by, "QLVH đã ký, duyệt");
    if (o.sentAt) add("Sản xuất", day(o.sentAt), o.sentBy, "Gửi xưởng" + (o.sendOverride ? " · ngoại lệ thiếu NVL" : ""), true);
    if (o.ackAt) add("Sản xuất", day(o.ackAt), o.ackBy, "Xưởng xác nhận nhận đơn", true);
    if (o.startedAt) add("Sản xuất", day(o.startedAt), o.startedBy, "Xưởng bắt đầu may", true);
    Object.keys(o.calls || {}).forEach(function(d){ var c = o.calls[d] || {}; if (c.done) add("Sản xuất", day(c.at || d), c.by, "Đã gọi xưởng (mốc " + Don.dm(d) + ")" + (c.note ? " · " + esc(c.note) : ""), true); });
    ((N && N.issues) || []).filter(function(p){ return p.oid === o.id; }).forEach(function(p){ add("NVL", p.at, p.by, "Xuất NVL " + esc(p.no || "")); if (p.void) add("NVL", p.void.at, p.void.by, "Huỷ phiếu xuất " + esc(p.no || "") + " · " + esc(p.void.reason || "")); });
    (o.receipts || []).forEach(function(x){ var q = 0; Object.keys(x.sizes || {}).forEach(function(c){ (x.sizes[c] || []).forEach(function(v){ q += +v || 0; }); });
      add("Giao nhận", x.savedAt || x.at, x.by, "Xưởng giao " + Don.fmt(q) + " áo" + (x.final ? " · lần giao cuối" : ""));
      if (x.void) add("Giao nhận", x.void.at, x.void.by, "Huỷ lần nhận · " + esc(x.void.reason || ""));
      (x.docsLog || []).forEach(function(e){ add("Chứng từ", e.at, e.by, (e.act === "xong" ? "Xong " : "Bỏ ") + esc(((Don.DOCS.filter(function(d){ return d.k === e.k; })[0]) || {}).t || e.k) + (e.doc ? " · số " + esc(e.doc) : "")); }); });
    (o.recvLog || []).forEach(function(e){ add("Giao nhận", e.at, e.by, ({"chot-du":"Chốt giao nhận · giao đủ", "chot-thieu":"Chốt giao thiếu", "mo-lai":"Mở lại giao nhận", cho:"Chờ giao tiếp"})[e.act] || esc(e.act)); });
    (o.ctuLog || []).forEach(function(e){ if (e.act !== "sua" || e.f === "status") add("Chứng từ", e.at, e.by, "Chứng từ " + esc(((Don.CTU.filter(function(c){ return c.k === e.t; })[0]) || {}).t || e.t) + ": " + (e.act === "them" ? "thêm" : e.act === "xoa" ? "xoá" : e.act === "na" ? "không áp dụng" : e.act === "bo-na" ? "bỏ không áp dụng" : "→ " + esc(Don.CT_ST[e.to] || e.to))); });
    (o.handoverLog || []).forEach(function(e){ add("Bàn giao hồ sơ", e.at, e.by, ({ghi:"Ghi nhận bàn giao hồ sơ", "xac-nhan":"Xác nhận nhận hồ sơ · Hoàn tất", "xac-nhan-admin":"Admin xác nhận bàn giao hợp lệ · Hoàn tất", "huy-ghi":"Huỷ ghi nhận bàn giao", "mo-lai":"Mở lại đơn đã hoàn tất"})[e.act] || esc(e.act)); });
    (o.vuong || []).forEach(function(v){ add("Vướng mắc", v.at, v.by, "Báo vướng mắc: " + esc(v.text || "")); if (v.nhanAt) add("Vướng mắc", v.nhanAt, v.nhanBy, "Nhận xử lý vướng mắc"); if (v.doneAt) add("Vướng mắc", v.doneAt, v.doneBy, "Giải quyết vướng mắc" + (v.reply ? ": " + esc(v.reply) : "")); });
    (o.cancelLog || []).forEach(function(c){ add("Huỷ", c.at, c.by, "Huỷ đơn · " + esc(c.reason || "")); add("Huỷ", c.restoredAt, c.restoredBy, "Khôi phục đơn"); });
    if (o.cancelled) add("Huỷ", o.cancelled.at, o.cancelled.by, "Huỷ đơn · " + esc(o.cancelled.reason || ""));
    /* Nhật ký server: chỉ các trường chưa có mốc riêng ở trên */
    var SKIP = /(receipts|recvClose|recvLog|arrived|cancelled|cancelLog|sizeLog|calls|closed|closedAt|closedBy|nvlOut|shipDate|shipBy|ship|shipPx|noDeduct|adjust|reopenLog|sentAt|sentBy|startedAt|startedBy|sendOverride|chotOverride|flow|handover|doneAt|doneBy|qlvh|qlvhLog|ackAt|ackBy|exec|execLog|erpCode|erpAt|erpBy|vuong|khtl|ctu|ctuLog)/;
    var G = {}; (srv || []).filter(function(e){ return e.key !== "he-thong" && !SKIP.test(e.path || ""); }).forEach(function(e){ var k = e.at + "|" + e.by; (G[k] = G[k] || {t:e.at, by:e.by, items:[]}).items.push(e); });
    Object.keys(G).forEach(function(k){ var g = G[k]; add("Nhật ký", g.t, g.by, g.items.map(function(e){ return esc(Don.logLabel(e)) + ": " + esc(Don.logVal(e.before)) + " → " + esc(Don.logVal(e.after)); }).join(" · ")); });
    return E.sort(function(a, b){ return a.t - b.t; });
  }

  /* ===== Đợt 2 (sơ đồ 1·01): chuông cảnh báo trên thanh đầu mọi trang — số Quá hạn (đỏ) và Sắp hạn giao (cam), cùng cách đếm với 2 ô Tổng quan.
     Admin / quản lý: đơn theo bộ lọc mã đang xem · Nhân viên: đơn mình thực thi. Bấm → Tổng quan lọc đúng danh sách. Chỉ đọc ===== */
  function bellCounts(S){ S = S || Don.readS(); var staff = !!(Khung.me && Khung.me.role === "staff"), q = 0, s = 0;
    Don.all(S).forEach(function(x){ var o = x.o; if (!o || !o.closed || o.cancelled || o.doneAt || (Don.isPlan && Don.isPlan(o))) return; if (staff && !Don.isMyExec(o)) return;
      var I = issues(o, S, x.m.key); if (I.some(function(i){ return i.rank === 1; })) q++; if (I.some(function(i){ return i.k === "sap-han-giao"; })) s++; });
    return {q:q, s:s}; }
  function drawBell(){
    var tb = document.querySelector(".topbar"); if (!tb || !Khung.me) return;
    var el = document.getElementById("kbBell");
    if (!el){ el = document.createElement("span"); el.id = "kbBell"; el.className = "kb-bell"; tb.appendChild(el);
      var st = document.createElement("style"); st.textContent = ".kb-bell{display:inline-flex;gap:6px;align-items:center;margin-left:10px;white-space:nowrap}.kb-bell a,.kb-bell span{border-radius:99px;padding:1px 9px;font-size:11.5px;font-weight:700;text-decoration:none;line-height:1.7}"
        + ".kb-bell .r{background:var(--crit-bg,#fdecea);color:var(--crit,#c62828)}.kb-bell .o{background:var(--warn-bg,#fff4e0);color:var(--warn,#b26a00)}.kb-bell .g{background:var(--line);color:var(--muted);font-weight:600}@media (max-width:700px){.kb-bell .lb{display:none}}"; document.head.appendChild(st); }
    var c; try { c = bellCounts(); } catch(e){ return; }
    var item = function(n, tone, ex, lb){ return n ? '<a class="' + tone + '" data-bell="' + ex + '" href="tong-quan.html?ex=' + ex + '" title="' + lb + ' · bấm để xem danh sách">' + (ex === "quahan" ? "🔔 " : "") + '<span class="lb" style="background:none;padding:0">' + lb + ' </span>' + n + '</a>'
      : '<span class="g" data-bell="' + ex + '" title="' + lb + ': không có">' + (ex === "quahan" ? "🔔 " : "") + '<span class="lb" style="background:none;padding:0">' + lb + ' </span>0</span>'; };
    el.innerHTML = item(c.q, "r", "quahan", "Quá hạn") + item(c.s, "o", "sap", "Sắp hạn");
    el.setAttribute("aria-label", "Cảnh báo: " + c.q + " quá hạn, " + c.s + " sắp hạn");
  }
  var bellT = null, bellLater = function(){ clearTimeout(bellT); bellT = setTimeout(drawBell, 60); };
  if (window.document){ if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bellLater); else bellLater();
    try { if (Don.onChange) Don.onChange(bellLater); } catch(e){} try { Khung.onFilter(bellLater); } catch(e){}
    window.addEventListener("storage", function(e){ if (["kehoach-sx-v3", "danhmuc-v1"].indexOf(e.key) >= 0) bellLater(); }); }

  /* ===== V5.4 Đợt 3 (Q6, Q7, UX3): màn Tiếp nhận đơn sản xuất — dữ liệu đầu vào + checklist bắt buộc (server kiểm lại, cùng quy tắc CheckReq),
     Trả lại chọn 1 trong 5 nhóm + ghi chú bắt buộc. Tiếp nhận xong hiện ngay danh sách công việc thực thi (tiến trình 9 bước V5.3). Đơn mua NVL giữ 1 nút (X2) ===== */
  var CHECK_T = {"so-luong":"Số lượng màu × size và tổng áo đúng", xuong:"Xưởng và loại đơn đúng", ngay:"Ngày hẹn giao khả thi", nvl:"NVL đủ / đã giữ", "ngoai-le":"Đã đọc chốt ngoại lệ thiếu NVL", techpack:"Có Tech Pack / thông tin mẫu và ghi chú gửi xưởng"};
  var CHECK_D = {nvl:"chỉ đơn gia công", "ngoai-le":"chỉ khi đơn có chốt ngoại lệ"};
  var TRA_G = [["so-luong","Sai số lượng"],["nvl","Thiếu NVL"],["techpack","Thiếu Tech Pack / mẫu"],["xuong-ngay","Sai xưởng / ngày hẹn"],["khac","Khác"]];
  function checkReq(o){ var L = ["so-luong", "xuong", "ngay"]; if ((o.xuong === "hoa" || o.xuong === "mien") && !o.type) L.push("nvl"); if (o.chotOverride) L.push("ngoai-le"); L.push("techpack"); return L; }
  var traName = function(k){ var x = TRA_G.filter(function(g){ return g[0] === k; })[0]; return x ? x[1] : ""; };
  function sizeRows(o, mk, S){
    var SZ = Khung.sizesOf(mk), R = [];
    if (o.type && o.sizes){ Object.keys(o.sizes).forEach(function(c){ var a = (o.sizes[c] || []).map(function(v){ return +v || 0; }); if (a.some(function(v){ return v > 0; })) R.push({c:c, a:a}); }); }
    else (o.lines || []).forEach(function(l){ var a = []; try { a = Array.isArray(l.sizes) ? l.sizes.slice() : Array.isArray(l.q) ? l.q.map(function(v){ return +v || 0; }) : SoLuong.lineSizes(l, SoLuong.rollOf(S, mk, o)); } catch(e){ a = []; } R.push({c:l.color, a:a}); });
    return {SZ:SZ, R:R};
  }
  function workList(o, mk, S){
    var st = Don.steps(o, S); if (!st) return "";
    var e = o.exec || {}, due = function(k){ if (k === "po" && e.ackAt) return Don.hmShort(e.ackAt + CFG.poHours * 36e5); if (k === "giao" || k === "nhan" || k === "chot-gn") return o.dueDate ? Don.dm(o.dueDate) : "chưa có hạn giao"; if ((k === "ct" || k === "hs" || k === "chung-tu") && o.arrived) return Don.dm(Don.addDays(o.arrived, 3)); return "—"; };
    var act = Don.stepAction(o, mk, S);
    return '<table class="t" data-work54><thead><tr><th>Việc</th><th>Trạng thái</th><th>Hạn</th><th></th></tr></thead><tbody>' + st.list.map(function(z){
      var d = z.cls.indexOf("d") === 0, cur = z.cls.indexOf("c") === 0;
      return '<tr data-wk="' + Khung.esc(z.k || "") + '"><td>' + Khung.esc(z.t) + '</td><td><span class="ux-b ' + (d ? "k" : cur ? "o" : "g") + '">' + (d ? "Xong" : cur ? "Đang làm" : "Chưa đến") + '</span></td><td class="small">' + Khung.esc(d ? "" : due(z.k)) + '</td><td>' + (cur && act && act.href ? '<a class="btn primary" href="' + act.href + '">' + Khung.esc(act.label) + '</a>' : '') + '</td></tr>'; }).join("") + '</tbody></table>';
  }
  function tiepNhan(o, mk, opts){
    opts = opts || {}; var S = Don.readS(), m = Don.modelOf(mk) || {key:mk, name:mk}, e = o.exec || {}, esc = Khung.esc, X = Don.xOf(o), REQ = checkReq(o);
    var old = document.getElementById("tn54"); if (old) old.remove();
    var w = document.createElement("div"); w.id = "tn54"; w.className = "tn54-back";
    if (!document.getElementById("tn54css")){ var st = document.createElement("style"); st.id = "tn54css"; st.textContent = ".tn54-back{position:fixed;inset:0;background:rgba(0,0,0,.32);z-index:300;display:grid;place-items:center;padding:16px}"
      + ".tn54{background:var(--surface,#fff);border-radius:10px;max-width:980px;width:100%;max-height:92vh;overflow:auto;padding:16px 18px;display:grid;gap:12px;box-shadow:0 12px 40px rgba(0,0,0,.25)}"
      + ".tn54 .hd{display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center}.tn54 .hd b{font-size:15px}.tn54 .c2{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);gap:14px}"
      + ".tn54 .bx{border:1px solid var(--line,#e5e7eb);border-radius:8px;padding:10px 12px;display:grid;gap:8px;align-content:start}.tn54 .bx h4{margin:0;font-size:13px}"
      + ".tn54 .ck{display:flex;gap:8px;align-items:flex-start;font-size:12.5px}.tn54 .ck small{display:block;color:var(--muted,#6b7280)}.tn54 .acts{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}"
      + ".tn54 table.sz{border-collapse:collapse;font-size:12px}.tn54 table.sz th,.tn54 table.sz td{border:1px solid var(--line,#e5e7eb);padding:3px 8px;text-align:right}.tn54 table.sz th:first-child,.tn54 table.sz td:first-child{text-align:left}"
      + ".tn54 .err{color:var(--crit,#c62828);font-size:12.5px}.tn54 .tra{display:grid;gap:6px;border-top:1px dashed var(--line,#e5e7eb);padding-top:8px}@media(max-width:800px){.tn54 .c2{grid-template-columns:1fr}}"; document.head.appendChild(st); }
    var I = issues(o, S, mk), late = I.filter(function(i){ return i.k === "qua-han-nhan"; })[0];
    var sr = sizeRows(o, mk, S), qty = Don.orderQty(o, S), C = (X.type === "GC" && !o.type) ? Don.nvlOf(o, S, mk) : null;
    var hd = '<div class="hd"><b>Tiếp nhận đơn · ' + esc(Don.label(o, m)) + '</b><span class="muted small">' + esc(m.name) + ' · ' + esc(X.name) + ' · ' + esc(Don.typeLabel(o)) + '</span>'
      + (e.by ? '<span class="ux-b g">' + esc(Khung.userName(e.by)) + ' bàn giao ' + Don.hmShort(e.at) + '</span>' : '')
      + (late ? '<span class="ux-b r">Quá hạn tiếp nhận</span>' : e.at ? '<span class="ux-b o">Hạn tiếp nhận ' + Don.hmShort(e.at + CFG.nhanHours * 36e5) + '</span>' : '') + '</div>';
    var inp = '<div class="bx"><h4>Dữ liệu đầu vào</h4><div class="small"><b>' + Don.fmt(qty) + ' ' + esc(Khung.unitOf(mk)) + '</b> · ' + sr.R.length + ' màu · hẹn giao <b>' + (o.dueDate ? Don.dm(o.dueDate) : "chưa có (dự kiến " + Don.dm(Don.addDays(o.date || Don.today(), 22)) + ")") + '</b> · ' + esc(X.name) + ' · ' + esc(Don.typeLabel(o)) + '</div>'
      + '<div style="overflow:auto"><table class="sz"><thead><tr><th>Màu</th>' + sr.SZ.map(function(s){ return '<th>' + esc(s) + '</th>'; }).join("") + '<th>Tổng</th></tr></thead><tbody>' + sr.R.map(function(r){ var t = r.a.reduce(function(p, v){ return p + (+v || 0); }, 0); return '<tr><td>' + esc(r.c) + '</td>' + sr.SZ.map(function(s, i){ return '<td>' + (r.a[i] || 0) + '</td>'; }).join("") + '<td><b>' + t + '</b></td></tr>'; }).join("") + '</tbody></table></div>'
      + (C ? '<div class="small">NVL: <b>' + esc(NV.STATE[C.state] || C.state) + '</b></div>' : '<div class="small muted">' + (o.type ? "Đơn " + esc(Don.typeLabel(o)) + ": không kiểm NVL" : "FOB: xưởng tự lo NVL") + '</div>')
      + (o.chotOverride ? '<div class="small" style="color:var(--warn,#b26a00)">⚠ Chốt ngoại lệ thiếu NVL · ' + esc(Khung.userName(o.chotOverride.by)) + ': ' + esc(o.chotOverride.reason || "") + '</div>' : '')
      + '<div class="small muted">Tech Pack / mẫu: xem <a href="Tech-Pack-Hang-Hoa.html" target="_blank">Tech Pack hàng hóa</a> · <a href="don-hang.html?id=' + encodeURIComponent(o.id) + '" target="_blank">Chi tiết đơn</a></div></div>';
    var ck = '<div class="bx"><h4>Checklist tiếp nhận <span class="muted small" data-ckn>0/' + REQ.length + ' · bắt buộc</span></h4>' + REQ.map(function(k){ return '<label class="ck"><input type="checkbox" data-ck54="' + k + '"><span>' + esc(CHECK_T[k]) + (CHECK_D[k] ? '<small>' + esc(CHECK_D[k]) + '</small>' : '') + '</span></label>'; }).join("")
      + '<div class="err" data-err></div><div class="acts"><button type="button" class="btn" data-tn54="close">Đóng</button><button type="button" class="btn" data-tn54="tra">Trả lại…</button><button type="button" class="btn primary" data-tn54="nhan" disabled>✓ Tiếp nhận</button></div>'
      + '<div class="tra" data-trabox hidden><b class="small">Trả lại cho người quản lý kế hoạch · chọn nhóm lý do</b>' + TRA_G.map(function(g){ return '<label class="ck"><input type="radio" name="tra54" value="' + g[0] + '"><span>' + esc(g[1]) + '</span></label>'; }).join("")
      + '<label class="small">Ghi chú cụ thể (bắt buộc)<textarea class="field" data-tranote rows="2" style="width:100%"></textarea></label><div class="acts"><button type="button" class="btn" data-tn54="tra-x">Huỷ</button><button type="button" class="btn primary" data-tn54="tra-ok">Gửi trả lại</button></div></div></div>';
    w.innerHTML = '<div class="tn54" role="dialog" aria-modal="true" aria-label="Tiếp nhận đơn">' + hd + '<div class="c2">' + inp + ck + '</div></div>';
    document.body.appendChild(w);
    var box = w.querySelector(".tn54"), errEl = function(t){ var x = w.querySelector("[data-err]"); if (x) x.textContent = t || ""; };
    var sync = function(){ var n = w.querySelectorAll("[data-ck54]:checked").length; w.querySelector("[data-ckn]").textContent = n + "/" + REQ.length + " · bắt buộc"; w.querySelector('[data-tn54="nhan"]').disabled = n < REQ.length; };
    var close = function(){ w.remove(); if (opts.onClose) opts.onClose(); };
    w.addEventListener("change", function(ev){ if (ev.target.matches("[data-ck54]")) sync(); });
    w.addEventListener("click", function(ev){
      if (ev.target === w){ close(); return; }
      var b = ev.target.closest("[data-tn54]"); if (!b) return; var a = b.dataset.tn54;
      if (a === "close"){ close(); return; }
      if (a === "tra"){ w.querySelector("[data-trabox]").hidden = false; return; }
      if (a === "tra-x"){ w.querySelector("[data-trabox]").hidden = true; return; }
      if (a === "tra-ok"){ var g = (w.querySelector('input[name="tra54"]:checked') || {}).value, nt = (w.querySelector("[data-tranote]").value || "").trim();
        if (!g){ errEl("Chọn 1 trong 5 nhóm lý do trả lại."); return; } if (!nt){ errEl("Ghi chú cụ thể lý do trả lại (bắt buộc)."); return; }
        b.disabled = true; Don.op({op:"tra-lai", model:mk, oid:o.id, group:g, reason:nt}).then(function(r){ b.disabled = false; if (r.status !== 200){ errEl((r.j && r.j.error) || "Không trả lại được"); return; }
          box.innerHTML = '<div class="hd"><b>Đã trả lại ' + esc(Don.label(o, m)) + '</b><span class="ux-b o">' + esc(traName(g)) + '</span></div><div class="small">Ghi chú: ' + esc(nt) + '</div><div class="acts"><button type="button" class="btn primary" data-tn54="close">Đóng</button></div>'; if (opts.onDone) opts.onDone("tra"); }); return; }
      if (a === "nhan"){ var got = [].map.call(w.querySelectorAll("[data-ck54]:checked"), function(x){ return x.dataset.ck54; });
        b.disabled = true; Don.op({op:"nhan-viec", model:mk, oid:o.id, check:got}).then(function(r){ if (r.status !== 200){ b.disabled = false; errEl((r.j && r.j.error) || "Không tiếp nhận được"); return; }
          var S2 = Don.readS(), o2 = null; Don.all(S2, true).forEach(function(x){ if (x.o.id === o.id) o2 = x.o; }); o2 = o2 || o;
          box.innerHTML = '<div class="hd"><b>✓ Đã tiếp nhận ' + esc(Don.label(o2, m)) + '</b><span class="muted small">' + esc(Khung.userName(Khung.me && Khung.me.id)) + ' · ' + Don.hmShort(Date.now()) + ' · checklist ' + got.length + '/' + REQ.length + '</span></div>'
            + '<div class="bx"><h4>Công việc thực thi <span class="muted small">theo tiến trình đơn</span></h4>' + workList(o2, mk, S2) + '</div><div class="acts"><a class="btn" href="don-hang.html?id=' + encodeURIComponent(o.id) + '">Mở chi tiết đơn</a><button type="button" class="btn primary" data-tn54="close">Đóng</button></div>';
          if (opts.onDone) opts.onDone("nhan"); }); return; }
    });
    if (opts.mode === "tra") w.querySelector("[data-trabox]").hidden = false;
    return w;
  }

  Object.assign(Don, {V54:true, tiepNhan54:tiepNhan, checkReq54:checkReq, CHECK_T54:CHECK_T, TRA_G54:TRA_G, traName54:traName, workList54:workList, bellCounts:bellCounts, drawBell:drawBell, CFG54:CFG, CFG54_DEF:DEF, CFG54_LIM:LIM, syncCfg54:syncCfg, now54:now, hmShort:hmShort, issues:issues, prioKey:prioKey, prioCmp:prioCmp, prioSort:prioSort, RANK_T:RANK_T, dueTxt:dueTxt, hasIssue:hasK,
    buyAlerts:buyAlerts, periodState:periodState, periodProgress:periodProgress, PSTATE:PSTATE, skuList:skuList, SKU_GRP:SKU_GRP, SKU_DANGER:DANGER, timeline:timeline});
})();
