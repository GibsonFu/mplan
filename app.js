// ---------- 共用工具 ----------
const $ = (id) => document.getElementById(id);
const pad2 = (n) => String(n).padStart(2, "0");

// ---------- Firebase 初始化（使用 compat 版 SDK，才能用瀏覽器直接雙擊 index.html 打開） ----------
const cfg = window.FIREBASE_CONFIG || {};
const firebaseConfigured = !!cfg.apiKey && cfg.apiKey !== "請填入";
if (!firebaseConfigured) {
  document.getElementById("configWarning").classList.remove("hidden");
}
const firebaseApp = firebaseConfigured ? firebase.initializeApp(cfg) : null;
const auth = firebaseConfigured ? firebase.auth() : null;
const db = firebaseConfigured ? firebase.firestore() : null;

async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const ADMIN_CODE = "處長";
const repNameByCode = Object.fromEntries(window.REPS.map((r) => [r.code, r.name]));
const S_CODES = window.REPS.map((r) => "S" + r.code.slice(2));

function customersFor(repCode) {
  return window.CUSTOMERS.filter((c) => c.repCode === repCode);
}
function findCustomer(repCode, custCode) {
  return window.CUSTOMERS.find((c) => c.repCode === repCode && c.code === custCode);
}

// ---------- 狀態 ----------
let session = JSON.parse(localStorage.getItem("mvp_session") || "null");
let unsubscribeVisits = null;
let currentVisits = [];
const now = new Date();
let currentYear = now.getFullYear();
let currentMonth = now.getMonth() + 2; // 預設帶下個月
if (currentMonth > 12) {
  currentMonth = 1;
  currentYear += 1;
}

// ==================================================================
// 登入畫面初始化
// ==================================================================
function fillLoginOptions() {
  const sel = $("loginCode");
  sel.innerHTML = "";
  for (const r of window.REPS) {
    const opt = document.createElement("option");
    opt.value = r.code;
    opt.textContent = `${r.code} ${r.name}`;
    sel.appendChild(opt);
  }
  const adminOpt = document.createElement("option");
  adminOpt.value = ADMIN_CODE;
  adminOpt.textContent = "處長（管理員）";
  sel.appendChild(adminOpt);
}

async function checkNeedsSeed() {
  const snap = await db.collection("accounts").get();
  $("seedBox").classList.toggle("hidden", !snap.empty);
  return snap.empty;
}

$("seedBtn").addEventListener("click", async () => {
  $("seedBtn").disabled = true;
  $("seedMsg").textContent = "初始化中...";
  $("seedMsg").className = "msg";
  try {
    const batch = db.batch();
    for (const r of window.REPS) {
      const hash = await sha256("0000");
      batch.set(db.collection("accounts").doc(r.code), {
        code: r.code, name: r.name, role: "rep", passwordHash: hash,
      });
    }
    const adminHash = await sha256("admin2026");
    batch.set(db.collection("accounts").doc(ADMIN_CODE), {
      code: ADMIN_CODE, name: "處長", role: "admin", passwordHash: adminHash,
    });
    await batch.commit();
    $("seedMsg").textContent = "初始化完成，請登入。";
    $("seedMsg").className = "msg ok";
    $("seedBox").classList.add("hidden");
  } catch (e) {
    $("seedMsg").textContent = "初始化失敗：" + e.message;
    $("seedMsg").className = "msg error";
    $("seedBtn").disabled = false;
  }
});

$("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("loginMsg").textContent = "";
  if (!firebaseConfigured) {
    $("loginMsg").textContent = "尚未設定 Firebase，請先完成 SETUP.md 的設定步驟。";
    $("loginMsg").className = "msg error";
    return;
  }
  const code = $("loginCode").value;
  const pw = $("loginPassword").value;
  try {
    const snap = await db.collection("accounts").doc(code).get();
    if (!snap.exists) {
      $("loginMsg").textContent = "帳號不存在，請先初始化系統帳號。";
      $("loginMsg").className = "msg error";
      return;
    }
    const data = snap.data();
    const hash = await sha256(pw);
    if (hash !== data.passwordHash) {
      $("loginMsg").textContent = "密碼錯誤";
      $("loginMsg").className = "msg error";
      return;
    }
    session = { code: data.code, name: data.name, role: data.role };
    localStorage.setItem("mvp_session", JSON.stringify(session));
    enterApp();
  } catch (e) {
    $("loginMsg").textContent = "登入失敗：" + e.message;
    $("loginMsg").className = "msg error";
  }
});

