/* ================================================================
 * js/app.js
 * DOM 연결/화면 갱신 담당 — document에 접근하는 유일한 레이어.
 * 데이터 로직은 store.js, 지오코딩은 geocode.js, 엑셀은 excel.js,
 * 지도는 map.js 에 위임한다. (React 포팅 시 이 파일만 교체하면 된다.)
 * ================================================================ */

import * as store from "./store.js";
import { geocode } from "./geocode.js";
import * as excelIO from "./excel.js";
import * as mapView from "./map.js";

const PAGE_SIZE = 150; // 사이드바 목록 한 번에 렌더링하는 개수
let listPage = 1;

// ---------------- 유틸 ----------------
function esc(s) {
  return String(s || "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

// ---------------- 지도 초기화 ----------------
mapView.initMap("map");

// ---------------- 팝업 HTML ----------------
// 같은 건물에 여러 명이 있으면 먼저 이름 목록을 보여주고,
// 이름을 누르면 그 사람의 상세정보로 바뀐다.

/** 건물 마커의 기본 팝업. 1명이면 상세정보, 2명 이상이면 명단. */
function buildingPopupHtml(group) {
  if (group.length === 1) return personPopupHtml(group[0], null);
  return listPopupHtml(group);
}

function listPopupHtml(group) {
  // 대형 빌딩에는 수십 개 회사가 입주해 있어 이름만 나열하면 읽기 어렵다.
  // 회사별로 묶고, 인원이 많은 회사를 위로 올린다.
  const byCompany = new Map();
  for (const f of group) {
    const key = f.company || "(회사 미상)";
    if (!byCompany.has(key)) byCompany.set(key, []);
    byCompany.get(key).push(f);
  }
  const companies = [...byCompany.entries()].sort((a, b) => b[1].length - a[1].length);
  const singleCompany = companies.length === 1;

  const header = singleCompany ? companies[0][0] : group[0].address || "이 건물";
  const summary = singleCompany
    ? `이곳에 ${group.length}명이 근무합니다 — 이름을 누르면 상세정보`
    : `${companies.length}개 회사 ${group.length}명 — 이름을 누르면 상세정보`;

  const body = companies
    .map(([company, people]) => {
      const items = people
        .map((f) => {
          const sub = [f.title, f.department].filter(Boolean).join(" · ");
          return `<li class="pl-item" data-action="show-person" data-id="${esc(f.id)}">
            <span class="pl-name">${esc(f.name)}</span>
            ${sub ? `<span class="pl-sub">${esc(sub)}</span>` : ""}
          </li>`;
        })
        .join("");
      const heading = singleCompany
        ? ""
        : `<li class="pl-company">${esc(company)} <span class="pl-count">${people.length}</span></li>`;
      return heading + items;
    })
    .join("");

  return `<div class="popup-card">
    <div class="pc-name">${esc(header)}</div>
    <div class="pc-role">${esc(summary)}</div>
    <ul class="popup-list">${body}</ul>
  </div>`;
}

/**
 * 한 사람의 상세정보 팝업.
 * @param {object} f
 * @param {string|null} backToId - 값이 있으면 "목록으로" 버튼을 보여준다.
 */
function personPopupHtml(f, backToId) {
  return popupHtml(f, backToId);
}

function popupHtml(f, backToId) {
  const titleDept = [esc(f.title), esc(f.department)].filter(Boolean).join(" · ");
  const role = [titleDept, esc(f.company)].filter(Boolean).join(" · ");
  return `<div class="popup-card">
    ${backToId ? `<button class="pc-back" data-action="back-to-list" data-id="${esc(backToId)}">← 이 건물의 다른 사람들</button>` : ""}
    <div class="pc-name">${esc(f.name)}</div>
    ${role ? `<div class="pc-role">${role}</div>` : ""}
    ${f.phone ? `<div class="pc-row">📞 <a href="tel:${esc(f.phone)}">${esc(f.phone)}</a></div>` : ""}
    ${f.workPhone ? `<div class="pc-row">☎️ <a href="tel:${esc(f.workPhone)}">${esc(f.workPhone)}</a></div>` : ""}
    ${f.email ? `<div class="pc-row">✉️ <a href="mailto:${esc(f.email)}">${esc(f.email)}</a></div>` : ""}
    ${f.address ? `<div class="pc-row">📍 ${esc(f.address)}</div>` : ""}
    ${store.precisionLabel(f.precision) ? `<div class="pc-approx">≈ ${esc(store.precisionLabel(f.precision))}</div>` : ""}
    <div class="pc-buttons">
      <button class="pc-btn" data-action="edit" data-id="${esc(f.id)}">✏️ 수정</button>
      <button class="pc-btn danger" data-action="delete" data-id="${esc(f.id)}">🗑 삭제</button>
    </div>
  </div>`;
}

// 팝업 안의 수정/삭제 버튼은 Leaflet이 팝업을 document.body에 붙이므로
// 이벤트 위임으로 한 번만 등록한다 (인라인 onclick + window 전역 함수 대신).
document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-action]");
  if (!el) return;
  const id = el.dataset.id;
  switch (el.dataset.action) {
    case "edit":
      editFriend(id);
      break;
    case "delete":
      deleteFriend(id);
      break;
    case "show-person": {
      // 건물 명단에서 이름을 누른 경우: 팝업을 닫지 않고 상세정보로 교체한다.
      const f = store.getById(id);
      if (f) mapView.setOpenPopupContent(personPopupHtml(f, id));
      break;
    }
    case "back-to-list": {
      const f = store.getById(id);
      if (f) mapView.setOpenPopupContent(buildingPopupHtml(groupAt(f)));
      break;
    }
  }
});

