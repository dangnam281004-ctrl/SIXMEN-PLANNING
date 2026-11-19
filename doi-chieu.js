/* Đối chiếu đơn đã đặt với bảng Cần đặt SIXMEN (nạp sau khung.js, don.js, so-luong.js, phan-tich.js).
   Vị trí: trang Phân tích nhu cầu, ngay sau khu cập nhật Tồn kho + Cần đặt (luồng: cập nhật → kiểm tra dữ liệu → ĐỐI CHIẾU → phân tích → chuyển Kế hoạch).
   Người lập kế hoạch xác nhận từng đơn × màu × size: SIXMEN đã tính đơn vào bảng Cần đặt chưa (KHÔNG phải đã trừ tồn kho thực tế).
   Lưu o.sxRefl (hiện hành: số đã tính từng ô, số còn hiệu lực lúc xác nhận, phiên bản bảng Cần đặt) + o.sxReflLog (mọi lần, kể cả Admin).
   Không đổi bảng Tồn kho / Cần đặt gốc, không đổi số lượng / trạng thái đơn đã chốt, không cộng / trừ tồn thành phẩm. */
(function(){
  var CUR = null, SZL = Khung.live(function(){ return Khung.sizesOf(CUR || (ctx && ctx.key)); }), COLORS = PT.COLORS, esc = Khung.esc, fmt = PT.fmt;
  var NAME = {TRG:"Trắng", XDE:"Xanh Đen", DEN:"Đen", GLA:"Xám Lam", DNI:"Denim", NAU:"Nâu", VOD:"Vỏ Đậu", DOD:"Đỏ Đô", CAC:"Cacao", REU:"Rêu", BEE:"Bee", XDM:"Xanh Đậm", XNH:"Xanh Nhạt", XDA:"Xám Đá"}; try { var _cn = window.Khung && Khung.colorNames ? Khung.colorNames() : {}; Object.keys(_cn).forEach(function(k){ if (!NAME[k]) NAME[k] = _cn[k]; }); } catch(e){}   // màu khai thêm ở Danh mục
  NAME = Khung.nameMap(NAME, function(){ return CUR || (ctx && ctx.key); });   // 13/11: tên màu riêng của mã (Jeans XDA = Xanh Đậm)
  var PILL = {no:["p-ok","SIXMEN chưa trừ → Planning trừ"], yes:["p-mute","SIXMEN đã trừ → không trừ lại"], part:["p-info","SIXMEN đã trừ một phần → chỉ trừ phần còn lại"], unknown:["p-warn","Chưa xác định"]};
  /* Kiểu riêng của hộp đối chiếu (dùng được trên mọi trang) */
  var css = document.createElement("style");
  css.textContent = ".hd-back{position:fixed;inset:0;z-index:60;background:rgba(15,20,18,.35);display:flex;align-items:flex-start;justify-content:center;padding:5vh 16px;overflow:auto}" +
    ".hd{background:var(--surface,#fff);border:1px solid var(--line);border-radius:12px;box-shadow:0 18px 50px rgba(0,0,0,.25);padding:18px 20px;width:100%;display:grid;gap:8px}" +
    ".hd.rf{max-width:1080px} .hd h3{margin:0;font-size:16px} .hd .actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}" +
    ".rf-o{border:1px solid var(--line);border-radius:8px;padding:10px 12px;display:grid;gap:6px;min-width:0}" +
    ".rf-o h4{margin:0;font-size:14px;display:flex;flex-wrap:wrap;gap:6px 10px;align-items:baseline}" +
    ".rf-o table{width:100%;border-collapse:collapse} .rf-o th,.rf-o td{padding:5px 8px;border-bottom:1px solid var(--line);text-align:center;white-space:nowrap}" +
    ".rf-o th{font-size:11.5px;font-weight:600;color:var(--ink2);background:var(--head)} .rf-o th:first-child,.rf-o td:first-child{text-align:left}" +
    ".rf-o input.sm{width:58px;border:1px solid var(--line);border-radius:5px;padding:4px;text-align:center;font:inherit;font-variant-numeric:tabular-nums}" +
    ".rf-o .q{display:block;font-size:11px;color:var(--muted)} .rf-o td.aff{background:var(--warn-bg)} .rf-o td.foc{box-shadow:inset 0 0 0 2px var(--warn)}" +
    ".rf-o .ck-warn div.bad{padding:6px 10px;border-radius:6px;background:var(--crit-bg);color:var(--crit);font-size:12.5px} .p-info{background:#e8f0fb;color:var(--accent)}";
  document.head.appendChild(css);
  var readS = function(){ try { return JSON.parse(localStorage.getItem("kehoach-sx-v3")) || {models:{}}; } catch(e){ return {models:{}}; } };
  var vOf = function(e){ return e.unk > 0 ? "unknown" : e.no <= 0 && e.yes > 0 ? "yes" : e.yes <= 0 ? "no" : "part"; };
  var kind = function(o){ return o.type ? ({theu:"Thêu thành phẩm", phoi:"Phôi"}[o.type] || o.type) : ((window.Don && Don.XUONG[o.xuong]) || {name:o.xuong}).name; };
  var stage = function(o){ return o.cancelled ? "Đã huỷ" : o.doneAt ? "Hoàn tất Planning" : o.arrived ? (o.recvClose && o.recvClose.kind === "thieu" ? "Chốt giao thiếu" : "Chốt giao đủ") : (o.receipts || []).length ? "Xưởng giao một phần" : o.nvlOut ? "Đã xuất NVL" : "Đã chốt, đang may"; };

  /* Tình trạng đối chiếu của 1 mã theo bảng Cần đặt đang dùng */
  function summary(key, opt){
    opt = opt || {};
    var r = PT.analyze(key, {S:opt.S || readS(), H:opt.H});
    var need = r.orders.filter(function(x){ return x.cells.some(function(c){ return c.affected; }); });
    var done = r.orders.filter(function(x){ return x.cells.every(function(c){ return !c.refl.unk; }); });
    return {res:r, orders:r.orders.length, need:need.length, done:done.length, skus:r.rows.filter(function(x){ return x.affected; }).length,
      stale:r.orders.filter(function(x){ return x.cells.some(function(c){ return c.refl.prev; }); }).length, needAt:r.times.need.at, hasNeed:!!r.ver};
  }

  var box = null, ctx = null, msg = {};
  function orderHTML(m, r, x){
    CUR = m.key; var o = x.o, cf = o.sxRefl, ed = Khung.canEdit(m.key) && !!r.ver, k = o.id, foc = ctx.filter;
    var sum = {yes:0, no:0, unk:0}; x.cells.forEach(function(c){ sum.yes += c.refl.yes; sum.no += c.refl.no; sum.unk += c.refl.unk; });
    var v = vOf(sum), stale = x.cells.some(function(c){ return c.refl.prev; });
    var cols = COLORS.filter(function(c){ return x.cells.some(function(y){ return y.c === c; }); });
    var cell = function(c, i){ return x.cells.filter(function(y){ return y.c === c && y.i === i; })[0]; };
    var inp = function(cc){
      var f = cc.refl, firm = !f.unk && cf && cf.cells && cf.cells[cc.c] && cf.cells[cc.c][cc.i] != null, prev = f.prev ? Math.min(cc.q, +cf.cells[cc.c][cc.i] || 0) : null;
      return '<input class="sm" data-rq="' + cc.c + '|' + cc.i + '" data-q="' + cc.q + '"' + (prev != null ? ' data-prev="' + prev + '"' : '') + ' inputmode="numeric" value="' + (firm ? f.yes : '') + '" placeholder="' + (prev != null ? 'trước ' + prev : '?') + '" aria-label="SIXMEN đã trừ ' + cc.c + ' ' + SZL[cc.i] + '"' + (ed ? '' : ' disabled') + ' title="' + esc(f.why || '') + '">';
    };
    var rows = cols.map(function(c){
      return '<tr><td><b>' + c + '</b> <span class="muted small">' + esc(NAME[c] || '') + '</span></td>' + SZL.map(function(_s, i){
        var cc = cell(c, i); if (!cc) return '<td class="muted">—</td>';
        var f = foc && foc.c === c && foc.i === i;
        return '<td class="' + (cc.affected ? 'aff' : '') + (f ? ' foc' : '') + '"><span class="q" title="' + (cc.qd ? 'xưởng chưa giao ' + cc.qo + ' + đã giao chưa đối chiếu tồn ' + cc.qd : 'xưởng chưa giao') + '">còn hiệu lực ' + fmt(cc.q) + '</span>' + inp(cc) +
          '<span class="q">Cần đặt gốc ' + (cc.B == null ? '—' : fmt(cc.B)) + (cc.affected ? ' · <b style="color:var(--warn)">cần xác nhận</b>' : cc.refl.unk ? ' · không ảnh hưởng' : '') + '</span></td>';
      }).join('') + '<td class="nowrap">' + (ed ? '<button class="btn ghost" data-rfset="no" data-rfc="' + c + '" title="SIXMEN chưa trừ dòng này trong Cần đặt">Chưa trừ</button><button class="btn ghost" data-rfset="yes" data-rfc="' + c + '" title="SIXMEN đã trừ đủ dòng này trong Cần đặt">Đã trừ</button><button class="btn ghost" data-rfset="blank" data-rfc="' + c + '" title="Chưa xác định">?</button>' : '') + '</td></tr>';
    }).join('');
    var L = o.sxReflLog || [];
    var hist = L.length ? '<details class="muted small"><summary>Lịch sử đối chiếu (' + L.length + ')</summary>' + L.slice().reverse().map(function(h){
      return '<div style="margin:4px 0"><b>' + new Date(h.at).toLocaleString("vi-VN") + '</b> · ' + esc(Khung.userName(h.by)) + ' · bảng Cần đặt ' + (h.needAt ? PT.hmd(h.needAt) : '—') + (h.note ? ' · ' + esc(h.note) : '') + '<br>' +
        h.lines.map(function(l){ return l.c + ' ' + l.s + ': ' + (l.r == null ? 'chưa xác định' : 'SIXMEN đã trừ ' + l.r + '/' + l.q + ', chưa trừ ' + l.chua); }).join(' · ') + '</div>';
    }).join('') + '</details>' : '';
    return '<div class="rf-o" data-rfo="' + k + '">' +
      '<h4><a href="don-hang.html?id=' + encodeURIComponent(o.id) + '">' + esc(window.Don ? Don.label(o, m) : (o.code || o.id)) + '</a><span class="muted small">' + esc(m.name) + ' · ' + esc(kind(o)) + ' · ' + stage(o) + '</span><span class="pill ' + PILL[v][0] + '">' + PILL[v][1] + '</span></h4>' +
      '<div class="muted small">' + (cf ? 'Đối chiếu lần cuối ' + new Date(cf.at).toLocaleString("vi-VN") + ' · ' + esc(Khung.userName(cf.by)) + ' · theo bảng Cần đặt ' + (cf.needAt ? PT.hmd(cf.needAt) : '—') + (stale ? ' · <b style="color:var(--warn)">bảng Cần đặt / số còn hiệu lực đã đổi, cần xác nhận lại</b>' : '') : 'Chưa đối chiếu lần nào.') + '</div>' +
      '<div class="scroll"><table class="t2"><thead><tr><th>Màu</th>' + SZL.map(function(z){ return '<th>' + z + '<div class="muted small" style="font-weight:400">SIXMEN đã trừ</div></th>'; }).join('') + '<th></th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      (ed ? '<div class="actions" style="justify-content:flex-start;align-items:center"><button class="btn ghost" data-rfset="no">Cả đơn: Chưa trừ</button><button class="btn ghost" data-rfset="yes">Cả đơn: Đã trừ</button><button class="btn ghost" data-rfset="blank">Cả đơn: Chưa xác định</button>' +
        (stale ? '<button class="btn ghost" data-rfset="prev" title="Điền lại số đã xác nhận lần trước — chỉ là gợi ý, bấm Lưu mới là xác nhận cho bảng mới">Điền như lần trước</button>' : '') +
        '<input class="field" data-rfnote placeholder="Ghi chú (nếu có)" style="flex:1;min-width:160px"><button class="btn primary" data-rf="save">Lưu đối chiếu</button></div>'
        : (!r.ver ? '<div class="muted small">Chưa có bảng Cần đặt nên chưa đối chiếu được.</div>' : '<div class="muted small">Chỉ người phụ trách mã (hoặc Admin) xác nhận được.</div>')) +
      (msg[k] ? (msg[k].ok ? '<div class="small" style="color:var(--ok);font-weight:600">✓ ' + esc(msg[k].t) + '</div>' : '<div class="ck-warn"><div class="bad">' + esc(msg[k].t) + '</div></div>') : '') +
      hist + '</div>';
  }
  function draw(skip){
    if (!box) return;
    var typed = {};
    box.querySelectorAll("[data-rfo]").forEach(function(b){ if (b.dataset.rfo === skip) return; b.querySelectorAll("[data-rq],[data-rfnote]").forEach(function(i){ typed[b.dataset.rfo + "#" + (i.dataset.rq || "note")] = i.value; }); });
    var m = Khung.models(true).filter(function(x){ return x.key === ctx.key; })[0] || {key:ctx.key, name:ctx.key};
    var r = PT.analyze(ctx.key, {S:readS(), H:ctx.H && ctx.H()}), f = ctx.filter;
    var show = r.orders.filter(function(x){ return !f ? true : f.aff ? x.cells.some(function(c){ return c.affected; }) : x.cells.some(function(c){ return c.c === f.c && c.i === f.i; }); });
    var keep = box.scrollTop;
    box.innerHTML = '<div class="hd rf" role="dialog" aria-modal="true" aria-label="Đối chiếu đơn đã đặt"><h3>Đối chiếu đơn đã đặt · ' + esc(m.name) + '</h3>' +
      '<p class="muted small" style="margin:0">Bảng Cần đặt SIXMEN đang dùng: <b>' + (r.times.need.at ? PT.hmd(r.times.need.at) : 'chưa có') + '</b>. Mỗi ô: số áo <b>còn hiệu lực</b> của đơn (xưởng chưa giao + đã giao chưa đối chiếu tồn) và ô nhập <b>số áo SIXMEN đã trừ trong bảng Cần đặt</b>: 0 = chưa trừ, bằng số còn hiệu lực = đã trừ, ở giữa = đã trừ một phần, để trống = chưa xác định. ' +
      'Đây là SIXMEN đã tính đơn vào số Cần đặt hay chưa, <b>không phải đã trừ tồn kho thực tế</b>. Còn phải đặt = MAX(0, Cần đặt − phần SIXMEN chưa trừ); ô chưa xác định → size đó Cần đối chiếu, chưa có số chính thức.</p>' +
      (f ? '<div class="note" style="--nc:var(--warn)">Đang xem ' + (f.aff ? 'các đơn có size cần xác nhận' : 'các đơn dính ' + esc(f.c) + ' ' + SZL[f.i]) + ' · ô tô vàng là size cần xác nhận, ô khác không bắt buộc. <button class="btn ghost" data-rf="all">Xem tất cả ' + r.orders.length + ' đơn</button></div>' : '') +
      (show.map(function(x){ return orderHTML(m, r, x); }).join('') || '<div class="muted">' + (f ? 'Không còn đơn nào cần xác nhận.' : 'Không có đơn đã chốt nào đang tính vào Đã đặt của mã này.') + '</div>') +
      '<div class="actions"><button class="btn ghost" data-rf="close">Xong</button></div></div>';
    box.querySelectorAll("[data-rfo]").forEach(function(b){ b.querySelectorAll("[data-rq],[data-rfnote]").forEach(function(i){ var v = typed[b.dataset.rfo + "#" + (i.dataset.rq || "note")]; if (v !== undefined) i.value = v; }); });
    box.scrollTop = keep;
  }
  function save(oid, el){
    var key = ctx.key, S = readS(), p = (S.models || {})[key] || {}, o = (p.orders || []).concat(p.gapOrders || []).filter(function(x){ return x.id === oid; })[0];
    if (!o) return "Không tìm thấy đơn.";
    if (!Khung.canEdit(key)) return "Tài khoản này không sửa được mã này.";
    var Hh = ctx.H && ctx.H(), r = PT.analyze(key, {S:S, H:Hh}); if (!r.ver) return "Chưa có bảng Cần đặt để đối chiếu.";
    var x = r.orders.filter(function(y){ return y.o === o; })[0]; if (!x) return "Đơn không còn tính vào Đã đặt.";
    var cells = {}, eff = {}, lines = [], bad = "";
    x.cells.forEach(function(cc){
      var i = el.querySelector('[data-rq="' + cc.c + '|' + cc.i + '"]'), v = i ? String(i.value).trim() : "";
      cells[cc.c] = cells[cc.c] || [null, null, null, null, null]; eff[cc.c] = eff[cc.c] || [0, 0, 0, 0, 0]; eff[cc.c][cc.i] = cc.q;
      if (v === ""){ lines.push({c:cc.c, s:SZL[cc.i], q:cc.q, r:null, chua:null}); return; }
      var k = Number(v);
      if (!Number.isInteger(k) || k < 0 || k > cc.q){ bad = bad || cc.c + " " + SZL[cc.i] + ": nhập số nguyên từ 0 đến " + cc.q + "."; return; }
      cells[cc.c][cc.i] = k; lines.push({c:cc.c, s:SZL[cc.i], q:cc.q, r:k, chua:cc.q - k});
    });
    if (bad) return bad;
    var note = ((el.querySelector("[data-rfnote]") || {}).value || "").trim(), at = Date.now(), by = Khung.me && Khung.me.id, needAt = r.times.need.at;
    var needId = ((((Hh || {}).heroes || {})[key] || {}).ver || {}).need || null;
    o.sxRefl = {needVer:r.ver, needId:needId, needAt:needAt, at:at, by:by, note:note, cells:cells, eff:eff};
    (o.sxReflLog = o.sxReflLog || []).push({at:at, by:by, needVer:r.ver, needId:needId, needAt:needAt, code:o.code, model:key, note:note, lines:lines});
    localStorage.setItem("kehoach-sx-v3", JSON.stringify(S));   // dong-bo.js tự gửi lên server (gộp theo từng phần, có nhật ký)
    return "";
  }
  /* Mở danh sách: opt.key mã, opt.filter null | {aff:true} | {c, i}, opt.H() bảng Phân tích đang hiện, opt.onSaved() vẽ lại trang */
  function open(opt){
    ctx = opt; msg = {};
    if (box) box.remove();
    box = document.createElement("div"); box.className = "hd-back"; document.body.appendChild(box);
    box.addEventListener("click", function(e){
      if (e.target.closest('[data-rf="close"]')){ box.remove(); box = null; if (ctx.onClose) ctx.onClose(); return; }
      if (e.target.closest('[data-rf="all"]')){ ctx.filter = null; draw(); return; }
      var blk = e.target.closest("[data-rfo]"); if (!blk) return;
      var st = e.target.closest("[data-rfset]");
      if (st){ var c = st.dataset.rfc, a = st.dataset.rfset;
        blk.querySelectorAll("[data-rq]").forEach(function(i){ if (c && i.dataset.rq.indexOf(c + "|") !== 0) return;
          i.value = a === "no" ? 0 : a === "yes" ? i.dataset.q : a === "prev" ? (i.dataset.prev != null ? i.dataset.prev : i.value) : ""; });
        return; }
      if (e.target.closest('[data-rf="save"]')){
        var err = save(blk.dataset.rfo, blk);
        msg[blk.dataset.rfo] = err ? {t:err} : {ok:true, t:"Đã lưu đối chiếu theo bảng Cần đặt đang dùng."};
        if (!err && ctx.onSaved) ctx.onSaved();
        draw(err ? null : blk.dataset.rfo);
      }
    });
    draw();
  }
  window.DC = {summary:summary, open:open, PILL:PILL, vOf:vOf};
})();