// ==================================================================
// 進入主畫面
// ==================================================================
function fillYearMonthSelects() {
  const ySel = $("yearSelect");
  ySel.innerHTML = "";
  for (let y = now.getFullYear() - 1; y <= now.getFullYear() + 1; y++) {
    const opt = document.createElement("option");
    opt.value = y; opt.textContent = y + " 年";
    if (y === currentYear) opt.selected = true;
    ySel.appendChild(opt);
  }
  const mSel = $("monthSelect");
  mSel.innerHTML = "";
  for (let m = 1; m <= 12; m++) {
    const opt = document.createElement("option");
    opt.value = m; opt.textContent = m + " 月";
    if (m === currentMonth) opt.selected = true;
    mSel.appendChild(opt);
  }
}

function fillRepFilter() {
  const sel = $("repFilter");
  sel.innerHTML = "";
  const allOpt = document.createElement("option");
  allOpt.value = "ALL"; allOpt.textContent = "全部代表";
  sel.appendChild(allOpt);
  for (const r of window.REPS) {
    const opt = document.createElement("option");
    opt.value = r.code; opt.textContent = `${r.code} ${r.name}`;
    sel.appendChild(opt);
  }
}

function enterApp() {
  $("loginScreen").classList.add("hidden");
  $("appScreen").classList.remove("hidden");
  $("whoami").textContent = `${session.name}（${session.code}）`;
  fillYearMonthSelects();
  if (session.role === "admin") {
    $("adminBar").classList.remove("hidden");
    fillRepFilter();
  } else {
    $("adminBar").classList.add("hidden");
  }
  subscribeVisits();
}

function logout() {
  session = null;
  localStorage.removeItem("mvp_session");
  if (unsubscribeVisits) unsubscribeVisits();
  $("appScreen").classList.add("hidden");
  $("loginScreen").classList.remove("hidden");
  $("loginForm").reset();
}
$("logoutBtn").addEventListener("click", logout);

$("yearSelect").addEventListener("change", () => {
  currentYear = Number($("yearSelect").value);
  subscribeVisits();
});
$("monthSelect").addEventListener("change", () => {
  currentMonth = Number($("monthSelect").value);
  subscribeVisits();
});
$("repFilter") && $("repFilter").addEventListener("change", () => {
  subscribeVisits();
});

// ==================================================================
// 拜訪資料訂閱 / 表格渲染
// ==================================================================
function activeRepFilterCode() {
  if (session.role !== "admin") return session.code;
  return $("repFilter").value || "ALL";
}

function subscribeVisits() {
  if (unsubscribeVisits) unsubscribeVisits();
  let q = db.collection("visits").where("year", "==", currentYear).where("month", "==", currentMonth);
  const repCode = activeRepFilterCode();
  if (repCode !== "ALL") q = q.where("repCode", "==", repCode);
  unsubscribeVisits = q.onSnapshot((snap) => {
    currentVisits = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    currentVisits.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    renderTable();
    if (!$("reportTab").classList.contains("hidden")) renderReport();
  }, (err) => {
    $("emptyMsg").textContent = "讀取失敗：" + err.message;
    $("emptyMsg").classList.remove("hidden");
  });
}

function renderTable() {
  const showRepCol = session.role === "admin" && activeRepFilterCode() === "ALL";
  const head = $("visitTableHead");
  head.innerHTML = "";
  const cols = ["日期", "醫院/客戶", "醫師/聯絡人", "科別 / 職稱", "分級", "產品分類", "產品", "拜訪分類"];
  if (showRepCol) cols.splice(1, 0, "代表");
  cols.push("");
  for (const c of cols) {
    const th = document.createElement("th");
    th.textContent = c;
    head.appendChild(th);
  }

  const body = $("visitTableBody");
  body.innerHTML = "";
  $("emptyMsg").classList.toggle("hidden", currentVisits.length > 0);

  for (const v of currentVisits) {
    body.appendChild(buildVisitRow(v, showRepCol));
  }

  $("summaryLine").textContent = `共 ${currentVisits.length} 筆拜訪紀錄`;
}