/** 같은 건물(동일 좌표)에 있는 지인들을 모아 반환한다. */
function groupAt(f) {
  if (f.lat == null) return [f];
  const key = f.lat.toFixed(6) + "," + f.lng.toFixed(6);
  return store.getAll().filter((x) => x.lat != null && x.lat.toFixed(6) + "," + x.lng.toFixed(6) === key);
}

// ---------------- 마커 렌더링 ----------------
function renderMarkers() {
  mapView.renderMarkers(store.getAll(), buildingPopupHtml);
}

// ---------------- 목록 렌더링 (증분 렌더링: "더 보기") ----------------
const listEl = document.getElementById("friend-list");
const searchEl = document.getElementById("search");
const countEl = document.getElementById("friend-count");

function renderList() {
  const q = searchEl.value.trim();
  const filtered = store.search(q); // 검색은 항상 전체 레코드 대상
  const shown = filtered.slice(0, listPage * PAGE_SIZE);

  listEl.innerHTML = "";
  const frag = document.createDocumentFragment();
  for (const f of shown) {
    const li = document.createElement("li");
    li.className = "friend-item";
    const sub = [f.title, f.department, f.company].filter(Boolean).join(" · ");
    li.innerHTML = `<div class="fi-name"></div><div class="fi-sub"></div>`;
    li.querySelector(".fi-name").textContent = f.name;
    li.querySelector(".fi-sub").textContent = sub || f.address || "";
    if (f.lat == null) {
      const warn = document.createElement("div");
      warn.className = "fi-warn";
      warn.textContent = f.address
        ? "⚠️ 지도 데이터에 이 주소가 없습니다 — 눌러서 수정"
        : "⚠️ 주소 없음 — 눌러서 입력";
      li.appendChild(warn);
      li.addEventListener("click", () => editFriend(f.id));
    } else {
      const label = store.precisionLabel(f.precision);
      if (label) {
        const approx = document.createElement("div");
        approx.className = "fi-approx";
        approx.textContent = "≈ " + label;
        li.appendChild(approx);
      }
      li.addEventListener("click", () => {
        mapView.flyToFriend(f);
        setTimeout(() => {
          // 같은 건물에 동료가 있으면 상세정보를 바로 띄우되 명단으로 돌아갈 수 있게 한다.
          const group = groupAt(f);
          mapView.openPopup(f.id, group.length > 1 ? personPopupHtml(f, f.id) : undefined);
        }, 400);
      });
    }
    frag.appendChild(li);
  }
  listEl.appendChild(frag);

  if (filtered.length > shown.length) {
    const moreLi = document.createElement("li");
    moreLi.className = "friend-item-more";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn btn-small";
    btn.textContent = `더 보기 (${filtered.length - shown.length}명 남음)`;
    btn.addEventListener("click", () => {
      listPage++;
      renderList();
    });
    moreLi.appendChild(btn);
    listEl.appendChild(moreLi);
  }

  const total = store.getAll().length;
  countEl.textContent = `총 ${total}명` + (q ? ` (검색 결과 ${filtered.length}명)` : "");
}

