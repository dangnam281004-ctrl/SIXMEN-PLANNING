/* Đồng bộ dữ liệu Planning với thư mục du-lieu\ trên máy (qua server.ps1). Thư mục là BẢN CHÍNH.
   - Mở trang: lấy bản trong thư mục về trình duyệt (trừ khi trình duyệt còn thay đổi chưa gửi được).
   - Mỗi lần trang lưu: chỉ gửi khi dữ liệu THỰC SỰ đổi, kèm số phiên bản đang dựa trên.
   - Nơi khác (tab / máy khác) vừa lưu bản mới hơn → KHÔNG ghi đè, KHÔNG tự tải lại, KHÔNG bỏ thay đổi:
     giữ "bản nháp xung đột" (trong trình duyệt + thư mục lịch sử), hiện dải cảnh báo cho anh chọn
     "Lấy bản mới nhất" hoặc "Ghi đè bằng bản của tôi".
   - Mất kết nối với server: giữ thay đổi trong trình duyệt, báo "chưa lưu", tự gửi lại khi có kết nối. */
(function(){
  var KEYS = ["checkhero-v3", "kehoach-sx-v3", "nvl-v3", "xuong-v3", "danhmuc-v1"];
  var NAME = {"checkhero-v3":"Phân tích nhu cầu", "kehoach-sx-v3":"Kế hoạch sản xuất", "nvl-v3":"Tồn kho NVL", "xuong-v3":"Thông tin xưởng", "danhmuc-v1":"Danh mục mã"};
  var LOGIN = "dang-nhap.html?next=" + encodeURIComponent(location.pathname.split("/").pop() + location.search);
  var noAuth = false, denied = {}, rejected = {};
  var REV = function(k){ return "_rev_" + k; }, DIRTY = function(k){ return "_dirty_" + k; }, CONF = function(k){ return "_conflict_" + k; };
  var rawSet = Storage.prototype.setItem, rawRemove = Storage.prototype.removeItem;
  var timers = {}, offline = {}, page = location.pathname.split("/").pop() || "check-hero.html";
  var ls = function(k){ try { return localStorage.getItem(k); } catch(e){ return null; } };

  function adopt(key, srv){   // nhận bản từ thư mục vào trình duyệt
    rawSet.call(localStorage, key, JSON.stringify(srv.value));
    rawSet.call(localStorage, REV(key), String(srv.rev));
    rawRemove.call(localStorage, DIRTY(key));
    rawRemove.call(localStorage, CONF(key));
  }
  /* Cất bản nháp xung đột: trong trình duyệt (luôn) và ra thư mục lịch sử (mỗi lần xung đột mới + trước khi bỏ) */
  function sendDraft(key, value){
    return fetch("/api/draft/" + key, {method:"PUT", body:value, headers:{"X-Base-Rev":ls(REV(key))||"0", "X-Page":page}}).catch(function(){});
  }
  function keepDraft(key, value, srv){
    var isNew = !ls(CONF(key));   // xung đột mới → luôn cất ra thư mục
    rawSet.call(localStorage, CONF(key), JSON.stringify({mine:value, base:ls(REV(key))||"0", serverRev:srv.rev, serverAt:srv.savedAt, at:Date.now()}));
    if (isNew) sendDraft(key, value);
  }
  /* Chia dữ liệu theo phần giống server: các mục theo mã (models / catalog / gapNames / heroes) tách từng mã */
  var SPLIT = {"kehoach-sx-v3":["models","catalog","gapNames"], "checkhero-v3":["heroes"]};
  function parts(key, v){ var o = {}, sp = SPLIT[key] || []; Object.keys(v || {}).forEach(function(k){ if (sp.indexOf(k) >= 0 && v[k] && typeof v[k] === "object") Object.keys(v[k]).forEach(function(m){ o[k + "\u0001" + m] = v[k][m]; }); else o[k] = v[k]; }); return o; }
  /* Lấy bản gộp của server, chép đè các phần mình vừa sửa thêm (local khác với bản đã gửi) */
  function keepMine(key, merged, sent, local){
    var ps = parts(key, sent), pl = parts(key, local);
    Object.keys(pl).concat(Object.keys(ps)).forEach(function(n){
      if (JSON.stringify(pl[n]) === JSON.stringify(ps[n])) return;
      var i = n.indexOf("\u0001");
      if (i > 0){ var top = n.slice(0, i), sub = n.slice(i + 1); merged[top] = merged[top] || {}; if (n in pl) merged[top][sub] = pl[n]; else delete merged[top][sub]; }
      else { if (n in pl) merged[n] = pl[n]; else delete merged[n]; }
    });
    return merged;
  }
  /* Mỗi phần dữ liệu chỉ 1 lần gửi đang chạy: lần gửi sau chờ lần trước xong (có số phiên bản mới) mới gửi.
     Trước đây 2 lần lưu sát nhau gửi cùng số phiên bản cũ → server coi lần sau là xung đột với chính lần trước của mình */
  var inflight = {}, again = {};
  function push(key, force){
    clearTimeout(timers[key]);
    timers[key] = setTimeout(function(){
      if (inflight[key]){ again[key] = again[key] || force || true; return; }
      var value = ls(key); if (value === null) return;
      inflight[key] = true;
      var done = function(){ inflight[key] = false; if (again[key]){ var f = again[key]; again[key] = false; if (ls(DIRTY(key)) && !ls(CONF(key))) push(key, f === true ? undefined : f); } };
      var base = force ? String(force) : (ls(REV(key)) || "0");
      var why = ls("_reason_" + key), hd = {"X-Base-Rev":base, "X-Page":page}; if (why) hd["X-Reason"] = encodeURIComponent(why);   // VD Admin khôi phục bản lưu cũ
      var ka = new Blob([value]).size < 60000;   // trình duyệt từ chối keepalive khi thân > 64KB (VD nhiều ảnh màu) → bản lớn gửi thường
      fetch("/api/data/" + key, {method:"PUT", body:value, keepalive:ka, headers:hd})
        .then(function(r){ return r.json().then(function(j){ return {status:r.status, j:j}; }); })
        .then(function(x){
          offline[key] = false;
          if (x.status === 200){ delete rejected[key]; rawRemove.call(localStorage, "_reason_" + key); }
          if (x.status === 200 && x.j.merged && x.j.value !== undefined){
            /* Người khác vừa lưu phần khác (mã khác) → server đã gộp: nhận bản gộp, giữ cả phần mình gõ thêm trong lúc chờ */
            var local = ls(key), merged = x.j.value, more = local !== value;
            if (more) merged = keepMine(key, merged, JSON.parse(value), JSON.parse(local));
            var nv = JSON.stringify(merged);
            rawSet.call(localStorage, key, nv); rawSet.call(localStorage, REV(key), String(x.j.rev)); rawRemove.call(localStorage, CONF(key));
            if (more) push(key); else rawRemove.call(localStorage, DIRTY(key));
            try { window.dispatchEvent(new StorageEvent("storage", {key:key, newValue:nv, oldValue:local})); } catch(e){}
            if (!x.j.guard) toast(NAME[key] + ": vừa có thay đổi mới của người khác, đã gộp cùng thay đổi của anh (không mất phần nào). Trang đã cập nhật số mới.");   // guard: server chỉ giữ đúng phần do server ghi (VD xác nhận QLVH)
            try { window.dispatchEvent(new CustomEvent("db-merged", {detail:{key:key}})); } catch(e){}
          } else if (x.status === 200){
            rawSet.call(localStorage, REV(key), String(x.j.rev));
            if (ls(key) === value){ rawRemove.call(localStorage, DIRTY(key)); rawRemove.call(localStorage, CONF(key)); }
          } else if (x.status === 409 && x.j && x.j.value !== undefined){
            keepDraft(key, value, x.j);    // KHÔNG adopt, KHÔNG reload: giữ nguyên thay đổi của người dùng
          } else if (x.status === 401){
            noAuth = true;                 // hết phiên: giữ thay đổi trong trình duyệt, đăng nhập lại rồi tự gửi
          } else if (x.status === 403){
            denied[key] = true;            // không có quyền sửa phần này: giữ bản nháp, chờ lấy lại bản trong thư mục
          } else if (x.status === 422){
            rejected[key] = x.j.error;     // server từ chối theo quy tắc nghiệp vụ (VD giữ NVL vượt khả dụng): giữ bản nháp, báo lý do
            try { window.dispatchEvent(new CustomEvent("db-reject", {detail:{key:key, error:x.j.error}})); } catch(e){}
          } else if (x.status >= 500){
            offline[key] = true;           // server lỗi: báo chưa lưu, tự gửi lại sau (trước đây im lặng)
          }
          banner(); done();
        }).catch(function(){ offline[key] = true; banner(); done(); });
    }, force ? 0 : 400);
  }

  /* Thông báo ngắn ở góc dưới (tự tắt) */
  function toast(msg){
    if (!document.body) return;
    var el = document.createElement("div"); el.className = "db-toast"; el.textContent = msg;
    el.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:9998;max-width:420px;background:#1f2328;color:#fff;border-radius:8px;padding:10px 14px;font:13px/1.45 Inter,Segoe UI,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.2)";
    document.body.appendChild(el); setTimeout(function(){ el.remove(); }, 7000);
  }
  /* Mọi lần trang lưu dữ liệu Planning → chỉ gửi khi nội dung khác bản đang có */
  Storage.prototype.setItem = function(k, v){
    if (this === localStorage && KEYS.indexOf(k) >= 0){
      if (ls(k) === v) return;                       // không đổi gì → không lưu, không tăng phiên bản
      rawSet.call(this, k, v);
      rawSet.call(this, DIRTY(k), "1");
      if (!ls(CONF(k))) push(k);                     // đang có xung đột chưa xử lý thì chờ anh chọn
      else { var c = JSON.parse(ls(CONF(k))); c.mine = v; rawSet.call(this, CONF(k), JSON.stringify(c)); banner(); }
      return;
    }
    rawSet.call(this, k, v);
  };

  /* Dải cảnh báo xung đột / chưa lưu (gắn vào trang khi trang đã dựng xong) */
  function banner(){
    if (!document.body) return;
    var el = document.getElementById("dbBanner");
    var conf = KEYS.filter(function(k){ return ls(CONF(k)); });
    var off = KEYS.filter(function(k){ return offline[k] && ls(DIRTY(k)); });
    var den = KEYS.filter(function(k){ return denied[k] && ls(DIRTY(k)); }), rej = KEYS.filter(function(k){ return rejected[k] && ls(DIRTY(k)); });
    if (!conf.length && !off.length && !noAuth && !den.length && !rej.length){ if (el) el.remove(); return; }
    if (!el){ el = document.createElement("div"); el.id = "dbBanner"; document.body.appendChild(el); }
    el.style.cssText = "position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:9999;max-width:min(920px,calc(100% - 32px));background:#fff3df;color:#5b3a00;border:1px solid #e0b25c;border-radius:10px;box-shadow:0 8px 30px rgba(0,0,0,.18);padding:12px 16px;font:13px/1.5 Inter,'Segoe UI',sans-serif;display:grid;gap:8px";
    var h = "";
    conf.forEach(function(k){
      var c = JSON.parse(ls(CONF(k))), t = c.serverAt ? new Date(c.serverAt).toLocaleTimeString("vi-VN",{hour:"2-digit",minute:"2-digit"}) : "";
      h += '<div><b>⚠ ' + NAME[k] + ': thay đổi của anh CHƯA được lưu</b> vì dữ liệu vừa được lưu ở tab hoặc máy khác' + (t ? ' (lúc ' + t + ')' : '') + '. Thay đổi của anh vẫn đang giữ ở trang này và đã cất một bản trong <i>Sao lưu &amp; khôi phục</i>.</div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap"><button data-db="take" data-k="' + k + '" style="border:1px solid #c9a24f;background:#fff;border-radius:7px;padding:5px 12px;font:inherit;font-weight:600;cursor:pointer">Lấy bản mới nhất (bỏ thay đổi ở trang này)</button>' +
        '<button data-db="mine" data-k="' + k + '" style="border:1px solid #1f5fae;background:#1f5fae;color:#fff;border-radius:7px;padding:5px 12px;font:inherit;font-weight:600;cursor:pointer">Ghi đè bằng bản của tôi</button></div>';
    });
    if (noAuth) h += '<div><b>⚠ Phiên đăng nhập đã hết.</b> Thay đổi của anh vẫn giữ trong trình duyệt. <a href="' + LOGIN + '">Đăng nhập lại</a> rồi quay lại trang này, dữ liệu sẽ tự gửi.</div>';
    den.forEach(function(k){ h += '<div><b>⚠ ' + NAME[k] + ': tài khoản này không có quyền sửa.</b> Thay đổi chưa được lưu. <button data-db="deny" data-k="' + k + '" style="border:1px solid #c9a24f;background:#fff;border-radius:7px;padding:3px 10px;font:inherit;font-weight:600;cursor:pointer">Lấy lại bản trong thư mục</button></div>'; });
    rej.forEach(function(k){ h += '<div><b>⚠ ' + NAME[k] + ': thay đổi chưa được lưu.</b> ' + String(rejected[k]).replace(/</g, "&lt;") + ' <button data-db="deny" data-k="' + k + '" style="border:1px solid #c9a24f;background:#fff;border-radius:7px;padding:3px 10px;font:inherit;font-weight:600;cursor:pointer">Lấy lại bản trong thư mục</button></div>'; });
    if (off.length) h += '<div><b>⚠ Chưa lưu được ra thư mục</b> (' + off.map(function(k){ return NAME[k]; }).join(", ") + ') vì mất kết nối với chương trình lưu (server). Dữ liệu vẫn giữ trong trình duyệt và sẽ tự gửi lại khi kết nối lại. Nếu kéo dài, mở lại bằng <b>Mo-Planning.bat</b>.</div>';
    el.innerHTML = h;
  }
  document.addEventListener("click", function(e){
    var b = e.target.closest && e.target.closest("[data-db]"); if (!b) return;
    var k = b.getAttribute("data-k");
    if (b.getAttribute("data-db") === "deny"){
      fetch("/api/data/" + k, {cache:"no-store"}).then(function(r){ return r.json(); }).then(function(srv){ delete denied[k]; delete rejected[k]; adopt(k, srv); location.reload(); });
      return;
    }
    var c = JSON.parse(ls(CONF(k)) || "null"); if (!c) return;
    if (b.getAttribute("data-db") === "take"){
      if (!confirm("Lấy bản mới nhất trong thư mục cho " + NAME[k] + "?\nThay đổi ở trang này sẽ không dùng nữa (vẫn còn trong Sao lưu & khôi phục).")) return;
      Promise.resolve(sendDraft(k, c.mine))   // cất bản cuối cùng của trang này trước khi bỏ
        .then(function(){ return fetch("/api/data/" + k, {cache:"no-store"}); }).then(function(r){ return r.json(); }).then(function(srv){ adopt(k, srv); location.reload(); });
    } else {
      if (!confirm("Ghi đè " + NAME[k] + " bằng bản ở trang này?\nThay đổi vừa được lưu ở nơi khác sẽ bị thay (vẫn còn trong Sao lưu & khôi phục).")) return;
      fetch("/api/data/" + k, {cache:"no-store"}).then(function(r){ return r.json(); }).then(function(srv){
        rawSet.call(localStorage, k, c.mine); rawRemove.call(localStorage, CONF(k)); push(k, srv.rev);
      });
    }
  });
  /* Gửi lại thay đổi chưa lưu khi có kết nối */
  setInterval(function(){ KEYS.forEach(function(k){ if (ls(DIRTY(k)) && !ls(CONF(k)) && offline[k] !== undefined) push(k); }); }, 20000);
  window.addEventListener("online", function(){ KEYS.forEach(function(k){ if (ls(DIRTY(k)) && !ls(CONF(k))) push(k); }); });
  window.addEventListener("storage", function(e){ if (e.key && (e.key.indexOf("_conflict_") === 0 || KEYS.indexOf(e.key) >= 0)) banner(); });
  document.addEventListener("DOMContentLoaded", banner);

  /* Trước thao tác cần số mới nhất (VD giữ NVL): lấy bản trong thư mục nếu trang không còn thay đổi chưa gửi */
  window.DongBo = {toast:function(m){ toast(m); },
  /* Server vừa ghi (giữ / xuất NVL…) và trả bản mới: nhận vào trình duyệt nếu trang không còn thay đổi chưa gửi;
     còn thay đổi chưa gửi thì gửi tiếp, server tự gộp (sổ phân bổ / phiếu xuất luôn lấy bản server) */
  take:function(key, value, rev){
    if (ls(DIRTY(key)) || ls(CONF(key))){ if (!ls(CONF(key))) push(key); return false; }
    var old = ls(key), nv = JSON.stringify(value); adopt(key, {value:value, rev:rev});
    try { window.dispatchEvent(new StorageEvent("storage", {key:key, newValue:nv, oldValue:old})); } catch(e){}
    return true;
  },
  fresh:function(key){
    try {
      if (ls(DIRTY(key)) || ls(CONF(key))) return false;
      var x = new XMLHttpRequest(); x.open("GET", "/api/data/" + key, false); x.send();
      if (x.status !== 200) return false;
      var srv = JSON.parse(x.responseText); if (String(srv.rev) === (ls(REV(key)) || "0")) return false;
      adopt(key, srv); return true;
    } catch(e){ return false; }
  }};
  /* Mở trang: hỏi server "tôi là ai" trước (chưa đăng nhập → sang trang đăng nhập), rồi đọc đồng bộ dữ liệu */
  try {
    var mx = new XMLHttpRequest(); mx.open("GET", "/api/me", false); mx.send();
    if (mx.status === 401){ location.replace(LOGIN); window.TOI = {me:null, users:[]}; return; }
    if (mx.status === 200) window.TOI = JSON.parse(mx.responseText);
    /* Dữ liệu trên server đã được làm sạch (mã khởi tạo khác) → bỏ bản cũ trình duyệt đang giữ, KHÔNG gửi ngược lên */
    var ep = window.TOI && window.TOI.epoch;
    if (ep && ls("_epoch") !== ep){
      KEYS.forEach(function(k){ rawRemove.call(localStorage, k); rawRemove.call(localStorage, REV(k)); rawRemove.call(localStorage, DIRTY(k)); rawRemove.call(localStorage, CONF(k)); });
      rawSet.call(localStorage, "_epoch", ep);
    }
  } catch(e){ window.TOI = {me:null, users:[]}; }
  KEYS.forEach(function(key){
    try {
      var x = new XMLHttpRequest();
      x.open("GET", "/api/data/" + key, false);
      x.send();
      var local = ls(key), dirty = ls(DIRTY(key));
      if (x.status === 200){
        var srv = JSON.parse(x.responseText);
        if (dirty && local !== null){
          if (String(srv.rev) === (ls(REV(key)) || "0")){ if (!ls(CONF(key))) push(key); }   // thư mục chưa đổi → gửi tiếp
          else keepDraft(key, local, srv);   // thư mục đã có bản mới hơn → giữ bản của anh, báo xung đột (không thay im lặng)
        } else adopt(key, srv);
      } else if (x.status === 404 && local !== null){
        push(key);
      }
    } catch(e){
      KEYS.forEach(function(k){ if (ls(DIRTY(k))) offline[k] = true; });   // không nối được server: chạy bằng dữ liệu trình duyệt, báo chưa lưu
    }
  });
})();