// ---------- 表格內可直接拉選修改的欄位 ----------
function rowBuildHospitalOptions(sel, repCode) {
  sel.innerHTML = "";
  for (const c of customersFor(repCode)) {
    const opt = document.createElement("option");
    opt.value = c.code; opt.textContent = c.name;
    sel.appendChild(opt);
  }
  const ebGroup = document.createElement("optgroup");
  ebGroup.label = "其他";
  const ebOpt = document.createElement("option");
  ebOpt.value = "EB"; ebOpt.textContent = "EB";
  ebGroup.appendChild(ebOpt);
  sel.appendChild(ebGroup);
}

function rowBuildDoctorOptions(sel, repCode, custCode) {
  sel.innerHTML = "";
  if (custCode === "EB") {
    for (const s of S_CODES) {
      const opt = document.createElement("option");
      opt.value = s; opt.textContent = s;
      sel.appendChild(opt);
    }
    return;
  }
  const cust = findCustomer(repCode, custCode);
  const contacts = cust ? cust.contacts : [];
  if (contacts.length === 0) {
    const opt = document.createElement("option");
    opt.value = ""; opt.textContent = "（無聯絡人資料）";
    sel.appendChild(opt);
    return;
  }
  for (const c of contacts) {
    const opt = document.createElement("option");
    opt.value = c.name;
    opt.textContent = `${c.name}（${c.dept} / ${c.title}）`;
    opt.dataset.dept = c.dept;
    opt.dataset.title = c.title;
    opt.dataset.level = c.level;
    sel.appendChild(opt);
  }
}

function rowBuildCategoryOptions(sel) {
  sel.innerHTML = "";
  for (const c of window.PRODUCT_CATEGORIES) {
    const opt = document.createElement("option");
    opt.value = c; opt.textContent = c;
    sel.appendChild(opt);
  }
}

function rowBuildProductOptions(sel, category) {
  sel.innerHTML = "";
  for (const p of window.PRODUCTS.filter((p) => p.category === category)) {
    const opt = document.createElement("option");
    opt.value = p.name; opt.textContent = p.name;
    sel.appendChild(opt);
  }
}

function rowBuildVisitTypeOptions(sel) {
  sel.innerHTML = "";
  for (const t of window.VISIT_TYPES) {
    const opt = document.createElement("option");
    opt.value = t; opt.textContent = t;
    sel.appendChild(opt);
  }
}