function renderAll() {
  renderMarkers();
  renderList();
}

// ---------------- 추가/수정 폼 ----------------
const overlay = document.getElementById("form-overlay");
const form = document.getElementById("friend-form");
const geocodeStatus = document.getElementById("geocode-status");
const saveBtn = document.getElementById("btn-save");

function openForm(f) {
  document.getElementById("form-title").textContent = f ? "지인 수정" : "지인 추가";
  document.getElementById("f-id").value = f ? f.id : "";
  document.getElementById("f-name").value = f ? f.name : "";
  document.getElementById("f-phone").value = f ? f.phone : "";
  document.getElementById("f-workphone").value = f ? f.workPhone : "";
  document.getElementById("f-title").value = f ? f.title : "";
  document.getElementById("f-department").value = f ? f.department : "";
  document.getElementById("f-email").value = f ? f.email : "";
  document.getElementById("f-company").value = f ? f.company : "";
  document.getElementById("f-address").value = f ? f.address : "";
  geocodeStatus.hidden = true;
  overlay.hidden = false;
  document.getElementById("f-name").focus();
}
function closeForm() {
  overlay.hidden = true;
}

function editFriend(id) {
  const f = store.getById(id);
  if (f) openForm(f);
}

function deleteFriend(id) {
  const f = store.getById(id);
  if (!f) return;
  if (!confirm(`'${f.name}' 님을 삭제할까요?`)) return;
  store.remove(id);
  renderAll();
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = document.getElementById("f-id").value;
  const existing = id ? store.getById(id) : null;
  const record = {
    id: id || store.makeId(),
    name: document.getElementById("f-name").value.trim(),
    phone: document.getElementById("f-phone").value.trim(),
    workPhone: document.getElementById("f-workphone").value.trim(),
    title: document.getElementById("f-title").value.trim(),
    department: document.getElementById("f-department").value.trim(),
    email: document.getElementById("f-email").value.trim(),
    company: document.getElementById("f-company").value.trim(),
    address: document.getElementById("f-address").value.trim(),
    country: existing ? existing.country : "",
    region: existing ? existing.region : "",
    addressType: existing ? existing.addressType : "",
    registeredAt: existing ? existing.registeredAt : new Date().toISOString().slice(0, 10),
    lat: null,
    lng: null,
  };

  const addressChanged = !existing || existing.address !== record.address;

  if (existing && !addressChanged) {
    record.lat = existing.lat;
    record.lng = existing.lng;
  }

  if (addressChanged && record.address) {
    geocodeStatus.hidden = false;
    geocodeStatus.className = "";
    geocodeStatus.textContent = "🌍 주소의 위치를 찾는 중…";
    saveBtn.disabled = true;
    try {
      const pos = await geocode(record.address);
      if (pos) {
        record.lat = pos.lat;
        record.lng = pos.lng;
      } else {
        geocodeStatus.className = "err";
        geocodeStatus.textContent =
          "⚠️ 이 주소의 위치를 찾지 못했습니다. 주소를 더 자세히 쓰거나(도시·국가 포함), 그대로 저장할 수도 있습니다.";
        saveBtn.disabled = false;
        // 한 번 더 저장을 누르면 위치 없이 저장되도록 플래그
        if (form.dataset.forceSave === record.address) {
          delete form.dataset.forceSave;
        } else {
          form.dataset.forceSave = record.address;
          return;
        }
      }
    } catch (err) {
      geocodeStatus.className = "err";
      geocodeStatus.textContent = "⚠️ 지오코딩 실패: " + err.message;
      saveBtn.disabled = false;
      return;
    }
    saveBtn.disabled = false;
  }

  store.upsert(record);
  listPage = 1;
  renderAll();
  closeForm();
  if (record.lat != null) {
    mapView.flyToFriend(record);
    setTimeout(() => mapView.openPopup(record.id), 900);
  }
});

