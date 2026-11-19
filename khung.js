/* Khung chung SIXMEN Planning (nạp ngay sau dong-bo.js ở mọi trang):
   - Danh mục mã: đọc từ dữ liệu "danhmuc-v1" (Admin quản lý ở trang Danh mục mã), không viết cứng trong từng trang.
   - Người đang đăng nhập + danh sách tài khoản: do server trả về (dong-bo.js → window.TOI), giao diện không tự đặt tên / quyền.
   - Bộ lọc dùng chung: Mã của tôi / Tất cả / Theo người / Chưa phân công + ô tìm; nhớ riêng theo từng tài khoản.
   - Thanh bên mới (Sản xuất / Quản lý), hộp tài khoản, thanh lọc dưới thanh tiêu đề. */
(function(){
  var CAT_KEY = "danhmuc-v1";
  var DEFAULT = [
    {key:"mado", code:"SXPL001", name:"Polo Mã Đáo", group:"hero", theu:true},
    {key:"basor", code:"", name:"Polo Basor", group:"hero", theu:true},
    {key:"victory", code:"", name:"Polo Victory", group:"hero", theu:true},
    {key:"marin", code:"", name:"Polo Marin", group:"hero"},
    {key:"galio", code:"SXPL012", name:"Polo Galio", group:"hero"},
    {key:"tron", code:"", name:"Polo Trơn", group:"hero", phoi:true}
  ];
  var ls = function(k){ try { return localStorage.getItem(k); } catch(e){ return null; } };
  var toi = window.TOI || {me:null, users:[]};
  var me = toi.me, users = toi.users || [];

  function catalog(){ var c = null; try { c = JSON.parse(ls(CAT_KEY)); } catch(e){} return c && Array.isArray(c.models) ? c : {models:DEFAULT.map(function(m){ return Object.assign({owner:null, status:"active"}, m); }), log:[]}; }
  /* Mã đang dùng (bỏ mã đã ngừng). Trả về bản sao để trang không sửa nhầm danh mục */
  function models(all){ return catalog().models.filter(function(m){ return all || m.status !== "stopped"; }).map(function(m){ return Object.assign({}, m, {code:m.code || "", theu:!!m.theu, phoi:!!m.phoi}); }); }
  var userName = function(id){ var u = users.filter(function(x){ return x.id === id; })[0]; return u ? u.name || u.username : (id ? "(tài khoản đã xoá)" : "Chưa phân công"); };
  var isAdmin = function(){ return !!me && me.role === "admin"; };
  var isKho = function(){ return !!me && (me.role === "kho" || me.role === "admin"); };   // nhận hàng mua, xác nhận dư ở xưởng
  var ownerOf = function(key){ var m = catalog().models.filter(function(x){ return x.key === key; })[0]; return m ? m.owner : null; };
  /* Quyền sửa 1 mã: Admin mọi mã; nhân viên chỉ mã mình phụ trách (server cũng kiểm tra lại) */
  var canEdit = function(key){ return isAdmin() || (!!me && ownerOf(key) === me.id); };
  /* Tech Pack: Admin + nhân viên được Admin bật "Quyền Tech Pack" (không theo người phụ trách mã). Kho chỉ xem bản Kho, có từ GĐ2 */
  var canTechPack = function(){ return isAdmin() || (!!me && me.role === "staff" && !!me.techpack); };
  /* Loại sản phẩm (09/11/2026): mặc định áo polo (5 size M–3XL, 11 màu). Mã quần (kind "quan") khai size và màu riêng trong danh mục */
  var POLO_SZ = ["M","L","XL","2XL","3XL"], POLO_CL = ["TRG","XDE","DEN","GLA","DNI","NAU","VOD","DOD","CAC","REU","BEE"];
  var EXTRA_CL = ["XDM","XNH","XDA"], COLOR_EXTRA = {XDM:"Xanh Đậm", XNH:"Xanh Nhạt", XDA:"Xám Đá"};
  var _mr = null, _mm = [];
  var modelOf = function(key){ var raw = ls(CAT_KEY); if (raw !== _mr || !_mm.length){ _mr = raw; _mm = catalog().models; } return _mm.filter(function(m){ return m.key === key; })[0] || null; };
  var isQuan = function(key){ var m = modelOf(key); return !!m && m.kind === "quan"; };
  /* Sơ mi (kind "somi", 09/11/2026): 4 size M–2XL = 4 ô đầu của áo (ô 3XL bỏ trống), lên đơn như polo; chưa có xưởng → chưa lên đơn */
  var isSomi = function(key){ var m = modelOf(key); return !!m && m.kind === "somi"; };
  var ownColors = function(key){ var m = modelOf(key); return !!m && Array.isArray(m.colors) && m.colors.length > 0; };
  var sizesOf = function(key){ var m = modelOf(key); return m && Array.isArray(m.sizes) && m.sizes.length >= 1 && m.sizes.length <= 5 ? m.sizes.slice() : POLO_SZ.slice(); };
  var colorsOfModel = function(key){ var m = modelOf(key); return m && Array.isArray(m.colors) && m.colors.length ? m.colors.slice() : POLO_CL.slice(); };
  var unitOf = function(key){ return isQuan(key) ? "quần" : "áo"; };
  /* Ngành hàng / nhóm (09/11/2026, anh duyệt): Polo / Quần / Sơ mi / Áo thun × Bán chạy / Bán bình thường. Lấy từ danh mục (kind, nhom), không theo vị trí hay tên */
  var NGANH = [["polo","Polo"],["quan","Quần"],["somi","Sơ mi"],["thun","Áo thun"]], NHOM = [["chay","Bán chạy"],["thuong","Bán bình thường"]];
  var mOf = function(m){ return typeof m === "string" ? modelOf(m) : m; };
  var nganhOf = function(m){ m = mOf(m); var k = m && m.kind; return k === "quan" || k === "somi" || k === "thun" ? k : "polo"; };
  var nhomOf = function(m){ m = mOf(m); if (!m) return "thuong"; if (m.nhom === "chay" || m.nhom === "thuong") return m.nhom; return m.group === "hero" ? "chay" : "thuong"; };
  /* Đã khai đủ size + màu chưa (polo luôn đủ). Chưa đủ → chưa nhập bảng SIXMEN, chưa lên đơn */
  var ready = function(m){ m = mOf(m); if (!m) return false; if (nganhOf(m) === "polo") return true; return Array.isArray(m.sizes) && m.sizes.length >= 1 && m.sizes.length <= 5 && Array.isArray(m.colors) && m.colors.length > 0; };
  /* Cách lên đơn: polo (Hòa / Miên / Hoàng, thêu, phôi) · quan (FOB Anh Hùng, nhập thẳng số) · none (chưa khai đủ, hoặc sơ mi / áo thun chưa có xưởng) */
  var orderMode = function(m){ m = mOf(m); if (!ready(m)) return "none"; var n = nganhOf(m); return n === "polo" ? "polo" : n === "quan" ? "quan" : "none"; };
  var aliasOf = function(m){ m = mOf(m); return m && Array.isArray(m.alias) ? m.alias.join(" ") : ""; };
  /* Tên màu khai thêm trong danh mục (màu mới của quần / sơ mi / áo thun) */
  var colorNames = function(){ var o = {}; Object.keys(COLOR_EXTRA).forEach(function(k){ o[k] = COLOR_EXTRA[k]; }); catalog().models.forEach(function(m){ var cn = m.colorNames || {}; Object.keys(cn).forEach(function(k){ if (!o[k]) o[k] = cn[k]; }); }); return o; };
  /* 13/11/2026: tên màu riêng theo mã hàng (VD Quần Jeans XDA = Xanh Đậm, sơ mi XDA = Xám Đá). Không có thì null → dùng tên chung */
  var colorName = function(c, key){ var m = key ? modelOf(key) : null, cn = m && m.colorNames; return cn && cn[c] ? cn[c] : null; };
  /* Bảng tên màu của trang: đọc theo mã đang xem (keyFn), trang áo vẫn ra tên chung như cũ */
  function nameMap(base, keyFn, lower){ return new Proxy(base, {get:function(t, p){ if (typeof p === "string"){ var k = null; try { k = keyFn ? keyFn() : null; } catch(e){} var v = colorName(p, k); if (v) return lower ? String(v).toLowerCase() : v; } return t[p]; }}); }
  var COLORS_ALL = (function(){ var a = POLO_CL.concat(EXTRA_CL); try { catalog().models.forEach(function(m){ (m.colors || []).forEach(function(c){ if (a.indexOf(c) < 0) a.push(c); }); }); } catch(e){} return a; })();
  /* Danh sách "sống": mỗi lần đọc trả theo mã đang xem (trang áo không đổi gì vì vẫn ra đúng danh sách cũ) */
  function live(fn){ return new Proxy([], {get:function(t, p){ var a = fn(); var v = a[p]; return typeof v === "function" ? v.bind(a) : v; }, has:function(t, p){ return p in fn(); }}); }

  /* ===== Bộ lọc ===== */
  var FKEY = "_ui_filter_" + (me ? me.id : "x");
  var F = (function(){ try { return JSON.parse(ls(FKEY)) || {}; } catch(e){ return {}; } })();
  F.mode = F.mode || "mine"; F.q = F.q || ""; F.nganh = F.nganh || "polo";
  /* Nhân viên chỉ thấy mã mình phụ trách (Admin, Kho xem toàn bộ) */
  var staffOnly = function(){ return !!me && me.role === "staff"; };
  /* V5: các mã có đơn đang giao cho tài khoản này thực thi (đọc Kế hoạch trong trình duyệt, nhớ theo bản đang có) */
  var _er = null, _em = {};
  function execModels(){ var raw = ls("kehoach-sx-v3"); if (raw === _er) return _em; _er = raw; _em = {};
    try { var S = JSON.parse(raw) || {}; Object.keys(S.models || {}).forEach(function(k){ var p = S.models[k] || {}; (p.orders || []).concat(p.gapOrders || []).forEach(function(o){ if (o && o.exec && me && o.exec.user === me.id && o.closed && !o.cancelled) _em[k] = true; }); }); } catch(e){}
    return _em; }
  if (staffOnly()) F.mode = "mine";
  /* Mở trang kèm ?m=<mã> (link từ trang khác) → tự chuyển sang đúng ngành của mã đó */
  try { var qm = new URLSearchParams(location.search).get("m"), qmm = qm && catalog().models.filter(function(x){ return x.key === qm; })[0]; if (qmm && F.nganh !== "all" && nganhOf(qmm) !== F.nganh) F.nganh = nganhOf(qmm); } catch(e){}
  var subs = [];
  function saveF(){ try { localStorage.setItem(FKEY, JSON.stringify({mode:F.mode, person:F.person, nganh:F.nganh})); } catch(e){} }
  var norm = function(s){ return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d"); };
  function visible(key){
    var m = catalog().models.filter(function(x){ return x.key === key; })[0]; if (!m) return F.mode === "all" && !staffOnly();
    if (staffOnly() && !(me && m.owner === me.id) && !execModels()[key]) return false;   // V5: nhân viên thấy thêm mã có đơn giao cho mình thực thi
    if (F.nganh !== "all" && nganhOf(m) !== F.nganh) return false;
    if (F.mode === "mine" && !(me && m.owner === me.id) && !execModels()[key]) return false;   // "Mã của tôi" gồm cả mã có đơn mình thực thi
    if (F.mode === "person" && m.owner !== F.person) return false;
    if (F.mode === "none" && m.owner) return false;
    return true;
  }
  /* Ô tìm: khớp tên mẫu / mã SP (trang nào có mã đơn thì tự so thêm bằng Khung.match) */
  var match = function(){ var q = norm(F.q).trim(); if (!q) return true; for (var i = 0; i < arguments.length; i++) if (norm(arguments[i]).indexOf(q) >= 0) return true; return false; };
  function setFilter(p){ Object.assign(F, p); if (staffOnly()) F.mode = "mine"; saveF(); drawFilter(); subs.forEach(function(fn){ try { fn(F); } catch(e){ console.error(e); } }); }
  /* Chia danh sách mã (đã lọc) thành các phần Ngành · Nhóm, giữ thứ tự danh mục. Xem 1 ngành: chỉ ghi nhóm */
  function sections(list){
    var out = [];
    NGANH.forEach(function(n){ NHOM.forEach(function(g){
      var L = list.filter(function(m){ return nganhOf(m) === n[0] && nhomOf(m) === g[0]; });
      if (L.length) out.push({nganh:n[0], nhom:g[0], label:(F.nganh === "all" ? n[1] + " · " : "") + g[1], list:L});
    }); });
    return out;
  }

  /* ===== Vẽ khung ===== */
  var I = {
    home:'<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>',
    hero:'<path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z"/><path d="M9 12l2 2 4-4"/>',
    plan:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    order:'<path d="M1 3h15v13H1z"/><path d="M16 8h4l3 3v5h-7z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>',
    nvl:'<path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/>',
    cart:'<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.6 12.4a1 1 0 0 0 1 .8h9.7a1 1 0 0 0 1-.8L21 7H6"/>',
    tag:'<path d="M20 12l-8 8-9-9V3h8z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
    log:'<path d="M4 4h16v16H4z"/><path d="M8 9h8M8 13h8M8 17h5"/>',
    user:'<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>',
    shop:'<path d="M3 21h18"/><path d="M5 21V8l7-4 7 4v13"/><path d="M9 21v-6h6v6"/>',
    kpi:'<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    pack:'<path d="M9 4h6v3H9z"/><path d="M9 5H6a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1h-3"/><path d="M9 12h6M9 16h4"/>',
    back:'<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/><path d="M12 8v4l3 2"/>',
    rep:'<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5"/><path d="M9 13h7M9 17h5"/>'
  };
  var ic = function(k){ return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + I[k] + '</svg>'; };
  var MENU = [
    {href:"tong-quan.html", t:"Tổng quan", i:"home"},
    {lbl:"Sản xuất"},
    {href:"check-hero.html", t:"Phân tích nhu cầu", i:"hero"},
    {href:"ke-hoach.html", t:"Kế hoạch sản xuất", i:"plan", sub:[["#b2","Lập kế hoạch"],["#b5","Kế hoạch tương lai"],["#b3","Kiểm tra NVL"],["#b4","Kiểm tra & Chốt"]]},   // UX-2: 4 tab
    {href:"theo-doi.html", t:"Đơn sản xuất", i:"order", also:["don-hang.html"]},
    {href:"bao-cao.html", t:"Báo cáo cuối ngày", i:"rep", can:function(){ return !!me && me.role !== "kho"; }},   // V5
    {href:"kpi.html", t:"KPI sản xuất", i:"kpi"},
    {href:"nvl.html", t:"Tồn kho NVL", i:"nvl"},
    {href:"dat-mua.html", t:"Đặt mua & Theo dõi NVL", i:"cart"},
    {href:"Tech-Pack-Hang-Hoa.html", t:"Tech Pack hàng hóa", i:"pack", can:function(){ return canTechPack(); }},
    {lbl:"Quản lý"},
    {href:"danh-muc.html", t:"Danh mục mã & phân công", i:"tag"},
    {href:"nhat-ky.html", t:"Nhật ký", i:"log"},
    {href:"tai-khoan.html", t:"Tài khoản", i:"user", admin:true},
    {href:"thong-tin.html", t:"Thông tin xưởng & kho", i:"shop"},
    {href:"sao-luu.html", t:"Sao lưu & khôi phục", i:"back", admin:true}
  ];
  /* V5.2 (anh chốt 13/11/2026): menu theo vai trò, mỗi mục 1 nhiệm vụ. Cùng 1 nguồn dữ liệu, các trang chỉ liên kết, không nhập trùng.
     Đăng Nam (Admin · quản lý 32 mã): 7 mục. Minh Tiến (nhân viên thực thi): 6 mục + tra cứu. Kho: giữ menu cũ (lọc theo quyền). */
  I.warn = '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18h.01"/>';
  I.doc = '<path d="M6 3h9l4 4v14H6z"/><path d="M9 13l2 2 4-4"/>';
  I.gear = '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>';
  var MENU_QL = [
    {href:"tong-quan.html", t:"Tổng quan quản lý", i:"home"},
    {href:"check-hero.html", t:"Phân tích nhu cầu", i:"hero"},
    {href:"ke-hoach.html", t:"Kế hoạch sản xuất", i:"plan", sub:[["#b2","Lập kế hoạch"],["#b5","Kế hoạch tương lai"],["#b3","Kiểm tra NVL"],["#b4","Kiểm tra & Chốt"]]},
    {href:"nvl.html", t:"Quản lý NVL", i:"nvl", also:["dat-mua.html"], subLinks:[["nvl.html","Tồn kho NVL"],["dat-mua.html","Đặt mua & theo dõi NVL"]]},
    {href:"theo-doi.html", t:"Giám sát đơn hàng", i:"order", also:["don-hang.html","chung-tu.html","vuong-mac.html"], subLinks:[["theo-doi.html","Đơn sản xuất"],["chung-tu.html","Chứng từ & bàn giao"],["vuong-mac.html","Vướng mắc"]]},
    {href:"bao-cao.html", t:"Báo cáo & KPI", i:"rep", also:["kpi.html"], subLinks:[["bao-cao.html","Báo cáo cuối ngày"],["kpi.html","KPI sản xuất"]]},
    {href:"danh-muc.html", t:"Danh mục & Cài đặt", i:"gear", also:["thong-tin.html","tai-khoan.html","sao-luu.html","nhat-ky.html","Tech-Pack-Hang-Hoa.html"], subLinks:[["danh-muc.html","Danh mục mã & phân công"],["thong-tin.html","Thông tin xưởng & kho"],["tai-khoan.html","Tài khoản"],["sao-luu.html","Sao lưu & khôi phục"],["nhat-ky.html","Nhật ký"],["Tech-Pack-Hang-Hoa.html","Tech Pack hàng hóa"]]}
  ];
  var MENU_TT = [
    {href:"tong-quan.html", t:"Công việc của tôi", i:"home"},
    {href:"theo-doi.html", t:"Đơn sản xuất", i:"order", also:["don-hang.html"]},
    {href:"dat-mua.html", t:"Đơn mua NVL", i:"cart"},
    {href:"chung-tu.html", t:"Chứng từ & Bàn giao", i:"doc"},
    {href:"vuong-mac.html", t:"Vướng mắc", i:"warn"},
    {href:"bao-cao.html", t:"Báo cáo cuối ngày", i:"rep"},
    {lbl:"Tra cứu"},
    {href:"nvl.html", t:"Tồn kho NVL", i:"nvl"},
    {href:"check-hero.html", t:"Phân tích nhu cầu", i:"hero"},
    {href:"Tech-Pack-Hang-Hoa.html", t:"Tech Pack hàng hóa", i:"pack", can:function(){ return canTechPack(); }}
  ];
  var page = location.pathname.split("/").pop() || "tong-quan.html";
  /* V5.4 Đợt 2 (sơ đồ 1·01 anh chốt 17/11/2026): Quản lý kế hoạch / Admin 8 mục · Nhân viên thực thi 5 mục · Kho giữ menu V5.3 (Q14).
     Ẩn menu chỉ để gọn; mọi quyền vẫn do server kiểm như V5.3. Kế hoạch tương lai = ke-hoach.html?v=khtl (link #b5 cũ tự chuyển) */
  var qv = (function(){ try { return new URLSearchParams(location.search).get("v") || ""; } catch(e){ return ""; } })();
  var isKhtl = function(){ return page === "ke-hoach.html" && (qv === "khtl" || location.hash === "#b5"); };
  var MENU_QL54 = [
    {href:"tong-quan.html", t:"Tổng quan", i:"home"},
    {href:"check-hero.html", t:"Phân tích nhu cầu", i:"hero"},
    {href:"ke-hoach.html", t:"Kế hoạch", i:"plan", on:function(){ return page === "ke-hoach.html" && !isKhtl(); }},
    {href:"ke-hoach.html?v=khtl", t:"Kế hoạch tương lai", i:"back", on:isKhtl},
    {href:"theo-doi.html", t:"Quản lý đơn", i:"order", also:["don-hang.html","chung-tu.html","vuong-mac.html"]},
    {href:"nvl.html", t:"Quản lý NVL", i:"nvl", also:["dat-mua.html"]},
    {href:"bao-cao.html", t:"Báo cáo", i:"rep", also:["kpi.html"], subLinks:[["bao-cao.html","Báo cáo cuối ngày"],["kpi.html","Phân tích SKU / Xưởng / Nhân viên"]]},
    {href:"danh-muc.html", t:"Cài đặt", i:"gear", also:["thong-tin.html","tai-khoan.html","sao-luu.html","nhat-ky.html","Tech-Pack-Hang-Hoa.html"], subLinks:[["danh-muc.html","Danh mục mã & phân công"],["thong-tin.html","Xưởng & kho"],["tai-khoan.html","Tài khoản"],["sao-luu.html","Sao lưu & khôi phục"],["nhat-ky.html","Nhật ký"],["Tech-Pack-Hang-Hoa.html","Tech Pack hàng hóa"],["danh-muc.html#nguong","Ngưỡng cảnh báo"]]}
  ];
  var MENU_TT54 = [
    {href:"tong-quan.html", t:"Công việc của tôi", i:"home"},
    {href:"theo-doi.html", t:"Đơn của tôi", i:"order", also:["don-hang.html","chung-tu.html","vuong-mac.html"]},
    {href:"nvl.html", t:"NVL", i:"nvl", also:["dat-mua.html"]},
    {href:"bao-cao.html", t:"Báo cáo cuối ngày", i:"rep"},
    {href:"check-hero.html", t:"Tra cứu", i:"log", also:["Tech-Pack-Hang-Hoa.html","kpi.html"], subLinks:[["check-hero.html","Phân tích nhu cầu"],["Tech-Pack-Hang-Hoa.html","Tech Pack hàng hóa"],["kpi.html","Phân tích của tôi"]]}
  ];
  /* Người phụ trách mã không phải Admin dùng cùng menu quản lý (quyền theo mã mình phụ trách, server kiểm) */
  var ownsAny = function(){ return !!me && catalog().models.some(function(m){ return m.owner === me.id && m.status !== "stopped"; }); };
  var roleMenu = function(){ return isAdmin() || (me && me.role === "staff" && ownsAny()) ? MENU_QL54 : (me && me.role === "staff") ? MENU_TT54 : MENU; };
  var FILTER_PAGES = ["tong-quan.html", "check-hero.html", "ke-hoach.html", "theo-doi.html", "don-hang.html", "nvl.html", "danh-muc.html", "nhat-ky.html"];
  var badges = {};
  function drawNav(){
    var nav = document.querySelector(".side .nav"); if (!nav) return;
    nav.innerHTML = roleMenu().filter(function(x){ return (!x.admin || isAdmin()) && (!x.can || x.can()); }).map(function(x){
      if (x.lbl) return '<div class="nav-label">' + x.lbl + '</div>';
      var on = x.on ? x.on() : page === x.href || (x.also || []).indexOf(page) >= 0;
      var bn = badges[x.href] || 0; (x.also || []).forEach(function(h){ bn += badges[h] || 0; });
      var b = bn ? '<span class="kb-badge">' + bn + '</span>' : "";
      var sub = on && x.sub ? '<div class="sub">' + x.sub.map(function(s){ return '<a href="' + x.href + s[0] + '"' + (location.hash === s[0] ? ' class="on"' : "") + '>' + s[1] + '</a>'; }).join("") + '</div>'
        : on && x.subLinks ? '<div class="sub">' + x.subLinks.filter(function(s){ return ((s[0] !== "tai-khoan.html" && s[0] !== "sao-luu.html" && s[0] !== "danh-muc.html#nguong") || isAdmin()) && (s[0] !== "Tech-Pack-Hang-Hoa.html" || canTechPack()); }).map(function(s){ var hs = s[0].split("#"), son = page === hs[0] && (hs[1] ? location.hash === "#" + hs[1] : !(location.hash === "#nguong" && page === "danh-muc.html")); return '<a href="' + s[0] + '"' + (son ? ' class="on"' : "") + '>' + s[1] + '</a>'; }).join("") + '</div>' : "";
      return '<a href="' + x.href + '"' + (on ? ' class="active" aria-current="page"' : "") + '>' + ic(x.i) + '<span style="flex:1">' + x.t + '</span>' + b + '</a>' + sub;
    }).join("");
    var foot = document.querySelector(".side .side-foot");
    if (foot) foot.innerHTML = me ? '<div class="kb-me"><b>' + esc(me.name || me.username) + '</b><span>' + (isAdmin() ? "Admin · quản lý tổng" : me.role === "kho" ? "Kho" : "Nhân viên") + '</span><button type="button" class="kb-out" id="kbOut">Đăng xuất</button></div>' : "";
  }
  var esc = function(s){ return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); };
  function counts(){
    var ms = catalog().models.filter(function(m){ return m.status !== "stopped" && (F.nganh === "all" || nganhOf(m) === F.nganh) && (!staffOnly() || (me && m.owner === me.id) || execModels()[m.key]); });
    return {mine:ms.filter(function(m){ return me && (m.owner === me.id || execModels()[m.key]); }).length, all:ms.length, none:ms.filter(function(m){ return !m.owner; }).length,
      by:function(id){ return ms.filter(function(m){ return m.owner === id; }).length; }};
  }
  function drawFilter(){
    if (FILTER_PAGES.indexOf(page) < 0) return;
    var bar = document.getElementById("kbFilter");
    if (!bar){ var tb = document.querySelector(".topbar"); if (!tb) return; bar = document.createElement("div"); bar.id = "kbFilter"; bar.className = "kb-filter"; tb.insertAdjacentElement("afterend", bar); }
    var c = counts(), act = users.filter(function(u){ return u.active; });
    var chip = function(mode, label, n){ return '<button type="button" class="kb-chip" data-kbmode="' + mode + '" aria-pressed="' + (F.mode === mode) + '">' + label + ' <span>' + n + '</span></button>'; };
    var all = catalog().models.filter(function(m){ return m.status !== "stopped" && (!staffOnly() || (me && m.owner === me.id) || execModels()[m.key]); });
    var ng = function(k, t){ var n = k === "all" ? all.length : all.filter(function(m){ return nganhOf(m) === k; }).length; return '<button type="button" class="kb-ng" data-kbng="' + k + '" aria-pressed="' + (F.nganh === k) + '">' + t + ' <span>' + n + '</span></button>'; };
    var tabs = '<div class="kb-ngs" role="tablist" aria-label="Ngành hàng">' + NGANH.map(function(x){ return ng(x[0], x[1]); }).join("") + ng("all", "Tất cả ngành") + '</div>';
    if (staffOnly()){ bar.innerHTML = tabs + '<div class="kb-chips"><span class="kb-chip" aria-pressed="true">Mã của tôi <span>' + c.mine + '</span></span></div><input id="kbQ" class="kb-q" type="search" placeholder="Tìm tên mẫu, mã SP, mã đơn…" value="' + esc(F.q) + '" aria-label="Tìm kiếm">'; return; }
    bar.innerHTML = tabs + '<div class="kb-chips">' + chip("mine", "Mã của tôi", c.mine) + chip("all", "Tất cả", c.all) +
      '<label class="kb-chip kb-sel" aria-pressed="' + (F.mode === "person") + '">Theo người <select id="kbPerson" aria-label="Lọc theo người phụ trách"><option value="">— chọn —</option>' +
      act.map(function(u){ return '<option value="' + u.id + '"' + (F.mode === "person" && F.person === u.id ? " selected" : "") + '>' + esc(u.name || u.username) + ' (' + c.by(u.id) + ')</option>'; }).join("") + '</select></label>' +
      chip("none", "Chưa phân công", c.none) + '</div>' +
      '<input id="kbQ" class="kb-q" type="search" placeholder="Tìm mã SP, tên mẫu, mã đơn…" value="' + esc(F.q) + '" aria-label="Tìm kiếm">';
  }
  function css(){
    var s = document.createElement("style");
    s.textContent = ".kb-filter{position:sticky;top:52px;z-index:19;display:flex;flex-wrap:wrap;gap:8px 14px;align-items:center;justify-content:space-between;padding:8px 28px;background:var(--surface);border-bottom:1px solid var(--line)}" +
      ".kb-chips{display:flex;flex-wrap:wrap;gap:6px}" +
      ".kb-ngs{display:flex;flex-wrap:wrap;gap:2px;flex-basis:100%;border-bottom:1px solid var(--line);margin:-2px 0 2px}" +
      ".kb-ng{border:0;background:transparent;color:var(--ink2);font:inherit;font-size:13px;font-weight:600;padding:5px 12px 7px;cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-1px}" +
      ".kb-ng span{color:var(--muted);font-weight:500;font-size:11.5px}.kb-ng[aria-pressed=true]{color:var(--brand);border-bottom-color:var(--brand)}" +
      ".kb-chip{border:1px solid var(--line);background:var(--surface);color:var(--ink2);border-radius:99px;padding:3px 11px;font:inherit;font-size:12px;font-weight:600;cursor:pointer;display:inline-flex;gap:6px;align-items:center}" +
      ".kb-chip span{color:var(--muted);font-weight:500}" +
      ".kb-chip[aria-pressed=true]{background:var(--ink);border-color:var(--ink);color:#fff} .kb-chip[aria-pressed=true] span{color:#cfd3d8}" +
      ".kb-sel select{border:0;background:transparent;color:inherit;font:inherit;font-weight:500;cursor:pointer;max-width:170px} .kb-chip[aria-pressed=true] select option{color:#1f2328}" +
      ".kb-q{border:1px solid var(--line);border-radius:7px;padding:5px 10px;font:inherit;font-size:12.5px;min-width:240px;background:var(--surface);color:var(--ink)}" +
      ".kb-badge{background:var(--crit-bg,#fdecea);color:var(--crit,#c62828);border-radius:99px;font-size:10.5px;font-weight:700;padding:0 7px;line-height:18px}" +
      ".nav a.active .kb-badge{background:#fff}" +
      ".kb-me{display:grid;gap:1px;font-size:12px;color:var(--ink2);border-top:1px solid var(--line);padding-top:10px}.kb-me b{color:var(--ink);font-size:12.5px}.kb-me span{color:var(--muted);font-size:11px}" +
      ".kb-out{justify-self:start;margin-top:6px;border:1px solid var(--line);background:var(--surface);border-radius:6px;padding:2px 9px;font:inherit;font-size:11.5px;cursor:pointer;color:var(--ink2)}" +
      ".side .sub{display:grid;gap:1px;padding:2px 0 4px 34px}.side .sub a{padding:4px 9px;font-size:12px;color:var(--muted);border-radius:6px;text-decoration:none}.side .sub a:hover{background:var(--hover)}.side .sub a.on{color:var(--brand);font-weight:600;background:var(--brand-bg)}" +
      ".kb-ro{display:inline-block;font-size:10.5px;font-weight:600;color:var(--muted);background:var(--line);border-radius:99px;padding:0 6px;margin-left:4px}" +
      ".kb-save{font-size:11.5px;color:var(--muted);white-space:nowrap;margin-left:auto}.kb-save.w{color:var(--warn)}.kb-save.x{color:var(--crit);font-weight:600}" +
      ".tile.zero .v{color:var(--muted);font-weight:600}details.srcmore summary{cursor:pointer;color:var(--accent);font-size:11.5px}" +
      "@media (max-width:900px){.kb-filter{padding:8px 16px;top:0}.kb-q{min-width:0;flex:1}}";
    document.head.appendChild(s);
  }
  document.addEventListener("click", function(e){
    var b = e.target.closest && e.target.closest("[data-kbmode]");
    if (b){ setFilter({mode:b.getAttribute("data-kbmode")}); return; }
    var g = e.target.closest && e.target.closest("[data-kbng]");
    if (g){ setFilter({nganh:g.getAttribute("data-kbng")}); return; }
    if (e.target.id === "kbOut"){ fetch("/api/logout", {method:"POST"}).then(function(){ location.href = "dang-nhap.html"; }); }
  });
  document.addEventListener("change", function(e){ if (e.target.id === "kbPerson"){ if (e.target.value) setFilter({mode:"person", person:e.target.value}); } });
  var qt; document.addEventListener("input", function(e){ if (e.target.id === "kbQ"){ clearTimeout(qt); qt = setTimeout(function(){ F.q = e.target.value; subs.forEach(function(fn){ try { fn(F); } catch(err){ console.error(err); } }); }, 150); } });
  /* UX-3: trạng thái lưu ở topbar cho trang chưa có ô #status. Chỉ ĐỌC dấu _dirty_ / _conflict_ do dong-bo.js ghi, không gửi / không sửa dữ liệu */
  var SK = ["checkhero-v3", "kehoach-sx-v3", "nvl-v3", "xuong-v3", "danhmuc-v1"], svWas = false, svAt = 0;
  function saveState(){
    var el = document.getElementById("kbSave"); if (!el) return;
    var g = function(k){ try { return localStorage.getItem(k); } catch(e){ return null; } };
    var conf = SK.some(function(k){ return g("_conflict_" + k); }), dirty = SK.some(function(k){ return g("_dirty_" + k); });
    if (svWas && !dirty) svAt = Date.now(); svWas = dirty;
    var t = svAt ? new Date(svAt).toLocaleTimeString("vi-VN", {hour:"2-digit", minute:"2-digit"}) : "";
    el.className = "kb-save" + (conf ? " x" : dirty ? " w" : "");
    el.textContent = conf ? "⚠ Chưa lưu · xung đột (xem dải cảnh báo)" : dirty ? "Đang lưu…" : t ? "✓ Đã lưu " + t : "✓ Đã đồng bộ";
  }
  function drawSave(){
    var tb = document.querySelector(".topbar"); if (!tb || document.getElementById("status") || document.getElementById("kbSave")) return;
    var el = document.createElement("span"); el.id = "kbSave"; el.className = "kb-save"; el.setAttribute("aria-live", "polite"); tb.appendChild(el);
    saveState(); setInterval(saveState, 1000);
  }
  /* V5.4 (17/11/2026): dải nhận biết BẢN THỬ — chỉ hiện ở cổng 8099, không bao giờ hiện ở bản chính 8080 */
  function testBadge(){ if (location.port !== "8099" || document.getElementById("v54Test")) return; var b = document.createElement("div"); b.id = "v54Test";
    b.textContent = "BẢN THỬ V5.4 · cổng 8099 · không phải dữ liệu thật · chỉ mở bằng Mo-Ban-Thu-V54.bat";
    b.setAttribute("style", "position:fixed;bottom:8px;right:10px;z-index:9999;pointer-events:none;background:#7a1fa2;color:#fff;font:600 11px/1.6 Inter,system-ui,sans-serif;padding:2px 10px;border-radius:99px;box-shadow:0 2px 8px rgba(0,0,0,.2);opacity:.92");
    document.body.appendChild(b); }
  function boot(){ css(); drawNav(); drawFilter(); drawSave(); testBadge(); window.addEventListener("hashchange", drawNav); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();

  /* ===== UX V5 (anh duyệt 13/11/2026): "Báo vướng mắc" dùng chung đơn sản xuất + đơn mua NVL.
     Loại vấn đề · mức ưu tiên · người báo · thời gian · trạng thái Chưa xử lý / Đang xử lý / Đã giải quyết. Server ghi (op vuong-bao / vuong-nhan / vuong-xong) ===== */
  var VUONG_LOAI = [["nvl","Thiếu / sai NVL"],["tre","NCC / xưởng trễ"],["so-lieu","Sai số liệu"],["ho-so","Chứng từ / hồ sơ"],["erp","PO / ERP"],["khac","Khác"]];
  var VUONG_UU = [["cao","Cao","r"],["tb","Trung bình","o"],["thap","Thấp","g"]];
  var VUONG_ST = {mo:["Chưa xử lý","o"], dang:["Đang xử lý","b"], xong:["Đã giải quyết","k"]};
  var vSt = function(v){ return v && VUONG_ST[v.state] ? v.state : "mo"; };
  var vOpen = function(L){ return (L || []).filter(function(v){ return v && v.state !== "xong"; }); };
  var vName = function(A, k){ var x = A.filter(function(a){ return a[0] === k; })[0]; return x ? x[1] : ""; };
  var vTime = function(t){ if (!t) return ""; var d = new Date(t); var p = function(x){ return (x < 10 ? "0" : "") + x; }; return p(d.getHours()) + ":" + p(d.getMinutes()) + " " + p(d.getDate()) + "/" + p(d.getMonth() + 1); };
  /* Hộp thoại báo vướng mắc → cb({text, can, loai, uu}) */
  function vuongForm(title, cb){
    var old = document.getElementById("uxVForm"); if (old) old.remove();
    var w = document.createElement("div"); w.className = "ux-dlg"; w.id = "uxVForm";
    w.innerHTML = '<form role="dialog" aria-modal="true" aria-label="Báo vướng mắc"><h3>' + esc(title || "Báo vướng mắc") + '</h3>'
      + '<label>Nội dung vướng mắc (bắt buộc)<textarea name="text" placeholder="VD: NCC báo lùi ngày giao vải đen 5 ngày"></textarea></label>'
      + '<div class="row2"><label>Loại vấn đề<select name="loai">' + VUONG_LOAI.map(function(x){ return '<option value="' + x[0] + '">' + x[1] + '</option>'; }).join("") + '</select></label>'
      + '<label>Mức ưu tiên<select name="uu">' + VUONG_UU.map(function(x){ return '<option value="' + x[0] + '"' + (x[0] === "tb" ? " selected" : "") + '>' + x[1] + '</option>'; }).join("") + '</select></label></div>'
      + '<label>Cần hỗ trợ / quyết định gì? (có thể bỏ trống)<input name="can"></label><div class="err"></div>'
      + '<div class="acts"><button type="button" class="btn" data-x>Huỷ</button><button type="submit" class="btn primary">Gửi vướng mắc</button></div></form>';
    document.body.appendChild(w);
    var f = w.querySelector("form"), close = function(){ w.remove(); };
    w.querySelector("[data-x]").onclick = close; w.addEventListener("click", function(e){ if (e.target === w) close(); });
    w.addEventListener("keydown", function(e){ if (e.key === "Escape") close(); });
    f.onsubmit = function(e){ e.preventDefault(); var t = f.text.value.trim(); if (!t){ w.querySelector(".err").textContent = "Ghi nội dung vướng mắc."; f.text.focus(); return; }
      close(); cb({text:t, can:f.can.value.trim(), loai:f.loai.value, uu:f.uu.value}); };
    setTimeout(function(){ f.text.focus(); }, 0);
  }
  /* Danh sách vướng mắc: canHandle = người được nhận / giải quyết (người quản lý kế hoạch, Admin) */
  function vuongList(L, canHandle, attrs){
    attrs = attrs || "";
    var A = (L || []).slice().sort(function(a, b){ var o = {mo:0, dang:1, xong:2}; return (o[vSt(a)] - o[vSt(b)]) || (b.at - a.at); });
    return '<div class="ux-vl">' + A.map(function(v){ var s = vSt(v), st = VUONG_ST[s], uu = VUONG_UU.filter(function(x){ return x[0] === (v.uu || "tb"); })[0] || VUONG_UU[1];
      return '<div class="ux-v ' + s + '" data-vid="' + esc(v.id) + '"><div class="t"><b>' + esc(v.text) + '</b><span class="ux-b ' + st[1] + '">' + st[0] + '</span>'
        + (s !== "xong" ? '<span class="ux-b ' + uu[2] + '">Ưu tiên ' + uu[1].toLowerCase() + '</span>' : '') + '<span class="ux-b g">' + esc(vName(VUONG_LOAI, v.loai || "khac") || "Khác") + '</span></div>'
        + (v.can ? '<div class="s">Cần: ' + esc(v.can) + '</div>' : '')
        + '<div class="s">' + esc(userName(v.by)) + ' báo ' + vTime(v.at) + (v.nhanAt ? ' · ' + esc(userName(v.nhanBy)) + ' nhận xử lý ' + vTime(v.nhanAt) : '')
        + (s === "xong" ? ' · ✓ ' + esc(userName(v.doneBy)) + ' giải quyết ' + vTime(v.doneAt) + (v.reply ? ': ' + esc(v.reply) : '') : '') + '</div>'
        + (s !== "xong" && canHandle ? '<div style="display:flex;gap:6px;margin-top:4px">' + (s === "mo" ? '<button type="button" class="btn" data-vnhan="' + esc(v.id) + '"' + attrs + '>Đang xử lý</button>' : '') + '<button type="button" class="btn primary" data-vxong="' + esc(v.id) + '"' + attrs + '>Đã giải quyết</button></div>' : '')
        + '</div>'; }).join("") + '</div>';
  }
  window.Khung = {
    isQuan:isQuan, isSomi:isSomi, ownColors:ownColors, sizesOf:sizesOf, colorsOfModel:colorsOfModel, unitOf:unitOf, live:live, POLO_SZ:POLO_SZ, POLO_CL:POLO_CL, COLORS_ALL:COLORS_ALL, COLOR_EXTRA:COLOR_EXTRA,
    NGANH:NGANH, NHOM:NHOM, nganhOf:nganhOf, nhomOf:nhomOf, ready:ready, orderMode:orderMode, aliasOf:aliasOf, colorNames:colorNames, colorName:colorName, nameMap:nameMap,
    VUONG_LOAI:VUONG_LOAI, VUONG_UU:VUONG_UU, VUONG_ST:VUONG_ST, vuongOpen:vOpen, vuongForm:vuongForm, vuongList:vuongList, sections:sections, staffOnly:staffOnly,
    models:models, catalog:catalog, me:me, users:users, userName:userName, isAdmin:isAdmin, isKho:isKho, ownerOf:ownerOf, canEdit:canEdit, canTechPack:canTechPack,
    filter:function(){ return F; }, visible:visible, match:match, onFilter:function(fn){ subs.push(fn); }, setFilter:setFilter,
    badge:function(href, n){ badges[href] = n || 0; drawNav(); }, esc:esc, norm:norm,
    /* Trang nào không có mã nào hiện theo bộ lọc thì hiện thông báo này */
    emptyText:function(){ var ng = F.nganh !== "all" ? (NGANH.filter(function(x){ return x[0] === F.nganh; })[0] || ["", ""])[1] : ""; if (staffOnly()) return "Anh/chị chưa được phân công mã nào" + (ng ? " ở ngành " + ng : "") + "."; return F.mode === "mine" ? "Anh/chị chưa được phân công mã nào. Chọn “Tất cả” để xem mọi mã." : "Không có mã nào khớp bộ lọc."; }
  };
})();