function buildVisitRow(v, showRepCol) {
  const tr = document.createElement("tr");

  function addCell(content) {
    const td = document.createElement("td");
    if (content instanceof Node) td.appendChild(content);
    else td.textContent = content;
    tr.appendChild(td);
    return td;
  }

  async function persist(patch) {
    try {
      await db.collection("visits").doc(v.id).update(patch);
    } catch (err) {
      alert("更新失敗：" + err.message);
    }
  }

  if (showRepCol) addCell(`${v.repCode} ${v.repName}`);
  addCell(v.date);

  const hospitalSel = document.createElement("select");
  rowBuildHospitalOptions(hospitalSel, v.repCode);
  hospitalSel.value = v.customerCode;
  addCell(hospitalSel);

  const doctorSel = document.createElement("select");
  rowBuildDoctorOptions(doctorSel, v.repCode, hospitalSel.value);
  doctorSel.value = v.contactName;
  addCell(doctorSel);

  const deptTitleTd = addCell(`${v.contactDept || ""} / ${v.contactTitle || ""}`);
  const levelTd = addCell(v.contactLevel || "");

  const categorySel = document.createElement("select");
  rowBuildCategoryOptions(categorySel);
  categorySel.value = v.productCategory;
  addCell(categorySel);

  const productSel = document.createElement("select");
  rowBuildProductOptions(productSel, categorySel.value);
  productSel.value = v.productName;
  addCell(productSel);

  const visitTypeSel = document.createElement("select");
  rowBuildVisitTypeOptions(visitTypeSel);
  visitTypeSel.value = v.visitType;
  addCell(visitTypeSel);

  if (NO_PRODUCT_VISIT_TYPES.includes(visitTypeSel.value)) {
    categorySel.innerHTML = "";
    productSel.innerHTML = "";
    categorySel.disabled = true;
    productSel.disabled = true;
  }

  hospitalSel.addEventListener("change", () => {
    const custCode = hospitalSel.value;
    rowBuildDoctorOptions(doctorSel, v.repCode, custCode);
    const opt = doctorSel.options[0];
    const cust = findCustomer(v.repCode, custCode);
    const patch = {
      customerCode: custCode,
      customerName: custCode === "EB" ? "EB" : cust ? cust.name : "",
      contactName: opt ? opt.value : "",
      contactDept: opt ? opt.dataset.dept || "" : "",
      contactTitle: opt ? opt.dataset.title || "" : "",
      contactLevel: opt ? opt.dataset.level || "" : "",
    };
    deptTitleTd.textContent = `${patch.contactDept} / ${patch.contactTitle}`;
    levelTd.textContent = patch.contactLevel;
    persist(patch);
  });

  doctorSel.addEventListener("change", () => {
    const opt = doctorSel.options[doctorSel.selectedIndex];
    const patch = {
      contactName: opt ? opt.value : "",
      contactDept: opt ? opt.dataset.dept || "" : "",
      contactTitle: opt ? opt.dataset.title || "" : "",
      contactLevel: opt ? opt.dataset.level || "" : "",
    };
    deptTitleTd.textContent = `${patch.contactDept} / ${patch.contactTitle}`;
    levelTd.textContent = patch.contactLevel;
    persist(patch);
  });

  categorySel.addEventListener("change", () => {
    rowBuildProductOptions(productSel, categorySel.value);
    persist({ productCategory: categorySel.value, productName: productSel.value });
  });

  productSel.addEventListener("change", () => {
    persist({ productName: productSel.value });
  });

  visitTypeSel.addEventListener("change", () => {
    const noProduct = NO_PRODUCT_VISIT_TYPES.includes(visitTypeSel.value);
    categorySel.disabled = noProduct;
    productSel.disabled = noProduct;
    if (noProduct) {
      categorySel.innerHTML = "";
      productSel.innerHTML = "";
    } else if (categorySel.options.length === 0) {
      rowBuildCategoryOptions(categorySel);
      rowBuildProductOptions(productSel, categorySel.value);
    }
    const patch = { visitType: visitTypeSel.value };
    if (noProduct) {
      patch.productCategory = "";
      patch.productName = "";
    } else {
      patch.productCategory = categorySel.value;
      patch.productName = productSel.value;
    }
    persist(patch);
  });

  const tdDel = document.createElement("td");
  const delBtn = document.createElement("button");
  delBtn.className = "row-del";
  delBtn.textContent = "刪除";
  delBtn.addEventListener("click", () => deleteVisit(v.id));
  tdDel.appendChild(delBtn);
  tr.appendChild(tdDel);

  return tr;
}

async function deleteVisit(id) {
  if (!confirm("確定要刪除這筆拜訪紀錄嗎？")) return;
  await db.collection("visits").doc(id).delete();
}

// ==================================================================
// Tabs (admin: 拜訪清單 / 分析報表)
// ==================================================================
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    const tab = btn.dataset.tab;
    $("listTab").classList.toggle("hidden", tab !== "list");
    $("reportTab").classList.toggle("hidden", tab !== "report");
    if (tab === "report") renderReport();
  });
});

function barRows(counts, total) {
  const max = Math.max(1, ...Object.values(counts));
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return entries.map(([label, count]) => `
    <div class="bar-row">
      <div class="bar-label">${label}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${(count / max) * 100}%"></div></div>
      <div class="bar-count">${count}</div>
    </div>
  `).join("");
}

