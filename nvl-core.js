/* NVL dùng chung cho Kế hoạch và Tồn kho NVL (nạp sau so-luong.js). Một kho NVL duy nhất (dữ liệu nvl-v3).
   - Nhu cầu theo BOM: mỗi dòng NVL trong kho có "dùng cho mẫu / màu" + định mức (mỗi áo / mỗi cây) + hao hụt.
     Hao hụt: % riêng của dòng NVL, không có thì % của nhóm; dòng đánh dấu "định mức đã gồm hao hụt" thì không cộng lần nữa.
   - Giữ NVL: lưu trong đơn (o.nvlHold: kho / dư xưởng). Khả dụng = tồn − phần các đơn KHÁC đang giữ (đơn chưa xuất NVL, chưa huỷ).
     Ưu tiên theo thứ tự giữ thành công (server không cho tổng giữ vượt tồn).
   - Dư ở xưởng chỉ dùng được khi đã xác nhận (N.factoryOk) số lượng, chất lượng, khả năng dùng.
   - Đơn mua NCC đang về (N.pos) về kịp ngày cần → "Đang về"; về trễ → vẫn thiếu, không đề nghị mua trùng phần đó.
   - Đề nghị mua (N.requests) chỉ là đề nghị; Admin duyệt / phát hành đơn mua. */
