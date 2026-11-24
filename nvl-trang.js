/* Trang Tồn kho NVL (nvl.html, data-page=kho) và Đặt mua & Theo dõi NVL (dat-mua.html, data-page=mua) dùng chung 1 mã: cùng dữ liệu nvl-v3, cùng nghiệp vụ mua / nhận / cập nhật tồn.
   Mỗi trang chỉ vẽ phần của mình (anh duyệt tách 2 trang 28/10). */
/* V5.4 Đợt 2 (Q9, anh chốt 17/11/2026): Quản lý NVL = 1 trang nvl.html, 4 tab Tồn kho · Cần mua · Đang mua · Tại xưởng.
   Tab Tồn kho / Tại xưởng vẽ phần "kho", tab Cần mua / Đang mua vẽ phần "mua" như 2 trang cũ — không đổi công thức, không đổi số.
   Link cũ: nvl.html#kho / #so-ton / #ma-vach → Tồn kho · #o-xuong → Tại xưởng · #don-cho / #thieu / #dat-mua / ?khtl= → Cần mua · #ds-… / #don-mua / ?w= / ?st= → Đang mua */
const TABS54 = [["ton","Tồn kho"],["can-mua","Cần mua"],["dang-mua","Đang mua"],["tai-xuong","Tại xưởng"]];
const STAFF54 = !!(Khung.me && Khung.me.role==="staff" && !Khung.isAdmin());
/* Nhân viên thực thi: Đang mua (đơn mua được giao) · Tồn kho, Tại xưởng (xem) — sơ đồ 1·01 */
const tabsFor54 = () => STAFF54 ? TABS54.filter(t=>t[0]!=="can-mua") : TABS54;
let TAB = (()=>{ const q=new URLSearchParams(location.search), t=q.get("tab"), h=location.hash;
  if(t && tabsFor54().some(x=>x[0]===t)) return t;
  if(/^#(ds-|don-mua)/.test(h) || q.get("w") || q.get("st")) return "dang-mua";
  if(/^#(o-xuong)/.test(h)) return "tai-xuong";
  if(!STAFF54 && (/^#(don-cho|thieu|dat-mua)/.test(h) || q.get("khtl"))) return "can-mua";
  if(/^#(kho|so-ton|ma-vach)/.test(h)) return "ton";
  if(document.body.dataset.page==="mua") return STAFF54 ? "dang-mua" : "can-mua";
  return STAFF54 ? "dang-mua" : "ton"; })();
const modeOf54 = t => t==="can-mua"||t==="dang-mua" ? "mua" : "kho";
let PAGE = modeOf54(TAB);
document.body.dataset.page = PAGE; document.body.dataset.tab = TAB;
const SIZES = ["M","L","XL","2X","3X"];
const SZ_LABEL = ["M","L","XL","2XL","3XL"];
const COLORS = ["TRG","XDE","DEN","GLA","DNI","NAU","VOD","DOD","CAC","REU","BEE"];
const MODELS = Khung.models(true);   // danh mục mã (trang Danh mục mã & phân công)
const XUONG = new Proxy({hoa:"Anh Hòa", mien:"Anh Miên", hoang:"Anh Hoàng", hung:"Anh Hùng"}, {get:(t,p)=>p in t?t[p]:(p==="null"||p==="undefined"||p==="")?"Chưa chọn xưởng":undefined});   // CR03: kế hoạch tương lai chưa chọn xưởng
const GC = ["hoa","mien"];
/* Kho chia 3 nhóm cho dễ nhìn; mỗi nhóm chỉ có cột cần thiết */
const GROUPS = [
  {id:"vai", title:"Vải", hint:"Theo loại vải + màu, dùng chung cho các mẫu. Có Tồn (cây) thì trừ thẳng theo số cây của đơn; chưa có thì tính kg theo định mức kg / 1 cây.",
   add:{type:"Vải", model:"*", color:"TRG", unit:"kg", per:null, basis:"cay"}},
  {id:"bo", title:"Bo", hint:"Theo từng mẫu + màu. Luôn quản lý và đặt theo BỘ (1 bộ = 1 bo cổ + 1 đôi bo tay), không tách riêng. Định mức: số bộ cho 1 áo.",
   add:{type:"Bo cổ & bo tay", model:"mado", color:"*", unit:"bộ", per:1, basis:"ao"}},
  {id:"pl", title:"Phụ liệu khác", hint:"Nhãn sườn… Định mức: số cái cho 1 áo. Mã vạch kho tự in, không quản lý ở đây.",
   add:{type:"Nhãn sườn", model:"*", color:"*", unit:"cái", per:1, basis:"ao"}}
];
/* Chọn thay vì gõ: tên NVL ghép từ loại + màu/mẫu */
const COLOR_NAME = {TRG:"trắng", XDE:"xanh đen", DEN:"đen", GLA:"xám lam", DNI:"denim", NAU:"nâu", VOD:"vỏ đậu", DOD:"đỏ đô", CAC:"cacao", REU:"rêu", BEE:"bee", XDM:"xanh đậm", XNH:"xanh nhạt", XDA:"xám đá"}; try { var _cn = window.Khung && Khung.colorNames ? Khung.colorNames() : {}; Object.keys(_cn).forEach(function(k){ if (!COLOR_NAME[k]) COLOR_NAME[k] = String(_cn[k]).toLowerCase(); }); } catch(e){}   // màu khai thêm ở Danh mục
const colorWord = c => c==="*" ? "" : (COLOR_NAME[c]||c);
const colorLabel = c => COLOR_NAME[c] ? `${c} · ${COLOR_NAME[c]}` : c;
const UNITS = ["cái","đôi","bộ","chiếc","kg","m","cây","cuộn","gói"];
const DEFAULT_KINDS = {vai:["Cá sấu"], bo:["Bo cổ & bo tay"], pl:["Nhãn sườn"]};   // 02/11/2026: mã vạch kho tự in, không còn là NVL
const groupOf = it => it.grp ? it.grp : NV.groupOf(it);
function itemName(it){
  const md = it.model==="*" ? "polo" : (MODELS.find(m=>m.key===it.model)||{name:""}).name.replace(/^Polo\s+/,"");
  if(groupOf(it)==="vai") return `Vải ${(it.kind||"").toLowerCase()} ${colorWord(it.color)}${it.model==="*"?"":" · "+md}`.trim();
  return `${it.type} ${md}${it.color==="*"?"":" "+colorWord(it.color)}`.trim();
}
/* Đặt lại tên + đánh dấu dòng trùng (cùng loại, mẫu, màu) */
function tidy(){
  const seen=new Set();
  N.items.forEach(it=>{
    it.name=itemName(it);
    const sig=[it.type,it.kind,it.model,it.color].join("|");
    it.off=seen.has(sig); seen.add(sig);
  });
}
const $ = s => document.querySelector(s);
const n = x => NV.n(x);
const fmt = x => NV.fmt(x);
const esc = s => String(s??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const dmy = d => (d||"").split("-").reverse().join("/");
const today = () => NV.iso(Date.now());
const time = t => t?new Date(t).toLocaleString("vi-VN",{day:"2-digit",month:"2-digit",year:"2-digit",hour:"2-digit",minute:"2-digit"}):"";
const ME = () => Khung.me&&Khung.me.id;
const who = id => { const u=(Khung.users||[]).find(x=>x.id===id); return u?(u.name||u.username):id||"?"; };
const ADM = Khung.isAdmin(), KHO = Khung.isKho&&Khung.isKho();

const KEY="kehoach-sx-v3", NKEY="nvl-v3";
try { localStorage.removeItem("nvl-v1"); } catch(e) {}   // cách theo dõi cũ
let S, N;
function loadS(){ try { S=JSON.parse(localStorage.getItem(KEY)); } catch(e) {} if(!S||!S.models) S={models:{}}; S.perRoll=S.perRoll||65; S.catalog=S.catalog||{}; SoLuong.mark(S); }
function loadN(){
  try { N=JSON.parse(localStorage.getItem(NKEY)); } catch(e) {}
  if(!N||!N.items) N={items:[]};   // chưa có dữ liệu: bắt đầu trống, không dùng số mẫu
  N.kinds=N.kinds||JSON.parse(JSON.stringify(DEFAULT_KINDS));
  /* Bo cổ / bo tay: KHÔNG tự gộp nữa (BOM có thể tách 2 mã). Chỉ bổ sung lựa chọn loại */
  /* Bo luôn đặt theo bộ (anh chốt 24/10): không còn loại "Bo cổ" / "Bo tay" riêng.
     Dòng cũ khai riêng mà chưa có tồn → đổi thành "Bo cổ & bo tay", đơn vị bộ (nhật ký server ghi lại). Có tồn thì giữ nguyên, báo để Kho xử lý. */
  N.kinds.bo=[...new Set([...DEFAULT_KINDS.bo, ...N.kinds.bo.filter(k=>k!=="Bo cổ"&&k!=="Bo tay")])];
  N.items.forEach(it=>{
    if(it.type!=="Bo cổ"&&it.type!=="Bo tay") return;
    const twin=N.items.some(x=>x!==it&&x.type==="Bo cổ & bo tay"&&x.model===it.model&&x.color===it.color);
    if(!n(it.stock)&&!twin){ it.type="Bo cổ & bo tay"; it.unit="bộ"; it.grp="bo"; }
  });
  N.kinds.pl=(N.kinds.pl||[]).filter(k=>!/^tag/i.test(k));   // không dùng tag
  /* dòng gõ dở trước đây: chưa có tên, chưa có tồn → bỏ; vải cũ chưa có loại → Cá sấu */
  N.items=N.items.filter(it=>(it.name||"").trim() || n(it.stock));
  N.items.forEach(it=>{ if(it.type==="Vải" && !it.kind) it.kind="Cá sấu"; });
  tidy();
}
loadS(); loadN();
let saveTimer;
function saveN(now){
  clearTimeout(saveTimer);
  const go=()=>{ try { localStorage.setItem(NKEY, JSON.stringify(N)); $("#status").textContent="Đã lưu "+new Date().toLocaleTimeString("vi-VN",{hour:"2-digit",minute:"2-digit"}); } catch(e) {} };
  if(now) go(); else saveTimer=setTimeout(go,250);
}
/* Thao tác quan trọng (nhận hàng, duyệt, xác nhận dư): lấy bản mới nhất trước khi sửa */
function fresh(){ if(window.DongBo){ if(DongBo.fresh(NKEY)) loadN(); if(DongBo.fresh(KEY)) loadS(); } }

const byCay=NV.byCay, stockOf=NV.stockOf, unitOf=NV.unitOf;
function setStock(it,v){ if(byCay(it)) it.stockCay=v; else it.stock=v; }
const lineSizes = l => SoLuong.lineSizes(l, S.perRoll);
const lineQty = l => lineSizes(l).reduce((a,b)=>a+b,0);
const lineTotal = l => n(l.cay)*S.perRoll;
/* Đơn gia công còn cần NVL (chưa xuất NVL, chưa huỷ) — xếp theo ngày cần ở kho, rồi ngày đặt */
function waiting(){
  return NV.allGC(S).filter(x=>NV.needsNvl(x.o)&&!(x.o.closed&&x.o.sentAt&&NV.check(N,S,x.m,x.o).state==="du")).map(x=>({...x, C:NV.check(N,S,x.m,x.o)}))
    .sort((a,b)=>(a.C.dates.kho||"9999").localeCompare(b.C.dates.kho||"9999")||(a.o.date||"").localeCompare(b.o.date||""));
}
const NST_PILL={"san-sang":"p-ok","chua-giu":"p-warn","cho-nvl":"p-bad","thieu-du-lieu":"p-mute"};
const REQ_ST={"cho-duyet":"Chờ duyệt","da-duyet":"Đã duyệt","tu-choi":"Từ chối","da-dat":"Đã đặt NCC","huy":"Đã huỷ"};
const REQ_PILL={"cho-duyet":"p-warn","da-duyet":"p-info","tu-choi":"p-mute","da-dat":"p-ok","huy":"p-mute"};
const PO_ST={"dang-ve":"Đang về","nhan-mot-phan":"Nhận một phần","da-nhan":"Đã nhận đủ","huy":"Đã huỷ"};
const PO_PILL={"dang-ve":"p-info","nhan-mot-phan":"p-warn","da-nhan":"p-ok","huy":"p-mute"};
const itemOf = id => N.items.find(i=>i.id===id);

/* Vẽ */
let poForm=null;   // đề nghị đang mở form tạo đơn mua
let adjOpen=null;  // NVL đang mở form điều chỉnh tồn
const KIND={"dieu-chinh":"Điều chỉnh (kiểm kê)","nhap-mua":"Nhập hàng mua","tra-xuong":"Xưởng trả về","xuat":"Xuất cho xưởng","huy-xuat":"Huỷ phiếu xuất","khoi-phuc":"Khôi phục bản lưu"};
function adjForm(it,cols){
  const f=[["stock",`Tồn (${esc(it.unit)})`]]; if(it.type==="Vải") f.push(["stockCay","Tồn (cây)"]);
  const open=(N.stockReports||[]).filter(r=>r.item===it.id&&r.status==="mo");
  return `<tr class="poform" data-adjrow="${it.id}"><td colspan="${cols}"><div style="display:flex;flex-wrap:wrap;gap:8px 14px;align-items:center">
    <b>Điều chỉnh tồn ${esc(it.name)}</b>
    <label>Ô <select data-a="field">${f.map(([k,l])=>`<option value="${k}">${l}</option>`).join("")}</select></label>
    <label>Số thực tế <input class="f n" data-a="val" inputmode="decimal"></label>
    <label>Lý do (bắt buộc) <input class="f" data-a="why" style="width:260px" placeholder="VD: kiểm kê 24/10, tồn đầu kỳ, hàng lỗi QC…"></label>
    <button class="btn primary" data-adjsave="${it.id}">Lưu điều chỉnh</button><button class="btn ghost" data-adjclose>Đóng</button>
    ${open.length?`<span class="short small">Có ${open.length} báo sai lệch đang mở cho NVL này</span>`:""}
    <span class="muted small">Nhập hàng mua / xuất cho xưởng / xưởng trả về không sửa ở đây mà qua đúng nghiệp vụ.</span></div></td></tr>`;
}
/* Sổ tồn + báo sai lệch */
function renderStockLog(){
  const L=(N.stockLog||[]).slice().reverse().slice(0,80), R=(N.stockReports||[]).slice().reverse();
  const openR=R.filter(r=>r.status==="mo");
  $("#stockLog").innerHTML=`${R.length?`<div class="panel"><div class="grp-h"><div class="t"><h3>Báo sai lệch tồn</h3><p class="muted small">Nhân viên báo · Kho / Admin kiểm tra, điều chỉnh (nếu cần) rồi đóng</p></div><span class="pill ${openR.length?"p-warn":"p-ok"}">${openR.length} đang mở</span></div>
      <div class="scroll"><table class="t" style="min-width:820px"><thead><tr><th>Lúc</th><th>Người báo</th><th>NVL</th><th>Nội dung</th><th>Xử lý</th><th></th></tr></thead><tbody>
      ${R.map(r=>{ const it=itemOf(r.item); return `<tr><td class="small">${time(r.at)}</td><td>${esc(who(r.by))}</td><td>${esc(it?it.name:r.itemName)}</td><td>${esc(r.note)}</td>
        <td class="small">${r.status==="mo"?`<span class="pill p-warn">Đang mở</span>`:`<span class="pill p-ok">Đã xử lý</span> ${esc(who(r.doneBy))} ${time(r.doneAt)}${r.result?" · "+esc(r.result):""}`}</td>
        <td>${r.status==="mo"&&KHO?`<button class="btn ghost" data-repdone="${r.id}">Đã xử lý</button>`:""}</td></tr>`; }).join("")}</tbody></table></div></div>`:""}
    <div class="panel"><div class="grp-h"><div class="t"><h3>Sổ tồn NVL</h3><p class="muted small">Mọi thay đổi số tồn: người, giờ, trước → sau, lý do, nghiệp vụ · chỉ thêm, không sửa / xoá · 80 dòng gần nhất</p></div></div>
      <div class="scroll"><table class="t" style="min-width:980px"><thead><tr><th>Lúc</th><th>Người</th><th>NVL</th><th>Nghiệp vụ</th><th class="r">Trước</th><th class="r">Sau</th><th class="r">Thay đổi</th><th>Lý do / chứng từ</th></tr></thead><tbody>
      ${L.length?L.map(e=>{ const it=itemOf(e.item), u=e.field==="stockCay"?"cây":(it?it.unit:""); return `<tr><td class="small">${time(e.at)}</td><td>${esc(who(e.by))}</td><td>${esc(it?it.name:e.itemName)}</td><td>${KIND[e.kind]||esc(e.kind)}</td>
        <td class="r num">${fmt(e.before)}</td><td class="r num">${fmt(e.after)}</td><td class="r num ${e.delta<0?"short":"okc"}">${e.delta>0?"+":""}${fmt(e.delta)} ${esc(u)}</td><td class="small">${esc(e.reason)}</td></tr>`; }).join("")
        :`<tr><td colspan="8" class="muted">Chưa có thay đổi tồn nào.</td></tr>`}</tbody></table></div></div>`;
}
/* ===== UX V5 (anh duyệt 13/11/2026): Tồn kho NVL theo Ngành → Mã → NVL hoặc theo nhóm NVL; tìm kiếm + lọc trạng thái.
   Chỉ đổi cách hiển thị: không đổi số tồn, công thức, nghiệp vụ. NVL chưa nhập số = "Chưa khai báo" (không coi là 0, không coi là lỗi); tồn 0 đã khai là hợp lệ. ===== */
const UXK="_ux_nvl_"+(ME()||"x");
const UX=(()=>{ let o={}; try{ o=JSON.parse(localStorage.getItem(UXK))||{}; }catch(e){} return {mode:o.mode==="nvl"?"nvl":"sp", st:"all", q:"", open:new Set(Array.isArray(o.open)?o.open:[])}; })();
const uxSave=()=>{ try{ localStorage.setItem(UXK, JSON.stringify({mode:UX.mode, open:[...UX.open].slice(-80)})); }catch(e){} };
const blank=v=>v===null||v===undefined||v==="";
const UX_ST=[["all","Tất cả",""],["chua","Chưa khai báo",""],["chk","Cần kiểm tra","t-o"],["co","Có tồn",""],["het","Hết tồn",""],["giu","Có lượng đang giữ",""]];
function itState(it,H){
  const vai=groupOf(it)==="vai", decl=vai?!(blank(it.stock)&&blank(it.stockCay)):!blank(it.stock);
  const hold=n((H.kho||{})[it.id]), err=[], chk=[];
  if(decl&&(n(it.stock)<0||n(it.stockCay)<0)) err.push("tồn âm");
  if(decl&&stockOf(it)-hold<-1e-9) err.push("giữ vượt tồn "+fmt(hold-stockOf(it))+" "+unitOf(it));
  if(it.off) chk.push("trùng dòng khác, không tính");
  if(!byCay(it)&&blank(it.per)) chk.push("chưa có định mức");
  const rep=(N.stockReports||[]).filter(r=>r.item===it.id&&r.status==="mo").length; if(rep) chk.push(rep+" báo sai lệch đang mở");
  const st=stockOf(it);
  return {decl, hold, err, chk, has:decl&&st>1e-9, out:decl&&Math.abs(st)<=1e-9, bad:err.length+chk.length>0};
}
const itIn=(s,k)=>k==="all"||(k==="chua"&&!s.decl)||(k==="chk"&&s.bad)||(k==="co"&&s.has)||(k==="het"&&s.out)||(k==="giu"&&s.hold>1e-9);
function itText(it){ const m=MODELS.find(x=>x.key===it.model); return Khung.norm([it.name,it.type,it.kind,it.color,colorWord(it.color),m&&m.name,m&&m.code,m&&Khung.aliasOf(m),it.id].join(" ")); }
const itHit=it=>!UX.q||Khung.norm(UX.q).split(/\s+/).filter(Boolean).every(w=>itText(it).includes(w));
/* NVL thuộc cách xem hiện tại (để số trên chip / ô chỉ số khớp đúng số dòng hiện ra):
   Theo sản phẩm = NVL riêng của các mã đang xem (theo bộ lọc ngành / người phụ trách) + NVL dùng chung (mỗi dòng 1 lần) · Theo NVL = tất cả */
const uxModels=()=>MODELS.filter(m=>m.status!=="stopped"&&Khung.visible(m.key));
function uxView(){ if(UX.mode!=="sp") return N.items; const ks=new Set(uxModels().map(m=>m.key)); return N.items.filter(it=>it.model==="*"||ks.has(it.model)); }
function uxCounts(H){ const c={all:0,chua:0,chk:0,co:0,het:0,giu:0}; uxView().forEach(it=>{ const s=itState(it,H); UX_ST.forEach(([k])=>{ if(itIn(s,k)) c[k]++; }); }); return c; }
function itBadges(s){
  const b=[];
  if(!s.decl) b.push(`<span class="ux-b g">Chưa khai báo</span>`);
  if(s.err.length) b.push(`<span class="ux-b r" title="${esc(s.err.join(" · "))}">Dữ liệu lỗi: ${esc(s.err.join(" · "))}</span>`);
  if(s.chk.length) b.push(`<span class="ux-b o" title="${esc(s.chk.join(" · "))}">Cần kiểm tra: ${esc(s.chk.join(" · "))}</span>`);
  if(s.out&&!s.err.length) b.push(`<span class="ux-b g">Hết tồn</span>`);
  if(s.hold>1e-9) b.push(`<span class="ux-b b">Đang giữ</span>`);
  return b.join(" ");
}
function uxKpis(T,on){
  return `<div class="ux-kpis">${T.map(t=>{ const z=!t.v, inner=`<span class="v num">${fmt(t.v)}</span><span class="l">${t.l}</span><span class="d">${t.d}</span>`;
    return z?`<div class="ux-kpi zero">${inner}</div>`:`<button type="button" class="ux-kpi tone-${t.tone}${on&&on===t.go?" on":""}" data-uxgo="${esc(t.go)}" style="--c:var(--ux-${t.tone})">${inner}</button>`; }).join("")}</div>`;
}
function uxBar(C){
  let bar=$("#nvlBar"); if(!bar) return;
  if(!bar.dataset.built){
    bar.dataset.built="1";
    bar.innerHTML=`<div class="ux-bar"><div class="ux-seg" role="group" aria-label="Cách xem"><button type="button" data-uxmode="sp">Theo sản phẩm</button><button type="button" data-uxmode="nvl">Theo NVL</button></div>
      <input class="ux-q" id="nvlQ" type="search" placeholder="Tìm mã SP, tên NVL, mã NVL, màu…" aria-label="Tìm NVL" autocomplete="off">
      <span class="ux-sep"></span><div class="ux-chips" id="nvlChips"></div></div>`;
    $("#nvlQ").addEventListener("input",e=>{ UX.q=e.target.value; render(); });
  }
  bar.querySelectorAll("[data-uxmode]").forEach(b=>b.classList.toggle("on",b.dataset.uxmode===UX.mode));
  $("#nvlChips").innerHTML=UX_ST.map(([k,l,t])=>`<button type="button" class="ux-chip ${t}${UX.st===k?" on":""}" data-uxst="${k}"${k!=="all"&&!C[k]&&UX.st!==k?" disabled":""}>${l} <span class="n">${C[k]}</span></button>`).join("")
    +(UX.st!=="all"||UX.q?` <button type="button" class="ux-clear" data-uxclear>Bỏ lọc</button>`:"");
}
/* Theo sản phẩm: Ngành → Mã → NVL dùng cho mã đó (riêng của mã + dùng chung hợp màu của mã) */
function uxBySp(H,h){
  const filt=UX.st!=="all"||!!UX.q, act=uxModels();
  const shared={key:"*", name:"Dùng chung nhiều mã", code:"", shared:true};
  const forM=m=>m.shared?N.items.filter(it=>it.model==="*"):N.items.filter(it=>it.model===m.key);
  const none=[];
  const card=m=>{
      const its=forM(m); if(!its.length){ if(!m.shared) none.push(m); return ""; }
      const mHit=!m.shared&&UX.q&&Khung.norm(UX.q).split(/\s+/).filter(Boolean).every(w=>Khung.norm([m.name,m.code,Khung.aliasOf(m)].join(" ")).includes(w));
      const rows=its.map(it=>({it,s:itState(it,H)})).filter(x=>itIn(x.s,UX.st)&&(mHit||itHit(x.it)));
      if(filt&&!rows.length) return "";
      const all=its.map(it=>itState(it,H)), cnt=k=>all.filter(s=>itIn(s,k)).length, key="m:"+m.key, open=UX.open.has(key)||(filt&&rows.length<=40);
      const cl=m.shared?[]:Khung.colorsOfModel(m.key), vaiN=m.shared||Khung.nganhOf(m)!=="polo"?0:N.items.filter(it=>it.model==="*"&&groupOf(it)==="vai"&&cl.includes(it.color)).length;
      const meta=m.shared?`${its.length} NVL · vải, nhãn sườn… dùng cho mọi mã (mỗi dòng 1 lần)`:[`${its.length} NVL riêng của mã`, vaiN?`dùng ${vaiN} màu vải chung`:""].filter(Boolean).join(" · ");
      const rt=[cnt("chua")?`<span class="ux-b g">${cnt("chua")} chưa khai báo</span>`:"", cnt("chk")?`<span class="ux-b o">${cnt("chk")} cần kiểm tra</span>`:"", cnt("giu")?`<span class="ux-b b">${cnt("giu")} đang giữ</span>`:""].join(" ");
      const grpN={vai:"Vải",bo:"Bo",pl:"Phụ liệu"};
      const body=open?`<div class="b"><div class="scroll"><table class="t" style="min-width:860px"><thead><tr><th>Nhóm</th><th>NVL</th><th>Màu</th><th class="r">Tồn</th><th class="r">Đang giữ cho đơn</th><th class="r">Khả dụng</th><th>Tình trạng</th><th></th></tr></thead><tbody>
        ${rows.map(({it,s})=>{ const g=groupOf(it), stTxt=!s.decl?`<span class="muted">—</span>`:byCay(it)?`${fmt(it.stockCay)} cây${blank(it.stock)?"":` <span class="muted small">· ${fmt(it.stock)} kg</span>`}`:`${fmt(it.stock)} ${esc(unitOf(it))}`;
          return `<tr data-id="${it.id}" class="${s.err.length?"ux-row-r":s.bad?"ux-row-o":""}"><td>${grpN[g]||g}</td><td><b>${esc(it.name)}</b></td><td>${it.color==="*"?"Mọi màu":esc(colorLabel(it.color))}</td>
            <td class="r num">${stTxt}</td>${h.holdTd(it)}${h.freeTd(it)}<td>${itBadges(s)}</td><td style="white-space:nowrap">${h.adjBtn(it)}</td></tr>${adjOpen===it.id?adjForm(it,8):""}`; }).join("")}
        </tbody></table></div><div class="ux-hint" style="padding:8px 14px">Khai báo, sửa loại / màu / định mức, thêm NVL: chuyển sang <button type="button" class="ux-clear" data-uxmode="nvl">Theo NVL</button>.</div></div>`:"";
      return `<div class="ux-acc${open?" open":""}" data-uxacc="${key}"><button type="button" class="h" data-uxtog="${key}" aria-expanded="${open}"><span class="car">▶</span><span class="nm">${esc(m.name)}</span><span class="meta">${m.code?esc(m.code)+" · ":""}${meta}${filt?` · khớp ${rows.length}`:""}</span><span class="rt">${rt}</span></button>${body}</div>`;
  };
  const sh=card(shared);
  const secs=Khung.NGANH.map(([nk,nt])=>{
    const cards=act.filter(m=>Khung.nganhOf(m)===nk).map(card).join("");
    return cards?`<div class="ux-sec-h">${nt}</div>${cards}`:"";
  }).join("")+(sh?`<div class="ux-sec-h">NVL dùng chung nhiều mã (vải theo màu, nhãn sườn…)</div>${sh}`:"");
  const noneTxt=none.length&&!filt?`<div class="ux-hint">Không theo dõi NVL tại kho (FOB / chưa có xưởng / chưa khai báo NVL): ${esc(none.map(m=>m.name).join(", "))}</div>`:"";
  return `<div style="display:grid;gap:8px">${secs||`<div class="ux-empty">Không có NVL nào khớp bộ lọc.${UX.q||UX.st!=="all"?` <button type="button" class="ux-clear" data-uxclear>Bỏ lọc</button>`:""}</div>`}${noneTxt}</div>`;
}
/* Theo NVL: Vải / Bo / Phụ liệu → nhóm loại (+ mẫu) → từng màu; đầy đủ khai báo, sửa, thêm như trước */
function uxByNvl(H,COLS,rightCols){
  const filt=UX.st!=="all"||!!UX.q;
  return GROUPS.map(g=>{
    const its=N.items.filter(it=>groupOf(it)===g.id), byK=new Map();
    its.forEach(it=>{ const k=gkey(it); if(!byK.has(k)) byK.set(k,[]); byK.get(k).push(it); });
    const parts=[...byK.entries()].map(([k,L])=>{
      const rows=L.map(it=>({it,s:itState(it,H)})).filter(x=>itIn(x.s,UX.st)&&itHit(x.it));
      if(filt&&!rows.length) return "";
      const all=L.map(it=>itState(it,H)), cnt=q=>all.filter(s=>itIn(s,q)).length, key="g:"+k, open=UX.open.has(key)||(filt&&rows.length<=40);
      const rt=[cnt("chua")?`<span class="ux-b g">${cnt("chua")} chưa khai báo</span>`:"", cnt("chk")?`<span class="ux-b o">${cnt("chk")} cần kiểm tra</span>`:"", cnt("giu")?`<span class="ux-b b">${cnt("giu")} đang giữ</span>`:""].join(" ");
      const head=COLS[g.id].head.concat(["Tình trạng"]);
      const body=open?`<div class="b"><div class="scroll"><table class="t" style="min-width:1100px"><thead><tr>${head.map(x=>`<th${rightCols.has(x)?' class="r"':""}>${x}</th>`).join("")}</tr></thead>
        <tbody>${rows.map(({it,s})=>`<tr data-id="${it.id}" class="${s.err.length?"ux-row-r":s.bad?"ux-row-o":""}">${COLS[g.id].row(it,g)}<td>${itBadges(s)}</td></tr>${adjOpen===it.id?adjForm(it,head.length):""}`).join("")}</tbody></table></div></div>`:"";
      return `<div class="ux-acc${open?" open":""}" data-uxacc="${esc(key)}"><button type="button" class="h" data-uxtog="${esc(key)}" aria-expanded="${open}"><span class="car">▶</span><span class="nm">${esc(glabel(L[0]))}</span><span class="meta">${L.length} dòng${filt?` · khớp ${rows.length}`:""}</span><span class="rt">${rt}</span></button>${body}</div>`;
    }).join("");
    if(filt&&!parts) return "";
    return `<div class="panel"><div class="grp-h"><div class="t"><h3>${g.title}</h3><p class="muted small">${g.hint}</p></div><button class="btn" data-add="${g.id}">+ Thêm ${g.title.toLowerCase()}</button></div>
      <div style="display:grid;gap:6px;padding:0 12px 12px">${parts||`<div class="ux-hint">Chưa có. Bấm "+ Thêm ${g.title.toLowerCase()}".</div>`}</div></div>`;
  }).join("")||`<div class="ux-empty">Không có NVL nào khớp bộ lọc. <button type="button" class="ux-clear" data-uxclear>Bỏ lọc</button></div>`;
}
document.addEventListener("click",e=>{
  if(PAGE!=="kho") return;
  const m=e.target.closest("[data-uxmode]"); if(m){ UX.mode=m.dataset.uxmode; uxSave(); render(); return; }
  const s=e.target.closest("[data-uxst]"); if(s&&!s.disabled){ UX.st=UX.st===s.dataset.uxst?"all":s.dataset.uxst; render(); return; }
  if(e.target.closest("[data-uxclear]")){ UX.st="all"; UX.q=""; const q=$("#nvlQ"); if(q) q.value=""; render(); return; }
  const t=e.target.closest("[data-uxtog]"); if(t){ const k=t.dataset.uxtog; if(UX.open.has(k)) UX.open.delete(k); else UX.open.add(k); uxSave(); render(); return; }
  const g=e.target.closest("[data-uxgo]"); if(g){ const v=g.dataset.uxgo;
    if(v.startsWith("st:")){ const k=v.slice(3); UX.st=UX.st===k?"all":k; render(); const el=$("#kho"); if(el) el.scrollIntoView({behavior:"smooth",block:"start"}); return; }
    if(v.startsWith("#")){ const el=$(v); if(el){ el.scrollIntoView({behavior:"smooth",block:"start"}); el.classList.add("ux-flash"); setTimeout(()=>el.classList.remove("ux-flash"),1300); } return; }
    location.href=v; }
});
const tiles = T => T.map(t=>`<div class="tile${t.v?"":" zero"}" style="--c:${t.v?t.c:"var(--muted)"}"><span class="v num">${fmt(t.v)}</span><span class="l">${t.l}</span><span class="d">${t.d}</span></div>`).join("");
function render(){
  loadS();
  renderTabs54();
  if(PAGE==="mua"){ renderBuy(); if(TAB==="can-mua"){ renderOrders(waiting()); renderDrafts54(); } return; }
  renderReq();
  const W=waiting(), H=NV.holds(S,null,N);
  const bad=W.filter(x=>x.C.status!=="san-sang").length;
  const poOpen=(N.buyLists||[]).filter(r=>NV.LIST_OPEN.includes(r.status)).length;
  /* UX V5: ô chỉ số bấm được → lọc / cuộn đến đúng danh sách; ô = 0 không bấm */
  const STC=uxCounts(H);
  $("#sum").innerHTML=uxKpis([
    {v:STC.chua, l:"NVL chưa khai báo tồn", d:"chưa có số, không tính là 0", tone:"g", go:"st:chua"},
    {v:STC.chk, l:"NVL cần kiểm tra", d:"lỗi số liệu, báo sai lệch, thiếu định mức", tone:"o", go:"st:chk"},
    {v:STC.giu, l:"NVL đang giữ cho đơn", d:"có lượng đang giữ", tone:"b", go:"st:giu"},
    {v:W.length, l:"Đơn gia công chờ NVL", d:"chưa xuất NVL", tone:"b", go:"#don-cho"},
    {v:bad, l:"Đơn chưa sẵn sàng", d:"chưa giữ đủ / chờ NVL / chưa đủ dữ liệu", tone:"r", go:"#don-cho"},
    {v:poOpen, l:"Đơn mua NVL đang về", d:"đã gửi NCC, chưa nhận đủ", tone:"b", go:"dat-mua.html#don-mua"}
  ], UX.st!=="all"?"st:"+UX.st:"");

  const opt=(v,cur,l)=>`<option value="${v}"${String(cur)===String(v)?" selected":""}>${l}</option>`;
  const modelSel=it=>`<select data-f="model" aria-label="Dùng cho mẫu">${opt("*",it.model,"Tất cả mẫu")}${MODELS.map(m=>opt(m.key,it.model,m.name)).join("")}</select>`;
  const colorSel=(it,all=true)=>`<select data-f="color" aria-label="Màu">${all?opt("*",it.color,"Tất cả màu"):""}${COLORS.map(c=>opt(c,it.color,colorLabel(c))).join("")}</select>`;
  /* Loại: chọn trong danh sách, "+ Loại mới…" để thêm một lần */
  const kindSel=(it,g)=>{ const cur=g.id==="vai"?it.kind:it.type, list=[...new Set([...N.kinds[g.id],...(DEFAULT_KINDS[g.id]||[]),cur].filter(Boolean))];
    return `<select data-f="kind" data-g="${g.id}" aria-label="Loại">${list.map(k=>opt(k,cur,k)).join("")}<option value="__new">+ Loại mới…</option></select>`; };
  const nameCell=it=>`<div style="display:grid;gap:3px"><b style="font-size:12.5px">${esc(it.name)}</b>${it.off?`<span class="short small">Trùng với dòng phía trên, không tính</span>`:""}</div>`;
  /* Tồn: chỉ xem. Kho / Admin đổi bằng "Điều chỉnh tồn" (bắt buộc lý do, ghi sổ tồn); nhân viên "Báo sai lệch" */
  const sv=v=>v===null||v===undefined||v===""?`<span class="muted">—</span>`:fmt(v);
  const stockIn=it=>`<span class="num">${sv(it.stock)}</span>`;
  const adjBtn=it=>KHO?`<button class="btn ghost" data-adj="${it.id}" title="Điều chỉnh tồn thực tế (kiểm kê), bắt buộc ghi lý do">Điều chỉnh</button>`:`<button class="btn ghost" data-rep="${it.id}" title="Báo Kho / Admin số tồn đang sai">Báo sai lệch</button>`;
  const unitIn=it=>`<select data-f="unit" aria-label="Đơn vị">${[...new Set([...UNITS,it.unit])].map(u=>opt(u,it.unit,u)).join("")}</select>`;
  const perIn=it=>`<input class="f n" data-f="per" inputmode="decimal" value="${it.per??""}" placeholder="?" aria-label="Định mức" style="width:64px">`;
  /* Đang giữ = tổng phần các đơn chưa xuất NVL đang giữ; Khả dụng = tồn − đang giữ */
  const holdTd=it=>{ const h=n(H.kho[it.id]); return `<td class="r num need">${it.off?"—":h?`${fmt(h)} ${unitOf(it)}`:"—"}</td>`; };
  const freeTd=it=>{
    if(it.off) return `<td class="r num after"><span class="muted">—</span></td>`;
    if(!itState(it,H).decl) return `<td class="r num after"><span class="muted" title="Chưa khai báo tồn, không tính là 0">—</span></td>`;   // UX V5
    if(!byCay(it) && (it.per===null||it.per===""||it.per===undefined)) return `<td class="r num after"><span class="short">Chưa có định mức</span></td>`;
    const a=stockOf(it)-n(H.kho[it.id]);
    return `<td class="r num after"><span class="${a<0?"short":n(H.kho[it.id])?"okc":"muted"}">${a<0?"Giữ vượt tồn "+fmt(-a):fmt(a)} ${unitOf(it)}</span></td>`;
  };
  const delTd=it=>`<td style="white-space:nowrap">${adjBtn(it)} <button class="btn ghost" data-del="${it.id}" aria-label="Xoá ${esc(it.name)}">×</button></td>`;
  const COLS={
    vai:{head:["Loại vải","Màu","Dùng cho mẫu","Tên","Tồn (kg)","Tồn (cây)","Định mức (kg / 1 cây vải)","Đang giữ cho đơn","Khả dụng",""],
      row:(it,g)=>`<td>${kindSel(it,g)}</td><td>${colorSel(it,false)}</td><td>${modelSel(it)}</td><td>${nameCell(it)}</td><td class="r">${stockIn(it)}</td>
        <td class="r"><span class="num">${sv(it.stockCay)}</span></td>
        <td>${perIn(it)} <span class="muted small">kg / cây</span></td>${holdTd(it)}${freeTd(it)}${delTd(it)}`},
    bo:{head:["Loại","Dùng cho mẫu","Dùng cho màu","Tên","Tồn","Đơn vị","Định mức (1 áo)","Đang giữ cho đơn","Khả dụng",""],
      row:(it,g)=>`<td>${kindSel(it,g)}</td><td>${modelSel(it)}</td><td>${colorSel(it)}</td><td>${nameCell(it)}</td><td class="r">${stockIn(it)}</td><td>${unitIn(it)}</td><td>${perIn(it)} <span class="muted small">${esc(it.unit)} / áo</span></td>${holdTd(it)}${freeTd(it)}${delTd(it)}`},
    pl:{head:["Loại","Dùng cho mẫu","Tên","Tồn","Đơn vị","Định mức (1 áo)","Đang giữ cho đơn","Khả dụng",""],
      row:(it,g)=>`<td>${kindSel(it,g)}</td><td>${modelSel(it)}</td><td>${nameCell(it)}</td><td class="r">${stockIn(it)}</td><td>${unitIn(it)}</td><td>${perIn(it)} <span class="muted small">${esc(it.unit)} / áo</span></td>${holdTd(it)}${freeTd(it)}${delTd(it)}`}
  };
  const rightCols=new Set(["Tồn (kg)","Tồn (cây)","Tồn","Đang giữ cho đơn","Khả dụng"]);
  /* Bo: cùng mẫu / màu có cả dòng "Bo cổ & bo tay" lẫn dòng Bo cổ / Bo tay riêng → đơn sẽ tính cả hai (trùng) */
  const boSep=N.items.filter(it=>!it.off&&(it.type==="Bo cổ"||it.type==="Bo tay")).map(it=>it.name);
  const boDup=MODELS.flatMap(m=>COLORS.map(c=>{ const L=N.items.filter(it=>!it.off&&groupOf(it)==="bo"&&NV.fits(it,m.key,c)); const set=L.some(x=>x.type==="Bo cổ & bo tay"), sep=L.some(x=>x.type==="Bo cổ"||x.type==="Bo tay"); return set&&sep?`${m.name} ${c}`:null; })).filter(Boolean);
  const warnBo=(boSep.length?`<div class="note" style="--nc:var(--crit)">⚠ <b>Còn dòng bo khai riêng</b> (có tồn nên chưa tự đổi): ${esc(boSep.join(", "))}. Bo đặt theo bộ: Kho điều chỉnh tồn về 0 rồi đổi loại thành "Bo cổ &amp; bo tay".</div>`:"")
    +(boDup.length?`<div class="note" style="--nc:var(--crit)">⚠ <b>Bo có thể bị tính 2 lần</b>: ${esc([...new Set(boDup)].slice(0,8).join(", "))}${boDup.length>8?"…":""} vừa có dòng "Bo cổ &amp; bo tay" vừa có dòng Bo cổ / Bo tay riêng. Giữ một cách theo đúng BOM (mã kho), không tự gộp.</div>`:"");
  uxBar(STC);
  $("#groups").innerHTML=warnBo+(UX.mode==="sp"?uxBySp(H,{holdTd,freeTd,adjBtn}):uxByNvl(H,COLS,rightCols));

  renderOrders(W);

  renderFactory(); renderStockLog();

  /* Mã vạch: mọi đơn, số áo từng size = số mã vạch cần in */
  const all=[];
  Object.entries(S.models).forEach(([m,p])=>(p.orders||[]).forEach(o=>{ if(!o.cancelled && Khung.visible(m) && Khung.match(o.code,o.erpCode)) all.push({m,o}); }));   // đơn huỷ không in mã vạch; theo bộ lọc chung
  all.sort((a,b)=>(a.o.date||"").localeCompare(b.o.date||"")||a.o.id.localeCompare(b.o.id));
  $("#barcodes").innerHTML=all.length?all.map(({m,o},k)=>{
    const mm=MODELS.find(x=>x.key===m)||{name:m};
    return `<div class="panel ord"><div class="ord-h"><b>${esc(Don.label(o,mm))}</b><span class="muted">${esc(mm.name)} · ${XUONG[o.xuong]}</span><button class="btn ghost" data-bc="${k}">Chép số mã vạch</button></div>
      <div class="scroll"><table class="bc"><thead><tr><th>Mã SKU</th>${SZ_LABEL.map(s=>`<th>${s}</th>`).join("")}<th>Tổng</th></tr></thead><tbody>
      ${o.lines.map(l=>{ const sz=lineSizes(l); return `<tr><td>${mm.code||mm.name}-${l.color}</td>${sz.map(v=>`<td class="num">${v}</td>`).join("")}<td class="num"><b>${lineQty(l)}</b></td></tr>`; }).join("")}
      </tbody></table></div></div>`;
  }).join(""):`<div class="panel" style="padding:24px;text-align:center;color:var(--muted)">Chưa có đơn nào.</div>`;
  $("#barcodes").dataset.n=all.length;
  window._bc=all;
}
/* Đơn chờ NVL (tách ra để tab Cần mua dùng lại, nội dung giữ nguyên V5.3) */
function renderOrders(W){
  const el=$("#orders"); if(!el) return;
  const shown=W.filter(({m,o})=>Khung.visible(m)&&Khung.match(o.code,o.erpCode,(MODELS.find(x=>x.key===m)||{}).name));   // bộ lọc chung; số tồn kho không lọc
  el.innerHTML=shown.length?shown.map(({m,o,C})=>{
    const mm=MODELS.find(x=>x.key===m)||{name:m}, D=C.dates;
    const bad=C.rows.filter(r=>r.status!=="du");
    return `<div class="panel ord"><div class="ord-h"><b>${esc(Don.label(o,mm))}</b><span class="muted">${esc(mm.name)} · ${XUONG[o.xuong]} · đặt ${dmy(o.date)} · dự kiến về ${o.dueDate?dmy(o.dueDate):"chưa có"}</span>
      <span class="pill ${NST_PILL[C.status]}">${NV.ORDER[C.status]}</span><a class="small" href="ke-hoach.html?m=${m}#b3">Kiểm tra NVL →</a></div>
      ${C.missing.length?`<div class="ord-l"><span class="short">Kho chưa có: ${esc(C.missing.join(", "))}</span></div>`:""}
      ${C.noRate.length?`<div class="ord-l"><span class="short">Chưa có định mức: ${esc(C.noRate.join(", "))}</span></div>`:""}
      ${bad.map(r=>`<div class="ord-l"><span class="c">${esc(r.it.name)}</span><span class="muted num">cần ${fmt(r.need)} · đã giữ ${fmt(r.holdKho+r.holdXuong)} ${esc(r.unit)}</span><span class="${r.status==="thieu"?"short":""}">${NV.STATUS[r.status]}${r.status==="thieu"?" "+fmt(r.short)+" "+esc(r.unit):r.status==="dang-ve"?" · "+fmt(r.gap)+" "+esc(r.unit):""}</span></div>`).join("")}
      ${!bad.length&&!C.missing.length&&!C.noRate.length?`<div class="ord-l"><span class="okc">Đã giữ đủ NVL</span></div>`:""}
    </div>`;
  }).join(""):`<div class="panel" style="padding:24px;text-align:center;color:var(--muted)">Chưa có đơn gia công nào đang chờ NVL. Lên đơn Anh Hòa / Anh Miên ở trang Kế hoạch sản xuất.</div>`;
}

/* ===== Đề nghị mua: nhân viên tạo từ bước Kiểm tra NVL; Admin duyệt / từ chối / phát hành đơn mua NCC ===== */
function renderRequests(){
  const R=(N.requests||[]).slice().sort((a,b)=>(a.status==="cho-duyet"?0:a.status==="da-duyet"?1:2)-(b.status==="cho-duyet"?0:b.status==="da-duyet"?1:2)||(a.khoDate||"9999").localeCompare(b.khoDate||"9999")||b.createdAt-a.createdAt);
  /* Cùng NVL nhiều đơn: gợi ý gom vào 1 đơn mua (vẫn giữ đủ nhu cầu từng đơn) */
  const grp={}; R.filter(r=>r.status==="cho-duyet"||r.status==="da-duyet").forEach(r=>(grp[r.item]=grp[r.item]||[]).push(r));
  const gom=Object.values(grp).filter(L=>L.length>1).map(L=>`<b>${esc(L[0].itemName)}</b>: ${L.map(r=>`${esc(r.code)} (${esc((r.orderCodes||[]).join(", "))}) ${fmt(r.qty)} ${esc(r.unit)}`).join(" + ")}`);
  $("#reqs").innerHTML=(gom.length?`<div class="note" style="--nc:var(--accent);margin:10px 14px 0">Có thể gom vào 1 đơn mua NCC: ${gom.join(" · ")}. Admin tick "Gom" khi tạo đơn mua; số đặt tính lại từ tổng nhu cầu rồi làm tròn theo quy cách mua.</div>`:"")+(R.length?`<div class="scroll"><table class="t" style="min-width:1100px"><thead><tr><th>Số</th><th>NVL</th><th class="r">Số lượng</th><th>Cho đơn</th><th>Ngày cần NVL</th><th>Có ở kho trước</th><th>Đặt NCC trước</th><th>Người tạo</th><th>Trạng thái</th><th></th></tr></thead><tbody>
    ${R.map(r=>{ const mine=Khung.canEdit(r.model), last=(r.log||[]).slice(-1)[0];
      const acts=[];
      if(ADM&&r.status==="cho-duyet"){ acts.push(`<button class="btn ghost" data-rq="ok" data-id="${r.id}">Duyệt</button>`, `<button class="btn ghost" data-rq="no" data-id="${r.id}">Từ chối</button>`); }
      if(ADM&&r.status==="da-duyet") acts.push(`<button class="btn" data-rq="po" data-id="${r.id}">Tạo đơn mua NCC</button>`);
      if(r.status==="cho-duyet"&&(ADM||mine)) acts.push(`<button class="btn ghost" data-rq="huy" data-id="${r.id}">Huỷ</button>`);
      return `<tr><td><b>${esc(r.code||r.id)}</b></td><td>${esc(r.itemName)}</td><td class="r num"><b>${fmt(r.qty)}</b> ${esc(r.unit)}${r.stockUnit&&r.stockUnit!==r.unit?`<div class="muted small">= ${fmt(r.stockQty)} ${esc(r.stockUnit)}</div>`:""}</td>
        <td>${esc((r.orderCodes||[]).join(", "))}<div class="muted small">${esc((MODELS.find(m=>m.key===r.model)||{name:r.model}).name)}</div></td>
        <td>${r.needDate?dmy(r.needDate)+(r.tentative?` <span class="pill p-warn">tạm</span>`:""):`<span class="short">chưa có</span>`}</td><td>${dmy(r.khoDate)||"—"}</td><td>${dmy(r.orderBy)||"—"}</td>
        <td class="small">${esc(who(r.createdBy))}<div class="muted">${time(r.createdAt)}</div></td>
        <td><span class="pill ${REQ_PILL[r.status]}">${REQ_ST[r.status]||r.status}</span>${last&&last.act!=="tao"?`<div class="muted small">${esc(who(last.by))} ${time(last.at)}${last.note?" · "+esc(last.note):""}</div>`:""}</td>
        <td style="white-space:nowrap">${acts.join(" ")}</td></tr>
        ${poForm===r.id?`<tr class="poform" data-for="${r.id}"><td colspan="10"><div style="display:flex;flex-wrap:wrap;gap:8px 14px;align-items:center">
          <b>Đơn mua NCC từ ${esc(r.code||r.id)}</b>
          <label>Nhà cung cấp <input class="f" data-po="ncc" style="width:180px"></label>
          <label>Số đặt <input class="f n" data-po="qty" inputmode="decimal" value="${r.qty}"> ${esc(r.unit)}</label>
          <label>Ngày dự kiến về kho <input type="date" class="f" data-po="eta"></label>
          <label>Số PO / ghi chú <input class="f" data-po="ref" style="width:160px"></label>
          ${poExtra(r)}
          <button class="btn primary" data-rq="posave" data-id="${r.id}">Lưu đơn mua</button><button class="btn ghost" data-rq="poclose">Đóng</button></div></td></tr>`:""}`; }).join("")}
    </tbody></table></div>`:"")+(R.length?"":`<div style="padding:18px;text-align:center;color:var(--muted)">Chưa có đề nghị mua. Tạo ở Kế hoạch sản xuất › bước 3 Kiểm tra NVL khi đơn thiếu NVL.</div>`);
}
/* Form đơn mua: gom đề nghị cùng NVL đã duyệt; chưa có quy cách mua thì bắt xác nhận */
function poExtra(r){
  const it=itemOf(r.item), peers=(N.requests||[]).filter(x=>x.id!==r.id&&x.item===r.item&&x.status==="da-duyet");
  const spec=it&&n((it.buy||{}).pack);
  return `${peers.length?`<div style="flex-basis:100%;display:flex;flex-wrap:wrap;gap:6px 14px"><b class="small">Gom cùng NVL:</b>${peers.map(x=>`<label class="small"><input type="checkbox" data-po-gom="${x.id}" data-for="${r.id}"> ${esc(x.code)} · ${esc((x.orderCodes||[]).join(", "))} · ${fmt(x.qty)} ${esc(x.unit)}</label>`).join("")}</div>`:""}
    ${!spec?`<div class="short small" style="flex-basis:100%">⚠ ${esc(it?it.name:r.itemName)} chưa có quy cách mua (bội số / đóng gói) → số đặt chưa làm tròn. <label style="color:var(--ink)"><input type="checkbox" data-po="spec"> Tôi đã kiểm quy cách với NCC, xác nhận số đặt này</label></div>`:""}`;
}
/* Tick gom → tính lại số đặt từ tổng nhu cầu (đơn vị tồn) rồi quy đổi / làm tròn theo quy cách mua */
document.addEventListener("change",e=>{
  const c=e.target.closest&&e.target.closest("[data-po-gom]"); if(!c) return;
  const row=c.closest("tr"), r=(N.requests||[]).find(x=>x.id===c.dataset.for), it=itemOf(r.item);
  const ids=[r.id,...[...row.querySelectorAll("[data-po-gom]:checked")].map(x=>x.dataset.poGom)];
  const need=ids.map(id=>(N.requests||[]).find(x=>x.id===id)).reduce((a,x)=>a+n(x.needStock!=null?x.needStock:x.stockQty),0);
  const tb=NV.toBuy(it,need); if(tb.ok) row.querySelector(`[data-po="qty"]`).value=tb.qty;
});
/* ===== Đơn mua NCC: Admin phát hành; kho / Admin nhận hàng (đủ hoặc một phần) → cộng tồn ===== */
function renderPOs(){
  const P=(N.pos||[]).slice().sort((a,b)=>(NV.poOpen(a)?0:1)-(NV.poOpen(b)?0:1)||(a.eta||"").localeCompare(b.eta||""));
  $("#pos").innerHTML=P.length?`<div class="scroll"><table class="t" style="min-width:1000px"><thead><tr><th>Số</th><th>Nhà cung cấp</th><th>NVL</th><th class="r">Đặt</th><th class="r">Đã nhận</th><th class="r">Còn về</th><th>Dự kiến về</th><th>Trạng thái</th><th></th></tr></thead><tbody>
    ${P.map(p=>{ const it=itemOf(p.item), got=(p.received||[]).reduce((a,x)=>a+n(x.qty),0), left=NV.poLeft(p);
      return `<tr><td><b>${esc(p.code||p.id)}</b>${p.ref?`<div class="muted small">${esc(p.ref)}</div>`:""}<div class="muted small">từ ${esc(p.reqCode||"")}</div></td><td>${esc(p.ncc||"—")}</td><td>${esc(it?it.name:p.itemName)}</td>
        <td class="r num">${fmt(p.qty)} ${esc(p.unit)}</td><td class="r num">${got?fmt(got):"—"}</td><td class="r num">${NV.poOpen(p)?`<b>${fmt(left)}</b>`:"—"}</td><td>${dmy(p.eta)||"—"}</td>
        <td><span class="pill ${PO_PILL[p.status]}">${PO_ST[p.status]||p.status}</span>${(p.received||[]).length?`<details class="small"><summary>${p.received.length} lần nhận</summary>${p.received.map(x=>`<div>${time(x.at)} · ${esc(who(x.by))} · ${fmt(x.qty)} ${esc(p.unit)}${x.stockQty!==x.qty?` (= ${fmt(x.stockQty)} ${esc(x.stockUnit||"")})`:""}${x.note?" · "+esc(x.note):""}</div>`).join("")}</details>`:""}</td>
        <td style="white-space:nowrap">${NV.poOpen(p)&&KHO?`<button class="btn" data-po-act="recv" data-id="${p.id}">Nhận hàng</button>`:""} ${NV.poOpen(p)&&ADM?`<button class="btn ghost" data-po-act="huy" data-id="${p.id}">Huỷ</button>`:""}</td></tr>`; }).join("")}
    </tbody></table></div>`:`<div style="padding:18px;text-align:center;color:var(--muted)">Chưa có đơn mua NCC. Admin tạo từ đề nghị mua đã duyệt.</div>`;
}
/* ===== NVL tại xưởng (V5.4 Đợt 2, UX5 · X3): tách 5 số, công thức V5.3 giữ nguyên.
   Còn dư tại xưởng = NV.factoryBal (V5.3) · Đã xuất = phần gửi của các đơn đã xuất (cùng nguồn factoryBal đọc) · Trả lại = Kho đã nhận trả
   Đã sử dụng (ước tính theo định mức) = Đã xuất − Trả lại − Còn dư → luôn khớp đúng số dư V5.3, không nhập số thực tế.
   "Xưởng xác nhận đã nhận" có từ Đợt 3 (X4) → Đợt 2 để trống, ghi "chưa áp dụng". Dư không cộng vào tồn khả dụng kho ===== */
function factoryParts54(){
  const bal=NV.factoryBal(S,N), out={}, ret={};
  NV.allGC(S).forEach(({o})=>{ if(!o||!o.nvlOut||!o.ship) return; Object.keys(o.ship).forEach(id=>{ const k=o.xuong+"|"+id; out[k]=(out[k]||0)+n(o.ship[id]); }); });   // đúng nguồn factoryBal đọc
  (N.returns||[]).forEach(r=>{ const k=r.xuong+"|"+r.item; ret[k]=(ret[k]||0)+n(r.qty); });
  return {bal,out,ret};
}
function renderFactory(){
  const P=factoryParts54(), fbal=P.bal, H=NV.holds(S,null,N);
  $("#atFactory").innerHTML=GC.map(x=>{
    const rows=N.items.filter(it=>{ const k=x+"|"+it.id; return Math.abs(fbal[k]||0)>1e-9||(N.factoryOk||{})[k]||n(P.out[k])>1e-9||n(P.ret[k])>1e-9; });
    const rets=(N.returns||[]).filter(r=>r.xuong===x).slice(-5).reverse();
    return `<div class="panel"><div class="grp-h"><div class="t"><h3>${XUONG[x]}</h3></div></div>
      <div class="scroll"><table class="t fx5" style="min-width:1000px"><thead><tr><th>NVL</th><th class="r">Đã xuất khỏi kho</th><th>Xưởng xác nhận đã nhận</th><th class="r">Đã sử dụng (ước tính theo định mức)</th><th class="r">Trả lại (Kho đã nhận)</th><th class="r">Còn dư tại xưởng</th><th>Dư dùng được cho đơn sau</th><th></th></tr></thead><tbody>
      ${rows.length?rows.map(it=>{ const k=x+"|"+it.id, v=n(fbal[k]), ok=(N.factoryOk||{})[k], held=n(H.xuong[k]), sh=n(P.out[k]), rt=n(P.ret[k]), used=Math.round((sh-rt-v)*1e6)/1e6;
        return `<tr data-fx5="${esc(k)}" data-out="${sh}" data-used="${used}" data-ret="${rt}" data-bal="${v}"><td>${esc(it.name)}</td><td class="r num">${sh?`${fmt(sh)} ${unitOf(it)}`:"—"}</td>${recvCell54(k,it)}
          <td class="r num">${sh||used?`${fmt(used)} ${unitOf(it)}`:"—"}</td><td class="r num">${rt?`${fmt(rt)} ${unitOf(it)}`:"0"}</td>
          <td class="r num">${v<0?`<span class="short">Xưởng thiếu ${fmt(-v)} ${unitOf(it)}</span>`:`<b>${fmt(v)}</b> ${unitOf(it)}`}</td>
          <td class="small">${ok&&ok.usable&&ok.quality?`<span class="okc">✓ ${fmt(ok.qty)} ${unitOf(it)}</span>${held?` · đơn đang giữ ${fmt(held)}`:""}<div class="muted">${esc(who(ok.by))} ${time(ok.at)}${ok.note?" · "+esc(ok.note):""}</div>`:v>0?`<span class="short">Chưa xác nhận → không tính cho đơn</span>`:"—"}</td>
          <td style="text-align:right;white-space:nowrap">${KHO&&v>0?`<button class="btn ghost" data-fx="ok" data-k="${k}">${ok?"Sửa xác nhận":"Xác nhận dùng được"}</button>`:""}${KHO&&ok?` <button class="btn ghost" data-fx="off" data-k="${k}">Bỏ xác nhận</button>`:""}${v>0&&KHO?` <button class="btn ghost" data-ret="${k}">Nhận trả</button>`:""}</td></tr>`; }).join("")
        :`<tr><td colspan="8" class="muted">Không có NVL nào đã xuất / dư ở xưởng.</td></tr>`}
      </tbody></table></div>
      ${rets.length?`<p class="muted small" style="margin:0;padding:8px 14px 12px">Đã nhận trả: ${rets.map(r=>{ const it=itemOf(r.item); return `${dmy(r.date)} ${it?esc(it.name):"?"} ${fmt(r.qty)}`; }).join(" · ")}</p>`:""}
    </div>`;
  }).join("")+`<div class="sec-head" style="margin-top:6px"><h3>Phiếu xuất · xưởng xác nhận đã nhận</h3><p class="muted small">Kho / Admin xác nhận theo từng phiếu · người thực thi đơn gửi đề nghị kèm bằng chứng · số nhận khác số xuất hiện Lệch</p></div><div id="pxList"></div>`;
  renderPx54();
}
/* ===== V5.4 Đợt 3 (X4): xưởng xác nhận đã nhận theo từng phiếu xuất. Kho / Admin ghi xác nhận, từ chối đề nghị; người thực thi đơn gửi đề nghị kèm bằng chứng.
   Chỉ để đối chiếu: không đổi tồn, không đổi công thức dư ở xưởng. Số nhận khác số xuất → Lệch ±x (đỏ) ===== */
const pxSent=pl=>n(pl.qty)+n(pl.fromX);
function pxState(p){ if(p.recv) return "xn"; const r=p.recvReq; return r&&r.state==="cho"?"cho":r&&r.state==="tu-choi"?"tu-choi":"chua"; }
/* Tổng theo xưởng|NVL: số Kho đã xác nhận, lệch so với số đã xuất của các phiếu đã xác nhận, số phiếu chờ / chưa xác nhận */
function recvAgg54(){ const A={};
  (N.issues||[]).filter(p=>!p.void&&GC.includes(p.xuong)).forEach(p=>{ const st=pxState(p); (p.lines||[]).forEach(pl=>{ const k=p.xuong+"|"+pl.item, a=A[k]=A[k]||{got:0, sent:0, cho:0, chua:0, xn:0};
    if(st==="xn"){ a.xn++; a.got+=n(((p.recv||{}).qty||{})[pl.item]); a.sent+=pxSent(pl); } else if(st==="cho") a.cho++; else a.chua++; }); });
  return A; }
function recvCell54(k, it){ const a=recvAgg54()[k]; if(!a) return `<td class="na">chưa có phiếu xuất</td>`;
  const d=Math.round((a.got-a.sent)*1e6)/1e6;
  return `<td data-recv54="${esc(k)}" data-got="${a.got}" data-lech="${d}">${a.xn?`<b>${fmt(a.got)}</b> ${unitOf(it)}${Math.abs(d)>1e-9?` <span class="short">Lệch ${d>0?"+":""}${fmt(d)}</span>`:` <span class="okc">khớp</span>`}`:""}${a.cho?`<div class="small" style="color:var(--warn)">${a.cho} phiếu chờ Kho xác nhận</div>`:""}${a.chua&&!a.xn&&!a.cho?`<span class="muted small">chưa xác nhận</span>`:a.chua?`<div class="muted small">${a.chua} phiếu chưa xác nhận</div>`:""}</td>`; }
function renderPx54(){
  const el=$("#pxList"); if(!el) return;
  const L=(N.issues||[]).filter(p=>!p.void&&GC.includes(p.xuong)).slice().sort((a,b)=>(b.at||0)-(a.at||0));
  const ST={xn:["Đã xác nhận","p-ok"], cho:["Chờ Kho xác nhận","p-warn"], "tu-choi":["Đề nghị bị từ chối","p-bad"], chua:["Chưa xác nhận","p-mute"]};
  const oById=id=>{ let f=null; Object.entries(S.models||{}).forEach(([mk,p])=>(p.orders||[]).forEach(o=>{ if(o.id===id) f={o,mk}; })); return f; };
  el.innerHTML=L.length?`<div class="panel"><div class="scroll"><table class="t" style="min-width:980px"><thead><tr><th>Phiếu xuất</th><th>Đơn · xưởng</th><th>NVL đã xuất</th><th>Xưởng xác nhận đã nhận</th><th>Trạng thái</th><th></th></tr></thead><tbody>${L.map(p=>{ const st=pxState(p), f=oById(p.oid), mine=f&&f.o.exec&&f.o.exec.user===ME(), rv=p.recv||{}, rq=p.recvReq||{};
    const lines=(p.lines||[]).map(pl=>{ const g=st==="xn"?n((rv.qty||{})[pl.item]):null, d=g==null?0:Math.round((g-pxSent(pl))*1e6)/1e6;
      return `<div>${esc(pl.itemName)}: <b>${fmt(pxSent(pl))}</b> ${esc(pl.unit||"")}${g!=null?` → nhận <b>${fmt(g)}</b>${Math.abs(d)>1e-9?` <span class="short">Lệch ${d>0?"+":""}${fmt(d)}</span>`:""}`:""}</div>`; }).join("");
    const acts=[]; if(st!=="xn"&&st!=="cho"&&(mine||KHO)) acts.push(`<button class="btn ghost" data-xn="de-nghi" data-px="${esc(p.id)}">Đề nghị xác nhận</button>`);
    if(st!=="xn"&&KHO) acts.push(`<button class="btn primary" data-xn="ghi" data-px="${esc(p.id)}">Xác nhận đã nhận</button>`);
    if(st==="cho"&&KHO) acts.push(`<button class="btn ghost" data-xn="tu-choi" data-px="${esc(p.id)}">Từ chối</button>`);
    return `<tr data-px54="${esc(p.id)}" data-st="${st}"><td><b>${esc(p.no)}</b><div class="muted small">${dmy(p.date)} · ${esc(who(p.by))}</div></td><td>${esc(p.code||"")}<div class="muted small">${esc(XUONG[p.xuong]||p.xuong)}</div></td><td class="small">${lines}</td>
      <td class="small">${st==="xn"?`${esc(who(rv.by))} ${time(rv.at)}<div class="muted">nguồn: ${esc(rv.evidence||"")}</div>`:st==="cho"?`Đề nghị của ${esc(who(rq.by))} ${time(rq.at)}<div class="muted">bằng chứng: ${esc(rq.evidence||"")}</div>`:st==="tu-choi"?`<span class="short">Từ chối: ${esc(rq.reason||"")}</span><div class="muted">${esc(who(rq.doneBy))} ${time(rq.doneAt)}</div>`:`<span class="muted">—</span>`}</td>
      <td><span class="pill ${ST[st][1]}">${ST[st][0]}</span></td><td style="white-space:nowrap">${acts.join(" ")}</td></tr>`; }).join("")}</tbody></table></div></div>`
    :`<div class="panel" style="padding:16px;text-align:center;color:var(--muted)">Chưa có phiếu xuất NVL nào cho xưởng gia công.</div>`;
}
function xnDialog(p, kind){
  const f=(()=>{ let r=null; Object.entries(S.models||{}).forEach(([mk,pp])=>(pp.orders||[]).forEach(o=>{ if(o.id===p.oid) r={o,mk}; })); return r; })(); if(!f){ alert("Không tìm thấy đơn của phiếu này"); return; }
  const old=document.getElementById("xn54"); if(old) old.remove();
  const w=document.createElement("div"); w.id="xn54"; w.setAttribute("style","position:fixed;inset:0;background:rgba(0,0,0,.3);z-index:300;display:grid;place-items:center;padding:16px");
  const T={"de-nghi":"Đề nghị xác nhận xưởng đã nhận","ghi":"Kho / Admin xác nhận xưởng đã nhận","tu-choi":"Từ chối đề nghị xác nhận"}[kind], rq=p.recvReq||{};
  w.innerHTML=`<div role="dialog" aria-modal="true" style="background:var(--surface);border-radius:10px;padding:16px 18px;max-width:560px;width:100%;display:grid;gap:10px"><b>${T} · ${esc(p.no)} · ${esc(p.code||"")}</b>
    ${kind==="tu-choi"?`<label class="small">Lý do từ chối (bắt buộc)<textarea class="f" data-xnr rows="2" style="width:100%"></textarea></label>`
      :`${(p.lines||[]).map(pl=>`<label class="small" style="display:flex;gap:8px;align-items:center;justify-content:space-between">${esc(pl.itemName)} · đã xuất ${fmt(pxSent(pl))} ${esc(pl.unit||"")}<span>Xưởng nhận <input class="f n" data-xnq="${esc(pl.item)}" inputmode="decimal" value="${kind==="ghi"&&rq.state==="cho"&&rq.qty&&rq.qty[pl.item]!=null?rq.qty[pl.item]:""}"></span></label>`).join("")}
      <label class="small">Nguồn / bằng chứng (bắt buộc)<input class="f" data-xne style="width:100%" placeholder="VD: ảnh biên bản nhận hàng 16/11, tin nhắn xưởng" value="${kind==="ghi"&&rq.state==="cho"?esc(rq.evidence||""):""}"></label>`}
    <div class="short small" data-xnerr></div><div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn" data-xnx>Huỷ</button><button class="btn primary" data-xnok>${kind==="tu-choi"?"Từ chối":"Lưu"}</button></div>
    <div class="muted small">Chỉ ghi nhận để đối chiếu: không đổi tồn kho, không đổi số dư ở xưởng.</div></div>`;
  document.body.appendChild(w);
  w.addEventListener("click",async ev=>{ if(ev.target===w||ev.target.closest("[data-xnx]")){ w.remove(); return; } const b=ev.target.closest("[data-xnok]"); if(!b) return;
    const body={op:"xn-"+kind, model:f.mk, oid:p.oid, issue:p.id};
    if(kind==="tu-choi") body.reason=(w.querySelector("[data-xnr]").value||"").trim();
    else { body.qty={}; w.querySelectorAll("[data-xnq]").forEach(i=>{ body.qty[i.dataset.xnq]=i.value.trim(); }); body.evidence=(w.querySelector("[data-xne]").value||"").trim(); }
    b.disabled=true; let r; try { const x=await fetch("/api/nvl/op",{method:"POST",body:JSON.stringify(body),headers:{"Content-Type":"application/json"}}); r={status:x.status, j:await x.json().catch(()=>({}))}; } catch(e){ r={status:0,j:{error:"Không kết nối được server"}}; }
    if(r.status!==200){ b.disabled=false; w.querySelector("[data-xnerr]").textContent=(r.j&&r.j.error)||"Không thực hiện được"; return; }
    if(window.DongBo&&DongBo.take&&r.j.value){ if(!DongBo.take(NKEY,r.j.value,r.j.rev)) DongBo.fresh(NKEY); }
    w.remove(); loadN(); render(); });
}
document.addEventListener("click",e=>{ const b=e.target.closest&&e.target.closest("[data-xn]"); if(!b) return; const p=(N.issues||[]).find(x=>x.id===b.dataset.px); if(p) xnDialog(p,b.dataset.xn); });
/* ===== V5.4 Đợt 2: thanh 4 tab (số trên tab = số dòng cần chú ý) + đổi tab không tải lại trang ===== */
function tabCounts54(){
  const c={ton:0,"can-mua":0,"dang-mua":0,"tai-xuong":0};
  try { c.ton=uxCounts(NV.holds(S,null,N)).chk; } catch(e){}
  try { const SH=NV.shortages(N,S); c["can-mua"]=Object.values(SH.items).filter(x=>x.short>1e-9).length; } catch(e){}
  try { c["dang-mua"]=(N.buyLists||[]).filter(B=>dsSt(B)!=="nhap"&&!["xong","huy"].includes(dsSt(B))&&(dsLate(B)||dsHsLate(B)>0||Khung.vuongOpen(B.vuong).length>0)&&(!STAFF54||(B.giao&&B.giao.user===ME()))).length; } catch(e){}
  try { const P=factoryParts54(); c["tai-xuong"]=Object.keys(P.bal).filter(k=>n(P.bal[k])>1e-9&&!(((N.factoryOk||{})[k]||{}).usable)).length; } catch(e){}
  return c;
}
function renderTabs54(){
  const el=$("#ntabs"); if(!el) return; const C=tabCounts54();
  el.innerHTML=tabsFor54().map(([k,t])=>`<a class="ntab" role="tab" href="nvl.html?tab=${k}" data-ntab="${k}" aria-selected="${TAB===k}">${t}${C[k]?` <span class="n${k==="can-mua"||k==="dang-mua"?" r":""}">${C[k]}</span>`:""}</a>`).join("");
}
function setTab54(t){
  if(t===TAB||!tabsFor54().some(x=>x[0]===t)) return;
  TAB=t; PAGE=modeOf54(t); document.body.dataset.page=PAGE; document.body.dataset.tab=TAB;
  try { const u=new URL(location.href); u.searchParams.set("tab",t); ["w","st"].forEach(p=>{ if(t!=="dang-mua") u.searchParams.delete(p); }); history.replaceState(null,"",u.pathname+u.search); } catch(e){}
  render(); window.scrollTo({top:0});
}
document.addEventListener("click",e=>{ const a=e.target.closest&&e.target.closest("[data-ntab]"); if(!a) return; e.preventDefault(); setTab54(a.dataset.ntab); });
/* Tab Cần mua: danh sách mua chưa chốt (bản nháp) — chỉ xem, mở ở tab Đang mua để sửa / chốt như V5.3 */
function renderDrafts54(){
  const el=$("#draftLists"); if(!el) return;
  const L=(N.buyLists||[]).filter(B=>dsSt(B)==="nhap").sort((a,b)=>b.createdAt-a.createdAt);
  el.innerHTML=L.length?`<div class="panel"><div class="scroll"><table class="t"><thead><tr><th>Số</th><th>Loại NVL</th><th>NCC</th><th class="r">Số dòng</th><th>Kế hoạch / đơn liên quan</th><th>Lập</th><th></th></tr></thead><tbody>${L.map(B=>`<tr data-draft="${esc(B.id)}"><td><b>${esc(B.no)}</b></td><td>${esc(B.title||"")}</td><td>${esc(B.ncc||"—")}</td><td class="r num">${(B.lines||[]).length}</td>
    <td class="small">${esc([...new Set((B.lines||[]).flatMap(l=>l.src||[]).map(s=>s.code).filter(Boolean))].join(", ")||"Ngoài kế hoạch")}</td><td class="small">${esc(who(B.createdBy))}<div class="muted">${time(B.createdAt)}</div></td>
    <td><a class="btn" href="nvl.html?tab=dang-mua&st=nhap#ds-${encodeURIComponent(B.id)}">Mở</a></td></tr>`).join("")}</tbody></table></div></div>`
    :`<div class="panel" style="padding:16px;text-align:center;color:var(--muted)">Không có danh sách mua nào đang nháp.</div>`;
}
/* ===== Quy cách mua, hao hụt, ngày QC / vận chuyển (Admin) ===== */
/* V3 (anh duyệt 30/10): NVL bắt buộc của đơn gia công theo nhóm chuẩn. 02/11/2026: mã vạch kho tự in, bỏ khỏi NVL → chuẩn 3 nhóm Vải · Bo · Nhãn sườn.
   Bảng tách rõ: nhóm bắt buộc (danh mục) ≠ dòng NVL đã khai báo ≠ tồn hiện có. Chỉ hiển thị: không tự tạo NVL, không tự tạo tồn, không tự cấp phát */
const REQ_STD=["vai","bo","nhan"];
function renderReq(){
  const el=$("#reqNvl"); if(!el) return;
  const cur=NV.reqKeys(N), std=REQ_STD.every(k=>cur.includes(k))&&cur.every(k=>REQ_STD.includes(k));
  const live=N.items.filter(i=>!i.off&&(i.name||"").trim());
  const rows=REQ_STD.map(k=>{ const R=NV.REQ_ALL[k], L=live.filter(i=>R.ok(i)), on=cur.includes(k);
    const tot=L.reduce((a,i)=>a+(+NV.stockOf(i)||0),0), units=[...new Set(L.map(i=>unitOf(i)))];
    /* UX V5: dòng chưa nhập số tồn = "chưa khai báo tồn", không gộp thành "tồn = 0" */
    const und=L.filter(i=>blank(i.stock)&&blank(i.stockCay)).length, undT=und?` · <span class="ux-t-g">${und} dòng chưa khai báo tồn</span>`:"";
    const st=!L.length?`<span class="short">Chưa khai báo dòng NVL nào → đơn gia công báo “Chưa đủ dữ liệu”, chưa gửi xưởng được</span>`
      :und===L.length?`<span class="ux-b g">Đã khai báo ${L.length} dòng, chưa nhập số tồn</span>`
      :tot<=0?`<span class="ux-t-o">Đã khai báo ${L.length} dòng, tồn hiện có = 0</span>${undT}`:`<span class="okc">Đã khai báo, có tồn</span>${undT}`;
    return `<tr data-req-row="${k}"><td><b>${esc(R.t)}</b></td><td>${on?`<span class="okc">✓ Bắt buộc</span>`:`<span class="short">Không bắt buộc (cấu hình cũ)</span>`}</td>
      <td class="small">${L.length?L.slice(0,6).map(i=>esc(i.name)+(i.model&&i.model!=="*"?` <span class="muted">(${esc(i.model)})</span>`:"")).join(", ")+(L.length>6?` … +${L.length-6}`:""):`<span class="muted">—</span>`}</td>
      <td class="r num">${L.length&&und<L.length?NV.fmt(tot)+" "+esc(units.join(" / ")):"—"}</td><td class="small">${st}</td></tr>`; }).join("");
  el.innerHTML=`<div class="panel" id="reqPanel" style="margin-bottom:12px"><div style="padding:10px 14px 0;display:flex;gap:10px;flex-wrap:wrap;align-items:baseline"><b>NVL bắt buộc mỗi đơn gia công</b><span class="muted small">Chuẩn: Vải · Bo · Nhãn sườn (mã vạch kho tự in, không thuộc NVL). Đơn FOB / thêu / phôi không kiểm NVL.</span>
      ${std?"":`<span class="short small">Cấu hình đang áp dụng khác chuẩn (${cur.map(k=>(NV.REQ_ALL[k]||{t:k}).t).join(", ")}).</span>${ADM?` <button class="btn ghost" data-reqstd>Áp dụng chuẩn (3 nhóm)</button>`:""}`}</div>
    <div class="scroll"><table class="t" style="min-width:760px"><thead><tr><th>Nhóm</th><th>Danh mục bắt buộc</th><th>NVL đã khai báo (dòng trong kho)</th><th class="r">Tồn hiện có</th><th>Tình trạng</th></tr></thead><tbody>${rows}</tbody></table></div>
    <div class="muted small" style="padding:6px 14px 10px">Bảng chỉ để xem: Planning không tự tạo dòng NVL, không tự tạo tồn, không tự giữ / cấp phát. Thiếu nhóm nào thì khai báo dòng NVL ở bảng bên dưới và nhập tồn thực tế qua nhập kho / điều chỉnh có lý do.</div></div>`;
}
document.addEventListener("click",e=>{ const b=e.target.closest&&e.target.closest("[data-reqstd]"); if(!b||!ADM) return;
  if(!confirm("Áp dụng danh mục NVL bắt buộc chuẩn cho đơn gia công: Vải, Bo, Nhãn sườn?")) return;
  N.cfg=N.cfg||{}; N.cfg.required=REQ_STD.slice(); saveN(); render(); });
function renderCfg(){
  const c=N.cfg||{}, lg=N.lossGroup||{}, dis=ADM?"":" disabled";
  const it=N.items.filter(i=>!i.off&&(i.name||"").trim());
  const ni=(attr,v,w=64,ph="")=>`<input class="f n" ${attr} inputmode="decimal" value="${v??""}" placeholder="${ph}" style="width:${w}px"${dis}>`;
  $("#cfg").innerHTML=`<div class="panel" style="padding:12px 14px;display:flex;flex-wrap:wrap;gap:10px 22px;align-items:center;font-size:12.5px">
      <b>Hao hụt dự phòng theo nhóm</b>${GROUPS.map(g=>`<label>${g.title} ${ni(`data-lg="${g.id}"`,lg[g.id],56,"0")} %</label>`).join("")}
      <span style="border-left:1px solid var(--line);height:22px"></span>
      <b>Lùi ngày cần</b><label>QC ${ni('data-cfg="qcDays"',c.qcDays,48,"0")} ngày</label>${GC.map(x=>`<label>Vận chuyển tới ${XUONG[x]} ${ni(`data-ship="${x}"`,(c.shipDays||{})[x],48,"0")} ngày</label>`).join("")}
      <span style="border-left:1px solid var(--line);height:22px"></span>
      <b>NVL bắt buộc mỗi đơn gia công</b>${Object.entries(NV.REQ_ALL).map(([k,x])=>`<label><input type="checkbox" data-req="${k}"${(c.required||NV.REQ_DEFAULT).includes(k)?" checked":""}${dis}> ${x.t}</label>`).join("")}
      ${ADM?"":`<span class="muted">Chỉ Admin sửa phần này.</span>`}</div>
    <div class="panel"><div class="scroll"><table class="t" style="min-width:1050px"><thead><tr><th>NVL</th><th>Đơn vị tồn</th><th class="r">Hao hụt riêng (%)</th><th>Định mức đã gồm hao hụt</th><th>Đơn vị mua</th><th>Quy đổi</th><th>Quy cách mua (ghi chú)</th><th class="r">Bội số mua</th><th class="r">NCC giao (ngày)</th><th>Đề xuất mua tính được?</th></tr></thead><tbody>
    ${it.length?it.map(i=>{ const b=i.buy||{}, u=unitOf(i), bu=b.unit||"", f=NV.facOf(i), t=NV.toBuy(i,1);
      return `<tr data-id="${i.id}"><td>${esc(i.name)}</td><td>${esc(u)}</td>
        <td class="r">${ni('data-b="lossPct"',i.lossPct,84,"theo nhóm")}</td>
        <td><label class="small"><input type="checkbox" data-b="perHasLoss"${i.perHasLoss?" checked":""}${dis}> có (không cộng thêm)</label></td>
        <td><select data-b="unit"${dis}><option value="">= ${esc(u)}</option>${UNITS.filter(x=>x!==u).map(x=>`<option${x===bu?" selected":""}>${x}</option>`).join("")}</select></td>
        <td class="small">${bu&&bu!==u?(byCay(i)&&bu==="kg"?`${ni('data-b="kgPerCay"',b.kgPerCay,64,"?")} kg / cây <div class="muted">riêng mã vải này; lô khác nhập lúc nhận</div>`:`1 ${esc(bu)} = ${ni('data-b="factor"',b.factor,64,"?")} ${esc(u)}`):`<span class="muted">không cần</span>`}</td>
        <td><input class="f" data-b="spec" value="${esc(b.spec||"")}" placeholder="VD: cuộn 25 kg, gói 1000 cái" style="width:170px"${dis}></td>
        <td class="r">${ni('data-b="pack"',b.pack,64,"?")} <span class="muted small">${esc(bu||u)}</span></td>
        <td class="r">${ni('data-b="leadDays"',b.leadDays,48,"")}</td>
        <td class="small">${!t.ok?`<span class="short">Chưa: ${esc(t.why)}</span>`:t.specMissing?`<span class="short">Đề nghị được, chưa làm tròn: thiếu bội số mua · tạo đơn mua phải xác nhận</span>`:`<span class="okc">Được</span>`}</td></tr>`; }).join("")
      :`<tr><td colspan="10" class="muted">Chưa có NVL.</td></tr>`}
    </tbody></table></div></div>`;
}

/* Nhập liệu */
const parseNum = s => { const r=String(s).replace(/[^\d.,-]/g,"").replace(",","."); if(r===""||r==="-") return null; const v=parseFloat(r); return Number.isNaN(v)?null:v; };
function refresh(){
  const f=document.activeElement, row=f&&f.closest&&f.closest("[data-id]"), id=row&&row.dataset.id, fld=f&&f.dataset&&(f.dataset.f||f.dataset.b), pos=f&&f.selectionStart, inCfg=!!(f&&f.closest&&f.closest("#cfg")), key=f&&f.dataset&&(f.dataset.lg||f.dataset.cfg||f.dataset.ship);
  render();
  let el=null;
  if(id&&fld) el=document.querySelector(`${inCfg?"#cfg":"#groups"} [data-id="${id}"] [data-${f.dataset.f?"f":"b"}="${fld}"]`);
  else if(key) el=document.querySelector(`#cfg [data-lg="${key}"],#cfg [data-cfg="${key}"],#cfg [data-ship="${key}"]`);
  if(el){ el.focus(); try{ el.setSelectionRange(pos,pos); }catch(e){} }
}
function onField(e){
  const t=e.target;
  if(t.closest&&t.closest("#cfg")){ onCfg(t); return; }
  const row=t.closest&&t.closest("#groups [data-id]"); if(!row||!t.dataset.f) return;
  const it=N.items.find(x=>x.id===row.dataset.id), f=t.dataset.f;
  if(f==="kind"){
    const g=t.dataset.g;
    let v=t.value;
    if(v==="__new"){
      v=(prompt(g==="vai"?"Tên loại vải mới (VD: Cotton, Thun lạnh):":"Tên loại mới:")||"").trim();
      if(!v){ render(); return; }
      if(!N.kinds[g].includes(v)) N.kinds[g].push(v);
    }
    it.grp=g;
    if(g==="vai") it.kind=v; else it.type=v;
  } else {
    it[f]=["stock","stockCay","per"].includes(f)?parseNum(t.value):t.value;
  }
  tidy(); saveN();
  if(f==="kind"||f==="model"){ UX.open.add("g:"+gkey(it)); uxSave(); }   // UX V5: đổi loại / mẫu thì dòng chuyển nhóm, mở nhóm mới để không "mất" dòng
  if(t.tagName==="SELECT") render(); else refresh();
}
function onCfg(t){
  if(!ADM) return;
  if(t.dataset.lg){ N.lossGroup=N.lossGroup||{}; const v=parseNum(t.value); if(v===null) delete N.lossGroup[t.dataset.lg]; else N.lossGroup[t.dataset.lg]=v; }
  else if(t.dataset.cfg){ N.cfg=N.cfg||{}; N.cfg[t.dataset.cfg]=parseNum(t.value); }
  else if(t.dataset.req){ N.cfg=N.cfg||{}; N.cfg.required=[...document.querySelectorAll("#cfg [data-req]:checked")].map(x=>x.dataset.req); }
  else if(t.dataset.ship){ N.cfg=N.cfg||{}; N.cfg.shipDays=N.cfg.shipDays||{}; N.cfg.shipDays[t.dataset.ship]=parseNum(t.value); }
  else if(t.dataset.b){
    const it=N.items.find(x=>x.id===t.closest("[data-id]").dataset.id), b=t.dataset.b;
    if(b==="lossPct"){ const v=parseNum(t.value); if(v===null) delete it.lossPct; else it.lossPct=v; }
    else if(b==="perHasLoss"){ if(t.checked) it.perHasLoss=true; else delete it.perHasLoss; }
    else { it.buy=it.buy||{}; if(b==="unit"){ if(t.value) it.buy.unit=t.value; else { delete it.buy.unit; delete it.buy.factor; delete it.buy.kgPerCay; } } else if(b==="spec"){ if(t.value.trim()) it.buy.spec=t.value; else delete it.buy.spec; } else { const v=parseNum(t.value); if(v===null||v<=0) delete it.buy[b]; else it.buy[b]=v; } if(!Object.keys(it.buy).length) delete it.buy; }
  }
  saveN();
  if(t.tagName==="SELECT"||t.type==="checkbox") render(); else refresh();
}
document.addEventListener("input",e=>{ if(e.target.tagName==="INPUT"&&e.target.type!=="checkbox"&&!e.target.dataset.po) onField(e); });
document.addEventListener("change",e=>{ if(e.target.tagName==="SELECT"||e.target.type==="checkbox") onField(e); });
document.addEventListener("click",e=>{
  const d=e.target.closest("[data-del]");
  if(d){ const it=N.items.find(x=>x.id===d.dataset.del);
    const used=NV.allGC(S).some(x=>(x.o.nvlHold&&NV.active(x.o)&&(n((x.o.nvlHold.kho||{})[it.id])||n((x.o.nvlHold.xuong||{})[it.id]))))||(N.pos||[]).some(p=>p.item===it.id&&NV.poOpen(p))||(N.requests||[]).some(r=>r.item===it.id&&(r.status==="cho-duyet"||r.status==="da-duyet"));
    if(used){ alert(`${it.name} đang được đơn giữ / có đề nghị hoặc đơn mua đang mở, không xoá được.`); return; }
    if(n(it.stock)||n(it.stockCay)){ alert(`${it.name} còn tồn. Kho / Admin điều chỉnh tồn về 0 (có lý do) trước khi xoá.`); return; }
    if(confirm(`Xoá ${it.name} khỏi kho NVL?`)){ N.items=N.items.filter(x=>x!==it); saveN(); render(); } return; }
  const bc=e.target.closest("[data-bc]");
  if(bc){
    const {m,o}=window._bc[+bc.dataset.bc], mm=MODELS.find(x=>x.key===m)||{name:m};
    const txt=[`Mã vạch ${Don.label(o,mm)}`, ...o.lines.flatMap(l=>lineSizes(l).map((v,i)=>v?`${mm.code||mm.name}-${l.color}-${SZ_LABEL[i]}: ${v}`:null).filter(Boolean))].join("\n");
    navigator.clipboard.writeText(txt).then(()=>{ bc.textContent="Đã chép"; setTimeout(()=>bc.textContent="Chép số mã vạch",1500); });
  }
});
/* Đề nghị mua: duyệt / từ chối / huỷ / tạo đơn mua */
document.addEventListener("click",e=>{
  const b=e.target.closest("[data-rq]"); if(!b) return;
  const act=b.dataset.rq;
  if(act==="poclose"){ poForm=null; render(); return; }
  if(act==="po"){ poForm=b.dataset.id; render(); return; }
  if(act==="posave"){
    const row=b.closest("tr"), v=k=>row.querySelector(`[data-po="${k}"]`).value.trim();
    const qty=parseNum(v("qty")), eta=v("eta"), ncc=v("ncc");
    if(!(qty>0)||!eta||!ncc){ alert("Nhập đủ nhà cung cấp, số đặt và ngày dự kiến về kho."); return; }
    fresh();
    const gomIds=[...row.querySelectorAll("[data-po-gom]:checked")].map(x=>x.dataset.poGom), specOk=!!(row.querySelector(`[data-po="spec"]`)||{}).checked, needSpec=!!row.querySelector(`[data-po="spec"]`);
    if(needSpec&&!specOk){ alert("NVL này chưa có quy cách mua. Kiểm với NCC rồi tick xác nhận số đặt trước khi tạo đơn mua chính thức (hoặc nhập bội số mua ở mục Quy cách mua)."); return; }
    const r=(N.requests||[]).find(x=>x.id===b.dataset.id);
    if(!r||r.status!=="da-duyet"){ alert("Đề nghị này không còn ở trạng thái Đã duyệt (có thể người khác vừa xử lý)."); poForm=null; render(); return; }
    const gomR=gomIds.map(id=>(N.requests||[]).find(x=>x.id===id));
    if(gomR.some(x=>!x||x.status!=="da-duyet"||x.item!==r.item)){ alert("Có đề nghị gom không còn ở trạng thái Đã duyệt (có thể vừa được xử lý). Mở lại form."); poForm=null; render(); return; }
    const allR=[r,...gomR];
    /* Kiểm tra trùng: đề nghị đã có đơn mua, hoặc món này đang có đơn mua mở cho cùng đơn sản xuất */
    const ords=[...new Set(allR.flatMap(x=>x.orders||[]))];
    const dup=(N.pos||[]).filter(p=>p.status!=="huy"&&((p.reqs||[p.req]).some(id=>allR.some(x=>x.id===id))||(p.item===r.item&&NV.poOpen(p)&&(p.orders||[]).some(id=>ords.includes(id)))));
    if(dup.length&&!confirm(`Đã có đơn mua ${dup.map(p=>p.code).join(", ")} cho món này / đơn này. Vẫn tạo thêm?`)) return;
    const it=itemOf(r.item);
    if(it&&NV.buyUnit(it)!==r.unit&&!confirm(`Đơn vị mua của ${it.name} hiện là ${NV.buyUnit(it)}, đề nghị ghi ${r.unit}. Vẫn tạo theo ${r.unit}?`)) return;
    N.pos=N.pos||[]; const now=Date.now();
    const po={id:"po"+now, code:"PO-"+String(N.pos.length+1).padStart(4,"0"), req:r.id, reqs:allR.map(x=>x.id), reqCode:allR.map(x=>x.code).join(", "), item:r.item, itemName:r.itemName, qty, unit:r.unit, ncc, eta, ref:v("ref"), orders:ords, status:"dang-ve", received:[], createdBy:ME(), createdAt:now, log:[{at:now, by:ME(), act:"tao", note:allR.length>1?"gom "+allR.length+" đề nghị":""}]};
    if(needSpec) po.specConfirmed={by:ME(), at:now};
    N.pos.push(po);
    allR.forEach(x=>{ x.status="da-dat"; x.po=po.id; (x.log=x.log||[]).push({at:now, by:ME(), act:"da-dat", note:po.code}); });
    poForm=null; saveN(true); render(); return;
  }
  fresh();
  const r=(N.requests||[]).find(x=>x.id===b.dataset.id); if(!r) return;
  if(r.status!=="cho-duyet"){ alert("Đề nghị này đã được xử lý."); render(); return; }
  const now=Date.now();
  if(act==="ok"){ if(!ADM) return; if(!confirm(`Duyệt đề nghị ${r.code}: ${r.itemName} ${fmt(r.qty)} ${r.unit}?`)) return; r.status="da-duyet"; r.log.push({at:now, by:ME(), act:"duyet"}); }
  else if(act==="no"){ if(!ADM) return; const why=(prompt(`Lý do từ chối ${r.code}:`)||"").trim(); if(!why) return; r.status="tu-choi"; r.log.push({at:now, by:ME(), act:"tu-choi", note:why}); }
  else if(act==="huy"){ const why=(prompt(`Huỷ đề nghị ${r.code}? Ghi lý do:`)||"").trim(); if(!why) return; r.status="huy"; r.log.push({at:now, by:ME(), act:"huy", note:why}); }
  saveN(true); render();
});
/* Nhận hàng mua: cộng tồn theo hệ số quy đổi đã xác nhận; phần chưa nhận vẫn "đang về" */
document.addEventListener("click",e=>{
  const b=e.target.closest("[data-po-act]"); if(!b) return;
  fresh();
  const p=(N.pos||[]).find(x=>x.id===b.dataset.id); if(!p||!NV.poOpen(p)){ render(); return; }
  const it=itemOf(p.item), now=Date.now();
  if(b.dataset.poAct==="huy"){
    if(!ADM) return;
    const why=(prompt(`Huỷ đơn mua ${p.code}? Phần chưa nhận (${fmt(NV.poLeft(p))} ${p.unit}) sẽ thôi tính "đang về". Ghi lý do:`)||"").trim(); if(!why) return;
    p.status="huy"; (p.log=p.log||[]).push({at:now, by:ME(), act:"huy", note:why}); saveN(true); render(); return;
  }
  if(!KHO) return;
  if(!it){ alert("Không tìm thấy NVL của đơn mua này trong kho."); return; }
  /* Vải mua kg, tồn cây: kg / cây theo LÔ nhận (mặc định theo mã vải, kho sửa nếu lô khác) — không giả định chung cho mọi mã */
  let f=p.unit===unitOf(it)?1:NV.buyUnit(it)===p.unit?NV.facOf(it):null, lot=null;
  if(byCay(it)&&p.unit==="kg"){
    const d=n((it.buy||{}).kgPerCay);
    lot=parseNum(prompt(`${it.name}: lô hàng ${p.code} bao nhiêu kg / 1 cây? (theo phiếu cân / NCC)${d?"\nMã vải này đang cài "+fmt(d)+" kg / cây":""}`, d?String(d):"")||"");
    if(!(lot>0)){ alert("Chưa có số kg / cây hợp lệ của lô này, chưa nhận được (không tự giả định)."); return; }
    f=1/lot;
  }
  if(f===null){ alert(`Chưa có hệ số quy đổi hợp lệ: ${NV.facText(it)} (${it.name}). Admin nhập ở mục Quy cách mua trước khi nhận hàng.`); return; }
  const left=NV.poLeft(p), v=parseNum(prompt(`Nhận ${p.code} · ${it.name}\nCòn về ${fmt(left)} ${p.unit}. Số thực nhận (${p.unit}):`, String(left))||"");
  if(!(v>0)) return;
  if(v>left+1e-9&&!confirm(`Nhận ${fmt(v)} nhiều hơn số còn về ${fmt(left)}. Vẫn nhận?`)) return;
  const note=(prompt("Ghi chú (QC, số phiếu nhập…), có thể để trống:")||"").trim();
  const sq=Math.round(v*f*1e4)/1e4, why=`Nhận ${p.code} (${p.ncc||"NCC"}) ${fmt(v)} ${p.unit}${lot?` · lô ${fmt(lot)} kg/cây`:""}${note?" · "+note:""}`;
  (p.received=p.received||[]).push({id:"rc"+now, qty:v, stockQty:sq, stockUnit:unitOf(it), lotKgPerCay:lot, at:now, by:ME(), note});
  p.status=NV.poLeft(p)>1e-9?"nhan-mot-phan":"da-nhan";
  NV.addStock(N, it, sq, "nhap-mua", ME(), why, p.id);
  if(lot) NV.stockChange(N, it, "stock", n(it.stock)+v, "nhap-mua", ME(), why, p.id);   // vải: cộng cả số kg
  saveN(true); render();
});
/* Dư ở xưởng: kho / Admin xác nhận số lượng, chất lượng, dùng được */
document.addEventListener("click",e=>{
  const b=e.target.closest("[data-fx]"); if(!b||!KHO) return;
  fresh();
  const k=b.dataset.k, [x,id]=k.split("|"), it=itemOf(id), have=Math.max(0,NV.factoryBal(S,N)[k]||0);
  N.factoryOk=N.factoryOk||{};
  if(b.dataset.fx==="off"){ if(!confirm(`Bỏ xác nhận dư ${it.name} ở ${XUONG[x]}? Đơn đang giữ phần này vẫn giữ, đơn mới không giữ thêm được.`)) return; delete N.factoryOk[k]; saveN(true); render(); return; }
  const v=parseNum(prompt(`${XUONG[x]} đang có dư ${fmt(have)} ${unitOf(it)} ${it.name}.\nSố lượng ĐÃ KIỂM, dùng được cho đơn sau:`, String(Math.round(have*100)/100))||"");
  if(v===null||v<0) return;
  if(v>have+1e-9){ alert(`Không xác nhận quá số đang ở xưởng (${fmt(have)}).`); return; }
  if(!confirm(`Xác nhận ${fmt(v)} ${unitOf(it)} ${it.name} ở ${XUONG[x]}:\n• đúng số lượng\n• đạt chất lượng\n• dùng được / chuyển được cho đơn sau?`)) return;
  const note=(prompt("Ghi chú (người kiểm, biên bản…), có thể để trống:")||"").trim();
  N.factoryOk[k]={qty:v, quality:true, usable:true, at:Date.now(), by:ME(), note};
  saveN(true); render();
});
/* ===== Đặt mua NVL: từ phần thiếu theo kế hoạch → danh sách theo loại NVL + màu → sao chép gửi NCC qua Zalo → theo dõi nhận hàng =====
   Không làm tròn, không cộng dự phòng: gợi ý = số còn thiếu, người dùng sửa số thực tế đặt. Tồn chỉ tăng khi Kho / Admin nhận hàng (nhập kho, ghi sổ tồn). */
const LIST_ST={"nhap":"Nháp","da-gui":"Đã gửi NCC","ncc-xac-nhan":"NCC xác nhận","nhan-mot-phan":"Nhận một phần","da-nhan":"Đã nhận đủ","huy":"Đã huỷ"};
const LIST_PILL={"nhap":"p-mute","da-gui":"p-info","ncc-xac-nhan":"p-info","nhan-mot-phan":"p-warn","da-nhan":"p-ok","huy":"p-mute"};
const modelName = m => (MODELS.find(x=>x.key===m)||{name:m}).name;
/* Phân bổ vải theo cây (anh duyệt 07/11/2026): dự kiến chỉ để theo dõi; chỉ "Xác nhận phân bổ" mới giữ NVL. Không tự chia, không tự giữ. Server kiểm tra lại mọi số */
const pbOpen=new Set(), pbDraft={};
const pbFabric = l => { const it=itemOf(l.item); return !!it&&byCay(it); };
function pbBtn(B,l){ if(B.status==="huy"||!pbFabric(l)) return ""; return ` <button class="btn ghost" style="white-space:nowrap" data-pb="${l.id}" aria-expanded="${pbOpen.has(l.id)}" title="Xem dự kiến, phân bổ và giữ theo từng kế hoạch">Phân bổ</button>`; }
function pbSum(B,l){ if(!pbFabric(l)) return ""; const I=NV.lineInfo(N,S,B,l); return `<div class="muted" data-pbsum="${l.id}">Dự kiến ${fmt(I.planned)} · Đã giữ ${fmt(I.alloc)} · Chưa phân bổ ${fmt(I.unalloc)}</div>`; }
function pbRow(B,l){
  if(!pbOpen.has(l.id)||!pbFabric(l)) return "";
  const it=itemOf(l.item), I=NV.lineInfo(N,S,B,l), free=Math.max(0,stockOf(it)-n(NV.holds(S,null,N).kho[it.id])), dr=pbDraft[l.id]||{}, canPb=B.status!=="nhap";
  const cell=(t,v,c)=>`<div><span class="muted small">${t}</span><br><b class="num"${c?` style="color:var(--${c})"`:""}>${v}</b></div>`;
  const cand=NV.allGC(S).filter(z=>NV.needsNvl(z.o)&&Khung.canEdit(z.m)&&!(l.src||[]).some(s=>s.id===z.o.id)&&(NV.orderNeeds(N,S,z.m,z.o).needs[l.item]));
  const name=z=>z.o.khtl&&!z.o.closed?z.o.khtl.code:Don.label(z.o);
  const rows=I.rows.map(r=>{ const s=r.s, ed=r.live&&!s.next&&Khung.canEdit(s.model);
    return `<tr data-pbr="${esc(s.id)}"><td>${srcLink(s)}${r.live?"":` <span class="pill p-mute">không tính</span>`}</td>
      <td class="r num">${fmt(r.need)}${Math.abs(r.need-n(s.need))>1e-6?`<div class="small" style="color:var(--warn)">lúc lập ${fmt(n(s.need))}</div>`:""}</td><td class="r num">${fmt(r.held+r.issued)}</td><td class="r num">${fmt(r.rest)}</td>
      <td class="r">${ed?`<input class="f n" data-pbplan="${esc(s.id)}" data-ln="${l.id}" data-id="${B.id}" inputmode="decimal" value="${r.plan}" aria-label="Dự kiến">`:`<span class="num">${r.live?fmt(r.plan):"—"}</span>`}${r.live&&r.plan>r.need+1e-6?`<div class="small" style="color:var(--warn)">vượt nhu cầu</div>`:""}</td>
      <td class="r num">${r.alloc>1e-9?`<b>${fmt(r.alloc)}</b>${Khung.canEdit(s.model)?` <button class="btn ghost" data-pbundo="${esc(s.id)}" data-ln="${l.id}" data-id="${B.id}">Hủy phân bổ</button>`:""}`:"0"}</td>
      <td class="r">${ed&&canPb?`<input class="f n" data-pbq="${esc(s.id)}" data-ln="${l.id}" inputmode="decimal" value="${esc(dr[s.id]||"")}" aria-label="Phân bổ thêm">`:s.next?`<span class="muted small">lưu thành KHTL trước</span>`:"—"}</td></tr>`; }).join("");
  return `<tr class="pb-row" data-pbrow="${l.id}"><td colspan="12"><div class="panel" style="padding:10px 12px;display:grid;gap:8px;border-color:var(--accent);position:sticky;left:0;width:min(1000px,calc(100vw - 340px));min-width:300px;box-sizing:border-box">
    <div style="display:flex;flex-wrap:wrap;gap:6px 22px">${cell("Đã đặt mua",fmt(I.qty)+" cây")}${cell("Đã nhận đạt",fmt(I.got)+" cây")}${cell("Kg thực nhận",I.kg>1e-9?fmt(I.kg)+" kg":"chưa cân")}${cell("Dự kiến phân bổ",fmt(I.planned)+" cây")}${cell("Đã phân bổ &amp; giữ",fmt(I.alloc)+" cây","ok")}${cell("Chưa phân bổ",fmt(I.unalloc)+" cây",I.unalloc>1e-9?"warn":"")}${cell("Còn thiếu so với dự kiến",fmt(I.short)+" cây",I.short>1e-9?"crit":"")}${cell("Tồn khả dụng",fmt(free)+" cây")}</div>
    ${I.over>1e-9?`<div class="note" style="--nc:var(--crit)">⚠ Tổng dự kiến vượt số đặt ${fmt(I.over)} cây: sửa dự kiến hoặc số đặt.</div>`:""}
    <div class="scroll"><table class="t" style="min-width:760px"><thead><tr><th>Kế hoạch</th><th class="r">Cần hiện tại</th><th class="r">Đã giữ + đã xuất</th><th class="r">Còn cần</th><th class="r">Dự kiến</th><th class="r">Từ dòng này</th><th class="r">Phân bổ thêm (cây)</th></tr></thead><tbody>${rows}</tbody></table></div>
    <div style="display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center">
      ${canPb&&I.rows.some(r=>r.live&&!r.s.next&&Khung.canEdit(r.s.model))?`<button class="btn primary" data-pbgo="${l.id}" data-id="${B.id}" title="Giữ NVL theo số vừa nhập; server kiểm tra lại nhu cầu, tồn khả dụng, số đạt chưa chia">Xác nhận phân bổ</button>`:""}
      ${cand.length?`<label class="small">Gắn kế hoạch <select data-pbsel="${l.id}">${cand.map(z=>`<option value="${esc(z.o.id)}|${esc(z.m)}">${esc(name(z))}</option>`).join("")}</select></label><label class="small">dự kiến <input class="f n" data-pbnew="${l.id}" inputmode="decimal" value="${I.spare>1e-9?Math.round(I.spare*100)/100:""}" aria-label="Dự kiến cho kế hoạch gắn thêm"> cây</label><button class="btn" data-pblink="${l.id}" data-id="${B.id}">Gắn vào dòng này</button>`:""}
      ${KHO&&I.got>1e-9?`<button class="btn ghost" data-kgadd="${l.id}" data-id="${B.id}" title="Ghi kg thực cân của lô; không cộng vào tồn">Bổ sung kg thực cân</button>`:""}
      <span class="muted small">Dự kiến không giữ NVL. Vải chưa phân bổ vẫn là tồn khả dụng.</span></div></div></td></tr>`;
}
const pbLine = (dsId,lnId) => { const B=(N.buyLists||[]).find(x=>x.id===dsId), l=B&&(B.lines||[]).find(x=>x.id===lnId); return {B,l}; };
async function pbCall(body,okFn){ const r=await NV.op(body); if(r.status===200){ if(okFn) okFn(); } else { alert((r.j&&r.j.error)||"Không thực hiện được"); if(window.DongBo) DongBo.fresh(NKEY); } loadN(); fresh(); render(); return r; }
document.addEventListener("input",e=>{ const t=e.target; if(t.dataset&&t.dataset.pbq){ (pbDraft[t.dataset.ln]=pbDraft[t.dataset.ln]||{})[t.dataset.pbq]=t.value; } });
document.addEventListener("change",e=>{ const t=e.target; if(!(t.dataset&&t.dataset.pbplan)) return;
  fresh(); const {B,l}=pbLine(t.dataset.id,t.dataset.ln); if(!l){ render(); return; }
  const s=(l.src||[]).find(z=>z.id===t.dataset.pbplan), v=parseNum(t.value); if(!s){ render(); return; }
  if(v===null||v<0){ alert("Dự kiến phải là số ≥ 0."); render(); return; }
  if(Math.abs(v-NV.planOfSrc(s))<1e-9) return;
  pbCall({op:"du-kien", ds:B.id, ln:l.id, oid:s.id, model:s.model, plan:v, exp:NV.planOfSrc(s)});
});
document.addEventListener("click",e=>{
  const o=e.target.closest("[data-pb]"); if(o){ const id=o.dataset.pb; if(pbOpen.has(id)) pbOpen.delete(id); else pbOpen.add(id); render(); return; }
  const g=e.target.closest("[data-pbgo]");
  if(g){ fresh(); const {B,l}=pbLine(g.dataset.id,g.dataset.pbgo); if(!l){ render(); return; }
    const I=NV.lineInfo(N,S,B,l), dr=pbDraft[l.id]||{}, rows=[], bad=[];
    I.rows.forEach(r=>{ const raw=dr[r.s.id]; if(raw===undefined||raw==="") return; const v=parseNum(raw); if(v===null||v<0){ bad.push(r.s.code); return; } if(v>0) rows.push({r,v}); });
    if(bad.length){ alert("Số phân bổ không hợp lệ: "+bad.join(", ")); return; }
    if(!rows.length){ alert("Chưa nhập số phân bổ."); return; }
    const nm=r=>r.o&&r.o.khtl&&!r.o.closed?r.o.khtl.code:r.s.code;
    if(!confirm(`Xác nhận phân bổ và GIỮ ${B.no} · ${cname(l.color)}:\n${rows.map(x=>`• ${nm(x.r)}: ${fmt(x.v)} cây`).join("\n")}\n\nTổng ${fmt(rows.reduce((a,x)=>a+x.v,0))} cây. Chưa phân bổ còn ${fmt(I.unalloc)} cây trước lần này.`)) return;
    g.disabled=true;
    pbCall({op:"phan-bo", ds:B.id, ln:l.id, reqId:"pb"+Date.now()+Math.random().toString(36).slice(2,8), lineExp:I.alloc, rows:rows.map(x=>({oid:x.r.s.id, model:x.r.s.model, qty:x.v, exp:x.r.held}))},()=>{ delete pbDraft[l.id]; });
    return; }
  const u=e.target.closest("[data-pbundo]");
  if(u){ fresh(); const {B,l}=pbLine(u.dataset.id,u.dataset.ln); if(!l){ render(); return; }
    const r=NV.lineInfo(N,S,B,l).rows.find(z=>z.s.id===u.dataset.pbundo); if(!r||r.alloc<=1e-9){ render(); return; }
    const v=parseNum(prompt(`Hủy phân bổ ${r.s.code}: đang phân bổ ${fmt(r.alloc)} cây từ dòng này. Số cây hủy:`,String(r.alloc))||""); if(!(v>0)) return;
    const why=(prompt("Lý do hủy phân bổ (bắt buộc):")||"").trim(); if(!why) return;
    pbCall({op:"nha", oid:r.s.id, model:r.s.model, items:[{item:l.item, qty:v, ln:l.id}], reason:why});
    return; }
  const k=e.target.closest("[data-pblink]");
  if(k){ fresh(); const {B,l}=pbLine(k.dataset.id,k.dataset.pblink); if(!l){ render(); return; }
    const sel=document.querySelector(`[data-pbsel="${l.id}"]`), inp=document.querySelector(`[data-pbnew="${l.id}"]`); if(!sel) return;
    const v=parseNum(inp.value), p=sel.value.split("|"); if(v===null||v<0){ alert("Nhập số dự kiến (≥ 0)."); return; }
    pbCall({op:"du-kien", ds:B.id, ln:l.id, oid:p[0], model:p[1], plan:v});
    return; }
  const w=e.target.closest("[data-kgadd]");
  if(w&&KHO){ fresh(); const {B,l}=pbLine(w.dataset.id,w.dataset.kgadd); if(!l){ render(); return; }
    const v=parseNum(prompt(`Kg THỰC CÂN thêm cho ${B.no} · ${cname(l.color)} (không nhập số ước tính, không cộng vào tồn):`,"")||""); if(!(v>0)) return;
    const now=Date.now(); (l.received=l.received||[]).push({id:"kg"+now, kind:"kg", kg:v, at:now, by:ME()}); listLog(B,"kg",`${cname(l.color)} ${fmt(v)} kg thực cân`); saveN(true); render(); return; }
});
/* Loại NVL (gom các màu): vải theo loại vải (+ mẫu nếu riêng), còn lại theo loại + mẫu */
const gkey = it => groupOf(it)==="vai" ? `vai|${it.kind||""}|${it.model}` : `${it.type}|${it.model}`;
const glabel = it => groupOf(it)==="vai" ? `Vải ${(it.kind||"").toLowerCase()}${it.model==="*"?"":" · "+modelName(it.model).replace(/^Polo\s+/,"")}` : `${it.type}${it.model==="*"?"":" "+modelName(it.model).replace(/^Polo\s+/,"")}`;
const cname = c => c==="*" ? "Mọi màu" : (s=>s.charAt(0).toUpperCase()+s.slice(1))(COLOR_NAME[c]||c);
const canList = L => ADM || (L.status==="nhap" && !L.free && (L.models||[]).every(m=>Khung.canEdit(m)));   // đơn mua ngoài kế hoạch: chỉ Admin
/* Chống mua trùng: thêm nhu cầu vào dòng nháp thì dùng phần đặt dư chưa dự kiến trước, chỉ tăng số đặt phần còn lại */
const addQty = (ex,q) => Math.max(0, q-Math.max(0, n(ex.qty)-(ex.src||[]).reduce((a,z)=>a+NV.planOfSrc(z),0)));
const listLog = (L,act,note) => (L.log=L.log||[]).push({at:Date.now(), by:ME(), act, note:note||""});
const LOG_ACT={"tao":"Tạo","sua":"Sửa","gui":"Đã gửi NCC","ncc":"NCC xác nhận","nhan":"NCC giao","qc":"Kiểm nhận","huy":"Huỷ","du-kien":"Dự kiến phân bổ","lien-ket":"Gắn kế hoạch","phan-bo":"Phân bổ","huy-pb":"Hủy phân bổ","bo-lien-ket":"Bỏ liên kết","kg":"Kg thực nhận","giao":"Bàn giao","chot":"Chốt nhu cầu","tiep-nhan":"Tiếp nhận","tra-lai":"Trả lại","thu-hoi":"Trả về nháp","po":"Mã PO ERP","po-sua":"Đính chính PO","qlvh":"QLVH đã duyệt","qlvh-bo":"Bỏ xác nhận QLVH","hs":"Hồ sơ","hs-na":"Hồ sơ không áp dụng","hs-bo":"Bỏ ghi nhận hồ sơ","bg":"Ghi nhận bàn giao hồ sơ","bg-xn":"Xác nhận nhận hồ sơ","bg-huy":"Huỷ ghi nhận bàn giao","xong":"Hoàn tất","mo-lai":"Mở lại","vuong":"Báo vướng mắc","vuong-nhan":"Đang xử lý vướng mắc","vuong-xong":"Đã giải quyết vướng mắc","hsd":"Chứng từ đợt","hsd-na":"Chứng từ đợt không áp dụng","hsd-bo":"Bỏ chứng từ đợt"};
/* Đơn mua NVL · 1 PO ERP (VIKING → NCC NVL) + hồ sơ (anh yêu cầu 11/11/2026). Các bước do server ghi (/api/nvl/ds-op); trạng thái gốc giữ nguyên
   nên phần tính đang mua / KHTL không đổi. Đơn đã gửi NCC từ trước (không có bước giao) giữ cách cũ. */
const ME_ID=()=>Khung.me&&Khung.me.id;
const isEx=B=>!!(B.giao&&B.giao.user===ME_ID());
const exOk=B=>!!B.giao&&!B.giao.traAt&&(ADM||(isEx(B)&&Don.buyReady(B)));   // V5.3: đơn bàn giao mới phải tiếp nhận rồi mới thực thi (Admin hỗ trợ được)
const lk=B=>!!(B.giao||B.chot);   // V5.3: đã chốt nhu cầu (có hoặc chưa bàn giao) → khoá số đặt / NVL / NCC
const isOwnL=B=>!B.free&&(B.models||[]).length>0&&(B.models||[]).every(m=>Khung.canEdit(m));
const exName=()=>{ const u=(Khung.catalog().exec||{}).user; return u?Khung.userName(u):"người thực thi"; };
const DOCS=[["dntt","Giấy đề nghị thanh toán"],["phieu","Phiếu giao hàng / phiếu nhập NVL"],["hd","Hoá đơn VAT / chứng từ mua hàng hợp lệ"]];
const hPend=B=>(B.handovers||[]).find(h=>h.state==="cho");
const hOk=B=>{ const H=B.handovers||[], h=H[H.length-1]; return !!h&&(!h.state||h.state==="xn"); };
let bgF={};   /* ô nhập bàn giao đang gõ dở (theo đơn mua), giữ qua render */
const docsMissing=B=>Don.buyDocsMissing(B);   // 13/11: phiếu nhập / hoá đơn theo từng đợt kiểm nhận (tính chung ở don.js, giống server)
function stOf(B){
  if(B.status==="huy") return {k:"huy",t:"Đã huỷ",p:"p-mute"};
  if(B.doneAt) return {k:"xong",t:"Hoàn tất",p:"p-ok"};
  if(B.status==="nhap"){ const bs=Don.buyBg(B);
    if(bs==="nhap") return {k:"nhap",t:"Nháp",p:"p-mute"};
    if(bs==="chua-bg") return {k:"chua-bg",t:"Đã chốt — Chưa bàn giao",p:"p-warn"};
    if(bs==="cho-nhan") return {k:"cho-nhan",t:"Đã bàn giao — Chờ tiếp nhận",p:"p-info"};
    if(bs==="tra-lai") return {k:"tra-lai",t:"Đã trả lại — Chờ xử lý",p:"p-warn"};
    if(!B.po) return {k:"cho-po",t:"Đã tiếp nhận — Chờ PO",p:"p-warn"}; if(!B.qlvh) return {k:"cho-qlvh",t:"Chờ QLVH",p:"p-warn"}; return {k:"cho-ncc",t:"Chờ gửi NCC",p:"p-info"}; }
  if(NV.LIST_OPEN.includes(B.status)) return {k:"dang-giao",t:B.giao?"Đang giao · "+LIST_ST[B.status].toLowerCase():LIST_ST[B.status],p:LIST_PILL[B.status]};
  if(B.status==="da-nhan") return B.giao?{k:"cho-hs",t:hPend(B)?"Chờ xác nhận bàn giao hồ sơ":"Chờ hồ sơ",p:"p-warn"}:{k:"da-nhan",t:"Đã nhận đủ",p:"p-ok"};
  return {k:B.status,t:LIST_ST[B.status]||B.status,p:LIST_PILL[B.status]||"p-mute"};
}
async function dsOp(body){
  let r; try { const x=await fetch("/api/nvl/ds-op",{method:"POST",body:JSON.stringify(body)}); const j=await x.json().catch(()=>({error:"Server trả lỗi "+x.status})); r={status:x.status,j}; } catch(e){ r={status:0,j:{error:"Không kết nối được server"}}; }
  if(r.status===200){ if(window.DongBo&&DongBo.take) DongBo.take("nvl-v3",r.j.value,r.j.rev); } else { alert(r.j.error||"Không thực hiện được"); if(window.DongBo) DongBo.fresh(NKEY); }
  loadN(); fresh(); render(); return r;
}
/* Các bước PO ERP: chốt & giao → mã PO → QLVH ký, duyệt → gửi NCC (chỉ gửi được sau khi QLVH đã duyệt) */
function flowBox(B){
  if(!B.giao&&!B.chot) return B.status==="nhap"?`<div class="note small" style="--nc:var(--accent)">Quy trình: chốt nhu cầu → bàn giao ${esc(exName())} → ${esc(exName())} tiếp nhận → tạo <b>1 PO ERP</b> (VIKING → NCC NVL) → QLVH ký, duyệt trên ERP → gửi NCC → Kho kiểm nhận → hồ sơ → hoàn tất. Đơn mua NVL không có PO HKD → VIKING.</div>`:"";
  const g=B.giao||{}, ok=exOk(B)&&!B.doneAt, nh=B.status==="nhap", line="display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center";
  const st=(done,t,info,ctl)=>`<div style="${line}"><span style="width:18px;color:var(${done?"--ok":"--muted"})">${done?"✓":"○"}</span><b style="min-width:150px">${t}</b>${info?`<span class="small">${info}</span>`:""}${ctl||""}</div>`;
  const A=[];
  A.push(st(true,"Chốt nhu cầu",B.chot?`${esc(who(B.chot.by))} chốt ${time(B.chot.at)}`:`${esc(who(g.by))} chốt &amp; giao ${time(g.at)} (trước V5.3)`, nh&&!B.po&&(ADM||isOwnL(B)||(isEx(B)&&Don.buyReady(B)))?` <button class="btn ghost" data-dso="thu-hoi" data-id="${B.id}" title="Trả về nháp để sửa nhu cầu (chỉ khi chưa có PO)">Trả về nháp</button>`:""));
  /* V5.3: Bàn giao (người quản lý kế hoạch) → Tiếp nhận / Trả lại (người thực thi) — tách khỏi chốt */
  A.push(st(!!B.giao&&!g.traAt,"Bàn giao",B.giao?(g.traAt?`<span style="color:var(--warn)">${esc(who(g.traBy))} trả lại ${time(g.traAt)} · lý do: <b>${esc(g.traReason||"")}</b></span>`:`${esc(who(g.by))} → <b>${esc(who(g.user))}</b> · ${time(g.at)}`):"chưa bàn giao",
    (!B.giao||g.traAt)&&nh&&(ADM||isOwnL(B))?` <button class="btn primary" data-dso="giao" data-id="${B.id}">${g.traAt?"Bàn giao lại":"Bàn giao"} cho ${esc(exName())}</button>`:""));
  if(B.giao&&!g.traAt) A.push(st(Don.buyReady(B),"Tiếp nhận",g.ackAt?`${esc(who(g.ackBy))} tiếp nhận ${time(g.ackAt)}`:g.v===2?`chờ ${esc(who(g.user))} tiếp nhận`:"đơn giao trước V5.3",
    g.v===2&&!g.ackAt&&nh&&(isEx(B)||ADM)?` <button class="btn primary" data-dso="nhan" data-id="${B.id}">✓ Tiếp nhận</button> <button class="btn" data-dso="tra-lai" data-id="${B.id}">Trả lại…</button>`:""));
  A.push(st(!!B.po,"Mã PO ERP",B.po?`<b>${esc(B.po.code)}</b> · ${esc(who(B.po.by))} nhập ${time(B.po.at)}`:"VIKING đặt NCC NVL · tạo trên ERP rồi nhập mã",
    !B.po&&ok&&nh?` <input class="f" data-dpo="${B.id}" placeholder="Mã PO trên ERP" style="width:200px" aria-label="Mã PO ERP"> <button class="btn primary" data-dso="po" data-id="${B.id}">Lưu mã PO</button>`:B.po&&ADM&&!B.doneAt?` <button class="btn ghost" data-dso="po-sua" data-id="${B.id}">Đính chính PO</button>`:""));
  A.push(st(!!B.qlvh,"QLVH ký, duyệt",B.qlvh?`${esc(who(B.qlvh.by))} xác nhận ${time(B.qlvh.at)}`:B.po?"trình QLVH ký, duyệt PO trên ERP":"",
    !B.qlvh&&B.po&&ok&&nh?` <label class="small"><input type="checkbox" data-dqlvh="${B.id}"> Đã kiểm tra PO ${esc(B.po.code)} được QLVH ký và duyệt trên ERP</label> <button class="btn primary" data-dso="qlvh" data-id="${B.id}">QLVH đã ký &amp; duyệt</button>`:B.qlvh&&ADM&&nh?` <button class="btn ghost" data-dso="qlvh-bo" data-id="${B.id}">Bỏ xác nhận</button>`:""));
  A.push(st(!nh,"Gửi NCC",!nh&&B.sentAt?`${esc(who(B.sentBy))} gửi ${time(B.sentAt)}`:B.qlvh?"sẵn sàng gửi":"chỉ gửi được sau khi QLVH đã duyệt",
    nh&&B.qlvh&&ok?` <button class="btn primary" data-dso="gui" data-id="${B.id}">Gửi NCC</button>`:""));
  return `<div class="panel" style="padding:10px 12px;display:grid;gap:6px;font-size:12.5px" data-flow="${B.id}"><div class="muted small">PO mua NVL · 1 PO ERP (VIKING → NCC NVL) · người thực thi <b>${B.giao?esc(who(g.user)):"chưa bàn giao"}</b></div>${A.join("")}</div>`;
}
/* Hồ sơ đơn mua NVL: PO ERP + đề nghị thanh toán (nếu áp dụng) + phiếu giao / nhập + hoá đơn → bàn giao → hoàn tất. Không dùng quy trình hoá đơn 5 bước của đơn sản xuất */
function docsBox(B){
  if(!B.giao||(B.status==="nhap"&&!B.qlvh)) return "";
  const ok=exOk(B)&&!B.doneAt, D=B.docs||{}, miss=docsMissing(B), H=B.handovers||[];
  const row=(t,state,ctl)=>`<tr><td>${t}</td><td class="small">${state}</td><td class="nowrap">${ctl||""}</td></tr>`;
  const R=[row("PO mua NVL trên ERP",B.po?`<span class="okc">✓</span> ${esc(B.po.code)}`:`<span class="short">chưa có</span>`)];
  /* 13/11: phiếu nhập / hoá đơn ghi theo từng đợt (bảng bên dưới); chỉ hiện dòng chung cả đơn khi đơn cũ đã ghi theo cách cũ */
  DOCS.filter(([k])=>k==="dntt"||D[k]).forEach(([k,t])=>{ const d=D[k];
    R.push(row(t,d?(d.na?`<span class="muted">Không áp dụng</span> · ${esc(d.reason||"")} · ${esc(who(d.by))} ${time(d.at)}`:`<span class="okc">✓</span> ${d.no?"số "+esc(d.no):""}${d.note?" · "+esc(d.note):""} · ${esc(who(d.by))} ${time(d.at)}`):`<span class="short">chưa có</span>`,
      ok?(d?(d.na&&k!=="dntt"&&!ADM||hPend(B)?"":`<button class="btn ghost" data-dso="hs-bo" data-t="${k}" data-id="${B.id}">Bỏ ghi nhận</button>`):`<button class="btn" data-dso="hs" data-t="${k}" data-id="${B.id}">Ghi nhận</button>${k==="dntt"||ADM?` <button class="btn ghost" data-dso="hs-na" data-t="${k}" data-id="${B.id}">Không áp dụng</button>`:""}`):"")); });
  /* Bàn giao 2 bước (như đơn sản xuất): ghi nhận → người nhận xác nhận bằng tài khoản / Admin xác nhận thay khi người nhận chưa có tài khoản */
  const P=hPend(B), me=ME_ID(), HST={cho:"chờ xác nhận", xn:"đã xác nhận", huy:"đã huỷ"};
  const why=[...(B.status!=="da-nhan"?["chưa nhận đủ NVL"]:[]),...(miss.length?["thiếu "+miss.join(", ")]:[]),...(P?["chờ "+P.to+" xác nhận đã nhận hồ sơ"]:hOk(B)?[]:["chưa bàn giao hồ sơ (bước 1 ghi nhận, bước 2 người nhận xác nhận)"])];
  const hRow=h=>`<div>${time(h.at)} · ${esc(who(h.by))} → <b>${esc(h.to)}</b>${h.toUser?" (tài khoản)":""}${h.evidence?" · "+esc(h.evidence):""} · <span class="${h.state==="cho"?"short":h.state==="huy"?"muted":"okc"}">${HST[h.state]||"đã ghi"}</span>${h.confirmAt?` · ${esc(who(h.confirmBy))} xác nhận ${time(h.confirmAt)}`:""}${h.cancelAt?` · ${esc(who(h.cancelBy))} huỷ: ${esc(h.reason||"")}`:""}</div>`;
  const users=((window.TOI&&TOI.users)||[]).filter(u=>u.active&&u.id!==me), f=bgF[B.id]||{};
  const canBg=B.status==="da-nhan"&&!miss.length;
  const form=!B.doneAt&&!P&&!hOk(B)&&ok?(canBg?`<div style="display:grid;gap:6px" data-bgform="${B.id}">
      <label style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">Người nhận <select class="f" data-bgf="to" data-id="${B.id}"><option value="">— Người nhận chưa có tài khoản —</option>${users.map(u=>`<option value="${esc(u.id)}"${f.to===u.id?" selected":""}>${esc(u.name)} (tài khoản)</option>`).join("")}</select>
        <input class="f" data-bgf="name" data-id="${B.id}" placeholder="Tên người / bộ phận nhận (VD Kế toán)" value="${esc(f.name||"")}" style="width:240px"${f.to?" hidden":""}></label>
      <input class="f" data-bgf="ev" data-id="${B.id}" placeholder="Bằng chứng (bắt buộc khi người nhận chưa có tài khoản): ảnh ký nhận, tin nhắn Zalo…" value="${esc(f.ev||"")}">
      <div><button class="btn" data-dso="bg" data-id="${B.id}">Bước 1 · Ghi nhận bàn giao hồ sơ</button> <span class="muted small">Sau đó chờ người nhận xác nhận (bước 2) mới hoàn tất.</span></div></div>`
    :`<span class="muted small">Ghi nhận bàn giao khi đã nhận đủ NVL và đủ hồ sơ.</span>`):"";
  const wait=P?`<div class="note small" style="--nc:var(--warn)" data-bgwait="${B.id}">${P.toUser?`Chờ <b>${esc(P.to)}</b> đăng nhập tài khoản của mình và bấm “Xác nhận đã nhận hồ sơ”.`:"Người nhận chưa có tài khoản: Admin kiểm tra bằng chứng rồi bấm “Xác nhận bàn giao hợp lệ”."} Chưa xác nhận thì chưa hoàn tất.
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px">${P.toUser&&P.toUser===me?`<button class="btn primary" data-dso="bg-xn" data-id="${B.id}">✓ Xác nhận đã nhận hồ sơ</button>`:""}${!P.toUser&&ADM?`<button class="btn primary" data-dso="bg-xn" data-id="${B.id}">✓ Xác nhận bàn giao hợp lệ</button>`:""}${ADM||P.by===me?`<button class="btn ghost" data-dso="bg-huy" data-id="${B.id}">Huỷ ghi nhận</button>`:""}</div></div>`:"";
  return `<div class="panel" style="padding:10px 12px;display:grid;gap:8px;font-size:12.5px" data-docs="${B.id}"><b>Hồ sơ đơn mua</b>
    <div class="scroll"><table class="t" style="width:auto;min-width:640px"><tbody>${R.join("")}</tbody></table></div>
    ${batchBox(B,ok)}
    <div><b>Bàn giao hồ sơ:</b> ${H.length?H.map(hRow).join(""):`<span class="muted">chưa bàn giao</span>`}</div>${wait}${form}
    <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">${B.doneAt?`<span class="pill p-ok">Hoàn tất ${time(B.doneAt)} · ${esc(who(B.doneBy))}</span>${ADM?` <button class="btn ghost" data-dso="mo-lai" data-id="${B.id}">Mở lại</button>`:""}`
      :ok&&!why.length?`<button class="btn primary" data-dso="xong" data-id="${B.id}">Hoàn tất đơn mua</button>`:why.length?`<span class="muted small">Chưa hoàn tất: ${esc(why.join("; "))}</span>`:""}</div></div>`;
}
/* ===== Hồ sơ từng đợt nhận (anh duyệt 13/11/2026) =====
   Mỗi lần Kho kiểm nhận đạt = 1 đợt (mã <số đơn>-Đn), có số đạt, ngày, người xác nhận. Phiếu giao / nhập + hoá đơn ghi theo đợt; 1 chứng từ gắn được nhiều đợt
   (NCC xuất gộp: ghi trùng số → server gắn thêm đợt vào chứng từ đã có, không tạo trùng). Ghi chứng từ KHÔNG đụng tồn kho. */
function batchBox(B,ok){
  const S0=Don.buyBatchState(B), D=B.docs||{}, T=Don.BDOC_T.filter(([k])=>!D[k]);
  const tot=(B.lines||[]).reduce((a,l)=>a+n(l.qty),0), got=(B.lines||[]).reduce((a,l)=>a+NV.lineGot(l),0), full=S0.filter(x=>!x.miss.length).length, u=((B.lines||[])[0]||{}).unit||"";
  const head=`<div style="display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center"><b>Hồ sơ từng đợt nhận</b>
      <span class="ux-hint">Nhận hàng: đạt <b>${fmt(got)}</b> / ${fmt(tot)} ${esc(u)} · ${S0.length} đợt kiểm nhận</span>
      <span class="ux-b ${!S0.length?"g":full===S0.length?"k":S0.some(x=>x.late)?"r":"o"}">Hồ sơ đợt: ${full}/${S0.length} đợt đủ chứng từ</span></div>`;
  if(!S0.length) return `<div style="display:grid;gap:6px" data-batches="${B.id}">${head}<span class="ux-hint">Chưa có đợt nào: mỗi lần Kho kiểm nhận đạt sẽ thành 1 đợt để ghi phiếu nhập, hoá đơn.</span></div>`;
  if(!T.length) return `<div data-batches="${B.id}">${head}<span class="ux-hint">Đơn này đã ghi phiếu nhập / hoá đơn chung cả đơn (cách cũ): phủ mọi đợt.</span></div>`;
  const cell=(x,k)=>{ const d=x.docs[k];
    if(d&&d.legacy) return `<span class="okc">✓</span> chung cả đơn`;
    if(d) return `${d.na?`<span class="muted">Không áp dụng</span> · ${esc(d.reason||"")}`:`<span class="okc">✓</span> số <b>${esc(d.no)}</b>${(d.batches||[]).length>1?` <span class="ux-b b" title="1 chứng từ cho ${(d.batches||[]).length} đợt (NCC xuất gộp)">gộp ${(d.batches||[]).length} đợt</span>`:""}`}<div class="muted small">${esc(who(d.by))} ${time(d.at)}</div>${ok&&!hPend(B)&&(!d.na||ADM)?`<button class="btn ghost" data-dsd="bo" data-t="${k}" data-b="${esc(x.id)}" data-id="${B.id}">Bỏ khỏi đợt</button>`:""}`;
    return ok?`<button class="btn" data-dsd="ghi" data-t="${k}" data-b="${esc(x.id)}" data-id="${B.id}">Ghi</button>${ADM?` <button class="btn ghost" data-dsd="na" data-t="${k}" data-b="${esc(x.id)}" data-id="${B.id}">Không áp dụng</button>`:""}`:`<span class="short">chưa có</span>`; };
  const stx=x=>!x.miss.length?`<span class="ux-b k">Đủ chứng từ</span>`:x.late?`<span class="ux-b r">Quá hạn ${x.late} ngày</span>`:`<span class="ux-b o">Thiếu · hạn ${x.due?dmy(x.due):"—"}</span>`;
  return `<div style="display:grid;gap:6px" data-batches="${B.id}">${head}
    <div class="scroll"><table class="t" style="min-width:900px"><thead><tr><th>Đợt</th><th>NVL · màu</th><th>Kiểm nhận đạt</th><th class="r">Số đạt</th><th>${esc(Don.BDOC_T[0][1])}</th><th>${esc(Don.BDOC_T[1][1])}</th><th>Tình trạng hồ sơ đợt</th></tr></thead><tbody>
    ${S0.map(x=>`<tr data-batch="${esc(x.id)}" class="${x.late?"ux-row-r":x.miss.length?"ux-row-o":""}"><td><b>${esc(x.code)}</b></td><td>${esc(cname(x.color))}<div class="muted small">${esc(x.item||"")}</div></td>
      <td class="small">${time(x.at)}<div class="muted">${esc(who(x.by))} xác nhận</div></td><td class="r num"><b>${fmt(x.ok)}</b> ${esc(x.unit||"")}${x.bad?`<div class="short small">lỗi ${fmt(x.bad)}</div>`:""}</td>
      <td>${cell(x,"phieu")}</td><td>${cell(x,"hd")}</td><td>${stx(x)}</td></tr>`).join("")}</tbody></table></div>
    <span class="ux-hint">Ghi chứng từ chỉ lưu hồ sơ, không đổi tồn kho. NCC xuất 1 phiếu / 1 hoá đơn cho nhiều đợt: chọn nhiều đợt khi ghi, hoặc ghi đúng số chứng từ đã có để gắn thêm đợt.</span></div>`;
}
/* Hộp ghi chứng từ đợt: loại, số (bắt buộc), ghi chú, các đợt áp dụng (đợt chưa có loại chứng từ này) */
function batchDlg(B,t,bid){
  const S0=Don.buyBatchState(B), cand=S0.filter(x=>!x.docs[t]), nm=(Don.BDOC_T.find(x=>x[0]===t)||[])[1], ex=(B.bdocs||[]).filter(x=>x.t===t&&!x.na);
  const old=document.getElementById("uxBdForm"); if(old) old.remove();
  const w=document.createElement("div"); w.className="ux-dlg"; w.id="uxBdForm";
  w.innerHTML=`<form role="dialog" aria-modal="true" aria-label="Ghi chứng từ đợt"><h3>${esc(nm)} · ${esc(B.no)}</h3>
    <label>Số chứng từ (bắt buộc)<input name="no" list="uxBdNo" autocomplete="off" placeholder="VD: PN-0123 / số hoá đơn"><datalist id="uxBdNo">${ex.map(x=>`<option value="${esc(x.no)}">`).join("")}</datalist></label>
    <div class="ux-hint" data-bdhint></div>
    <label>Ghi chú (ngày, người ký, nơi lưu…)<input name="note"></label>
    <div style="display:grid;gap:4px;font-size:12.5px"><b style="font-size:12px;color:#6b7280">Áp dụng cho đợt</b>${cand.map(x=>`<label style="display:flex;gap:8px;align-items:center;font-weight:500;color:#1f2328"><input type="checkbox" name="b" value="${esc(x.id)}"${x.id===bid?" checked":""}> ${esc(x.code)} · ${esc(cname(x.color))} · đạt ${fmt(x.ok)} · ${time(x.at)}</label>`).join("")}</div>
    <div class="err"></div><div class="acts"><button type="button" class="btn" data-x>Huỷ</button><button type="submit" class="btn primary">Ghi chứng từ</button></div></form>`;
  document.body.appendChild(w);
  const f=w.querySelector("form"), close=()=>w.remove(), hint=w.querySelector("[data-bdhint]");
  w.querySelector("[data-x]").onclick=close; w.addEventListener("click",e=>{ if(e.target===w) close(); });
  f.no.addEventListener("input",()=>{ const m=ex.find(x=>String(x.no).trim().toLowerCase()===f.no.value.trim().toLowerCase()); hint.textContent=m?`Số này đã có (đợt ${(m.batches||[]).map(b=>(S0.find(x=>x.id===b)||{}).code||b).join(", ")}): sẽ gắn thêm đợt đã chọn vào chứng từ này (NCC xuất gộp), không tạo chứng từ mới.`:""; });
  f.onsubmit=async e=>{ e.preventDefault(); const no=f.no.value.trim(), bs=[...f.querySelectorAll("[name=b]:checked")].map(x=>x.value);
    if(!no){ w.querySelector(".err").textContent="Ghi số chứng từ. Chưa có chứng từ thì chưa ghi nhận."; return; }
    if(!bs.length){ w.querySelector(".err").textContent="Chọn ít nhất 1 đợt."; return; }
    close(); await dsOp({op:"hsd", ds:B.id, type:t, no, note:f.note.value.trim(), batches:bs}); };
  setTimeout(()=>f.no.focus(),0);
}
document.addEventListener("click",async e=>{
  const b=e.target.closest("[data-dsd]"); if(!b) return; fresh(); const B=(N.buyLists||[]).find(x=>x.id===b.dataset.id); if(!B){ render(); return; }
  const a=b.dataset.dsd, t=b.dataset.t, bid=b.dataset.b, nm=(Don.BDOC_T.find(x=>x[0]===t)||[])[1], code=(Don.buyBatches(B).find(x=>x.id===bid)||{}).code||bid;
  if(a==="ghi"){ batchDlg(B,t,bid); return; }
  const reason=(prompt(`${a==="na"?"Không áp dụng":"Bỏ"} ${nm} cho đợt ${code}: ghi lý do`)||"").trim(); if(!reason) return;
  await dsOp({op:a==="na"?"hsd-na":"hsd-bo", ds:B.id, type:t, batches:[bid], reason});
});
document.addEventListener("input",e=>{ const t=e.target; if(!t.dataset||!t.dataset.bgf) return; const f=bgF[t.dataset.id]=bgF[t.dataset.id]||{}; f[t.dataset.bgf]=t.value;
  if(t.dataset.bgf==="to"){ const nm=document.querySelector(`[data-bgf="name"][data-id="${t.dataset.id}"]`); if(nm) nm.hidden=!!t.value; } });
document.addEventListener("change",e=>{ const t=e.target; if(t.dataset&&t.dataset.bgf==="to"){ const f=bgF[t.dataset.id]=bgF[t.dataset.id]||{}; f.to=t.value; const nm=document.querySelector(`[data-bgf="name"][data-id="${t.dataset.id}"]`); if(nm) nm.hidden=!!t.value; } });
document.addEventListener("click",async e=>{
  const b=e.target.closest("[data-dso]"); if(!b||b.disabled) return; const a=b.dataset.dso, id=b.dataset.id; fresh(); const B=(N.buyLists||[]).find(x=>x.id===id); if(!B){ render(); return; }
  const body={op:a, ds:id}, ask=m=>(prompt(m)||"").trim();
  if(a==="chot"){ if(!confirm(`Chốt nhu cầu mua ${B.no} · ${B.title}?\n\n${zaloText(B)}\n\nSau khi chốt, số đặt / NCC / mã NVL chỉ Admin sửa được, có lý do (hoặc trả về nháp trước khi có PO). Chốt CHƯA bàn giao: bấm Bàn giao ở bước sau.`)) return; }
  else if(a==="giao"){ if(!confirm(`Bàn giao ${B.no} · ${B.title} cho ${exName()}?\n\nTạo đúng 1 việc trong Công việc của ${exName()} (tiếp nhận hoặc trả lại), rồi mới tạo 1 PO ERP (VIKING → NCC). Không tạo thêm đơn mua.`)) return; }
  else if(a==="tra-lai"){ body.reason=ask(`Trả lại ${B.no} cho người quản lý kế hoạch: ghi lý do (bắt buộc)`); if(!body.reason) return; }
  else if(a==="thu-hoi"){ body.reason=ask(`Trả ${B.no} về nháp: ghi lý do`); if(!body.reason) return; }
  else if(a==="qlvh-bo"){ body.reason=ask(`Bỏ xác nhận QLVH ${B.no}: ghi lý do`); if(!body.reason) return; }
  else if(a==="mo-lai"){ body.reason=ask(`Mở lại ${B.no} đã hoàn tất: ghi lý do`); if(!body.reason) return; }
  else if(a==="po"){ body.po=((document.querySelector(`[data-dpo="${id}"]`)||{}).value||"").trim(); if(!body.po){ alert("Nhập mã PO ERP."); return; } if(!confirm(`Lưu mã PO ERP ${body.po} cho ${B.no}?\nMột đơn mua NVL chỉ có một PO.`)) return; }
  else if(a==="po-sua"){ body.po=ask(`Đính chính mã PO ${B.po.code} → mã đúng:`); if(!body.po) return; body.reason=ask("Lý do đính chính:"); if(!body.reason) return; }
  else if(a==="qlvh"){ const ck=document.querySelector(`[data-dqlvh="${id}"]`); if(!ck||!ck.checked){ alert("Tick xác nhận đã kiểm tra PO được QLVH ký và duyệt trên ERP."); return; } body.ack=true; }
  else if(a==="gui"){ if(!confirm(`Gửi NCC ${B.no} (PO ${B.po.code})?\n\n${zaloText(B)}\n\nTồn kho chưa tăng, chỉ tăng khi Kho kiểm nhận.`)) return; }
  else if(a==="ncc"){ body.note=ask("NCC xác nhận (ghi chú: ngày giao, số lượng NCC chốt…):"); }
  else if(a==="hs"){ const nm=(DOCS.find(d=>d[0]===b.dataset.t)||[])[1]; const sn=prompt(`${nm} · số chứng từ (bắt buộc, chưa có chứng từ thì chưa ghi nhận):`,""); if(sn===null) return; body.type=b.dataset.t; body.no=sn.trim(); if(!body.no){ alert("Ghi số chứng từ. Chưa có chứng từ thì chưa ghi nhận."); return; } body.note=ask("Ghi chú (ngày, người ký, nơi lưu…), có thể để trống:"); }
  else if(a==="hs-na"||a==="hs-bo"){ body.type=b.dataset.t; body.reason=ask((a==="hs-na"?"Không áp dụng":"Bỏ ghi nhận")+": ghi lý do"); if(!body.reason) return; }
  else if(a==="bg"){ const f=bgF[id]||{}, to=f.to||"", name=(f.name||"").trim(), ev=(f.ev||"").trim();
    if(!to&&!name){ alert("Chọn tài khoản người nhận, hoặc ghi tên người / bộ phận nhận."); return; }
    if(!to&&!ev){ alert("Người nhận chưa có tài khoản: ghi bằng chứng bàn giao (ảnh ký nhận, tin nhắn…)."); return; }
    if(!confirm(`Ghi nhận bàn giao hồ sơ ${B.no} cho ${to?Khung.userName(to):name}?\nHoàn tất khi ${to?"người nhận xác nhận bằng tài khoản của mình":"Admin kiểm tra bằng chứng và xác nhận"}.`)) return;
    body.toUser=to; body.to=name; body.evidence=ev; }
  else if(a==="bg-xn"){ const P=hPend(B); if(!P) { render(); return; } if(!confirm(P.toUser?`Xác nhận đã nhận đủ hồ sơ đơn mua ${B.no}?`:`Xác nhận bàn giao hồ sơ ${B.no} cho ${P.to} là hợp lệ (đã kiểm tra bằng chứng: ${P.evidence||"—"})?`)) return; }
  else if(a==="bg-huy"){ body.reason=ask(`Huỷ ghi nhận bàn giao ${B.no}: ghi lý do`); if(!body.reason) return; }
  else if(a==="xong"){ if(!confirm(`Hoàn tất đơn mua ${B.no}? (Đã nhận đủ NVL, đủ hồ sơ, người nhận đã xác nhận bàn giao)`)) return; }
  b.disabled=true; const r=await dsOp(body); if(a==="bg"&&r&&r.status===200) delete bgF[id];
});
/* Nguồn của 1 dòng mua: đọc đơn / kế hoạch tương lai mới nhất; kế hoạch bấm được để mở ngược về Kế hoạch */
const srcOrder = s => (((S.models||{})[s.model]||{}).orders||[]).find(o=>o.id===s.id)||null;
function srcLink(s){
  if(s.next) return "Bản nháp đợt sau "+esc(modelName(s.model).replace(/^Polo\s+/,""));
  const o=srcOrder(s);
  if(o&&o.khtl){
    if(o.closed) return `<a href="don-hang.html?id=${encodeURIComponent(o.id)}" title="Kế hoạch tương lai đã chốt thành đơn sản xuất">${esc(o.khtl.code)} → ${esc(Don.label(o))}</a>`;
    return `<a href="ke-hoach.html?m=${encodeURIComponent(s.model)}&khtl=${encodeURIComponent(o.id)}#khtl"${o.cancelled?' style="color:var(--crit)"':""} title="Mở kế hoạch tương lai">${esc(o.khtl.code)}${o.cancelled?" (đã huỷ)":""}</a>`;
  }
  return esc(o?Don.label(o):s.code)+(o&&o.cancelled?" (đã huỷ)":"");
}
/* Từ Kế hoạch: nvl.html?m=<mã>&khtl=<id> (nút "Lưu kế hoạch & Đặt mua NVL") → tạo sẵn DS nháp CHỈ cho phần thiếu của kế hoạch đó (anh duyệt 28/10).
   Mỗi loại NVL 1 DS; đã có DS nháp cùng loại (mình sửa được) thì thêm dòng vào. Nhu cầu của kế hoạch đã có trong DS nào (chưa huỷ) thì không thêm lần nữa.
   DS đã gửi NCC không bị sửa. Số đặt thực tế sửa được; Admin xác nhận gửi NCC như hiện tại. */
function prefillFromPlan(){
  const q=new URLSearchParams(location.search), oid=q.get("khtl"); if(!oid) return;
  history.replaceState(null,"",location.pathname+(q.get("m")?"?m="+encodeURIComponent(q.get("m")):""));
  fresh();
  let o=null, m=null; Object.keys(S.models||{}).forEach(k=>((S.models[k]||{}).orders||[]).forEach(x=>{ if(x.id===oid){ o=x; m=k; } }));
  const box=$("#planNote"), say=(c,h)=>{ box.innerHTML=`<div class="note" style="--nc:var(--${c});display:flex;flex-wrap:wrap;gap:8px 14px;align-items:center">${h}</div>`; box.scrollIntoView({block:"start"}); };
  if(!o||!o.khtl){ say("crit","Không tìm thấy kế hoạch tương lai này (có thể chưa lưu lên server)."); return; }
  const code=o.khtl.code, back=`<a class="btn" href="ke-hoach.html?m=${encodeURIComponent(m)}&khtl=${encodeURIComponent(oid)}#khtl">← Về kế hoạch ${esc(code)}</a>`;
  if(o.closed||o.cancelled){ say("warn",`${esc(code)} đã ${o.closed?"chốt thành đơn sản xuất":"huỷ"}: không tạo danh sách mua. ${back}`); return; }
  if(!Khung.canEdit(m)){ say("warn",`${esc(code)} thuộc mã ${esc(modelName(m))}: chỉ người phụ trách mã hoặc Admin tạo danh sách mua được. ${back}`); return; }
  const SH=NV.shortages(N,S), groups={}, skip=[], r2=v=>Math.round(v*100)/100;
  Object.values(SH.items).forEach(x=>{ const s=x.src.find(z=>z.id===oid); if(!s||s.short<=1e-9) return;
    if(s.lists.length){ /* KHTL tăng số: phần thiếu mới (trừ phần đã nằm trong DS nháp) vẫn thêm được; DS đã gửi NCC đã được trừ sẵn trong số thiếu */
      const dr=(N.buyLists||[]).filter(B=>B.status==="nhap").flatMap(B=>(B.lines||[]).filter(l=>l.item===x.it.id).flatMap(l=>(l.src||[]).filter(z=>z.id===oid))).reduce((a,z)=>a+NV.planOfSrc(z),0), more=s.short-dr;
      if(more<=1e-9){ skip.push(`${cname(x.it.color)} ${esc(x.it.name)}: đã có trong ${s.lists.map(l=>esc(l.no||l.code||"DS")+" ("+LIST_ST[l.status].toLowerCase()+")").join(", ")}`); return; }
      (groups[gkey(x.it)]=groups[gkey(x.it)]||[]).push({x,s:Object.assign({},s,{short:more,dup:true})}); return; }
    (groups[gkey(x.it)]=groups[gkey(x.it)]||[]).push({x,s}); });
  const made=[], now=Date.now(); let seq=0; N.buyLists=N.buyLists||[];
  Object.keys(groups).forEach(key=>{
    const lines=groups[key].sort((a,b)=>COLORS.indexOf(a.x.it.color)-COLORS.indexOf(b.x.it.color)).map(({x,s})=>({id:"ln"+now+"-"+(seq++), item:x.it.id, itemName:x.it.name, color:x.it.color, unit:x.unit, need:r2(s.need), short:r2(s.short), qty:Math.ceil(s.short*100-1e-9)/100,
      src:[{id:s.id, code:s.code, model:s.model, need:r2(s.need), short:r2(s.short)}], received:[], dupOk:s.dup?true:undefined}));
    const txt=lines.map(l=>`${cname(l.color)} ${fmt(l.qty)} ${l.unit}`).join(", ");
    const draft=N.buyLists.filter(B=>B.gkey===key&&B.status==="nhap"&&!lk(B)&&canList(B)).sort((a,b)=>b.createdAt-a.createdAt)[0];
    if(draft){
      lines.forEach(l=>{ const ex=(draft.lines||[]).find(y=>y.item===l.item);
        if(ex){ const more=addQty(ex,l.qty), z=(ex.src||[]).find(q=>q.id===l.src[0].id); if(z){ z.short=r2(n(z.short)+l.short); if(z.plan!==undefined&&z.plan!==null&&z.plan!=="") z.plan=r2(n(z.plan)+l.short); } else { ex.src=[...(ex.src||[]),...l.src]; ex.need=r2(n(ex.need)+l.need); } ex.short=r2(n(ex.short)+l.short); ex.qty=r2(n(ex.qty)+more); } else draft.lines.push(l); });
      draft.lines.sort((a,b)=>COLORS.indexOf(a.color)-COLORS.indexOf(b.color)); draft.models=[...new Set([...(draft.models||[]),m])];
      listLog(draft,"sua",`Thêm từ kế hoạch ${code}: ${txt}`); made.push({B:draft, add:true, txt});
    } else {
      const it0=groups[key][0].x.it, prev=N.buyLists.filter(x=>x.gkey===key&&x.code).sort((a,b)=>b.createdAt-a.createdAt)[0];
      const B={id:"ds"+now+(seq++), no:"DS-"+String(N.buyLists.length+1).padStart(4,"0"), gkey:key, title:glabel(it0), ncc:prev?prev.ncc||"":"", eta:null, models:[m], lines, status:"nhap", createdBy:ME(), createdAt:now, log:[], fromPlan:oid};
      listLog(B,"tao",`Từ kế hoạch ${code}: ${txt}`); N.buyLists.push(B); made.push({B, add:false, txt});
    }
  });
  if(made.length) saveN(true);
  made.forEach(z=>openL.add(z.B.id)); render();
  say(made.length?"ok":"accent",`<span><b>${esc(code)}</b> · ${esc(modelName(m))}. ${made.length?`Đã tạo sẵn danh sách nháp cho phần thiếu của kế hoạch này: ${made.map(z=>`<a href="#ds-${z.B.id}">${esc(z.B.no)}</a> ${z.add?"(thêm vào DS nháp đã có)":"(mới)"} ${esc(z.txt)}`).join(" · ")}. Sửa số đặt thực tế rồi chốt & giao người thực thi tạo PO ERP.`:"Không có phần thiếu nào cần thêm vào danh sách mua."}${skip.length?`<br><span class="muted">Không thêm lần nữa (nhu cầu của kế hoạch đã có trong danh sách): ${skip.join(" · ")}. Cần mua thêm thì dùng "Tạo danh sách đặt mua" bên dưới (có cảnh báo trùng).</span>`:""}</span>${back}`);
}
function renderBuy(){
  const SH=NV.shortages(N,S), groups={};
  Object.values(SH.items).forEach(x=>{ const k=gkey(x.it); (groups[k]=groups[k]||{key:k, label:glabel(x.it), unit:x.unit, rows:[]}).rows.push(x); });
  const G=Object.values(groups).filter(g=>g.rows.some(x=>x.short>1e-9||x.draft>1e-9)).sort((a,b)=>a.label.localeCompare(b.label));
  const miss=[...new Set(SH.missing.map(m=>`${m.src.next?"Bản nháp đợt sau "+modelName(m.src.model):m.src.code}: ${m.what}`))];
  const srcTxt=s=>`${srcLink(s)}${s.short>1e-9?` <b class="short">thiếu ${fmt(s.short)}</b>`:""}${s.lists.length?` <span class="muted">(${s.lists.map(l=>esc(l.no||l.code||"DS")+" "+LIST_ST[l.status].toLowerCase()).join(", ")})</span>`:""}`;
  const order=c=>COLORS.indexOf(c)<0?99:COLORS.indexOf(c);
  /* UX-2: nhiều nguồn → hiện 2 nguồn (ưu tiên nguồn đang thiếu), phần còn lại trong "+n nguồn" (đủ nguồn, không bớt) */
  const srcCompact=L=>{ if(L.length<=2) return L.map(srcTxt).join(" · "); const A=L.slice().sort((p,q)=>(q.short>1e-9?1:0)-(p.short>1e-9?1:0));
    return A.slice(0,2).map(srcTxt).join(" · ")+`<details class="srcmore"><summary>+${A.length-2} nguồn khác</summary>${A.slice(2).map(srcTxt).join("<br>")}</details>`; };
  /* UX-1: gom theo nhóm NVL (màu · số nguồn), danh sách đủ từng mục vẫn ở "Xem chi tiết" — không bớt cảnh báo nào */
  const MG={}; SH.missing.forEach(m=>{ const w=String(m.what||""), i=w.lastIndexOf(" "), t=i>0?w.slice(0,i):w, c=i>0?w.slice(i+1):"";
    const g=MG[t]=MG[t]||{t, colors:new Set(), src:new Set()}; if(c) g.colors.add(c); g.src.add(m.src.next?"Bản nháp đợt sau "+modelName(m.src.model):m.src.code); });
  const missHTML=miss.length?`<div class="note" id="missNote" style="--nc:var(--crit)">⚠ <b>Chưa đủ dữ liệu, chưa tính được</b> (không tự suy định mức) · ${Object.keys(MG).length} nhóm NVL chưa khai báo:
      <ul style="margin:4px 0 0;padding-left:18px">${Object.values(MG).map(g=>`<li data-miss-grp="${esc(g.t)}"><b>${esc(g.t)}</b> · ${g.colors.size} màu (${esc([...g.colors].join(", "))}) · ${g.src.size} nguồn</li>`).join("")}</ul>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:6px"><a class="btn primary" href="nvl.html">Khai báo ở Tồn kho NVL →</a><details><summary class="small" style="cursor:pointer">Xem chi tiết ${miss.length} mục</summary><div class="small">${esc(miss.join(" · "))}</div></details></div></div>`:"";
  $("#buyShort").innerHTML=missHTML
    +(G.length?G.map(g=>{ const mine=g.rows.some(x=>x.src.some(s=>s.short>1e-9&&Khung.canEdit(s.model)));
      return `<div class="panel"><div class="grp-h"><div class="t"><h3>${esc(g.label)}</h3><p class="muted small">Đơn vị ${esc(g.unit)} · cần theo kế hoạch (đơn đã lên + Bản nháp đợt sau), trừ phần đơn đã giữ, tồn khả dụng và hàng đã gửi NCC</p></div>
        ${mine?`<button class="btn primary" data-mklist="${esc(g.key)}">Tạo danh sách đặt mua</button>`:""}</div>
        <div class="scroll"><table class="t" style="min-width:980px"><thead><tr><th>Màu</th><th class="r">Cần theo KH</th><th class="r">Đơn đã giữ</th><th class="r">Tồn khả dụng</th><th class="r">Đã gửi NCC (chưa về)</th><th class="r">Còn thiếu</th><th class="r">Đang ở DS nháp</th><th>Nguồn</th></tr></thead><tbody>
        ${g.rows.sort((a,b)=>order(a.it.color)-order(b.it.color)).map(x=>`<tr><td><b>${esc(cname(x.it.color))}</b></td><td class="r num">${fmt(x.need)}</td><td class="r num">${x.held?fmt(x.held):"—"}</td><td class="r num">${fmt(x.free)}</td><td class="r num">${x.sup?fmt(x.sup):"—"}</td>
          <td class="r num">${x.short>1e-9?`<b class="short">${fmt(x.short)}</b>`:`<span class="okc">0</span>`}</td><td class="r num">${x.draft?fmt(x.draft):"—"}</td><td class="small">${srcCompact(x.src)}</td></tr>`).join("")}
        </tbody></table></div></div>`; }).join("")
      :`<div class="panel" style="padding:18px;text-align:center;color:var(--muted)">Không có NVL nào thiếu theo kế hoạch hiện tại.</div>`);
  /* Danh sách đặt mua: bảng tổng quan theo trạng thái, bấm 1 đơn mới mở chi tiết (anh duyệt 28/10) */
  /* ===== UX V5 (anh duyệt 13/11/2026): trạng thái nghiệp vụ ≠ cảnh báo; mọi ô chỉ số có dữ liệu bấm được và lọc đúng đơn; tìm kiếm, lọc người thực thi /
     thời gian / hạn giao; đơn cần xử lý lên trước, hoàn tất / huỷ không chiếm chỗ; tải từng phần. Không đổi nghiệp vụ, số liệu ===== */
  const ALL=(N.buyLists||[]).slice();
  const shortN=G.reduce((a,g)=>a+g.rows.filter(x=>x.short>1e-9).length,0);
  const cnt=(f)=>ALL.filter(f).length;
  const stTiles=DS_ST.map(([k,t,tone,d])=>({v:cnt(B=>dsSt(B)===k), l:t, d, tone, go:"st:"+k}));
  const wTiles=[{v:cnt(B=>!!dsLate(B)), l:"Trễ NCC", d:"quá ngày hẹn còn hiệu lực, còn hàng chưa nhận đạt", tone:"r", go:"w:tre"},
    {v:shortN, l:"Thiếu NVL", d:"dòng NVL · màu còn thiếu theo kế hoạch, chưa có đơn mua", tone:"r", go:"#thieu"},
    {v:cnt(B=>!!dsHsLate(B)), l:"Hồ sơ quá hạn", d:"đã nhận đủ NVL đạt quá 3 ngày, hồ sơ chưa hoàn tất", tone:"r", go:"w:hsqh"},
    {v:cnt(B=>Khung.vuongOpen(B.vuong).length>0), l:"Việc cần hỗ trợ", d:"vướng mắc chưa giải quyết", tone:"o", go:"w:ht"}];
  const on=DQ.w?"w:"+DQ.w:DQ.st?"st:"+DQ.st:"";
  $("#sum").innerHTML=`<div style="display:grid;gap:12px"><div class="ux-kpi-grp"><span class="h">Cảnh báo cần xử lý</span>${uxKpis(wTiles,on)}</div>
    <div class="ux-kpi-grp"><span class="h">Trạng thái đơn mua (mỗi đơn đúng 1 trạng thái)</span>${uxKpis(stTiles.filter(t=>t.go!=="st:huy"&&t.go!=="st:xong"),on)}</div>
    <div class="ux-hint">Đã xong: ${stTiles.filter(t=>t.go==="st:xong"||t.go==="st:huy").map(t=>t.v?`<button type="button" class="ux-clear" data-uxgo="${t.go}">${t.l} ${t.v}</button>`:`${t.l} 0`).join(" · ")}</div></div>`;
  const srcs=B=>[...new Map((B.lines||[]).flatMap(l=>l.src||[]).map(s=>[s.id,s])).values()];
  /* Nguồn là kế hoạch tương lai: kèm trạng thái mới nhất; đủ NVL thì nhắc quay lại Kế hoạch để chốt */
  const srcCell=B=>srcs(B).map(s=>{ const o=srcOrder(s); if(!o||!o.khtl||o.closed||o.cancelled) return srcLink(s);
    const st=NV.planState(N,S,s.model,o); return `${srcLink(s)} <span class="pill ${NV.PLAN_PILL[st]}">${NV.PLAN_STATE[st]}</span>${st==="du-chua-giu"||st==="da-giu"?` <a href="ke-hoach.html?m=${encodeURIComponent(s.model)}&khtl=${encodeURIComponent(o.id)}#khtl">Về kế hoạch để chốt →</a>`:""}`; }).join("<br>")||`<span class="pill p-info" title="Mua không theo nhu cầu kế hoạch. Hàng về là tồn khả dụng">Ngoài kế hoạch</span>`;
  const rowOf=B=>{ const tot=(B.lines||[]).reduce((a,l)=>a+n(l.qty),0), got=(B.lines||[]).reduce((a,l)=>a+NV.lineGot(l),0), left=NV.LIST_OPEN.includes(B.status)?(B.lines||[]).reduce((a,l)=>a+NV.lineLeft(l),0):0, u=((B.lines||[])[0]||{}).unit||"", on=openL.has(B.id);
    const s=dsSt(B), S0=DS_ST.find(x=>x[0]===s)||DS_ST[0], lt=dsLate(B), hq=dsHsLate(B), vo=Khung.vuongOpen(B.vuong).length;
    const warn=[lt?`<span class="ux-b r" title="Quá ngày hẹn ${lt.days} ngày, còn ${fmt(lt.qty)} chưa nhận đạt">Trễ NCC ${lt.days} ngày · còn ${fmt(lt.qty)}</span>`:"", hq?`<span class="ux-b r">Hồ sơ quá hạn ${hq} ngày</span>`:"", vo?`<span class="ux-b o">${vo} vướng mắc</span>`:""].filter(Boolean).join(" ");
    return `<tr class="ds-row${on?" on":""}${lt||hq?" ux-row-r":vo?" ux-row-o":""}" data-lopen="${B.id}"><td><button class="btn ghost" data-lopen="${B.id}" aria-expanded="${on}">${on?"▾":"▸"} ${esc(B.no)}</button>${B.po?`<div class="small muted">PO ${esc(B.po.code)}</div>`:""}</td><td>${esc(B.title)}</td><td>${esc(B.ncc||"—")}</td>
      <td><span class="ux-b ${S0[2]}">${esc(S0[1])}</span>${warn?`<div style="margin-top:3px;display:flex;flex-wrap:wrap;gap:4px">${warn}</div>`:""}</td><td class="small">${B.giao?esc(who(B.giao.user)):`<span class="muted">chưa giao</span>`}</td>
      <td class="r num">${fmt(tot)} ${esc(u)}</td><td class="r num">${got?fmt(got):"—"}</td><td class="r num">${left>1e-9?`<b>${fmt(left)}</b>`:"—"}</td><td>${dsDue(B)?dmy(dsDue(B)):"—"}</td><td class="small">${srcCell(B)}</td>
      <td class="small">${esc(who(B.createdBy))}<div class="muted">${time(B.createdAt)}</div></td></tr>
      ${on?`<tr class="ds-detail"><td colspan="11">${listCard(B)}</td></tr>`:""}`; };
  /* Lọc: trạng thái (1) + cảnh báo (1) + tìm kiếm + người thực thi + thời gian lập + hạn giao. Mặc định: đơn chưa xong, cần xử lý lên trước */
  const extra=B=>dsQ(B)&&(!DQ.ex||(DQ.ex==="-"?!B.giao:B.giao&&B.giao.user===DQ.ex))&&dsTime(B)&&dsDueF(B);
  /* V5.4 Đợt 2: bảng đơn mua giữ đúng cách lọc V5.3 (kể cả đơn nháp, để luồng lập → chốt → bàn giao → gửi NCC không đổi); tab Cần mua có thêm khu "Danh sách mua chưa chốt" */
  const base=ALL.filter(extra), inSt=B=>DQ.st?dsSt(B)===DQ.st:(DQ.w||DQ.q?true:!["xong","huy"].includes(dsSt(B))), inW=B=>!DQ.w||dsW(B,DQ.w);
  const L=base.filter(B=>(inSt(B)&&inW(B))||openL.has(B.id)).sort((a,b)=>dsPri(a)-dsPri(b)||(dsDue(a)||"9999").localeCompare(dsDue(b)||"9999")||b.createdAt-a.createdAt);
  const hid=DQ.st||DQ.w||DQ.q?0:base.filter(B=>["xong","huy"].includes(dsSt(B))).length;
  const page=L.slice(0,DQ.n), exs=[...new Map(ALL.filter(B=>B.giao).map(B=>[B.giao.user,who(B.giao.user)])).entries()];
  const chip=(k,t,n,tone,kind)=>`<button type="button" class="ux-chip ${tone==="r"?"t-r":tone==="o"?"t-o":""}${(kind==="w"?DQ.w:DQ.st)===k?" on":""}" data-dq${kind}="${k}"${!n&&(kind==="w"?DQ.w:DQ.st)!==k?" disabled":""}>${t} <span class="n">${n}</span></button>`;
  const opt=(v,cur,t)=>`<option value="${v}"${cur===v?" selected":""}>${t}</option>`;
  const bar=`<div class="ux-bar" id="dqBar" style="display:grid;gap:8px">
      <div style="display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center"><input class="ux-q" id="dqQ" type="search" value="${esc(DQ.q)}" placeholder="Tìm mã đơn, mã PO, NVL, NCC, KHTL…" aria-label="Tìm đơn mua" autocomplete="off">
        <label class="ux-hint">Người thực thi <select class="ux-sel" data-dqf="ex">${opt("",DQ.ex,"Tất cả")}${exs.map(([id,nm])=>opt(id,DQ.ex,esc(nm))).join("")}${opt("-",DQ.ex,"Chưa giao")}</select></label>
        <label class="ux-hint">Lập trong <select class="ux-sel" data-dqf="t">${opt("",DQ.t,"Mọi lúc")}${opt("7",DQ.t,"7 ngày")}${opt("30",DQ.t,"30 ngày")}${opt("90",DQ.t,"90 ngày")}</select></label>
        <label class="ux-hint">Hạn giao <select class="ux-sel" data-dqf="h">${opt("",DQ.h,"Tất cả")}${opt("qua",DQ.h,"Đã quá hạn")}${opt("3",DQ.h,"Trong 3 ngày tới")}${opt("7",DQ.h,"Trong 7 ngày tới")}${opt("none",DQ.h,"Chưa có hạn")}</select></label>
        ${DQ.st||DQ.w||DQ.q||DQ.ex||DQ.t||DQ.h?`<button type="button" class="ux-clear" data-dqclear>Bỏ lọc</button>`:""}</div>
      <div class="ux-chips"><span class="ux-hint">Cảnh báo</span>${[["tre","Trễ NCC","r"],["hsqh","Hồ sơ quá hạn","r"],["ht","Việc cần hỗ trợ","o"]].map(([k,t,tone])=>chip(k,t,base.filter(B=>inSt(B)&&dsW(B,k)).length,tone,"w")).join("")}</div>
      <div class="ux-chips"><span class="ux-hint">Trạng thái</span>${DS_ST.map(([k,t,tone])=>chip(k,t,base.filter(B=>dsSt(B)===k&&inW(B)).length,"","st")).join("")}</div></div>`;
  $("#buyLists").innerHTML=`${ADM?freeBox():""}${bar}`
    +(L.length?`<div class="ux-hint" id="dqCount">Đang hiện ${page.length} / ${L.length} đơn${DQ.st||DQ.w?` · lọc: ${[DQ.w&&({tre:"Trễ NCC",hsqh:"Hồ sơ quá hạn",ht:"Việc cần hỗ trợ"})[DQ.w],DQ.st&&(DS_ST.find(x=>x[0]===DQ.st)||[])[1]].filter(Boolean).join(" + ")}`:" · cần xử lý lên trước"}</div>
      <div class="panel"><div class="scroll"><table class="t ds-tbl" style="min-width:1180px"><thead><tr><th>Số / PO</th><th>Loại NVL</th><th>NCC</th><th>Trạng thái · cảnh báo</th><th>Thực thi</th><th class="r">Đặt</th><th class="r">Đạt kiểm nhận</th><th class="r">Còn về</th><th>Hạn giao</th><th>Kế hoạch / đơn liên quan</th><th>Lập</th></tr></thead><tbody>${page.map(rowOf).join("")}</tbody></table></div>
      ${L.length>page.length?`<div class="ux-more"><button type="button" class="btn" data-dqmore>Xem thêm ${Math.min(DQ_PAGE,L.length-page.length)} đơn</button><span>còn ${L.length-page.length} đơn</span></div>`:""}</div>`
    :`<div class="ux-empty">${ALL.length?`Không có đơn mua nào khớp bộ lọc. <button type="button" class="ux-clear" data-dqclear>Bỏ lọc</button>`:`Chưa có danh sách đặt mua. Bấm "Tạo danh sách đặt mua" ở NVL còn thiếu phía trên.`}</div>`)
    +(hid?`<div class="ux-hint">${hid} đơn đã hoàn tất / đã huỷ đang ẩn · <button type="button" class="ux-clear" data-uxgo="st:xong">Xem đơn hoàn tất</button> · <button type="button" class="ux-clear" data-uxgo="st:huy">Xem đơn đã huỷ</button></div>`:"");
  const q=$("#dqQ"); if(q&&DQ.focus){ q.focus(); try{ q.setSelectionRange(q.value.length,q.value.length); }catch(e){} DQ.focus=false; }
}
/* ===== UX V5 · Đặt mua: định nghĩa trạng thái / cảnh báo (anh chốt 13/11/2026) ===== */
const DS_ST=[["nhap","Nháp","g","chờ chốt nhu cầu"],["chua-bg","Chờ bàn giao","o","đã chốt, chưa bàn giao người thực thi"],["cho-nhan","Chờ tiếp nhận","b","đã bàn giao, người thực thi chưa nhận"],["tra-lai","Bị trả lại","o","người thực thi trả lại, chờ xử lý"],["cho-po","Chờ PO","o","đã tiếp nhận, chờ tạo PO trên ERP"],["cho-qlvh","Chờ QLVH","o","có PO, chờ QLVH ký, duyệt"],["cho-ncc","Chờ gửi NCC","b","QLVH đã duyệt, chưa gửi NCC"],
  ["dang-giao","Đang giao","b","đã gửi NCC, chưa nhận đủ"],["cho-kn","Chờ kiểm nhận","o","NCC đã giao, Kho chưa kiểm nhận"],["cho-hs","Chờ hồ sơ","o","đã nhận đủ NVL đạt, hồ sơ chưa xong"],["xong","Hoàn tất","k","đã hoàn tất"],["huy","Đã hủy","g","đã huỷ"]];
const dsPendQ=B=>NV.LIST_OPEN.includes(B.status)&&(B.lines||[]).some(l=>NV.linePend(l)>1e-9);
function dsSt(B){ const k=stOf(B).k; if(k==="dang-giao") return dsPendQ(B)?"cho-kn":"dang-giao"; if(k==="da-nhan") return "xong"; return DS_ST.some(x=>x[0]===k)?k:"dang-giao"; }
const dsDue=B=>{ const E=(B.lines||[]).filter(l=>NV.LIST_OPEN.includes(B.status)?NV.lineLeft(l)>1e-9:true).map(l=>l.eta||B.eta).filter(Boolean).sort(); return E[0]||B.eta||null; };
const dayDiff=(a,b)=>Math.round((new Date(a+"T00:00:00")-new Date(b+"T00:00:00"))/86400000);
/* Trễ NCC: hôm nay đã qua ngày hẹn còn hiệu lực (ngày về của dòng, không có thì của đơn) và vẫn còn số chưa nhận đạt · giao một phần vẫn tính phần còn lại */
const dsLate=B=>Don.buyLate(B);   // tính chung ở don.js (Tổng quan dùng cùng cách → số khớp)
/* Thời điểm Kho xác nhận nhận đủ NVL đạt = lần kiểm nhận cuối cùng */
const dsFullAt=B=>Don.buyFullAt(B);
/* Hồ sơ quá hạn: quá 3 ngày kể từ khi nhận đủ đạt mà hồ sơ chưa hoàn tất (chỉ cảnh báo vận hành) → số ngày quá */
const dsHsLate=B=>Don.buyHsLate(B);
const dsW=(B,k)=>k==="tre"?!!dsLate(B):k==="hsqh"?dsHsLate(B)>0:k==="ht"?Khung.vuongOpen(B.vuong).length>0:true;
function dsPri(B){ const s=dsSt(B); if(dsLate(B)) return 0; if(Khung.vuongOpen(B.vuong).length) return 1; if(dsHsLate(B)) return 2; return {"cho-kn":3,"tra-lai":3,"chua-bg":4,"cho-nhan":4,"cho-po":4,"cho-qlvh":4,"cho-ncc":4,"cho-hs":5,"dang-giao":6,"nhap":7,"xong":8,"huy":9}[s]??6; }
const DQ_PAGE=15, DQ={st:"", w:"", q:"", ex:(Khung.me&&Khung.me.role==="staff"&&(N.buyLists||[]).some(B=>B.giao&&B.giao.user===Khung.me.id))?Khung.me.id:"", t:"", h:"", n:DQ_PAGE, focus:false};   // V5.2: Minh Tiến mở trang thấy đơn của mình trước (bấm Bỏ lọc để xem tất cả)
/* Link từ Tổng quan: dat-mua.html?w=tre|hsqh|ht hoặc ?st=<trạng thái> → mở sẵn đúng bộ lọc */
try { const u=new URLSearchParams(location.search), w=u.get("w"), st=u.get("st"); if(["tre","hsqh","ht"].includes(w)) DQ.w=w; if(st&&DS_ST.some(x=>x[0]===st)) DQ.st=st; if(PAGE==="mua"&&(DQ.w||DQ.st)) setTimeout(()=>{ const el=document.getElementById("don-mua"); if(el) el.scrollIntoView({block:"start"}); },400); } catch(e) {}
function dsText(B){ const S2=(B.lines||[]).flatMap(l=>l.src||[]);
  return Khung.norm([B.no,B.code,B.po&&B.po.code,B.title,B.ncc,...(B.lines||[]).map(l=>[l.itemName,l.color,cname(l.color)].join(" ")),...S2.map(s=>[s.code,s.erp,s.model&&modelName(s.model)].join(" ")),...(B.models||[]).map(modelName)].join(" ")); }
const dsQ=B=>!DQ.q||Khung.norm(DQ.q).split(/\s+/).filter(Boolean).every(w=>dsText(B).includes(w));
const dsTime=B=>!DQ.t||(Date.now()-(B.createdAt||0))<=+DQ.t*86400000;
const dsDueF=B=>{ if(!DQ.h) return true; const d=dsDue(B), open=!["xong","huy"].includes(dsSt(B)); if(DQ.h==="none") return open&&!d; if(!d||!open) return false; const k=dayDiff(d,today()); return DQ.h==="qua"?k<0:k>=0&&k<=+DQ.h; };
/* Ô "việc tiếp theo" trên chi tiết đơn: trạng thái · vướng ở đâu · ai xử lý · hạn · làm gì tiếp */
function dsNext(B){
  const s=dsSt(B), S0=DS_ST.find(x=>x[0]===s)||DS_ST[0], ex=B.giao?who(B.giao.user):exName(), mg=(B.models||[]).map(m=>Khung.userName(Khung.ownerOf(m))).filter(Boolean)[0]||"Admin";
  const lt=dsLate(B), hq=dsHsLate(B), V=Khung.vuongOpen(B.vuong), miss=docsMissing(B), P=hPend(B);
  let who2="—", due="—", next="—", why=[];
  if(s==="nhap"){ who2=B.free?"Admin":mg; next="Chốt nhu cầu mua"; }
  else if(s==="chua-bg"){ who2=B.free?"Admin":mg; next=`Bàn giao ${exName()}`; }
  else if(s==="cho-nhan"){ who2=ex; next="Tiếp nhận hoặc trả lại (ghi lý do)"; }
  else if(s==="tra-lai"){ who2=B.free?"Admin":mg; next=`Xử lý lý do trả lại (${(B.giao||{}).traReason||""}) rồi bàn giao lại, hoặc trả về nháp để sửa`; }
  else if(s==="cho-po"){ who2=ex; next="Tạo PO VIKING → NCC trên ERP, nhập mã PO"; }
  else if(s==="cho-qlvh"){ who2=ex; next=`Trình QLVH ký, duyệt PO ${B.po?B.po.code:""}`; }
  else if(s==="cho-ncc"){ who2=ex; next="Gửi NCC (sao chép nội dung gửi Zalo)"; }
  else if(s==="dang-giao"){ who2=`${ex} theo dõi · Kho nhận`; due=dsDue(B)?dmy(dsDue(B)):"chưa có ngày hẹn"; next="Theo dõi NCC giao; Kho ghi NCC giao rồi kiểm nhận"; }
  else if(s==="cho-kn"){ who2="Kho"; const p=(B.lines||[]).reduce((a,l)=>a+NV.linePend(l),0); next=`Kiểm nhận ${fmt(p)} đang chờ kiểm`; due=dsDue(B)?dmy(dsDue(B)):"—"; }
  else if(s==="cho-hs"){ const bm=Don.buyBatchState(B).filter(x=>x.miss.length).sort((a,b)=>a.at-b.at)[0]; due=bm&&bm.due?`${dmy(bm.due)} (đợt ${bm.code})`:"—"; if(P){ who2=P.toUser?Khung.userName(P.toUser):"Admin xác nhận thay"; next="Xác nhận đã nhận hồ sơ (bàn giao bước 2)"; } else if(miss.length){ who2=ex; next="Ghi nhận hồ sơ còn thiếu: "+miss.join(", "); } else { who2=ex; next="Bàn giao hồ sơ (2 bước) rồi hoàn tất"; } }
  else if(s==="xong"){ next="Đã hoàn tất"; } else { next="Đã huỷ"; }
  if(lt) why.push(`NCC trễ ${lt.days} ngày, còn ${fmt(lt.qty)} chưa nhận đạt`);
  if(hq) why.push(`Hồ sơ quá hạn ${hq} ngày (${Don.buyBatchState(B).filter(x=>x.late).map(x=>x.code).join(", ")})`);
  V.forEach(v=>why.push("Vướng mắc: "+v.text));
  return `<div class="ux-next"><div><span class="k">Trạng thái hiện tại</span><span class="v"><span class="ux-b ${S0[2]}">${S0[1]}</span></span></div>
    <div><span class="k">Nguyên nhân vướng</span><span class="v ${why.length?"ux-t-r":""}">${why.length?esc(why.join(" · ")):`<span class="muted">không có</span>`}</span></div>
    <div><span class="k">Người xử lý</span><span class="v">${esc(who2)}</span></div><div><span class="k">Hạn</span><span class="v">${esc(due)}</span></div>
    <div style="grid-column:span 2"><span class="k">Việc tiếp theo</span><span class="v">${esc(next)}</span></div></div>`;
}
/* Vướng mắc của đơn mua NVL (dùng chung "Báo vướng mắc"): người thực thi / người quản lý kế hoạch / Admin báo; người quản lý kế hoạch / Admin xử lý */
function dsVuong(B){
  const L=B.vuong||[], can=!B.doneAt&&B.status!=="huy"&&(exOk(B)||isOwnL(B)), hd=ADM||isOwnL(B);
  if(!L.length&&!can) return "";
  return `<div class="panel" style="padding:10px 12px;display:grid;gap:8px" data-dsvuong="${B.id}"><div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center"><b>Vướng mắc</b><span class="ux-hint">${Khung.vuongOpen(L).length?Khung.vuongOpen(L).length+" chưa giải quyết":"không có vướng mắc đang mở"}</span>${can?`<button type="button" class="btn" data-dsvbao="${B.id}" style="margin-left:auto">+ Báo vướng mắc</button>`:""}</div>
    ${L.length?Khung.vuongList(L,hd&&!B.doneAt,` data-ds="${B.id}"`):""}</div>`;
}
document.addEventListener("click",e=>{
  if(PAGE!=="mua") return;
  const mg=e.target.closest("[data-mgnvl]"); if(mg&&window.MauGui){ const B=(N.buyLists||[]).find(x=>x.id===mg.dataset.mgnvl); if(B) MauGui.preview(MauGui.nvl(B),`${B.no} ${B.title}`,`Mẫu gửi NCC · ${B.no}`); return; }   // V5.2
  const vb=e.target.closest("[data-dsvbao]"); if(vb){ const id=vb.dataset.dsvbao, B=(N.buyLists||[]).find(x=>x.id===id); Khung.vuongForm(`Báo vướng mắc · ${B?B.no:""}`, v=>dsOp(Object.assign({op:"vuong-bao", ds:id}, v))); return; }
  const vn=e.target.closest("[data-vnhan][data-ds]"); if(vn){ dsOp({op:"vuong-nhan", ds:vn.dataset.ds, vid:vn.dataset.vnhan}); return; }
  const vx=e.target.closest("[data-vxong][data-ds]"); if(vx){ const reply=(prompt("Cách xử lý / quyết định (ghi lại cho người báo):")||"").trim(); dsOp({op:"vuong-xong", ds:vx.dataset.ds, vid:vx.dataset.vxong, reply}); return; }
  const g=e.target.closest("[data-uxgo]"); if(g){ const v=g.dataset.uxgo;
    if(v.startsWith("#")){ const el=$(v); if(el){ el.scrollIntoView({behavior:"smooth",block:"start"}); el.classList.add("ux-flash"); setTimeout(()=>el.classList.remove("ux-flash"),1300); } return; }
    const [kind,k]=v.split(":"); const was=kind==="w"?DQ.w===k:DQ.st===k;
    Object.assign(DQ,{st:"",w:"",q:"",ex:"",t:"",h:"",n:DQ_PAGE}); if(!was){ if(kind==="w") DQ.w=k; else DQ.st=k; }
    render(); const el=$("#don-mua"); if(el) el.scrollIntoView({behavior:"smooth",block:"start"}); return; }
  const c=e.target.closest("[data-dqst],[data-dqw]"); if(c&&!c.disabled){ if(c.dataset.dqst!==undefined) DQ.st=DQ.st===c.dataset.dqst?"":c.dataset.dqst; else DQ.w=DQ.w===c.dataset.dqw?"":c.dataset.dqw; DQ.n=DQ_PAGE; render(); return; }
  if(e.target.closest("[data-dqclear]")){ Object.assign(DQ,{st:"",w:"",q:"",ex:"",t:"",h:"",n:DQ_PAGE}); render(); return; }
  if(e.target.closest("[data-dqmore]")){ DQ.n+=DQ_PAGE; render(); return; }
});
document.addEventListener("change",e=>{ const f=e.target.closest&&e.target.closest("[data-dqf]"); if(!f||PAGE!=="mua") return; DQ[f.dataset.dqf]=f.value; DQ.n=DQ_PAGE; render(); });
let dqT=null;
document.addEventListener("input",e=>{ if(PAGE!=="mua"||!e.target||e.target.id!=="dqQ") return; DQ.q=e.target.value; DQ.n=DQ_PAGE; clearTimeout(dqT); dqT=setTimeout(()=>{ DQ.focus=true; render(); },200); });
/* Mua NVL trước, lập KHTL sau (anh yêu cầu 07/11/2026, chỉ Admin): đơn mua không cần kế hoạch. Gửi NCC, nhận nhiều đợt, kiểm nhận như đơn thường.
   Không tạo KHTL, không giữ cho ai; hàng đạt kiểm nhận là tồn khả dụng. KHTL lập sau có thể gắn vào để theo dõi nguồn cung. */
/* 11/11/2026 (anh duyệt): nhập nhiều màu cùng loại NVL trong 1 lần (+ Thêm màu); Mã NVL, NCC, ngày về, lý do dùng chung. Sửa lỗi dòng "Lý do mua". */
const freeD={open:false, rows:[{item:"",qty:"",spec:""}], code:"", ncc:"", eta:"", why:""};
const freeReset=()=>Object.assign(freeD,{open:false,rows:[{item:"",qty:"",spec:""}],code:"",ncc:"",eta:"",why:""});
function freeBox(){
  if(!freeD.open) return `<div><button class="btn" data-free="open" title="Mua dự trữ hoặc mua trước khi có kế hoạch">+ Tạo đơn mua ngoài kế hoạch</button></div>`;
  const L=(N.items||[]).filter(i=>NV.live(i)&&!NV.isMV(i)), G=[["vai","Vải"],["bo","Bo"],["pl","Nhãn sườn"]], first=freeD.rows[0].item&&itemOf(freeD.rows[0].item), key=first?gkey(first):"";
  const lab="display:inline-flex;align-items:center;gap:6px;white-space:nowrap";
  const sel=(r,i)=>{ const used=new Set(freeD.rows.filter((x,j)=>j!==i).map(x=>x.item)), R0=i===0?L:L.filter(x=>gkey(x)===key);
    return `<select data-fr="item" data-i="${i}"><option value="">${i===0?"Chọn NVL":"Chọn màu"}</option>${G.map(([k,t])=>{ const R=R0.filter(x=>groupOf(x)===k&&!used.has(x.id)); return R.length?`<optgroup label="${t}">${R.map(x=>`<option value="${x.id}"${x.id===r.item?" selected":""}>${esc(x.name)}</option>`).join("")}</optgroup>`:""; }).join("")}</select>`; };
  const rowH=(r,i)=>{ const it=r.item&&itemOf(r.item); return `<tr><td>${sel(r,i)}</td><td><input class="f" data-fr="spec" data-i="${i}" value="${esc(r.spec)}" style="width:160px" placeholder="${esc(it&&it.buy&&it.buy.spec||"")}"></td>
    <td class="nowrap"><input class="f n" data-fr="qty" data-i="${i}" inputmode="decimal" value="${esc(r.qty)}"> <span class="muted">${esc(it?unitOf(it):"")}</span></td>
    <td>${freeD.rows.length>1?`<button class="btn ghost" data-free="del" data-i="${i}" title="Bỏ dòng này">✕</button>`:""}</td></tr>`; };
  const more=first&&L.some(x=>gkey(x)===key&&!freeD.rows.some(r=>r.item===x.id));
  return `<div class="panel" data-free-box style="padding:12px 14px;display:grid;gap:10px"><b>Tạo đơn mua ngoài kế hoạch</b>
    <div style="font-size:12.5px"><table class="t" style="width:auto"><thead><tr><th>NVL · màu</th><th>Quy cách</th><th>Số đặt</th><th></th></tr></thead><tbody>${freeD.rows.map(rowH).join("")}</tbody></table>
      <div style="margin-top:6px">${more?`<button class="btn ghost" data-free="add">+ Thêm màu</button> <span class="muted small">Thêm màu khác cùng loại ${esc(glabel(first))} vào cùng đơn</span>`:first?`<span class="muted small">Đã chọn hết màu của loại ${esc(glabel(first))}</span>`:`<span class="muted small">Chọn NVL dòng đầu, sau đó bấm "+ Thêm màu" để nhập thêm màu cùng loại</span>`}</div></div>
    <div style="display:flex;flex-wrap:wrap;gap:8px 16px;align-items:center;font-size:12.5px">
      <label style="${lab}">NCC <input class="f" data-fd="ncc" value="${esc(freeD.ncc)}" style="width:150px"></label>
      <label style="${lab}">Ngày về dự kiến <input type="date" class="f" data-fd="eta" value="${esc(freeD.eta)}"></label>
      <label style="${lab};flex:1 1 320px">Lý do mua (bắt buộc) <input class="f" data-fd="why" value="${esc(freeD.why)}" style="flex:1;min-width:160px" placeholder="VD: mua dự trữ cho mùa sau"></label></div>
    <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center"><button class="btn primary" data-free="save">Tạo đơn nháp</button><button class="btn ghost" data-free="close">Đóng</button><span class="muted small">Tạo xong là nháp, chưa tính đang mua. Chốt & giao người thực thi tạo PO ERP như đơn thường. Hàng về không giữ cho kế hoạch nào.</span></div></div>`;
}
document.addEventListener("input",e=>{ const t=e.target; if(!t.dataset) return; if(t.dataset.fd) freeD[t.dataset.fd]=t.value; else if(t.dataset.fr&&t.dataset.fr!=="item"){ const r=freeD.rows[+t.dataset.i]; if(r) r[t.dataset.fr]=t.value; } });
document.addEventListener("change",e=>{ const t=e.target; if(t.dataset&&t.dataset.fr==="item"){ const i=+t.dataset.i, r=freeD.rows[i]; if(!r) return; r.item=t.value;
  if(i===0){ const it=itemOf(t.value), k=it?gkey(it):""; freeD.rows=freeD.rows.filter((x,j)=>j===0||!x.item||(k&&gkey(itemOf(x.item))===k)); } render(); } });
document.addEventListener("click",e=>{
  const b=e.target.closest("[data-free]"); if(!b||!ADM) return; const a=b.dataset.free;
  if(a==="open"||a==="close"){ if(a==="close") freeReset(); freeD.open=a==="open"; render(); return; }
  if(a==="add"){ freeD.rows.push({item:"",qty:"",spec:""}); render(); return; }
  if(a==="del"){ freeD.rows.splice(+b.dataset.i,1); if(!freeD.rows.length) freeD.rows.push({item:"",qty:"",spec:""}); render(); return; }
  fresh(); const why=freeD.why.trim(), R=freeD.rows.filter(r=>r.item||String(r.qty).trim());
  if(!R.length||!itemOf(R[0].item)){ alert("Chọn NVL cần mua."); return; }
  const P=[]; for(const r of R){ const it=itemOf(r.item), v=parseNum(r.qty);
    if(!it){ alert("Có dòng chưa chọn màu. Chọn màu hoặc bấm ✕ để bỏ dòng."); return; }
    if(v===null||v<=0){ alert(`Số đặt của ${it.name} phải lớn hơn 0.`); return; }
    P.push({it,v,spec:String(r.spec||"").trim()||((it.buy||{}).spec||"")}); }
  const key=gkey(P[0].it); if(P.some(p=>gkey(p.it)!==key)){ alert("Các dòng phải cùng loại NVL."); return; }
  if(!why){ alert("Bắt buộc ghi lý do mua ngoài kế hoạch."); return; }
  const now=Date.now(), txt=P.map(p=>`${p.it.name} ${fmt(p.v)} ${unitOf(p.it)}`).join(", "); N.buyLists=N.buyLists||[];
  const mk=(p,k)=>{ const l={id:"ln"+now+"f"+k, item:p.it.id, itemName:p.it.name, color:p.it.color, unit:unitOf(p.it), need:0, short:0, qty:p.v, src:[], received:[]}; if(p.spec) l.spec=p.spec; return l; };
  const draft=N.buyLists.filter(B=>B.gkey===key&&B.status==="nhap"&&!lk(B)).sort((p,q)=>q.createdAt-p.createdAt)[0];
  let B=null;
  if(draft&&confirm(`Đã có ${draft.no} (nháp) cùng loại ${draft.title}.\nThêm ${txt} vào ${draft.no}?\n\nBấm Huỷ để tạo đơn riêng.`)){
    B=draft; P.forEach((p,k)=>{ const ex=(B.lines||[]).find(l=>l.item===p.it.id); if(ex) ex.qty=Math.round((n(ex.qty)+p.v)*100)/100; else B.lines.push(mk(p,k)); });
    B.lines.sort((p,q)=>COLORS.indexOf(p.color)-COLORS.indexOf(q.color)); listLog(B,"sua",`Thêm ngoài kế hoạch: ${txt} · ${why}`);
  } else {
    const prev=N.buyLists.filter(x=>x.gkey===key&&x.code).sort((p,q)=>q.createdAt-p.createdAt)[0];
    const lines=P.map(mk).sort((p,q)=>COLORS.indexOf(p.color)-COLORS.indexOf(q.color));
    B={id:"ds"+now, no:"DS-"+String(N.buyLists.length+1).padStart(4,"0"), gkey:key, title:glabel(P[0].it), ncc:freeD.ncc.trim()||(prev?prev.ncc||"":""), eta:freeD.eta||null, models:[], lines, status:"nhap", free:true, createdBy:ME(), createdAt:now, log:[]};
    listLog(B,"tao",`Ngoài kế hoạch: ${txt} · ${why}`); N.buyLists.push(B);
  }
  saveN(true); freeReset(); openL.add(B.id); render();
  const el=document.querySelector(`[data-list="${B.id}"]`); if(el) el.scrollIntoView({block:"center"});
});
/* Chi tiết 1 danh sách đặt mua (giữ nguyên nghiệp vụ: sửa số, gửi NCC, NCC giao, kiểm nhận, lịch sử) */
function listCard(B){
  const SH=NV.shortages(N,S);
  /* Màu / nguồn còn thiếu theo loại mà danh sách nháp chưa có → nhắc ngay trên danh sách */
  const missFor=B=>Object.values(SH.items).filter(x=>gkey(x.it)===B.gkey).flatMap(x=>x.src.filter(s=>s.short>1e-9&&Khung.canEdit(s.model)&&!(B.lines||[]).some(l=>l.item===x.it.id&&(l.src||[]).some(z=>z.id===s.id))).map(s=>({x,s})));
  {
    /* Sau khi giao (anh duyệt 11/11): số đặt / NCC / mã NVL chỉ Admin sửa, có lý do (server ghi nhật ký); người thực thi chỉ cập nhật ngày về */
    const gRun=lk(B)&&!B.doneAt&&["nhap","da-gui","ncc-xac-nhan","nhan-mot-phan"].includes(B.status);
    const ed=canList(B)&&!B.doneAt&&(ADM||!lk(B)), edAdm=ADM&&["da-gui","ncc-xac-nhan"].includes(B.status), qEd=lk(B)?ADM&&gRun&&B.status!=="nhan-mot-phan":ed||edAdm, fEd=lk(B)?(exOk(B)||ADM)&&gRun:qEd, cEd=lk(B)?ADM&&gRun:fEd, open=NV.LIST_OPEN.includes(B.status);
    const tot=(B.lines||[]).reduce((a,l)=>a+n(l.qty),0), got=(B.lines||[]).reduce((a,l)=>a+NV.lineGot(l),0);
    const acts=[`<button class="btn" data-mgnvl="${B.id}" title="Xem trước mẫu gửi NCC · sao chép ảnh dán Zalo · tải PNG / PDF">Mẫu gửi NCC</button>`, `<button class="btn" data-lact="copy" data-id="${B.id}">Sao chép danh sách đặt mua</button>`];   // V5.2
    if(B.status==="nhap"&&!lk(B)&&(ADM||isOwnL(B))) acts.push(`<button class="btn primary" data-dso="chot" data-id="${B.id}" title="Chốt nhu cầu mua: khoá số đặt / NVL / NCC. Chưa bàn giao">✓ Chốt nhu cầu mua</button>`);
    if(B.status==="nhap"&&B.chot&&(!B.giao||B.giao.traAt)&&(ADM||isOwnL(B))) acts.push(`<button class="btn primary" data-dso="giao" data-id="${B.id}" title="Bàn giao người thực thi: tạo 1 việc chờ tiếp nhận">${B.giao?"Bàn giao lại":"Bàn giao"} cho ${esc(exName())}</button>`);
    if(B.status==="nhap"&&Don.buyBg(B)==="cho-nhan"&&(isEx(B)||ADM)) acts.push(`<button class="btn primary" data-dso="nhan" data-id="${B.id}">✓ Tiếp nhận</button><button class="btn" data-dso="tra-lai" data-id="${B.id}">Trả lại…</button>`);
    if(B.status==="da-gui"&&(B.giao?exOk(B):ADM)) acts.push(B.giao?`<button class="btn" data-dso="ncc" data-id="${B.id}">NCC đã xác nhận</button>`:`<button class="btn" data-lact="ncc" data-id="${B.id}">NCC đã xác nhận</button>`);
    if(!B.doneAt&&((B.status==="nhap"&&(ADM||(!lk(B)&&ed)))||(ADM&&["da-gui","ncc-xac-nhan","nhan-mot-phan"].includes(B.status)))) acts.push(`<button class="btn ghost" data-lact="huy" data-id="${B.id}">Huỷ</button>`);
    return `<div class="panel ord" data-list="${B.id}" id="ds-${B.id}"><div class="ord-h"><b>${esc(B.no)}</b><span>${esc(B.title)}</span><span class="pill ${stOf(B).p}">${esc(stOf(B).t)}</span>${open&&B.eta&&B.eta<today()&&(B.lines||[]).some(l=>NV.lineLeft(l)>1e-9)?`<span class="pill p-bad">NCC trễ hẹn</span>`:""}
        <span class="muted small">${esc(who(B.createdBy))} lập ${time(B.createdAt)} · ${esc((B.models||[]).map(modelName).join(", "))}</span></div>
      ${dsNext(B)}
      <div style="display:flex;flex-wrap:wrap;gap:8px 16px;align-items:center;font-size:12.5px">
        ${B.code?`<span class="muted small">Mã NVL (cũ): ${esc(B.code)}</span>`:""}
        <label>NCC <input class="f" data-lf="ncc" data-id="${B.id}" value="${esc(B.ncc||"")}" style="width:150px"${cEd?"":" disabled"}></label>
        <label>Ngày về dự kiến <input type="date" class="f" data-lf="eta" data-id="${B.id}" value="${B.eta||""}"${fEd?"":" disabled"}></label></div>
      ${flowBox(B)}
      <div class="scroll"><table class="t" style="min-width:1080px"><thead><tr><th>Màu</th><th class="r">Cần theo KH</th><th class="r">Thiếu lúc lập</th><th class="r">Đặt thực tế</th><th class="r">NCC đã giao</th><th class="r">Đạt kiểm nhận</th><th class="r">Lỗi</th><th class="r">Chờ kiểm</th><th class="r">Còn về</th><th>Ngày về dòng</th><th>Nguồn từng đơn</th><th></th></tr></thead><tbody>
      ${(B.lines||[]).map(l=>{ const R=NV.recOf(l); return `<tr><td><b>${esc(cname(l.color))}</b>${l.dupOk?` <span class="pill p-warn" title="Đã có danh sách khác cho cùng nhu cầu, người lập xác nhận vẫn đặt">trùng nhu cầu</span>`:""}${pbBtn(B,l)}</td><td class="r num">${fmt(l.need)}</td><td class="r num">${fmt(l.short)}</td>
        <td class="r">${qEd?`<input class="f n" data-lq="${l.id}" data-id="${B.id}" inputmode="decimal" value="${l.qty}">`:`<b class="num">${fmt(l.qty)}</b>`} <span class="muted small">${esc(l.unit)}</span></td>
        <td class="r num">${R.giao?fmt(R.giao):"—"}</td><td class="r num">${R.ok?`<b>${fmt(R.ok)}</b>`:"—"}</td><td class="r num">${R.bad?`<span class="short">${fmt(R.bad)}</span>`:"—"}</td><td class="r num">${R.pend?`<b style="color:var(--warn)">${fmt(R.pend)}</b>`:"—"}</td><td class="r num">${open?fmt(NV.lineLeft(l)):"—"}</td>
        <td>${fEd||ADM&&open?`<input type="date" class="f" data-leta="${l.id}" data-id="${B.id}" value="${l.eta||""}" title="Để trống = theo ngày về của danh sách">`:l.eta?dmy(l.eta):`<span class="muted small">theo DS</span>`}</td>
        <td class="small">${(l.src||[]).map(s=>`${srcLink(s)}: ${s.linkedAt?`dự kiến ${fmt(NV.planOfSrc(s))}`:`thiếu ${fmt(s.short)}`}`).join(" · ")||`<span class="muted">Chưa gắn kế hoạch</span>`}${l.spec?`<div class="muted">Quy cách: ${esc(l.spec)}</div>`:""}${pbSum(B,l)}</td>
        <td class="nowrap">${open&&KHO&&NV.lineLeft(l)>1e-9?`<button class="btn ghost" data-recv="${l.id}" data-id="${B.id}" title="Bước 1: ghi số NCC giao thực tế (chưa vào tồn)">NCC giao</button>`:""}${open&&KHO&&R.pend>1e-9?` <button class="btn primary" data-qc="${l.id}" data-id="${B.id}" title="Bước 2: số đạt kiểm nhận vào tồn khả dụng, số lỗi ghi riêng">Kiểm nhận</button>`:""}</td></tr>${pbRow(B,l)}`; }).join("")}
      <tr><td><b>Tổng</b></td><td></td><td></td><td class="r num"><b>${fmt(tot)}</b></td><td></td><td class="r num">${got?fmt(got):"—"}</td><td></td><td></td><td></td><td></td><td></td><td></td></tr></tbody></table></div>
      ${(()=>{ if(B.status!=="nhap"&&!open) return ""; const G=[...new Map((B.lines||[]).flatMap(l=>l.src||[]).map(s=>[s.id,s])).values()].map(s=>({s,o:srcOrder(s)})).filter(z=>z.o&&z.o.cancelled);
        return G.length?`<div class="note" style="--nc:var(--crit)">⚠ <b>Nguồn đã huỷ:</b> ${G.map(z=>`${srcLink(z.s)} (${esc(z.o.cancelled.reason||"")})`).join(" · ")}. Danh sách không tự huỷ, không tự giảm số: Admin quyết định huỷ dòng / sửa số đặt, hoặc để hàng về thành tồn chung.</div>`:""; })()}
      ${dsVuong(B)}
      ${docsBox(B)}
      ${B.status==="nhap"&&ed&&!lk(B)&&missFor(B).length?`<div class="note" style="--nc:var(--warn);display:flex;flex-wrap:wrap;gap:8px 14px;align-items:center">⚠ <span><b>Còn màu thiếu chưa có trong danh sách này:</b> ${esc(missFor(B).map(m=>`${cname(m.x.it.color)} ${fmt(m.s.short)}`).join(", "))}</span><button class="btn primary" data-mklist="${esc(B.gkey)}">Thêm vào danh sách</button></div>`:""}
      <div style="display:flex;flex-wrap:wrap;gap:8px">${acts.join("")}</div>
      ${(B.log||[]).length?`<details class="small"><summary>Lịch sử đặt mua &amp; giao nhận (${B.log.length})</summary>${B.log.slice().reverse().map(e=>`<div>${time(e.at)} · ${esc(who(e.by))} · <b>${LOG_ACT[e.act]||esc(e.act)}</b>${e.note?" · "+esc(e.note):""}</div>`).join("")}</details>`:""}
    </div>`; }
}
/* Bộ lọc trạng thái + danh sách đang mở chi tiết (chỉ là cách xem trên máy này) */
const LIST_FILTER=[
  {k:"mo", t:"Đang xử lý", ok:B=>!["huy","xong","da-nhan"].includes(stOf(B).k)},
  {k:"nhap", t:"Nháp", ok:B=>stOf(B).k==="nhap"},
  {k:"cho-po", t:"Chờ PO", ok:B=>stOf(B).k==="cho-po"},
  {k:"cho-qlvh", t:"Chờ QLVH", ok:B=>stOf(B).k==="cho-qlvh"},
  {k:"cho-ncc", t:"Chờ gửi NCC", ok:B=>stOf(B).k==="cho-ncc"},
  {k:"dang-giao", t:"Đang giao", ok:B=>stOf(B).k==="dang-giao"},
  {k:"tre", t:"NCC trễ hẹn", ok:(B,late)=>late(B)},
  {k:"cho-hs", t:"Chờ hồ sơ", ok:B=>stOf(B).k==="cho-hs"},
  {k:"xong", t:"Hoàn tất / đã nhận đủ", ok:B=>["xong","da-nhan"].includes(stOf(B).k)},
  {k:"huy", t:"Đã huỷ", ok:B=>B.status==="huy"},
  {k:"all", t:"Tất cả", ok:()=>true}
];
let listF="mo"; try { listF=localStorage.getItem("_ui_datmua_f")||"mo"; } catch(e) {}
const openL=new Set();
function openList(id, scroll){
  if(!(N.buyLists||[]).some(B=>B.id===id)) return false;
  openL.add(id); if(TAB!=="dang-mua"&&tabsFor54().some(x=>x[0]==="dang-mua")) setTab54("dang-mua"); else render();   // V5.4 Đợt 2: mở 1 đơn mua → về tab Đang mua
  const el=document.getElementById("ds-"+id); if(el&&scroll){ el.scrollIntoView({block:"start"}); el.style.outline="2px solid var(--accent)"; setTimeout(()=>{ el.style.outline=""; },5000); }
  return true;
}
document.addEventListener("click",e=>{
  const f=e.target.closest("[data-lfilt]");
  if(f){ listF=f.dataset.lfilt; try { localStorage.setItem("_ui_datmua_f",listF); } catch(err) {} render(); return; }
  const r=e.target.closest("[data-lopen]"); if(!r||e.target.closest("a,input,select")) return;
  const id=r.dataset.lopen; if(openL.has(id)) openL.delete(id); else openL.add(id); render();
});
window.addEventListener("hashchange",()=>{ const h=location.hash.slice(1); if(h.startsWith("ds-")){ if(TAB!=="dang-mua") setTab54("dang-mua"); openList(h.slice(3),true); } else if(h==="ds-nhap"||h==="thieu"||h==="don-cho"){ if(TAB!=="can-mua") setTab54("can-mua"); } else if(h==="o-xuong"){ setTab54("tai-xuong"); } else if(h==="so-ton"||h==="kho"||h==="ma-vach"){ setTab54("ton"); } });
/* Nội dung gửi NCC qua Zalo: mã NVL, tên, màu: số lượng, tổng + đơn vị */
function zaloText(B){
  const L=(B.lines||[]).filter(l=>n(l.qty)>0), u=(L[0]||{}).unit||"", tot=L.reduce((a,l)=>a+n(l.qty),0);
  return [B.po?`PO ERP: ${B.po.code}`:null, `${B.title} (ĐVT: ${u})`, "", ...L.map(l=>`${cname(l.color)}: ${fmt(n(l.qty))}${l.spec?` (${l.spec})`:""}`), "", `Tổng: ${fmt(tot)} ${u}`].filter(x=>x!==null).join("\n");
}
/* Tạo danh sách nháp từ 1 loại NVL: mỗi màu còn thiếu = 1 dòng, giữ nguồn từng đơn (chỉ nguồn thuộc mã mình phụ trách) */
document.addEventListener("click",e=>{
  const b=e.target.closest("[data-mklist]"); if(!b) return;
  fresh();
  const key=b.dataset.mklist, SH=NV.shortages(N,S), rows=Object.values(SH.items).filter(x=>gkey(x.it)===key);
  const lines=[], dup=[];
  rows.sort((a,b)=>COLORS.indexOf(a.it.color)-COLORS.indexOf(b.it.color)).forEach(x=>{
    const src=x.src.filter(s=>s.short>1e-9&&Khung.canEdit(s.model)); if(!src.length) return;
    const d=src.filter(s=>s.lists.length); d.forEach(s=>dup.push(`• ${cname(x.it.color)} · ${s.next?"Bản nháp đợt sau "+modelName(s.model):s.code}: đã có ${s.lists.map(l=>(l.no||l.code)+" ("+LIST_ST[l.status].toLowerCase()+")").join(", ")}`));
    const short=src.reduce((a,s)=>a+s.short,0);
    lines.push({id:"ln"+Date.now()+lines.length, item:x.it.id, itemName:x.it.name, color:x.it.color, unit:x.unit, need:Math.round(src.reduce((a,s)=>a+s.need,0)*100)/100, short:Math.round(short*100)/100, qty:Math.ceil(short*100-1e-9)/100,
      src:src.map(s=>({id:s.id, code:s.code, model:s.model, next:s.next||undefined, need:Math.round(s.need*100)/100, short:Math.round(s.short*100)/100})), received:[], dupOk:d.length?true:undefined});
  });
  if(!lines.length){ alert("Không còn màu nào thiếu (thuộc mã anh phụ trách) để đặt."); render(); return; }
  /* Đã có danh sách NHÁP cùng loại (mình sửa được) → thêm màu / nguồn còn thiếu vào đó, giữ nguyên số đã sửa */
  const draft=(N.buyLists||[]).filter(x=>x.gkey===key&&x.status==="nhap"&&!x.giao&&canList(x)).sort((a,b)=>b.createdAt-a.createdAt)[0];
  if(draft){
    const has=(itemId,srcId)=>(draft.lines||[]).some(l=>l.item===itemId&&(l.src||[]).some(s=>s.id===srcId));
    const add=lines.map(l=>({...l, src:l.src.filter(s=>!has(l.item,s.id))})).filter(l=>l.src.length).map(l=>{ const sh=l.src.reduce((a,s)=>a+s.short,0); return {...l, need:Math.round(l.src.reduce((a,s)=>a+s.need,0)*100)/100, short:Math.round(sh*100)/100, qty:Math.ceil(sh*100-1e-9)/100, dupOk:undefined}; });
    if(!add.length){ alert(`Các màu còn thiếu đã có trong ${draft.no} (nháp). Sửa số ở danh sách đó.`); return; }
    if(confirm(`Đã có ${draft.no} (nháp) cho ${draft.title}.\nThêm vào ${draft.no}:\n${add.map(l=>`• ${cname(l.color)}: ${fmt(l.qty)} ${l.unit}`).join("\n")}\n\n(Số đã sửa trong ${draft.no} giữ nguyên.) Bấm Huỷ để tạo danh sách riêng.`)){
      add.forEach(l=>{ const ex=(draft.lines||[]).find(x=>x.item===l.item);
        if(ex){ const more=addQty(ex,l.qty); ex.src=[...ex.src,...l.src]; ex.need=Math.round((n(ex.need)+l.need)*100)/100; ex.short=Math.round((n(ex.short)+l.short)*100)/100; ex.qty=Math.round((n(ex.qty)+more)*100)/100; }
        else draft.lines.push(l); });
      draft.lines.sort((a,b)=>COLORS.indexOf(a.color)-COLORS.indexOf(b.color));
      draft.models=[...new Set([...(draft.models||[]),...add.flatMap(l=>l.src.map(s=>s.model))])];
      listLog(draft,"sua","Thêm: "+add.map(l=>`${cname(l.color)} ${fmt(l.qty)}`).join(", "));
      saveN(true); goList54(draft.id); return;
    }
  }
  if(dup.length&&!confirm(`Cảnh báo đặt trùng: các nhu cầu sau đã có danh sách đặt mua:\n${dup.join("\n")}\n\nVẫn tạo danh sách mới cho các dòng này?`)) return;
  const it0=rows[0].it, prev=(N.buyLists||[]).filter(x=>x.gkey===key&&x.code).sort((a,b)=>b.createdAt-a.createdAt)[0];
  const now=Date.now(); N.buyLists=N.buyLists||[];
  const B={id:"ds"+now, no:"DS-"+String(N.buyLists.length+1).padStart(4,"0"), gkey:key, title:glabel(it0), ncc:prev?prev.ncc||"":"", eta:null,
    models:[...new Set(lines.flatMap(l=>l.src.map(s=>s.model)))], lines, status:"nhap", createdBy:ME(), createdAt:now, log:[]};
  listLog(B,"tao",lines.map(l=>`${cname(l.color)} ${fmt(l.qty)}`).join(", "));
  N.buyLists.push(B); saveN(true); goList54(B.id);
});
/* V5.4 Đợt 2: danh sách vừa tạo / vừa thêm → mở ngay ở tab Đang mua (như V5.3 mở ngay bên dưới) */
function goList54(id){ openL.add(id); if(TAB!=="dang-mua") setTab54("dang-mua"); else render(); const el=document.querySelector(`[data-list="${id}"]`); if(el) el.scrollIntoView({block:"center"}); }
/* Sửa số đặt / mã NVL / NCC / ngày về: ghi lịch sử trước → sau */
document.addEventListener("change",e=>{
  const t=e.target;
  if(t.dataset&&t.dataset.lq){
    const B=(N.buyLists||[]).find(x=>x.id===t.dataset.id), l=B&&(B.lines||[]).find(x=>x.id===t.dataset.lq); if(!l) return;
    if(B.giao){ const v=parseNum(t.value); if(!ADM||v===null||v<0||Math.abs(v-n(l.qty))<1e-9){ if(v===null||v<0) alert("Số đặt phải ≥ 0."); render(); return; }
      const reason=(prompt(`Sửa số đặt ${cname(l.color)}: ${fmt(n(l.qty))} → ${fmt(v)}${B.po?` (đối chiếu PO ERP ${B.po.code})`:""}.\nGhi lý do (bắt buộc, lưu nhật ký):`)||"").trim(); if(!reason){ render(); return; }
      dsOp({op:"cap-nhat", ds:B.id, field:"qty", ln:l.id, value:String(v), reason}); return; }
    if(!(canList(B)||(ADM&&["da-gui","ncc-xac-nhan"].includes(B.status)))){ render(); return; }
    const v=parseNum(t.value); if(v===null||v<0){ alert("Số đặt phải ≥ 0."); render(); return; }
    if(Math.abs(v-n(l.qty))<1e-9) return;
    listLog(B,"sua",`${cname(l.color)}: ${fmt(n(l.qty))} → ${fmt(v)}`); l.qty=v; saveN(true); render(); return;
  }
  if(t.dataset&&t.dataset.leta){   // ngày về riêng của 1 dòng (NCC giao lệch ngày): ghi lịch sử cũ → mới
    const B=(N.buyLists||[]).find(x=>x.id===t.dataset.id), l=B&&(B.lines||[]).find(x=>x.id===t.dataset.leta); if(!l) return;
    if(!(canList(B)||ADM)){ if(isEx(B)&&(l.eta||null)!==(t.value||null)) dsOp({op:"cap-nhat", ds:B.id, field:"line-eta", ln:l.id, value:t.value||""}); else render(); return; }
    const v=t.value||null; if((l.eta||null)===v) return;
    (l.etaLog=l.etaLog||[]).push({at:Date.now(), by:ME(), from:l.eta||null, to:v});
    listLog(B,"sua",`Ngày về ${cname(l.color)}: ${l.eta?dmy(l.eta):"theo DS"} → ${v?dmy(v):"theo DS"}`); if(v) l.eta=v; else delete l.eta; saveN(true); render(); return;
  }
  if(t.dataset&&t.dataset.lf){
    const B=(N.buyLists||[]).find(x=>x.id===t.dataset.id); if(!B) return;
    if(B.giao){ const f=t.dataset.lf, v=t.value.trim(); if((B[f]||"")===v){ return; }
      if(f==="eta"){ if(exOk(B)) dsOp({op:"cap-nhat", ds:B.id, field:f, value:v}); else render(); return; }
      if(!ADM){ render(); return; }
      const reason=(prompt(`Sửa ${f==="ncc"?"NCC":"Mã NVL"}: ${B[f]||"—"} → ${v||"—"}${B.po?` (đối chiếu PO ERP ${B.po.code})`:""}.\nGhi lý do (bắt buộc, lưu nhật ký):`)||"").trim(); if(!reason){ render(); return; }
      dsOp({op:"cap-nhat", ds:B.id, field:f, value:v, reason}); return; }
    if(!(canList(B)||(ADM&&["da-gui","ncc-xac-nhan"].includes(B.status)))){ if(isEx(B)&&(B[t.dataset.lf]||null)!==(t.value.trim()||null)) dsOp({op:"cap-nhat", ds:B.id, field:t.dataset.lf, value:t.value.trim()}); else render(); return; }
    const f=t.dataset.lf, v=t.value.trim()||null, lb={code:"Mã NVL",ncc:"NCC",eta:"Ngày về"}[f];
    if((B[f]||null)===v) return;
    if(f==="eta") (B.etaLog=B.etaLog||[]).push({at:Date.now(), by:ME(), from:B.eta||null, to:v});
    listLog(B,"sua",`${lb}: ${f==="eta"?(B.eta?dmy(B.eta):"—"):(B[f]||"—")} → ${f==="eta"?(v?dmy(v):"—"):(v||"—")}`); B[f]=v; saveN(true); render();
  }
});
document.addEventListener("click",e=>{
  const b=e.target.closest("[data-lact]"); if(!b) return;
  const act=b.dataset.lact;
  if(act==="copy"){ const B=(N.buyLists||[]).find(x=>x.id===b.dataset.id), txt=zaloText(B);
    navigator.clipboard.writeText(txt).then(()=>{ b.textContent="Đã chép · dán vào Zalo"; setTimeout(()=>b.textContent="Sao chép danh sách đặt mua",1800); }).catch(()=>prompt("Chép nội dung này:",txt));
    return; }
  fresh();
  const B=(N.buyLists||[]).find(x=>x.id===b.dataset.id); if(!B){ render(); return; }
  if(act==="gui"){ return;   /* 11/11/2026: gửi NCC chỉ qua bước PO ERP + QLVH (data-dso="gui") */
    if(!(B.lines||[]).some(l=>n(l.qty)>0)){ alert("Danh sách chưa có số đặt nào."); return; }
    if(!B.code&&!confirm("Danh sách chưa có Mã NVL. Vẫn xác nhận đã gửi NCC?")) return;
    if(!confirm(`Xác nhận đặt ${B.no} · ${B.title}:\n${zaloText(B)}\n\nĐánh dấu ĐÃ GỬI NCC? (Tồn kho chưa tăng, chỉ tăng khi Kho nhận hàng.)`)) return;
    B.status="da-gui"; B.sentBy=ME(); B.sentAt=Date.now(); listLog(B,"gui"); }
  else if(act==="ncc"){ if(!ADM||B.status!=="da-gui") return; const note=(prompt("NCC xác nhận (ghi chú: ngày giao, số lượng NCC chốt…):","")||"").trim(); B.status="ncc-xac-nhan"; listLog(B,"ncc",note); }
  else if(act==="huy"){ if(!(ADM||(B.status==="nhap"&&canList(B)))) return; const why=(prompt(`Huỷ ${B.no}? Ghi lý do (bắt buộc):`)||"").trim(); if(!why) return;
    B.status="huy"; listLog(B,"huy",why+(B.lines.some(l=>NV.lineGot(l))?" (phần đã nhận giữ nguyên trong tồn)":"")); }
  saveN(true); render();
});
/* Nhận hàng 2 bước (Kho / Admin, anh duyệt 26/10): ① NCC giao thực tế (ghi số, CHƯA vào tồn) → ② Kiểm nhận: số đạt vào tồn khả dụng (sổ tồn), số lỗi ghi riêng
   (NCC còn phải giao bù). Có thể kiểm ngay sau khi ghi giao, hoặc để "chờ kiểm". Không tự coi hàng đã giao là đạt. */
const listStatus = B => (B.lines||[]).every(x=>NV.lineLeft(x)<=1e-9&&NV.linePend(x)<=1e-9) ? "da-nhan" : "nhan-mot-phan";
function qcStep(B,l,it,maxQ,refId){
  const ok=parseNum(prompt(`Kiểm nhận ${B.no} · ${cname(l.color)}: đang chờ kiểm ${fmt(maxQ)} ${l.unit}.\nSố ĐẠT kiểm nhận (vào tồn khả dụng):`, String(maxQ))||"");
  if(ok===null||ok<0||ok>maxQ+1e-9){ if(ok!==null) alert(`Số đạt phải từ 0 tới ${fmt(maxQ)}.`); return false; }
  const bad=parseNum(prompt(`Số LỖI / không đạt (ghi riêng, NCC giao bù), còn lại để chờ kiểm tiếp:`, String(Math.round((maxQ-ok)*100)/100))||"0")||0;
  if(bad<0||ok+bad>maxQ+1e-9){ alert(`Đạt + lỗi không được quá ${fmt(maxQ)}.`); return false; }
  let kg=null; if(byCay(it)&&ok>0){ const kr=prompt(`Kg THỰC CÂN của ${fmt(ok)} cây đạt (để trống nếu chưa cân, bổ sung sau; không nhập số ước tính):`,""); kg=kr?parseNum(kr):null; if(kg!==null&&kg<=0){ alert("Kg thực cân phải lớn hơn 0, hoặc để trống."); return false; } }
  const note=(prompt("Ghi chú kiểm nhận (lỗi gì, số phiếu nhập…), có thể để trống:")||"").trim();
  if(!confirm(`Kiểm nhận ${it.name}: đạt ${fmt(ok)}, lỗi ${fmt(bad)} ${l.unit}.\nNHẬP KHO ${fmt(ok)} · Tồn: ${fmt(stockOf(it))} → ${fmt(stockOf(it)+ok)}`)) return false;
  const now=Date.now();
  l.received.push(Object.assign({id:"qc"+now, kind:"qc", ref:refId||null, ok, bad, at:now, by:ME(), note},kg?{kg}:{}));
  if(ok>0) NV.addStock(N, it, ok, "nhap-mua", ME(), `Kiểm nhận ${B.no}${B.po?" (PO "+B.po.code+")":B.code?" ("+B.code+")":""}${cname(l.color)} đạt ${fmt(ok)} ${l.unit}${bad?`, lỗi ${fmt(bad)}`:""}${kg?`, thực cân ${fmt(kg)} kg (ghi theo lô, không cộng vào tồn kg)`:""}${note?" · "+note:""}`, B.id);
  listLog(B,"qc",`${cname(l.color)} đạt ${fmt(ok)}${bad?`, lỗi ${fmt(bad)}`:""} ${l.unit}${kg?` · thực cân ${fmt(kg)} kg`:""}${note?" · "+note:""}`);
  return true;
}
document.addEventListener("click",e=>{
  const b=e.target.closest("[data-recv],[data-qc]"); if(!b||!KHO) return;
  fresh();
  const B=(N.buyLists||[]).find(x=>x.id===b.dataset.id), l=B&&(B.lines||[]).find(x=>x.id===(b.dataset.recv||b.dataset.qc)); if(!l||!NV.LIST_OPEN.includes(B.status)){ render(); return; }
  const it=itemOf(l.item); if(!it){ alert("Không tìm thấy NVL này trong kho."); return; }
  l.received=l.received||[];
  if(b.dataset.qc){ const p=NV.linePend(l); if(p<=1e-9) return; const ref=[...l.received].reverse().find(r=>r.kind==="giao");
    if(qcStep(B,l,it,p,ref&&ref.id)){ B.status=listStatus(B); saveN(true); } render(); return; }
  const left=NV.lineLeft(l), v=parseNum(prompt(`Bước 1 · NCC giao ${B.no} · ${B.title} · ${cname(l.color)}\nĐặt ${fmt(n(l.qty))}, còn về ${fmt(left)} ${l.unit}. Số NCC giao thực tế (${l.unit}), CHƯA vào tồn:`, String(left))||"");
  if(!(v>0)) return;
  if(v>left+1e-9&&!confirm(`NCC giao ${fmt(v)} nhiều hơn số còn về ${fmt(left)}. Vẫn ghi?`)) return;
  const note=(prompt("Ghi chú giao hàng (số phiếu giao, xe…), có thể để trống:")||"").trim();
  const now=Date.now(), id="rc"+now;
  l.received.push({id, kind:"giao", qty:v, at:now, by:ME(), note});
  listLog(B,"nhan",`NCC giao ${cname(l.color)} ${fmt(v)} ${l.unit} (chờ kiểm)${note?" · "+note:""}`);
  B.status=listStatus(B);
  if(confirm(`Đã ghi NCC giao ${fmt(v)} ${l.unit}, đang chờ kiểm (chưa vào tồn).\n\nKiểm nhận luôn bây giờ?`)) qcStep(B,l,it,v,id);
  B.status=listStatus(B);
  saveN(true); render();
});

document.addEventListener("click",e=>{
  const a=e.target.closest("[data-adj]"); if(a&&KHO){ adjOpen=adjOpen===a.dataset.adj?null:a.dataset.adj; render(); const el=document.querySelector(`[data-adjrow] [data-a="val"]`); if(el) el.focus(); return; }
  if(e.target.closest("[data-adjclose]")){ adjOpen=null; render(); return; }
  const s=e.target.closest("[data-adjsave]");
  if(s&&KHO){
    const row=s.closest("tr"), fld=row.querySelector(`[data-a="field"]`).value, v=parseNum(row.querySelector(`[data-a="val"]`).value), why=row.querySelector(`[data-a="why"]`).value.trim();
    if(v===null||v<0){ alert("Nhập số tồn thực tế (≥ 0)."); return; }
    if(!why){ alert("Bắt buộc ghi lý do điều chỉnh."); return; }
    fresh();
    const it=itemOf(s.dataset.adjsave); if(!it) return;
    const before=n(it[fld]); if(Math.abs(before-v)<1e-9){ alert("Số mới bằng số đang có, không cần điều chỉnh."); return; }
    if(!confirm(`Điều chỉnh tồn ${it.name}${fld==="stockCay"?" (cây)":""}: ${fmt(before)} → ${fmt(v)}\nLý do: ${why}`)) return;
    NV.stockChange(N, it, fld, v, "dieu-chinh", ME(), why, null);
    adjOpen=null; saveN(true); render(); return;
  }
  const r=e.target.closest("[data-rep]");
  if(r){
    const it=itemOf(r.dataset.rep), note=(prompt(`Báo sai lệch tồn ${it.name} (đang ghi ${fmt(stockOf(it))} ${unitOf(it)}).\nMô tả (số thực tế anh thấy, ở đâu…):`)||"").trim(); if(!note) return;
    fresh(); (N.stockReports=N.stockReports||[]).push({id:"sr"+Date.now(), item:it.id, itemName:it.name, note, by:ME(), at:Date.now(), status:"mo"});
    saveN(true); render(); alert("Đã báo Kho / Admin."); return;
  }
  const d=e.target.closest("[data-repdone]");
  if(d&&KHO){
    fresh(); const x=(N.stockReports||[]).find(y=>y.id===d.dataset.repdone); if(!x||x.status!=="mo") return;
    const res=(prompt("Kết quả xử lý (VD: đã kiểm, điều chỉnh 498 → 480; số đúng, không đổi):")||"").trim(); if(!res) return;
    x.status="xong"; x.doneBy=ME(); x.doneAt=Date.now(); x.result=res; saveN(true); render();
  }
});
window.addEventListener("db-reject",e=>{ alert(e.detail.error+"\n\nBấm \"Lấy lại bản trong thư mục\" ở dải cảnh báo để tải số mới nhất."); });
/* Xưởng trả NVL dư về kho */
document.addEventListener("click",e=>{
  const b=e.target.closest("[data-ret]"); if(!b||!KHO) return;
  fresh();
  const [x,id]=b.dataset.ret.split("|"), it=itemOf(id), have=NV.factoryBal(S,N)[x+"|"+id]||0;
  const v=parseFloat(String(prompt(`${XUONG[x]} trả bao nhiêu ${unitOf(it)} ${it.name}? (đang ở xưởng ${fmt(have)})`, fmt(have).replace(/\./g,"").replace(",","."))||"").replace(",","."));
  if(!(v>0)) return;
  const note=(prompt("Ghi chú (biên bản, người giao…), có thể để trống:")||"").trim();
  (N.returns=N.returns||[]).push({xuong:x, item:id, qty:v, date:NV.iso(Date.now()), by:ME(), note});
  NV.addStock(N, it, v, "tra-xuong", ME(), `${XUONG[x]} trả về ${fmt(v)} ${unitOf(it)}${note?" · "+note:""}`, x);
  /* phần trả về không còn ở xưởng → số đã xác nhận không vượt số còn lại */
  const ok=(N.factoryOk||{})[x+"|"+id]; if(ok) ok.qty=Math.max(0,Math.min(n(ok.qty), have-v));
  saveN(true); render();
});
document.addEventListener("click",e=>{
  const a=e.target.closest("[data-add]"); if(!a) return;
  const g=GROUPS.find(x=>x.id===a.dataset.add), id="i"+Date.now();
  const it={id, stock:null, ...g.add, grp:g.id};
  const mine=N.items.filter(x=>groupOf(x)===g.id);
  if(g.id==="vai"){   // tự chọn màu chưa có cho loại vải đầu tiên
    it.kind=N.kinds.vai[0];
    it.color=COLORS.find(c=>!mine.some(x=>x.kind===it.kind&&x.color===c))||COLORS[0];
  } else {            // tự chọn loại chưa có trong nhóm
    it.type=N.kinds[g.id].find(k=>!mine.some(x=>x.type===k&&x.model===it.model))||N.kinds[g.id][0];
  }
  N.items.push(it); tidy(); saveN();
  UX.mode="nvl"; UX.open.add("g:"+gkey(it)); UX.st="all"; UX.q=""; const q=$("#nvlQ"); if(q) q.value=""; uxSave();   // UX V5: mở đúng nhóm vừa thêm
  render();
  const el=document.querySelector(`[data-id="${id}"] [data-f="kind"],[data-id="${id}"] [data-f="stock"]`); if(el){ el.focus(); el.scrollIntoView({block:"center"}); }
});
window.addEventListener("storage",e=>{ if(e.key===KEY) render(); if(e.key===NKEY){ loadN(); render(); } });

/* Khung */
$("#menuBtn").addEventListener("click",e=>{ e.stopPropagation(); document.body.classList.toggle("nav-open"); });
document.addEventListener("click",e=>{ if(document.body.classList.contains("nav-open") && (!e.target.closest(".side") || e.target.closest(".sub a"))) document.body.classList.remove("nav-open"); });
const subs=[...document.querySelectorAll(".sub a")];
const io=new IntersectionObserver(es=>es.forEach(en=>{ if(en.isIntersecting) subs.forEach(a=>a.classList.toggle("on",a.getAttribute("href")==="#"+en.target.id)); }),{rootMargin:"-25% 0px -65% 0px"});
subs.forEach(a=>{ const el=document.querySelector(a.getAttribute("href")); if(el) io.observe(el); });

Khung.onFilter(()=>render());
render();
saveN();
if(PAGE==="mua"){
  prefillFromPlan();
  /* Link từ Chi tiết đơn / Kế hoạch: dat-mua.html#ds-<mã danh sách> → mở thẳng chi tiết danh sách đặt mua đó */
  const h=location.hash.slice(1); if(h.startsWith("ds-")) openList(h.slice(3),true);
}