function renderReport() {
  const el = $("reportContent");
  const total = currentVisits.length;
  const byRep = {}, byType = {}, byCategory = {}, byCustomer = {};
  for (const v of currentVisits) {
    const repLabel = `${v.repCode} ${v.repName}`;
    byRep[repLabel] = (byRep[repLabel] || 0) + 1;
    byType[v.visitType] = (byType[v.visitType] || 0) + 1;
    byCategory[v.productCategory] = (byCategory[v.productCategory] || 0) + 1;
    byCustomer[v.customerName] = (byCustomer[v.customerName] || 0) + 1;
  }
  const topCustomers = Object.fromEntries(
    Object.entries(byCustomer).sort((a, b) => b[1] - a[1]).slice(0, 10)
  );

  let html = `<div class="report-block"><h3>${currentYear} 年 ${currentMonth} 月　總拜訪次數：${total}</h3></div>`;

  if (activeRepFilterCode() === "ALL") {
    html += `<div class="report-block"><h3>依代表統計</h3>${total ? barRows(byRep) : "<p>本月無資料</p>"}</div>`;
  }
  html += `<div class="report-block"><h3>依拜訪分類統計</h3>${total ? barRows(byType) : "<p>本月無資料</p>"}</div>`;
  html += `<div class="report-block"><h3>依產品分類統計</h3>${total ? barRows(byCategory) : "<p>本月無資料</p>"}</div>`;
  html += `<div class="report-block"><h3>拜訪次數前10大醫院/客戶</h3>${total ? barRows(topCustomers) : "<p>本月無資料</p>"}</div>`;

  el.innerHTML = html;
}

// ==================================================================
// 新增拜訪 Modal
// ==================================================================
function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function currentModalRepCode() {
  if (session.role === "admin") return $("visitRepPick").value;
  return session.code;
}

function populateHospitalSelect() {
  const repCode = currentModalRepCode();
  const sel = $("visitHospital");
  sel.innerHTML = "";
  for (const c of customersFor(repCode)) {
    const opt = document.createElement("option");
    opt.value = c.code;
    opt.textContent = c.name;
    sel.appendChild(opt);
  }
  const ebGroup = document.createElement("optgroup");
  ebGroup.label = "其他";
  const ebOpt = document.createElement("option");
  ebOpt.value = "EB";
  ebOpt.textContent = "EB";
  ebGroup.appendChild(ebOpt);
  sel.appendChild(ebGroup);
  populateDoctorSelect();
}

function populateDoctorSelect() {
  const repCode = currentModalRepCode();
  const custCode = $("visitHospital").value;
  const sel = $("visitDoctor");
  sel.innerHTML = "";

  if (custCode === "EB") {
    for (const s of S_CODES) {
      const opt = document.createElement("option");
      opt.value = s; opt.textContent = s;
      sel.appendChild(opt);
    }
    return;
  }

  const cust = findCustomer(repCode, custCode);
  const contacts = cust ? cust.contacts : [];
  if (contacts.length === 0) {
    const opt = document.createElement("option");
    opt.value = ""; opt.textContent = "（無聯絡人資料）";
    sel.appendChild(opt);
    return;
  }
  for (const c of contacts) {
    const opt = document.createElement("option");
    opt.value = c.name;
    opt.textContent = `${c.name}（${c.dept} / ${c.title}）`;
    opt.dataset.dept = c.dept;
    opt.dataset.title = c.title;
    opt.dataset.level = c.level;
    sel.appendChild(opt);
  }
}

const WEEKDAY_LABELS = ["日", "一", "二", "三", "四", "五", "六"];
let modalYear = currentYear;
let modalMonth = currentMonth;

function populateModalMonthSelects() {
  modalYear = currentYear;
  modalMonth = currentMonth;
  const ySel = $("visitYear");
  ySel.innerHTML = "";
  for (let y = now.getFullYear() - 1; y <= now.getFullYear() + 1; y++) {
    const opt = document.createElement("option");
    opt.value = y; opt.textContent = y + " 年";
    if (y === modalYear) opt.selected = true;
    ySel.appendChild(opt);
  }
  const mSel = $("visitMonth");
  mSel.innerHTML = "";
  for (let m = 1; m <= 12; m++) {
    const opt = document.createElement("option");
    opt.value = m; opt.textContent = m + " 月";
    if (m === modalMonth) opt.selected = true;
    mSel.appendChild(opt);
  }
}
$("visitYear").addEventListener("change", () => {
  modalYear = Number($("visitYear").value);
  renderDayCheckboxes();
});
$("visitMonth").addEventListener("change", () => {
  modalMonth = Number($("visitMonth").value);
  renderDayCheckboxes();
});

