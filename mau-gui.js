/* V5.2 (anh chốt 13/11/2026) · MẪU GỬI ĐỐI TÁC: đơn sản xuất (gửi xưởng) và đơn mua NVL (gửi NCC).
   Bố cục cố định, căn cột chuẩn; đủ mã đơn, ngày đặt, ngày hẹn, đối tác, màu / size / số lượng hoặc NVL / quy cách / số lượng.
   Xem trước → sao chép ảnh (dán Zalo) · tải PNG · tải PDF. Không đưa dữ liệu nội bộ (người phụ trách, ghi chú nội bộ, tồn, lịch sử).
   Bảng tự giãn theo nội dung, chữ dài tự xuống dòng (không cắt chữ, không vỡ bảng khi đơn dài). Mẫu này KHÔNG thay thế PO ERP chính thức. */
(function(){
  var esc = function(s){ return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); };
  var dmy = function(d){ return d ? String(d).slice(0, 10).split("-").reverse().join("/") : "—"; };
  var nf = function(x){ var v = +x || 0; return v.toLocaleString("vi-VN", {maximumFractionDigits:2}); };
  var C = {ink:"#111827", line:"#c9ccd1", head:"#1f2328", navy:"#0b3a6b", soft:"#f3f4f6"};
  var cell = "border:1px solid " + C.line + ";padding:6px 8px;vertical-align:middle;word-break:break-word;";
  var th = cell + "background:" + C.head + ";color:#fff;font-weight:700;text-align:center;";
  var tn = cell + "background:" + C.navy + ";color:#fff;font-weight:700;text-align:center;";
  var tc = cell + "text-align:center;";
  function frame(width, title, meta, body, foot){
    var el = document.createElement("div");
    el.className = "mau-gui";
    el.style.cssText = "background:#fff;color:" + C.ink + ";font:13px/1.45 Inter,'Segoe UI',Arial,sans-serif;padding:20px 22px;width:" + width + "px;box-sizing:border-box";
    el.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:flex-end;gap:16px;border-bottom:2px solid ' + C.head + ';padding-bottom:8px;margin-bottom:10px">'
      + '<div><div style="font-size:11px;letter-spacing:.08em;color:#6b7280;font-weight:700">SIXMEN</div><div style="font-size:19px;font-weight:800;letter-spacing:.01em">' + esc(title) + '</div></div>'
      + '<div style="text-align:right;font-size:12px;color:#374151">' + meta.filter(function(m){ return m[0] === "Mã đơn"; }).map(function(m){ return '<div style="font-size:15px;font-weight:800;color:' + C.ink + '">' + esc(m[1]) + '</div>'; }).join("") + '</div></div>'
      + '<table style="border-collapse:collapse;width:100%;margin-bottom:12px;font-size:12.5px"><tbody>'
      + (function(){ var M = meta.filter(function(m){ return m[0] !== "Mã đơn"; }), r = ""; for (var i = 0; i < M.length; i += 2){ r += '<tr>' + [M[i], M[i + 1]].map(function(m){ return m ? '<td style="padding:3px 8px 3px 0;color:#6b7280;width:110px;white-space:nowrap">' + esc(m[0]) + '</td><td style="padding:3px 16px 3px 0;font-weight:700">' + esc(m[1]) + '</td>' : '<td></td><td></td>'; }).join("") + '</tr>'; } return r; })()
      + '</tbody></table>' + body
      + '<div style="margin-top:12px;font-size:11px;color:#6b7280;border-top:1px solid ' + C.line + ';padding-top:6px">' + foot + '</div>';
    return el;
  }
  /* Đơn sản xuất (gửi xưởng). m: mã trong danh mục; S: kế hoạch (catalog màu, số áo / cây) */
  function sx(o, m, S){
    var key = m.key, quan = window.Khung && Khung.isQuan(key), SZ = (window.Khung ? Khung.sizesOf(key) : ["M","L","XL","2XL","3XL"]).map(function(x){ return x === "2X" ? "2XL" : x === "3X" ? "3XL" : x; });
    var cat = ((S && S.catalog) || {})[key] || {}, perRoll = (S && S.perRoll) || 65, X = window.Don ? Don.xOf(o) : {name:o.xuong};
    var sizes = function(l){ return SoLuong.lineSizes(l, perRoll).slice(0, SZ.length); };   // đơn đã chốt: số đã khoá; quần: số nhập thẳng
    var short = (m.name || "").replace(/^Polo\s+/, "").replace(/^Quần\s+/, "");
    /* đơn thêu / phôi (gapOrders) không có lines mà ghi số từng màu × size (o.sizes) → nhập thẳng như quần */
    var direct = quan || !o.lines, L0 = o.lines || Object.keys(o.sizes || {}).map(function(c){ return {color:c, q:o.sizes[c]}; });
    var lines = L0.filter(function(l){ return sizes(l).some(function(v){ return v > 0; }); });
    var rows = lines.map(function(l){ var c = cat[l.color] || {}, sz = sizes(l), tot = sz.reduce(function(a, v){ return a + v; }, 0);
      var nm = c.name || ((window.Khung && Khung.colorName(l.color, key)) || (window.Don && Don.COLOR_NAME[l.color]) || l.color);
      return '<tr><td style="' + tc + 'font-weight:700">' + esc(short.toUpperCase()) + '</td><td style="' + cell + '">' + esc(String(nm).toUpperCase()) + '<div style="font-size:11px;color:#6b7280">' + esc(l.color) + '</div></td>'
        + '<td style="' + cell + 'font-size:12px">' + esc((c.feat || "").toUpperCase()) + '</td>'
        + '<td style="' + tc + 'padding:3px;width:76px">' + (c.img ? '<img src="' + c.img + '" style="width:70px;height:70px;object-fit:cover;display:block;margin:auto">' : "") + '</td>'
        + (direct ? "" : (l.ratio || []).slice(0, SZ.length).map(function(v){ return '<td style="' + tc + '">' + (+v || 0) + '</td>'; }).join("") + '<td style="' + tc + 'background:' + C.soft + ';font-weight:700">' + (+l.cay || 0) + '</td>')
        + sz.map(function(v){ return '<td style="' + tc + '">' + (v || "") + '</td>'; }).join("") + '<td style="' + tc + 'font-weight:800">' + nf(tot) + '</td></tr>'; }).join("");
    var colTot = SZ.map(function(_, i){ return lines.reduce(function(a, l){ return a + (sizes(l)[i] || 0); }, 0); }), all = colTot.reduce(function(a, v){ return a + v; }, 0), u = quan ? "QUẦN" : "ÁO";
    var head = '<tr><th rowspan="2" style="' + th + '">MẪU</th><th rowspan="2" style="' + th + '">MÀU SẮC</th><th rowspan="2" style="' + th + '">ĐẶC TRƯNG</th><th rowspan="2" style="' + th + '">HÌNH MÀU</th>'
      + (direct ? "" : '<th colspan="' + SZ.length + '" style="' + th + '">TỈ LỆ SIZE</th><th rowspan="2" style="' + th + '">SỐ CÂY VẢI</th>')
      + '<th colspan="' + SZ.length + '" style="' + tn + '">SỐ ' + u + ' TỪNG SIZE</th><th rowspan="2" style="' + th + '">TỔNG SỐ ' + u + '</th></tr><tr>'
      + (direct ? "" : SZ.map(function(s){ return '<th style="' + th + '">' + esc(s) + '</th>'; }).join("")) + SZ.map(function(s){ return '<th style="' + tn + '">' + esc(s) + '</th>'; }).join("") + '</tr>';
    var totRow = '<tr><td colspan="' + (direct ? 4 : 4 + SZ.length) + '" style="' + tc + 'font-weight:800;text-align:right">TỔNG</td>' + (direct ? "" : '<td style="' + tc + 'font-weight:800">' + nf(lines.reduce(function(a, l){ return a + (+l.cay || 0); }, 0)) + '</td>')
      + colTot.map(function(v){ return '<td style="' + tc + 'font-weight:800">' + nf(v) + '</td>'; }).join("") + '<td style="' + tc + 'font-weight:800">' + nf(all) + '</td></tr>';
    var body = '<table style="border-collapse:collapse;width:100%;table-layout:auto"><thead>' + head + '</thead><tbody>' + (rows || '<tr><td colspan="20" style="' + tc + '">Chưa có dòng nào</td></tr>') + totRow + '</tbody></table>';
    return frame(direct ? 900 : 1180, "ĐƠN ĐẶT SẢN XUẤT", [["PO VIKING → Xưởng", (o.erpCode2 || "").trim() || "chưa có"], ["Xưởng", X.name || ""], ["Mẫu", m.name], ["Ngày đặt", dmy(o.date)], ["Ngày hẹn giao", o.dueDate ? dmy(o.dueDate) : "theo thỏa thuận"], ["Tổng số " + u.toLowerCase(), nf(all) + " · " + lines.length + " màu"]],
      body, "Đơn gửi xưởng từ SIXMEN Planning. Số lượng theo bảng trên; chứng từ chính thức theo PO ERP.");
  }
  /* Đơn mua NVL (gửi NCC) */
  function nvl(B){
    var L = (B.lines || []).filter(function(l){ return (+l.qty || 0) > 0; }), u = (L[0] || {}).unit || "", tot = L.reduce(function(a, l){ return a + (+l.qty || 0); }, 0);
    var cname = function(c){ var n = (window.Don && Don.COLOR_NAME[c]) || c; return c === "*" ? "Mọi màu" : n; };
    var rows = L.map(function(l, i){ return '<tr><td style="' + tc + '">' + (i + 1) + '</td><td style="' + cell + 'font-weight:600">' + esc(l.itemName || B.title) + '</td><td style="' + cell + '">' + esc(cname(l.color)) + '<div style="font-size:11px;color:#6b7280">' + esc(l.color || "") + '</div></td>'
      + '<td style="' + cell + '">' + esc(l.spec || "") + '</td><td style="' + tc + '">' + esc(l.unit || u) + '</td><td style="' + tc + 'font-weight:800">' + nf(l.qty) + '</td><td style="' + tc + '">' + (l.eta ? dmy(l.eta) : B.eta ? dmy(B.eta) : "") + '</td></tr>'; }).join("");
    var body = '<table style="border-collapse:collapse;width:100%;table-layout:auto"><thead><tr><th style="' + th + 'width:44px">STT</th><th style="' + th + '">TÊN NGUYÊN VẬT LIỆU</th><th style="' + th + '">MÀU</th><th style="' + th + '">QUY CÁCH</th><th style="' + th + 'width:64px">ĐVT</th><th style="' + tn + 'width:110px">SỐ LƯỢNG</th><th style="' + th + 'width:110px">NGÀY GIAO</th></tr></thead><tbody>'
      + (rows || '<tr><td colspan="7" style="' + tc + '">Chưa có dòng nào</td></tr>') + '<tr><td colspan="5" style="' + tc + 'font-weight:800;text-align:right">TỔNG</td><td style="' + tc + 'font-weight:800">' + nf(tot) + ' ' + esc(u) + '</td><td style="' + tc + '"></td></tr></tbody></table>';
    return frame(900, "ĐƠN ĐẶT MUA NGUYÊN VẬT LIỆU", [["Mã đơn", B.no], ["Nhà cung cấp", B.ncc || "—"], ["PO ERP", B.po ? B.po.code : "—"], ["Ngày đặt", dmy(B.sentAt ? new Date(B.sentAt - new Date().getTimezoneOffset() * 6e4).toISOString() : new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString())], ["Ngày hẹn giao", B.eta ? dmy(B.eta) : "—"], ["Loại NVL", B.title || ""]],
      body, "Đơn gửi NCC từ SIXMEN Planning (VIKING đặt NCC NVL). Căn cứ PO ERP " + esc(B.po ? B.po.code : "") + "; mẫu này không thay thế PO ERP chính thức.");
  }
  /* Thư viện xuất ảnh / PDF (cdnjs, tải khi cần) */
  var libs = {};
  function load(src, test){ if (test()) return Promise.resolve(); if (!libs[src]) libs[src] = new Promise(function(res, rej){ var s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = function(){ libs[src] = null; rej(new Error("Không tải được công cụ xuất ảnh / PDF, kiểm tra kết nối mạng")); }; document.head.appendChild(s); }); return libs[src]; }
  var H2C = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js", JSPDF = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
  function canvasOf(el){
    return load(H2C, function(){ return !!window.html2canvas; }).then(function(){
      var host = document.createElement("div"); host.style.cssText = "position:fixed;left:-20000px;top:0;z-index:-1"; var c = el.cloneNode(true); host.appendChild(c); document.body.appendChild(host);
      return html2canvas(c, {scale:2, backgroundColor:"#ffffff", useCORS:true}).then(function(cv){ host.remove(); return cv; }, function(e){ host.remove(); throw e; }); });
  }
  function pngBlob(el){ return canvasOf(el).then(function(cv){ return new Promise(function(r){ cv.toBlob(r, "image/png"); }); }); }
  function save(blob, name){ var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function(){ URL.revokeObjectURL(a.href); }, 1500); }
  /* PDF A4: đơn rộng → khổ ngang; đơn dài → chia nhiều trang, không cắt mất dòng cuối */
  function pdfBlob(el){
    return Promise.all([canvasOf(el), load(JSPDF, function(){ return !!(window.jspdf && window.jspdf.jsPDF); })]).then(function(r){
      var cv = r[0], land = cv.width > cv.height * 1.05, pdf = new window.jspdf.jsPDF({orientation:land ? "landscape" : "portrait", unit:"mm", format:"a4"});
      var W = pdf.internal.pageSize.getWidth() - 16, Hp = pdf.internal.pageSize.getHeight() - 16, pxPerMm = cv.width / W, slice = Math.floor(Hp * pxPerMm), y = 0, first = true;
      while (y < cv.height){ var h = Math.min(slice, cv.height - y), part = document.createElement("canvas"); part.width = cv.width; part.height = h; part.getContext("2d").drawImage(cv, 0, y, cv.width, h, 0, 0, cv.width, h);
        if (!first) pdf.addPage(); pdf.addImage(part.toDataURL("image/png"), "PNG", 8, 8, W, h / pxPerMm); first = false; y += h; }
      return pdf.output("blob"); });
  }
  /* Xem trước + 3 cách gửi */
  function preview(el, name, title){
    var old = document.getElementById("mauGuiDlg"); if (old) old.remove();
    var w = document.createElement("div"); w.id = "mauGuiDlg"; w.className = "ux-dlg";
    w.innerHTML = '<div role="dialog" aria-modal="true" aria-label="' + esc(title) + '" style="background:#fff;border-radius:10px;box-shadow:0 20px 60px rgba(0,0,0,.25);width:min(1240px,100%);max-height:94vh;display:grid;grid-template-rows:auto 1fr;overflow:hidden">'
      + '<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:12px 14px;border-bottom:1px solid #e5e7eb"><b style="font-size:14px;margin-right:auto">' + esc(title) + '</b>'
      + '<button type="button" class="btn primary" data-mg="copy">Sao chép ảnh (dán Zalo)</button><button type="button" class="btn" data-mg="png">Tải PNG</button><button type="button" class="btn" data-mg="pdf">Tải PDF</button><button type="button" class="btn ghost" data-mg="close">Đóng</button><span class="ux-hint" data-mg-msg style="width:100%"></span></div>'
      + '<div style="overflow:auto;background:#eef0f3;padding:16px" data-mg-body></div></div>';
    document.body.appendChild(w); w.querySelector("[data-mg-body]").appendChild(el);
    var msg = function(t){ w.querySelector("[data-mg-msg]").textContent = t; };
    w.addEventListener("click", function(e){ var b = e.target.closest("[data-mg]"); if (e.target === w || (b && b.dataset.mg === "close")){ w.remove(); return; } if (!b) return;
      var k = b.dataset.mg; b.disabled = true; msg("Đang tạo " + (k === "pdf" ? "PDF" : "ảnh") + "…");
      var p = k === "pdf" ? pdfBlob(el).then(function(bl){ save(bl, name + ".pdf"); msg("Đã tải " + name + ".pdf"); })
        : k === "png" ? pngBlob(el).then(function(bl){ save(bl, name + ".png"); msg("Đã tải " + name + ".png"); })
        : pngBlob(el).then(function(bl){ return navigator.clipboard.write([new ClipboardItem({"image/png":bl})]).then(function(){ msg("Đã chép ảnh: mở Zalo, Ctrl+V để gửi"); }); });
      p.catch(function(err){ msg("Không tạo được: " + (err && err.message || err)); }).then(function(){ b.disabled = false; }); });
    w.addEventListener("keydown", function(e){ if (e.key === "Escape") w.remove(); });
    return w;
  }
  window.MauGui = {sx:sx, nvl:nvl, preview:preview, pngBlob:pngBlob, pdfBlob:pdfBlob};
})();