document.getElementById("btn-add").addEventListener("click", () => openForm(null));
document.getElementById("btn-cancel").addEventListener("click", closeForm);
document.getElementById("btn-close").addEventListener("click", closeForm);
overlay.addEventListener("click", (e) => {
  if (e.target === overlay) closeForm();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !overlay.hidden) closeForm();
});

// ---------------- 내 위치 ----------------
document.getElementById("btn-locate").addEventListener("click", () => {
  mapView.locateMe().catch((err) => {
    alert(
      "위치를 가져오지 못했습니다: " +
        err.message +
        "\n(위치 기능은 localhost 또는 https 환경에서만 동작합니다)"
    );
  });
});

// ---------------- 검색 ----------------
searchEl.addEventListener("input", () => {
  listPage = 1;
  renderList();
});

// ---------------- 엑셀 가져오기/내보내기 ----------------
document.getElementById("btn-template").addEventListener("click", () => {
  excelIO.downloadTemplate();
});

document.getElementById("btn-export").addEventListener("click", () => {
  const all = store.getAll();
  if (!all.length) {
    alert("내보낼 지인이 없습니다.");
    return;
  }
  excelIO.exportFriends(all);
});

document.getElementById("btn-import").addEventListener("click", () =>
  document.getElementById("file-input").click()
);

document.getElementById("file-input").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;

  const statusEl = document.getElementById("import-status");
  statusEl.hidden = false;
  statusEl.textContent = "📖 파일을 읽는 중…";

  try {
    const toImport = await excelIO.readImportFile(file, store.makeId);

    if (!toImport.length) {
      statusEl.textContent =
        "⚠️ 가져올 데이터가 없습니다. '성명' 열이 있는지 확인해 주세요. (양식 버튼으로 예시 파일을 받을 수 있습니다)";
      return;
    }

    // 좌표가 없는 행만 지오코딩 (Nominatim 정책상 1초에 1건)
    const needGeo = toImport.filter((f) => f.lat == null && f.address);
    let done = 0;
    const failed = [];
    for (const f of needGeo) {
      statusEl.textContent = `🌍 주소의 위치를 찾는 중… (${++done}/${needGeo.length})\n${f.name}: ${f.address}`;
      try {
        const pos = await geocode(f.address);
        if (pos) {
          f.lat = pos.lat;
          f.lng = pos.lng;
        } else {
          failed.push(f.name);
        }
      } catch {
        failed.push(f.name);
      }
    }

    store.addMany(toImport);
    listPage = 1;
    renderAll();

    let msg = `✅ ${toImport.length}명을 가져왔습니다.`;
    if (failed.length)
      msg += `\n⚠️ 위치를 찾지 못한 지인: ${failed.join(", ")}\n목록에서 눌러 주소를 수정해 주세요.`;
    statusEl.textContent = msg;
    setTimeout(() => {
      if (statusEl.textContent === msg && !failed.length) statusEl.hidden = true;
    }, 6000);

    // 가져온 마커가 모두 보이도록 지도 범위 조정
    mapView.fitToFriends(toImport);
  } catch (err) {
    statusEl.textContent = "❌ 파일을 읽지 못했습니다: " + err.message;
  }
});

// ---------------- 시작 ----------------
async function start() {
  store.loadFriends();
  renderAll();
  mapView.fitToFriends(store.getAll());

  // 기본 시드 데이터(data/friends.json)를 백그라운드로 병합한다.
  // 파일이 없거나 실패해도 위에서 이미 화면을 그렸으므로 앱은 정상 동작한다.
  const { added } = await store.mergeSeedData();
  if (added > 0) {
    renderAll();
    mapView.fitToFriends(store.getAll());
  }
}

start();