function renderDayCheckboxes() {
  const wrap = $("dayCheckboxes");
  wrap.innerHTML = "";

  for (const w of WEEKDAY_LABELS) {
    const h = document.createElement("div");
    h.className = "day-grid-weekday";
    h.textContent = w;
    wrap.appendChild(h);
  }

  const n = daysInMonth(modalYear, modalMonth);
  const firstWeekday = new Date(modalYear, modalMonth - 1, 1).getDay();
  for (let i = 0; i < firstWeekday; i++) {
    const filler = document.createElement("div");
    filler.className = "day-grid-filler";
    wrap.appendChild(filler);
  }
  for (let d = 1; d <= n; d++) {
    const weekday = (firstWeekday + d - 1) % 7;
    const label = document.createElement("label");
    if (weekday === 0 || weekday === 6) label.classList.add("day-weekend");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = d;
    input.className = "day-cb";
    label.appendChild(input);
    label.appendChild(document.createTextNode(d));
    const wd = document.createElement("span");
    wd.className = "day-weekday-tag";
    wd.textContent = WEEKDAY_LABELS[weekday];
    label.appendChild(wd);
    wrap.appendChild(label);
  }
}

function populateCategorySelect() {
  const sel = $("visitCategory");
  sel.innerHTML = "";
  for (const c of window.PRODUCT_CATEGORIES) {
    const opt = document.createElement("option");
    opt.value = c; opt.textContent = c;
    sel.appendChild(opt);
  }
  populateProductSelect();
}
function populateProductSelect() {
  const cat = $("visitCategory").value;
  const sel = $("visitProduct");
  sel.innerHTML = "";
  for (const p of window.PRODUCTS.filter((p) => p.category === cat)) {
    const opt = document.createElement("option");
    opt.value = p.name; opt.textContent = p.name;
    sel.appendChild(opt);
  }
}
const NO_PRODUCT_VISIT_TYPES = ["Joint Call", "會議/訓練", "休假/請假", "面試/交接", "新人訓練/考核", "其他"];

function populateVisitTypeSelect() {
  const sel = $("visitType");
  sel.innerHTML = "";
  for (const t of window.VISIT_TYPES) {
    const opt = document.createElement("option");
    opt.value = t; opt.textContent = t;
    sel.appendChild(opt);
  }
  updateProductFieldsForVisitType();
}

function updateProductFieldsForVisitType() {
  const catSel = $("visitCategory");
  const prodSel = $("visitProduct");
  const noProduct = NO_PRODUCT_VISIT_TYPES.includes($("visitType").value);
  if (noProduct) {
    catSel.innerHTML = "";
    prodSel.innerHTML = "";
    catSel.disabled = true;
    prodSel.disabled = true;
    catSel.required = false;
    prodSel.required = false;
  } else {
    catSel.disabled = false;
    prodSel.disabled = false;
    catSel.required = true;
    prodSel.required = true;
    populateCategorySelect();
  }
}
$("visitType").addEventListener("change", updateProductFieldsForVisitType);

function populateAdminRepPick() {
  const sel = $("visitRepPick");
  sel.innerHTML = "";
  for (const r of window.REPS) {
    const opt = document.createElement("option");
    opt.value = r.code; opt.textContent = `${r.code} ${r.name}`;
    sel.appendChild(opt);
  }
  const f = $("repFilter").value;
  if (f && f !== "ALL") sel.value = f;
}

$("addVisitBtn").addEventListener("click", () => {
  $("visitFormMsg").textContent = "";
  $("visitForm").reset();
  if (session.role === "admin") {
    $("adminRepPickWrap").classList.remove("hidden");
    populateAdminRepPick();
  } else {
    $("adminRepPickWrap").classList.add("hidden");
  }
  populateHospitalSelect();
  populateModalMonthSelects();
  renderDayCheckboxes();
  populateVisitTypeSelect();
  $("visitModal").classList.remove("hidden");
});

$("visitRepPick") && $("visitRepPick").addEventListener("change", populateHospitalSelect);
$("visitHospital").addEventListener("change", populateDoctorSelect);
$("visitCategory").addEventListener("change", populateProductSelect);

$("cancelVisitBtn").addEventListener("click", () => $("visitModal").classList.add("hidden"));