(function(){
  var n = function(x){ return x == null || x === "" || isNaN(+x) ? 0 : +x; };
  var has = function(x){ return x !== null && x !== undefined && x !== ""; };
  var DAY = 864e5;
  var GC = ["hoa", "mien"];
  var byCay = function(it){ return it.type === "Vải" && has(it.stockCay); };
  var stockOf = function(it){ return byCay(it) ? n(it.stockCay) : n(it.stock); };
  var unitOf = function(it){ return byCay(it) ? "cây" : it.unit; };
  var groupOf = function(it){ return it.type === "Vải" ? "vai" : /^bo\b/i.test(it.type || "") ? "bo" : "pl"; };
  var fits = function(it, m, c){ return (it.model === "*" || it.model === m) && (it.color === "*" || it.color === c); };
  var live = function(it){ return (it.name || "").trim() !== "" && !it.off; };
  var iso = function(t){ var d = new Date(t); return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
  var dayMs = function(s){ var p = s.split("-").map(Number); return new Date(p[0], p[1] - 1, p[2]).getTime(); };
  /* NVL bắt buộc cho 1 dòng áo gia công (BOM): thiếu dòng NVL nào trong kho → "Chưa đủ dữ liệu", không bỏ qua.
     Tag: không dùng, không tính (anh chốt 24/10). Admin chỉnh danh sách ở Tồn kho NVL. */
  /* V3 (30/10) từng coi mã vạch là NVL riêng; từ 02/11/2026 mã vạch kho tự in, không tính tồn / giữ / đặt mua (xem REQ_DEFAULT, isMV) */
  var REQ_ALL = {vai:{t:"Vải", ok:function(it){ return groupOf(it) === "vai"; }}, bo:{t:"Bo", ok:function(it){ return groupOf(it) === "bo"; }},
    nhan:{t:"Nhãn sườn", ok:function(it){ return /^nhãn sườn/i.test(it.type || ""); }}, mavach:{t:"Mã vạch", ok:function(it){ return /^mã vạch/i.test(it.type || ""); }}};
  /* 02/11/2026 (anh duyệt): mã vạch kho tự in, không thuộc quy trình NVL → chuẩn còn 3 nhóm. REQ_ALL.mavach giữ lại chỉ để đọc cấu hình cũ */
  var REQ_DEFAULT = ["vai", "bo", "nhan"];
  /* Quy tắc hiệu lực: cấu hình cũ (dữ liệu / bản khôi phục) còn "mavach" vẫn chỉ kiểm Vải · Bo · Nhãn sườn — không sửa dữ liệu, chỉ bỏ qua khi đọc */
  var reqKeys = function(N){ var c = (N && N.cfg && N.cfg.required) || REQ_DEFAULT; return c.filter(function(k){ return REQ_ALL[k] && k !== "mavach"; }); };
  var required = function(N){ return reqKeys(N).map(function(k){ return REQ_ALL[k]; }); };
  /* Dòng "Mã vạch" cũ còn trong kho: giữ làm lịch sử, không tính vào nhu cầu / giữ / đặt mua NVL */
  var isMV = function(it){ return REQ_ALL.mavach.ok(it); };

  function lossOf(N, it){
    if (it.perHasLoss) return 0;
    if (has(it.lossPct)) return n(it.lossPct);
    return n(((N && N.lossGroup) || {})[groupOf(it)]);
  }
  /* Nhu cầu NVL của 1 dòng màu: [{it, q (đơn vị tồn, đã gồm hao hụt), base (chưa hao hụt)}]; q = null khi chưa có định mức */
  function lineNeeds(N, S, m, l){
    var qty = SoLuong.lineSizes(l, SoLuong.rollOf(S, m, l._o)).reduce(function(a, b){ return a + b; }, 0);
    return (N.items || []).filter(function(it){ return live(it) && !isMV(it) && fits(it, m, l.color); }).map(function(it){
      var bc = byCay(it);
      if (!bc && !has(it.per)) return {it:it, q:null, base:null};
      var base = bc ? n(l.cay) : (it.basis === "cay" ? n(l.cay) : qty) * n(it.per);
      return {it:it, base:base, q:base * (1 + lossOf(N, it) / 100)};
    });
  }
  /* Nhu cầu cả đơn theo từng dòng NVL + thiếu dữ liệu */
  function orderNeeds(N, S, m, o){
    var needs = {}, missing = [], noRate = [];
    /* Đơn đã chốt trước V3 (flow khác 3) giữ danh mục bắt buộc lúc chốt: không đòi thêm Mã vạch (không áp ngược quy định mới) */
    var reqs = required(N).filter(function(r){ return r !== REQ_ALL.mavach || !(o.closed && o.flow !== 3); });
    (o.lines || []).forEach(function(l){
      var L = lineNeeds(N, S, m, l);
      reqs.forEach(function(r){ if (!L.some(function(x){ return r.ok(x.it); })){ var s = r.t + " " + l.color; if (missing.indexOf(s) < 0) missing.push(s); } });
      L.forEach(function(x){
        if (x.q === null){ if (noRate.indexOf(x.it.name) < 0) noRate.push(x.it.name); return; }
        var e = needs[x.it.id] = needs[x.it.id] || {it:x.it, q:0, base:0}; e.q += x.q; e.base += x.base;
      });
    });
    return {needs:needs, missing:missing, noRate:noRate};
  }
  var isGC = function(o){ return GC.indexOf(o.xuong) >= 0; };
  function allGC(S){ var L = []; Object.keys(S.models || {}).forEach(function(m){ ((S.models[m] || {}).orders || []).forEach(function(o){ if (isGC(o)) L.push({m:m, o:o}); }); }); return L; }
  /* Đơn còn giữ NVL được: gia công, chưa xuất NVL, chưa huỷ */
  var active = function(o){ return isGC(o) && !o.nvlOut && !o.cancelled; };
  /* NVL đang ở xưởng = đã gửi − đơn đã xuất dùng − xưởng trả về (khoá xưởng|món) */
  function factoryBal(S, N){
    var bal = {}, add = function(k, v){ bal[k] = (bal[k] || 0) + v; };
    allGC(S).forEach(function(x){ var o = x.o;
      if (!o.nvlOut || !o.ship) return;
      Object.keys(o.ship).forEach(function(id){ add(o.xuong + "|" + id, n(o.ship[id])); });
      if (!o.cancelled) (o.lines || []).forEach(function(l){ lineNeeds(N, S, x.m, l).forEach(function(z){ if (z.q !== null) add(o.xuong + "|" + z.it.id, -z.q); }); });
    });
    (N.returns || []).forEach(function(r){ add(r.xuong + "|" + r.item, -n(r.qty)); });
    return bal;
  }
  /* ===== Sổ phân bổ NVL (N.alloc) + phiếu xuất (N.issues): chỉ server ghi qua /api/nvl/op (anh duyệt 26/10) =====
     Đơn đã có dòng trong sổ: số giữ lấy từ sổ. Đơn chưa có (giữ kiểu cũ o.nvlHold): vẫn tính như cũ, server chuyển vào sổ ở lần thao tác đầu. */
  var inLedger = function(N, oid){ return ((N && N.alloc) || []).some(function(e){ return e.oid === oid; }); };
  function allocOf(N, oid){ var h = {}; ((N && N.alloc) || []).forEach(function(e){ if (e.oid === oid) h[e.item] = (h[e.item] || 0) + n(e.qty); }); Object.keys(h).forEach(function(k){ if (Math.abs(h[k]) < 1e-9) delete h[k]; }); return h; }
  function heldOf(N, o){
    if (inLedger(N, o.id)) return {kho:allocOf(N, o.id), xuong:{}};
    var h = o.nvlHold; return h && active(o) ? {kho:h.kho || {}, xuong:h.xuong || {}} : {kho:{}, xuong:{}};
  }
  /* Phiếu xuất còn hiệu lực của 1 đơn; đơn xuất trước khi có phiếu (o.ship) tính như 1 phiếu */
  function issuesOf(N, o){ return ((N && N.issues) || []).filter(function(p){ return p.oid === o.id && !p.void; }); }
  function issuedOf(N, o){
    var h = {}, L = issuesOf(N, o);
    L.forEach(function(p){ (p.lines || []).forEach(function(l){ h[l.item] = (h[l.item] || 0) + n(l.qty) + n(l.fromX); }); });
    if (!L.length && o.nvlOut && o.ship) Object.keys(o.ship).forEach(function(id){ h[id] = n(o.ship[id]); });
    return h;
  }
  /* Đơn còn cần NVL: gia công, chưa huỷ, chưa về kho (có thể đã xuất một phần) */
  var needsNvl = function(o){ return isGC(o) && !o.cancelled && !o.arrived; };
  /* Tổng phần đang giữ của các đơn (trừ đơn exceptId). Truyền N để tính cả sổ phân bổ */
  function holds(S, exceptId, N){
    var kho = {}, xu = {};
    allGC(S).forEach(function(x){ var o = x.o; if (o.id === exceptId) return;
      var h = N ? heldOf(N, o) : (o.nvlHold && active(o) ? o.nvlHold : null); if (!h) return;
      Object.keys(h.kho || {}).forEach(function(id){ kho[id] = (kho[id] || 0) + n(h.kho[id]); });
      Object.keys(h.xuong || {}).forEach(function(id){ var k = o.xuong + "|" + id; xu[k] = (xu[k] || 0) + n(h.xuong[id]); });
    });
    return {kho:kho, xuong:xu};
  }
  /* Gọi server: {op:"giu"|"nha"|"xuat"|"huy-phieu", oid, model, items|lines, reason…} → {status, j}. Thành công: j.value là Tồn kho NVL mới */
  function op(body){
    return fetch("/api/nvl/op", {method:"POST", body:JSON.stringify(body)})
      .then(function(r){ return r.json().catch(function(){ return {error:"Server trả lỗi " + r.status}; }).then(function(j){ return {status:r.status, j:j}; }); })
      .then(function(x){ if (x.status === 200 && window.DongBo && DongBo.take) DongBo.take("nvl-v3", x.j.value, x.j.rev); return x; })
      .catch(function(){ return {status:0, j:{error:"Không kết nối được server"}}; });
  }
  /* Phần dư đã xác nhận mà các đơn xuất SAU lần xác nhận đã dùng (đơn ghi o.shipFromX lúc xuất) */
  function factoryUsed(S, x, id, since){
    return allGC(S).reduce(function(a, z){ var o = z.o; return a + (o.xuong === x && o.nvlOut && o.shipFromX && n(o.shipAt) >= since ? n(o.shipFromX[id]) : 0); }, 0);
  }
  /* Dư xưởng dùng được = min(đã xác nhận − đã dùng từ lúc xác nhận, dư thực tế) − phần đơn khác đang giữ.
     Dư phát sinh sau lần xác nhận không tự cộng: phải xác nhận lại */
  function factoryUsable(S, N, x, id, exceptId, bal, H){
    var ok = ((N.factoryOk || {})[x + "|" + id]) || null; if (!ok || !ok.usable || !ok.quality) return 0;
    bal = bal || factoryBal(S, N); H = H || holds(S, exceptId, N);
    var left = n(ok.qty) - factoryUsed(S, x, id, n(ok.at));
    return Math.max(0, Math.min(left, Math.max(0, n(bal[x + "|" + id]))) - n(H.xuong[x + "|" + id]));
  }
  /* Ngày cần NVL: KHÔNG dùng nữa (anh chốt 26/10: NVL do mình chủ động đặt và gửi xưởng). Luôn trả về chưa có ngày →
     hàng đã đặt NCC còn đang về được tính là đang về, không so ngày. (Dữ liệu ngày cũ trong đơn giữ nguyên, không đọc) */
  /* Ngày cần NVL (anh duyệt lại 26/10, QĐ7): = ngày phải giao NVL cho xưởng, nhập tay ở đơn (o.nvlNeedDate).
     Không lấy theo ngày đặt; chưa nhập thì không có ngày (hiện "cần bổ sung"), hàng đang về tính là đang về. */
  function dates(N, o){
    var c = (N.cfg || {}), need = o.nvlNeedDate || null, tentative = false;
    var back = n(c.qcDays) + n(((c.shipDays || {})[o.xuong]));
    return {need:need, tentative:tentative, kho:need ? iso(dayMs(need) - back * DAY) : null, back:back};
  }
  var poLeft = function(po){ return Math.max(0, n(po.qty) - (po.received || []).reduce(function(a, r){ return a + n(r.qty); }, 0)); };
  var poOpen = function(po){ return po.status === "dang-ve" || po.status === "nhan-mot-phan"; };
  /* Hệ số: 1 đơn vị mua = ? đơn vị tồn. Cùng đơn vị → 1; khác đơn vị mà chưa có hệ số đã xác nhận → null (không tự suy) */
  function facOf(it){
    var b = it.buy || {}, u = unitOf(it), bu = b.unit || u;
    if (bu === u) return 1;
    if (byCay(it) && bu === "kg") return n(b.kgPerCay) > 0 ? 1 / n(b.kgPerCay) : null;   // vải mua kg, tồn cây: kg / cây theo từng mã vải (lô có thể khác, nhập lúc nhận)
    return n(b.factor) > 0 ? n(b.factor) : null;
  }
  var facText = function(it){ var u = unitOf(it), bu = buyUnit(it); return byCay(it) && bu === "kg" ? "kg / cây của loại vải này" : "1 " + bu + " = ? " + u; };
  var buyUnit = function(it){ return (it.buy && it.buy.unit) || unitOf(it); };
  /* Quy đổi + làm tròn theo quy cách mua của từng NVL */
  function toBuy(it, qty){
    var b = it.buy || {}, u = unitOf(it), bu = buyUnit(it), f = facOf(it);
    if (f === null) return {ok:false, why:"chưa có hệ số quy đổi hợp lệ (" + facText(it) + "), không tự giả định", unit:bu};
    var raw = qty / f;
    /* Chưa có quy cách mua: không tự đặt bội số; vẫn đề nghị đúng số thiếu, cảnh báo và bắt xác nhận khi tạo đơn mua chính thức */
    if (!n(b.pack)) { var q0 = Math.ceil(raw * 100 - 1e-9) / 100; return {ok:true, specMissing:true, qty:q0, unit:bu, stockQty:q0 * f, note:"chưa có quy cách mua, chưa làm tròn"}; }
    var q = Math.ceil(raw / n(b.pack) - 1e-9) * n(b.pack);
    return {ok:true, qty:q, unit:bu, stockQty:q * f, note:"làm tròn lên bội số " + fmtN(n(b.pack)) + " " + bu};
  }
  /* Kiểm tra NVL của 1 đơn */
  function check(N, S, m, o){
    var on = orderNeeds(N, S, m, o), D = dates(N, o), bal = factoryBal(S, N), Hx = holds(S, o.id, N), H = heldOf(N, o), iss = issuedOf(N, o), rows = [];
    var cov = poCoverage(N, S);
    Object.keys(on.needs).forEach(function(id){
      var e = on.needs[id], it = e.it, need = e.q, stock = stockOf(it);
      var heldOthers = n(Hx.kho[id]), hk = n((H.kho || {})[id]), hx = n((H.xuong || {})[id]), is = n(iss[id]);
      var freeKho = Math.max(0, stock - heldOthers - hk), freeX = Math.max(0, factoryUsable(S, N, o.xuong, id, o.id, bal, Hx) - hx);
      var own = hk + hx + is, gap = Math.max(0, need - own), free = freeKho + freeX;
      var c = (cov[o.id] || {})[id] || {timely:0, late:[], noEta:[]};
      var req = (N.requests || []).filter(function(r){ return r.item === id && (r.status === "cho-duyet" || r.status === "da-duyet") && (r.orders || []).indexOf(o.id) >= 0; }).reduce(function(a, r){ return a + (has(r.stockQty) ? n(r.stockQty) : n(r.qty)); }, 0);
      var LL = listsFor(N, id, o.id), LK = linksOf(N, o.id, id), rest0 = Math.max(0, need - own);
      var row = {it:it, unit:unitOf(it), need:need, base:e.base, loss:lossOf(N, it), stock:stock, heldOthers:heldOthers, available:Math.max(0, stock - heldOthers), holdKho:hk, holdXuong:hx, issued:is, freeKho:freeKho, freeX:freeX,
        timely:c.timely, late:c.late, noEta:c.noEta || [], lists:LL.map(function(L){ return {id:L.id, no:L.no, code:L.code, status:L.status, eta:L.eta || null}; }),
        buying:shareOf(LK, rest0, "I"), links:LK.map(function(k){ return {id:k.id, ln:k.l.id, no:k.no, status:k.status, plan:k.plan, alloc:k.alloc, linked:!!k.s.linkedAt}; }), spare:spareOf(N, S, id, o.id),
        gotOk:shareOf(LK, rest0, "R"),
        pending:shareOf(LK, rest0, "pend"),
        eta:LL.filter(function(L){ return LIST_OPEN.indexOf(L.status) >= 0; }).map(function(L){ return (L.lines || []).filter(function(l){ return l.item === id && lineLeft(l) + linePend(l) > 1e-9; }).map(function(l){ return l.eta || L.eta || null; }); }).reduce(function(a, b){ return a.concat(b); }, []),
        requested:req, short:0, status:"du", propose:null};
      if (gap <= 1e-9) row.status = "du";
      else if (free >= gap - 1e-9) row.status = "du-chua-giu";
      else {
        var rest = gap - free;
        row.gap = rest;
        if (c.timely >= rest - 1e-9) row.status = "dang-ve";
        else {
          row.status = "thieu"; row.short = rest - c.timely;
          var lateQ = c.late.reduce(function(a, x){ return a + x.qty; }, 0), q = Math.max(0, row.short - lateQ - req);
          row.lateQ = lateQ; row.propose = q > 1e-9 ? Object.assign({need:q}, toBuy(it, q)) : null;
          if (it.buy && n(it.buy.leadDays) && D.kho) row.orderBy = iso(dayMs(D.kho) - n(it.buy.leadDays) * DAY);
        }
      }
      rows.push(row);
    });
    var status = on.missing.length || on.noRate.length ? "thieu-du-lieu" : rows.some(function(r){ return r.status === "thieu" || r.status === "dang-ve"; }) ? "cho-nvl" : rows.every(function(r){ return r.status === "du"; }) ? "san-sang" : "chua-giu";
    var C = {rows:rows, missing:on.missing, noRate:on.noRate, dates:D, status:status};
    C.state = stateOf(C); C.risk = riskOf(C, o);
    return C;
  }
  /* Trạng thái đáp ứng NVL (5 mức, anh duyệt 26/10), lấy món tệ nhất:
     chua-kiem-tra (thiếu dữ liệu) · thieu (còn thiếu sau tồn khả dụng + hàng đã gửi NCC; đủ tồn mà chưa giữ cũng là thiếu: chưa chắc có)
     · dang-mua (phần thiếu đã đặt NCC, chưa nhận) · dang-nhan (đã nhận một phần / có hàng chờ kiểm) · du (đã giữ / đã xuất đủ) */
  function stateOf(C){
    if (C.status === "thieu-du-lieu") return "chua-kiem-tra";
    if (C.rows.every(function(r){ return r.status === "du"; })) return "du";
    if (C.rows.some(function(r){ return r.status === "thieu"; })) return "thieu";
    if (C.rows.some(function(r){ return r.status === "dang-ve"; }))
      return C.rows.some(function(r){ return r.status === "dang-ve" && (r.pending > 1e-9 || r.gotOk > 1e-9 || r.lists.some(function(L){ return L.status === "nhan-mot-phan"; })); }) ? "dang-nhan" : "dang-mua";
    return "chua-giu";   // không thiếu món nào, tồn đủ nhưng chưa giữ: bấm Giữ NVL (anh hỏi 26/10: báo "Thiếu" là sai)
  }
  /* Nguy cơ trễ tiến độ do NVL: [{lv:"crit"|"warn", t}] */
  function riskOf(C, o){
    var out = [], t = iso(Date.now()), short = C.rows.filter(function(r){ return r.status !== "du"; });
    if (!short.length) return out;
    if (!C.dates.need) out.push({lv:"warn", t:"Cần bổ sung ngày cần NVL (ngày giao NVL cho xưởng)"});
    short.forEach(function(r){
      if (r.status === "thieu" && !r.lists.some(function(L){ return L.status !== "huy"; })) out.push({lv:"crit", t:r.it.name + ": thiếu " + fmtN(r.short || r.gap || 0) + " " + r.unit + ", chưa có danh sách đặt mua"});
      r.late.forEach(function(x){ out.push({lv:"crit", t:r.it.name + ": NVL về " + x.eta.split("-").reverse().slice(0, 2).join("/") + (x.late != null ? ", trễ " + x.late + " ngày so với ngày cần" : "")}); });
      r.noEta.forEach(function(x){ out.push({lv:"warn", t:r.it.name + ": " + (x.code || "đơn mua") + " chưa có ngày về"}); });
      r.eta.forEach(function(e){ if (e && e < t) out.push({lv:"crit", t:r.it.name + ": NCC trễ hẹn (hẹn " + e.split("-").reverse().slice(0, 2).join("/") + ", chưa giao đủ)"}); });
    });
    var seen = {}; return out.filter(function(x){ if (seen[x.t]) return false; seen[x.t] = 1; return true; });
  }
  /* ===== Danh sách đặt mua NVL (gửi NCC qua Zalo) =====
     Trạng thái: nhap → da-gui (đã gửi NCC) → ncc-xac-nhan → nhan-mot-phan → da-nhan; huy. Chỉ khi đã gửi NCC mới tính là "đang đặt".
     Mỗi dòng = 1 NVL (1 màu): need (cần theo kế hoạch), short (còn thiếu lúc lập), qty (số thực tế đặt), received[], src[] (nguồn từng đơn) */
  var LIST_OPEN = ["da-gui", "ncc-xac-nhan", "nhan-mot-phan"];
  /* Nhận hàng 2 bước (anh duyệt 26/10, QĐ5): lần nhận {kind:"giao", qty} = NCC giao thực tế (chưa vào tồn);
     {kind:"qc", ref, ok, bad} = số đạt kiểm nhận (vào tồn) / lỗi. Lần nhận cũ không có kind = đã giao + đạt. */
  function recOf(l){
    var ok = 0, bad = 0, giao = 0, kg = 0;
    (l.received || []).forEach(function(r){ if (r.kind === "kg"){ kg += n(r.kg); return; } if (r.kind === "giao") giao += n(r.qty); else if (r.kind === "qc"){ ok += n(r.ok); bad += n(r.bad); kg += n(r.kg); } else { ok += n(r.qty); giao += n(r.qty); } });
    return {ok:ok, bad:bad, giao:giao, kg:kg, pend:Math.max(0, giao - ok - bad)};   // kg: kg THỰC CÂN Kho ghi từng lần, chỉ để theo dõi lô, không cộng vào tồn
  }
  var lineGot = function(l){ return recOf(l).ok; };                 // đã nhận hợp lệ (đạt kiểm nhận, đã vào tồn)
  var linePend = function(l){ return recOf(l).pend; };              // đã giao, chờ kiểm
  var lineLeft = function(l){ var r = recOf(l); return Math.max(0, n(l.qty) - r.ok - r.pend); };   // NCC còn phải giao (hàng lỗi vẫn phải giao bù)
  /* Hàng đang về của 1 NVL (đơn vị tồn): đơn mua cũ + dòng danh sách đặt mua đã gửi NCC (gồm hàng đã giao còn chờ kiểm).
     Ngày về: ngày riêng của dòng nếu có, không thì ngày của danh sách */
  function supplyOf(N, it){
    var out = [], f = facOf(it);
    if (f !== null) (N.pos || []).forEach(function(p){ if (poOpen(p) && p.item === it.id) out.push({p:p, left:poLeft(p) * f}); });
    (N.buyLists || []).forEach(function(L){ if (LIST_OPEN.indexOf(L.status) < 0) return;
      (L.lines || []).forEach(function(l){ var q = lineLeft(l) + linePend(l); if (l.item === it.id && q > 1e-9) out.push({p:{id:L.id, code:L.no || L.code, eta:l.eta || L.eta || null}, left:q, list:true}); }); });
    return out;
  }
  /* ===== Gom mua vải cho nhiều KHTL (anh duyệt 07/11/2026) =====
     src.plan = số dự kiến cho từng KHTL (chưa nhập thì lấy số thiếu lúc liên kết). Chỉ để theo dõi: không đụng tồn, không phải giữ.
     Phân bổ = dòng giữ trong sổ có ln (dòng đặt mua). Không tự chia theo ưu tiên, không tự giữ khi hàng về. */
  var planOfSrc = function(s){ return has(s.plan) ? n(s.plan) : n(s.short); };
  function lineAlloc(N, ln){ var by = {}, t = 0; ((N && N.alloc) || []).forEach(function(e){ if (e.ln === ln){ by[e.oid] = (by[e.oid] || 0) + n(e.qty); t += n(e.qty); } }); return {by:by, total:t}; }
  function srcOrderOf(S, s){ var o = (((S.models || {})[s.model] || {}).orders || []).filter(function(x){ return x.id === s.id; })[0]; return o ? {m:s.model, o:o} : null; }
  var srcLive = function(S, s){ if (s.next) return true; var x = srcOrderOf(S, s); return !!x && !x.o.cancelled && !x.o.arrived; };
  /* Các dòng đặt mua (chưa huỷ) có liên kết tới đơn oid với 1 NVL. I = NCC còn phải về + chờ kiểm (chỉ DS đã gửi), R = đạt kiểm nhận chưa phân bổ của dòng (dùng chung) */
  function linksOf(N, oid, itemId){
    var out = [];
    (N.buyLists || []).forEach(function(L){ if (L.status === "huy") return;
      (L.lines || []).forEach(function(l){ if (l.item !== itemId) return;
        var s = (l.src || []).filter(function(z){ return z.id === oid; })[0]; if (!s) return;
        var A = lineAlloc(N, l.id), a = n(A.by[oid]), plan = planOfSrc(s), open = LIST_OPEN.indexOf(L.status) >= 0;
        out.push({L:L, l:l, s:s, id:L.id, no:L.no, status:L.status, plan:plan, alloc:a, pr:Math.max(0, plan - a), I:open ? lineLeft(l) + linePend(l) : 0, pend:open ? linePend(l) : 0, R:Math.max(0, lineGot(l) - A.total)});
      }); });
    return out;
  }
  /* Phần của 1 đơn trong các dòng liên kết: không quá phần dự kiến chưa phân bổ, không quá số của dòng, không quá nhu cầu còn lại */
  var shareOf = function(LK, cap, key){ return Math.min(cap, LK.reduce(function(a, k){ return a + Math.min(k.pr, k[key]); }, 0)); };
  /* 5 con số của 1 dòng đặt mua + từng nguồn. Nguồn đã huỷ / đã về kho không tính vào dự kiến nhưng vẫn hiện để giữ lịch sử */
  function lineInfo(N, S, L, l){
    var A = lineAlloc(N, l.id), rows = (l.src || []).map(function(s){
      var x = srcOrderOf(S, s), o = x && x.o, nd = o ? (orderNeeds(N, S, x.m, o).needs[l.item] || {q:0}).q : n(s.need), h = o ? heldOf(N, o) : {}, is = o ? issuedOf(N, o) : {};
      var held = n((h.kho || {})[l.item]) + n((h.xuong || {})[l.item]), iss = n(is[l.item]);
      return {s:s, o:o, live:srcLive(S, s), plan:planOfSrc(s), alloc:n(A.by[s.id]), need:nd, held:held, issued:iss, rest:Math.max(0, nd - held - iss)}; });
    var act = rows.filter(function(r){ return r.live; }), planned = act.reduce(function(a, r){ return a + r.plan; }, 0), R = recOf(l);
    return {qty:n(l.qty), got:R.ok, kg:R.kg, planned:planned, alloc:A.total, unalloc:Math.max(0, R.ok - A.total), short:act.reduce(function(a, r){ return a + Math.max(0, r.plan - r.alloc); }, 0), spare:Math.max(0, n(l.qty) - planned), over:Math.max(0, planned - n(l.qty)), rows:rows};
  }
  /* DS đang mở có cùng NVL, còn dư chưa dự kiến cho ai, mà đơn này chưa liên kết: gợi ý gắn vào, không tự gắn, không tính là tồn khả dụng */
  function spareOf(N, S, itemId, oid){
    var out = [];
    (N.buyLists || []).forEach(function(L){ if (LIST_OPEN.indexOf(L.status) < 0) return;
      (L.lines || []).forEach(function(l){ if (l.item !== itemId || (l.src || []).some(function(z){ return z.id === oid; })) return;
        var q = lineInfo(N, S, L, l).spare; if (q > 1e-9) out.push({id:L.id, ln:l.id, no:L.no, q:q, ncc:L.ncc || "", eta:l.eta || L.eta || null, status:L.status, spec:l.spec || ""}); }); });
    return out;
  }
  /* Các danh sách (chưa huỷ) đã có NVL này cho nguồn src (id đơn hoặc "next:<mã>") */
  function listsFor(N, itemId, src){
    return (N.buyLists || []).filter(function(L){ return L.status !== "huy" && (L.lines || []).some(function(l){ return l.item === itemId && (l.src || []).some(function(s){ return s.id === src; }); }); });
  }
  /* Kế hoạch tương lai (KHTL, anh duyệt 28/10): đơn gia công đang lập được lưu lại chờ NVL, có mã KHTL-xxxx; chốt thì chính bản ghi đó thành đơn sản xuất */
  var isPlan = function(o){ return !!(o && o.khtl && !o.closed); };
  /* Thứ tự GỢI Ý ưu tiên (chỉ để gợi ý mua / cảnh báo tranh chấp, KHÔNG tự giữ): đơn đã chốt → kế hoạch tương lai theo giờ lưu → đơn đang lập khác */
  var prioKey = function(o){ return o.closed ? "0|" + o.closed : isPlan(o) ? "1|" + ("000000000000000" + n(o.khtl.at)).slice(-15) : "2|" + (o.date || ""); };
  /* Nguồn cần NVL theo kế hoạch: đơn gia công chưa xuất NVL + Bản nháp đợt sau của từng mã (chỉ dự kiến, chưa giữ) */
  function planSources(N, S, colors){
    var src = allGC(S).filter(function(x){ return needsNvl(x.o); }).sort(function(a, b){ return prioKey(a.o).localeCompare(prioKey(b.o)) || (a.o.date || "").localeCompare(b.o.date || "") || a.o.id.localeCompare(b.o.id); })   // chốt trước được tính trước
      .map(function(x){ return {id:x.o.id, code:isPlan(x.o) ? x.o.khtl.code : (window.Don && Don.label ? Don.label(x.o, x.m) : x.o.code), khtl:isPlan(x.o) || undefined, model:x.m, o:x.o, on:orderNeeds(N, S, x.m, x.o)}; });
    Object.keys(S.models || {}).forEach(function(m){
      var g = ((S.models[m] || {}).grids || {}).next, per = SoLuong.rollOf(S, m), lines = []; if (!g) return;
      (colors || Object.keys(g)).forEach(function(c){ var sz = (g[c] || []).map(n), v = sz.reduce(function(a, b){ return a + b; }, 0); if (v) lines.push({color:c, cay:v / per, sizes:sz}); });
      if (lines.length) src.push({id:"next:" + m, code:"Bản nháp đợt sau", model:m, next:true, on:orderNeeds(N, S, m, {lines:lines})});
    });
    return src;
  }
  /* NVL còn thiếu theo kế hoạch (cộng dồn mọi nguồn, không làm tròn, không cộng dự phòng).
     Thiếu = cần (phần chưa giữ) − tồn khả dụng (tồn − các đơn đang giữ) − hàng đã gửi NCC còn chưa về. Đơn lên trước được tính trước, Bản nháp đợt sau sau cùng. */
  function shortages(N, S, colors){
    var src = planSources(N, S, colors), H = holds(S, null, N), items = {}, missing = [];
    src.forEach(function(s){
      s.on.missing.forEach(function(x){ missing.push({src:s, what:x}); });
      s.on.noRate.forEach(function(x){ missing.push({src:s, what:"chưa có định mức " + x}); });
      var hh = s.o ? heldOf(N, s.o) : null, is = s.o ? issuedOf(N, s.o) : {};
      Object.keys(s.on.needs).forEach(function(id){
        var e = s.on.needs[id], h = hh ? n((hh.kho || {})[id]) + n((hh.xuong || {})[id]) + n(is[id]) : 0;
        (items[id] = items[id] || {it:e.it, src:[]}).src.push({id:s.id, code:s.code, model:s.model, next:!!s.next, need:e.q, rest:Math.max(0, e.q - h)});
      });
    });
    Object.keys(items).forEach(function(id){
      var x = items[id], it = x.it, free = Math.max(0, stockOf(it) - n(H.kho[id])), sup = supplyOf(N, it).reduce(function(a, p){ return a + p.left; }, 0), pool = free + sup;
      x.src.forEach(function(s){ var t = Math.min(pool, s.rest); pool -= t; s.short = s.rest - t; s.lists = listsFor(N, id, s.id).map(function(L){ return {id:L.id, no:L.no, code:L.code, status:L.status}; }); });
      x.need = x.src.reduce(function(a, s){ return a + s.need; }, 0); x.held = x.src.reduce(function(a, s){ return a + s.need - s.rest; }, 0);
      x.free = free; x.sup = sup; x.short = x.src.reduce(function(a, s){ return a + s.short; }, 0); x.unit = unitOf(it);
      x.draft = (N.buyLists || []).filter(function(L){ return L.status === "nhap"; }).reduce(function(a, L){ return a + (L.lines || []).filter(function(l){ return l.item === id; }).reduce(function(b, l){ return b + n(l.qty); }, 0); }, 0);
    });
    return {items:items, missing:missing};
  }
  /* Phân phiếu mua đang về cho các đơn còn thiếu: theo ngày cần ở kho (sớm trước), chỉ tính phiếu về kịp */
  function poCoverage(N, S){
    var out = {}, list = allGC(S).filter(function(x){ return needsNvl(x.o); }).map(function(x){ return {x:x, d:dates(N, x.o), h:heldOf(N, x.o), is:issuedOf(N, x.o)}; });
    list.sort(function(a, b){ return (a.d.kho || "9999").localeCompare(b.d.kho || "9999") || prioKey(a.x.o).localeCompare(prioKey(b.x.o)) || (a.x.o.date || "").localeCompare(b.x.o.date || ""); });
    var Hall = holds(S, null, N);
    (N.items || []).forEach(function(it){
      /* Vải (07/11/2026): hàng đang về chỉ tính theo dòng đặt mua có liên kết + số dự kiến của chính đơn; không chia theo thứ tự ưu tiên */
      if (byCay(it)){ list.forEach(function(L){
        var o = L.x.o, need = 0; (o.lines || []).forEach(function(l){ lineNeeds(N, S, L.x.m, l).forEach(function(z){ if (z.it.id === it.id && z.q !== null) need += z.q; }); });
        var gap = Math.max(0, need - n((L.h.kho || {})[it.id]) - n((L.h.xuong || {})[it.id]) - n(L.is[it.id]));
        var c = (out[o.id] = out[o.id] || {})[it.id] = {timely:0, late:[], noEta:[]};
        linksOf(N, o.id, it.id).forEach(function(k){ var t = Math.min(k.pr, k.I, gap); if (t <= 1e-9) return;
          var eta = k.l.eta || k.L.eta || null; gap -= t;
          if (!eta){ c.timely += t; c.noEta.push({code:k.no || k.L.code, qty:t}); }
          else if (!L.d.kho || eta <= L.d.kho) c.timely += t;
          else c.late.push({po:k.id, code:k.no || k.L.code, eta:eta, qty:t, late:Math.round((dayMs(eta) - dayMs(L.d.kho)) / DAY)});
        }); }); return; }
      var pos = supplyOf(N, it).sort(function(a, b){ return (a.p.eta || "9999").localeCompare(b.p.eta || "9999"); });
      if (!pos.length) return;
      var freeStock = Math.max(0, stockOf(it) - n(Hall.kho[it.id]));
      list.forEach(function(L){
        var o = L.x.o, need = 0; (o.lines || []).forEach(function(l){ lineNeeds(N, S, L.x.m, l).forEach(function(z){ if (z.it.id === it.id && z.q !== null) need += z.q; }); });
        var h = L.h, gap = Math.max(0, need - n((h.kho || {})[it.id]) - n((h.xuong || {})[it.id]) - n(L.is[it.id]));
        var fromFree = Math.min(freeStock, gap); freeStock -= fromFree; gap -= fromFree;
        var c = (out[o.id] = out[o.id] || {})[it.id] = {timely:0, late:[], noEta:[]};
        pos.forEach(function(P){ if (gap <= 1e-9 || P.left <= 1e-9) return;
          var t = Math.min(P.left, gap), ok = !L.d.kho || (P.p.eta && P.p.eta <= L.d.kho);   // không có ngày cần → hàng đang về đều tính
          /* Danh sách đặt mua đã gửi NCC nhưng chưa có ngày về: tính là đang về, ghi rõ "chưa có ngày về" để theo dõi */
          if (!P.p.eta && P.list){ c.timely += t; c.noEta.push({code:P.p.code, qty:t}); P.left -= t; gap -= t; }
          else if (ok){ c.timely += t; P.left -= t; gap -= t; }
          else { c.late.push({po:P.p.id, code:P.p.code, eta:P.p.eta, qty:t, late:L.d.kho && P.p.eta ? Math.round((dayMs(P.p.eta) - dayMs(L.d.kho)) / DAY) : null}); P.left -= t; gap -= t; }
        });
      });
    });
    return out;
  }
  /* Nhu cầu cạnh tranh của 1 đơn / kế hoạch theo từng NVL: phần CHƯA giữ (cần − đã giữ − đã xuất) của các nguồn khác.
     before = các nguồn đứng trước theo thứ tự gợi ý ưu tiên. Chỉ để cảnh báo / gợi ý, không giữ hộ ai. */
  function compete(N, S, o){
    var src = planSources(N, S).filter(function(s){ return s.o; }), me = -1, out = {};
    src.forEach(function(s, k){ if (s.id === o.id) me = k; });
    src.forEach(function(s, k){
      if (s.id === o.id) return;
      var hh = heldOf(N, s.o), is = issuedOf(N, s.o);
      Object.keys(s.on.needs).forEach(function(id){
        var rest = Math.max(0, s.on.needs[id].q - n((hh.kho || {})[id]) - n((hh.xuong || {})[id]) - n(is[id]));
        if (rest <= 1e-9) return;
        var x = out[id] = out[id] || {before:0, after:0, others:[]}, first = me < 0 || k < me;
        x.others.push({id:s.id, code:s.code, model:s.model, plan:!!s.khtl, closed:!!s.o.closed, rest:rest, first:first});
        if (first) x.before += rest; else x.after += rest;
      });
    });
    return out;
  }
  /* Trạng thái kế hoạch tương lai (anh duyệt 28/10): tính lại mỗi lần theo tồn thực tế, phần đã giữ và hàng đạt kiểm nhận.
     DS nháp chưa gửi NCC = chưa đặt mua; hàng NCC giao còn chờ kiểm không tính là có. Không tự giữ, không tự chốt. */
  var PLAN_OF = {"chua-kiem-tra":"chua-du-lieu", "thieu":"thieu-chua-mua", "dang-mua":"dang-mua", "dang-nhan":"ve-mot-phan", "chua-giu":"du-chua-giu", "du":"da-giu"};
  function planState(N, S, m, o, C){
    if (o.cancelled) return "huy";
    if (o.closed) return "da-chot";
    return PLAN_OF[(C || check(N, S, m, o)).state] || "chua-du-lieu";
  }
  /* Giữ NVL cho 1 đơn: dư xưởng đã xác nhận trước, rồi kho; chỉ giữ trong phần khả dụng. Trả về nhật ký thay đổi */
  function hold(N, S, m, o, by){
    var on = orderNeeds(N, S, m, o), bal = factoryBal(S, N), Hx = holds(S, o.id, N), before = sig(o.nvlHold);
    var h = o.nvlHold = o.nvlHold || {kho:{}, xuong:{}}; h.kho = h.kho || {}; h.xuong = h.xuong || {};
    Object.keys(on.needs).forEach(function(id){
      var need = on.needs[id].q, hx = n(h.xuong[id]), hk = n(h.kho[id]);
      var addX = Math.min(Math.max(0, need - hx - hk), Math.max(0, factoryUsable(S, N, o.xuong, id, o.id, bal, Hx) - hx));
      if (addX > 0) h.xuong[id] = hx + addX;
      var it = on.needs[id].it, freeKho = Math.max(0, stockOf(it) - n(Hx.kho[id]) - hk), addK = Math.min(Math.max(0, need - n(h.xuong[id]) - hk), freeKho);
      if (addK > 0) h.kho[id] = hk + addK;
    });
    if (sig(h) === before) return null;
    h.at = Date.now(); h.by = by;
    return log(o, by, "giu", before, sig(h));
  }
  /* Nhả phần giữ vượt nhu cầu (đơn giảm số lượng) hoặc nhả hết (huỷ / bấm nhả) */
  function trim(N, S, m, o, by, all, reason){
    if (!o.nvlHold) return null;
    var before = sig(o.nvlHold), on = all ? {needs:{}} : orderNeeds(N, S, m, o), h = o.nvlHold, changed = false;
    ["xuong", "kho"].forEach(function(k){ Object.keys(h[k] || {}).forEach(function(id){
      var need = on.needs[id] ? on.needs[id].q : 0, other = k === "kho" ? n((h.xuong || {})[id]) : 0, max = Math.max(0, need - other);
      if (n(h[k][id]) > max + 1e-9){ changed = true; if (max > 0) h[k][id] = max; else delete h[k][id]; }
    }); });
    if (!changed) return null;
    h.at = Date.now(); h.by = by;
    return log(o, by, all ? "nha-het" : "nha-thua", before, sig(h), reason);
  }
  /* Chữ ký phần giữ (chỉ số lượng) để so trước / sau */
  function sig(h){ var r = function(x){ var o = {}; Object.keys(x || {}).sort().forEach(function(k){ o[k] = Math.round(n(x[k]) * 1e4) / 1e4; }); return o; }; return JSON.stringify({kho:r((h || {}).kho), xuong:r((h || {}).xuong)}); }
  function log(o, by, act, before, after, reason){
    if (before === after) return null;
    var e = {at:Date.now(), by:by, act:act, before:before, after:after}; if (reason) e.reason = reason;
    (o.nvlLog = o.nvlLog || []).push(e); return e;
  }
  /* Nâng cấp: đơn chưa xuất NVL đã có phân bổ cũ (theo ngày đặt) → giữ phần lấy từ KHO đúng thứ tự cũ.
     Phần trước đây tự lấy từ dư ở xưởng KHÔNG tự xác nhận (quyết định 1b): đơn hiện "dư ở xưởng chờ xác nhận". */
  function migrate(N, S, by){
    var L = allGC(S).filter(function(x){ return active(x.o) && !x.o.nvlHold; }).sort(function(a, b){ return (a.o.date || "").localeCompare(b.o.date || "") || a.o.id.localeCompare(b.o.id); });
    if (!L.length) return 0;
    var rem = {}, fb = {}, Hall = holds(S, null); (N.items || []).forEach(function(it){ rem[it.id] = stockOf(it) - n(Hall.kho[it.id]); });
    var bal = factoryBal(S, N); Object.keys(bal).forEach(function(k){ fb[k] = Math.max(0, bal[k]) - n(Hall.xuong[k]); });
    L.forEach(function(x){ var o = x.o, on = orderNeeds(N, S, x.m, o), h = {kho:{}, xuong:{}, at:Date.now(), by:by, legacy:true};
      Object.keys(on.needs).forEach(function(id){ var q = on.needs[id].q, k = o.xuong + "|" + id, f = Math.min(Math.max(0, fb[k] || 0), q); fb[k] = (fb[k] || 0) - f;
        var kq = Math.min(Math.max(0, rem[id] || 0), q - f); if (kq > 0){ h.kho[id] = kq; rem[id] -= kq; }
        if (f > 0) (h.legacyFactory = h.legacyFactory || {})[id] = f; });
      if (!Object.keys(h.kho).length && !h.legacyFactory) return;   // không có phân bổ cũ nào → chưa giữ
      o.nvlHold = h; log(o, by, "khoi-tao", sig(null), sig(h), "Giữ nguyên phần lấy từ kho của phân bổ cũ khi nâng cấp" + (h.legacyFactory ? "; phần dư ở xưởng chờ xác nhận" : ""));
    });
    return L.length;
  }
  /* Mọi thay đổi số tồn đi qua đây: ghi sổ tồn (người, giờ, trước / sau, lý do, loại nghiệp vụ, chứng từ). Server từ chối thay đổi tồn không có sổ */
  function stockChange(N, it, field, after, kind, by, reason, ref){
    var before = n(it[field]); after = Math.round(n(after) * 1e6) / 1e6;
    if (Math.abs(after - before) < 1e-9) return null;
    var e = {id:"sl" + Date.now() + Math.random().toString(36).slice(2, 6), item:it.id, itemName:it.name, field:field, before:before, after:after, delta:Math.round((after - before) * 1e6) / 1e6, kind:kind, reason:reason, ref:ref || null, by:by, at:Date.now()};
    it[field] = after; (N.stockLog = N.stockLog || []).push(e); return e;
  }
  /* Cộng / trừ vào tồn chính của NVL (vải có tồn cây → cây) */
  function addStock(N, it, delta, kind, by, reason, ref){ var f = byCay(it) ? "stockCay" : "stock"; return stockChange(N, it, f, n(it[f]) + delta, kind, by, reason, ref); }
  var fmtN = function(x){ return (Math.round(x * 100) / 100).toLocaleString("vi-VN"); };
  window.NV = {n:n, byCay:byCay, stockOf:stockOf, unitOf:unitOf, groupOf:groupOf, fits:fits, live:live, lossOf:lossOf, lineNeeds:lineNeeds, orderNeeds:orderNeeds,
    factoryBal:factoryBal, holds:holds, factoryUsable:factoryUsable, dates:dates, poLeft:poLeft, poOpen:poOpen, toBuy:toBuy, check:check, poCoverage:poCoverage,
    inLedger:inLedger, allocOf:allocOf, heldOf:heldOf, issuesOf:issuesOf, issuedOf:issuedOf, needsNvl:needsNvl, op:op, recOf:recOf, linePend:linePend, stateOf:stateOf, riskOf:riskOf,
    STATE:{"chua-kiem-tra":"Chưa kiểm tra", "thieu":"Thiếu NVL", "dang-mua":"Đang mua", "dang-nhan":"Đang nhận", "chua-giu":"Đủ tồn, chưa giữ", "du":"Đủ NVL", "khong-can":"Không cần NVL"},
    STATE_PILL:{"chua-kiem-tra":"p-mute", "thieu":"p-bad", "dang-mua":"p-info", "dang-nhan":"p-warn", "chua-giu":"p-warn", "du":"p-ok", "khong-can":"p-mute"},
    hold:hold, trim:trim, log:log, sig:sig, stockChange:stockChange, addStock:addStock, supplyOf:supplyOf, listsFor:listsFor, planSources:planSources, shortages:shortages, lineGot:lineGot, lineLeft:lineLeft, LIST_OPEN:LIST_OPEN, facText:facText, REQ_ALL:REQ_ALL, REQ_DEFAULT:REQ_DEFAULT, factoryUsed:factoryUsed, migrate:migrate, active:active, facOf:facOf, buyUnit:buyUnit, allGC:allGC, dayMs:dayMs, iso:iso, isGC:isGC, fmt:fmtN,
    isPlan:isPlan, compete:compete, planState:planState, reqKeys:reqKeys, isMV:isMV, planOfSrc:planOfSrc, lineAlloc:lineAlloc, linksOf:linksOf, lineInfo:lineInfo,
    PLAN_STATE:{"chua-du-lieu":"Chưa đủ dữ liệu NVL", "thieu-chua-mua":"Thiếu NVL — Chưa đặt mua", "dang-mua":"Đang mua NVL", "ve-mot-phan":"NVL về một phần", "du-chua-giu":"Đủ tồn khả dụng — Chưa giữ", "da-giu":"Đủ NVL — Chờ chốt", "da-chot":"Đã chuyển thành đơn sản xuất", "huy":"Đã hủy"},
    PLAN_PILL:{"chua-du-lieu":"p-mute", "thieu-chua-mua":"p-bad", "dang-mua":"p-info", "ve-mot-phan":"p-warn", "du-chua-giu":"p-warn", "da-giu":"p-ok", "da-chot":"p-ok", "huy":"p-mute"},
    STATUS:{"du":"Đủ (đã giữ)", "du-chua-giu":"Đủ (chưa giữ)", "dang-ve":"Đang về", "thieu":"Thiếu", "thieu-du-lieu":"Chưa đủ dữ liệu"},
    ORDER:{"san-sang":"Sẵn sàng", "chua-giu":"Chưa giữ NVL", "cho-nvl":"Chờ NVL", "thieu-du-lieu":"Chưa đủ dữ liệu"}};
})();