$("visitForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const days = Array.from(document.querySelectorAll(".day-cb:checked")).map((el) => Number(el.value));
  if (days.length === 0) {
    $("visitFormMsg").textContent = "請至少勾選一個日期";
    $("visitFormMsg").className = "msg error";
    return;
  }
  const repCode = currentModalRepCode();
  const repName = repNameByCode[repCode] || repCode;
  const custCode = $("visitHospital").value;
  const cust = findCustomer(repCode, custCode);
  const doctorSel = $("visitDoctor");
  const doctorOpt = doctorSel.options[doctorSel.selectedIndex];
  const category = $("visitCategory").value;
  const productName = $("visitProduct").value;
  const visitType = $("visitType").value;

  try {
    for (const d of days) {
      await db.collection("visits").add({
        repCode, repName,
        customerCode: custCode,
        customerName: custCode === "EB" ? "EB" : cust ? cust.name : "",
        contactName: doctorOpt ? doctorOpt.value : "",
        contactDept: doctorOpt ? doctorOpt.dataset.dept || "" : "",
        contactTitle: doctorOpt ? doctorOpt.dataset.title || "" : "",
        contactLevel: doctorOpt ? doctorOpt.dataset.level || "" : "",
        year: modalYear,
        month: modalMonth,
        day: d,
        date: `${modalYear}-${pad2(modalMonth)}-${pad2(d)}`,
        productCategory: category,
        productName,
        visitType,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
    }
    $("visitModal").classList.add("hidden");
  } catch (err) {
    $("visitFormMsg").textContent = "儲存失敗：" + err.message;
    $("visitFormMsg").className = "msg error";
  }
});

// ==================================================================
// 匯出 CSV / 列印
// ==================================================================
$("exportBtn").addEventListener("click", () => {
  const showRepCol = session.role === "admin" && activeRepFilterCode() === "ALL";
  const head = ["日期", "醫院/客戶", "醫師/聯絡人", "科別", "職稱", "分級", "產品分類", "產品", "拜訪分類"];
  if (showRepCol) head.splice(1, 0, "代表代號", "代表姓名");
  const rows = [head];
  for (const v of currentVisits) {
    const row = [v.date, v.customerName, v.contactName, v.contactDept, v.contactTitle, v.contactLevel, v.productCategory, v.productName, v.visitType];
    if (showRepCol) row.splice(1, 0, v.repCode, v.repName);
    rows.push(row);
  }
  const csv = "﻿" + rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `月拜訪計畫表_${currentYear}${pad2(currentMonth)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
});

$("printBtn").addEventListener("click", () => window.print());

// ==================================================================
// 修改密碼
// ==================================================================
$("changePwBtn").addEventListener("click", () => {
  $("pwForm").reset();
  $("pwFormMsg").textContent = "";
  $("pwModal").classList.remove("hidden");
});
$("cancelPwBtn").addEventListener("click", () => $("pwModal").classList.add("hidden"));

$("pwForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const oldPw = $("oldPw").value;
  const new1 = $("newPw1").value;
  const new2 = $("newPw2").value;
  if (new1 !== new2) {
    $("pwFormMsg").textContent = "兩次輸入的新密碼不一致";
    $("pwFormMsg").className = "msg error";
    return;
  }
  try {
    const ref = db.collection("accounts").doc(session.code);
    const snap = await ref.get();
    const oldHash = await sha256(oldPw);
    if (!snap.exists || oldHash !== snap.data().passwordHash) {
      $("pwFormMsg").textContent = "目前密碼不正確";
      $("pwFormMsg").className = "msg error";
      return;
    }
    const newHash = await sha256(new1);
    await ref.update({ passwordHash: newHash });
    $("pwFormMsg").textContent = "密碼修改成功";
    $("pwFormMsg").className = "msg ok";
    setTimeout(() => $("pwModal").classList.add("hidden"), 800);
  } catch (err) {
    $("pwFormMsg").textContent = "修改失敗：" + err.message;
    $("pwFormMsg").className = "msg error";
  }
});

// ==================================================================
// 啟動
// ==================================================================
(async function init() {
  fillLoginOptions();
  if (!firebaseConfigured) return;
  await auth.signInAnonymously().catch((e) => console.error("匿名登入失敗", e));
  await checkNeedsSeed();
  if (session) {
    enterApp();
  }
})();
