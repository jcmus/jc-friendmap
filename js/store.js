/* ================================================================
 * js/store.js
 * 데이터 상태 관리 + localStorage 저장 + 시드 데이터 병합 + CRUD
 * 순수 로직만 담당 — DOM에 접근하지 않는다 (React 포팅 시 그대로 재사용 가능).
 * ================================================================ */

export const STORAGE_KEY = "friendmap.friends.v1";
const DELETED_SEED_KEY = "friendmap.deletedSeedIds.v1";
const SEED_URL = "data/friends.json";

/** @typedef {{
 *  id:string, name:string, company:string, department:string, title:string,
 *  phone:string, workPhone:string, email:string, address:string,
 *  country:string, region:string, addressType:string, registeredAt:string,
 *  lat:number|null, lng:number|null
 * }} Friend */

/** @type {Friend[]} */
let friends = [];

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function getDeletedSeedIds() {
  return new Set(readJSON(DELETED_SEED_KEY, []));
}

function addDeletedSeedId(id) {
  const set = getDeletedSeedIds();
  set.add(id);
  localStorage.setItem(DELETED_SEED_KEY, JSON.stringify([...set]));
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(friends));
}

/** 빈 필드를 채워 스키마를 통일한다 (시드/가져오기 데이터 대응). */
function normalize(rec) {
  return {
    id: rec.id,
    name: rec.name || "",
    company: rec.company || "",
    department: rec.department || "",
    title: rec.title || "",
    phone: rec.phone || "",
    workPhone: rec.workPhone || "",
    email: rec.email || "",
    address: rec.address || "",
    country: rec.country || "",
    region: rec.region || "",
    addressType: rec.addressType || "",
    registeredAt: rec.registeredAt || "",
    lat: rec.lat == null ? null : Number(rec.lat),
    lng: rec.lng == null ? null : Number(rec.lng),
  };
}

/** localStorage에서 지인 목록을 불러온다. */
export function loadFriends() {
  friends = readJSON(STORAGE_KEY, []).map(normalize);
  return friends;
}

/** 현재 메모리상의 전체 지인 배열 (참조 그대로 반환하므로 변형 금지). */
export function getAll() {
  return friends;
}

export function getById(id) {
  return friends.find((f) => f.id === id) || null;
}

/** 이름/회사/부서/직책/주소/지역/국가 전체를 대상으로 검색한다. */
export function search(query) {
  const q = (query || "").trim().toLowerCase();
  if (!q) return friends;
  return friends.filter((f) =>
    [f.name, f.company, f.department, f.title, f.address, f.region, f.country]
      .join(" ")
      .toLowerCase()
      .includes(q)
  );
}

/** 새 레코드를 추가하거나(id 미존재) 기존 레코드를 갱신한다(id 존재). */
export function upsert(record) {
  const norm = normalize(record);
  const idx = friends.findIndex((f) => f.id === norm.id);
  if (idx >= 0) friends[idx] = norm;
  else friends.push(norm);
  persist();
  return norm;
}

/** 여러 레코드를 한 번에 추가한다 (엑셀 가져오기용). */
export function addMany(records) {
  const normed = records.map(normalize);
  friends = friends.concat(normed);
  persist();
  return normed;
}

/** id로 레코드를 삭제한다. 시드 레코드였다면 삭제 목록에 기록해 재병합을 막는다. */
export function remove(id) {
  const f = getById(id);
  if (!f) return false;
  friends = friends.filter((x) => x.id !== id);
  if (String(id).startsWith("seed-")) addDeletedSeedId(id);
  persist();
  return true;
}

/**
 * data/friends.json 을 불러와 아직 없는 id만 병합한다.
 * - 이미 존재하는 id(사용자가 수정한 레코드 포함)는 건드리지 않는다.
 * - 사용자가 삭제한 시드 id는 다시 추가하지 않는다.
 * - 파일이 없거나 fetch에 실패해도 앱은 정상 동작해야 하므로 콘솔에만 알린다.
 */
export async function mergeSeedData() {
  let seed;
  try {
    const res = await fetch(SEED_URL, { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    seed = await res.json();
    if (!Array.isArray(seed)) throw new Error("배열 형식이 아닙니다");
  } catch (err) {
    console.info("[friend-map] 기본 데이터 파일 없음:", err && err.message ? err.message : err);
    return { added: 0 };
  }

  const deleted = getDeletedSeedIds();
  const existingIds = new Set(friends.map((f) => f.id));
  let added = 0;
  for (const rec of seed) {
    if (!rec || !rec.id) continue;
    if (existingIds.has(rec.id)) continue;
    if (deleted.has(rec.id)) continue;
    friends.push(normalize(rec));
    existingIds.add(rec.id);
    added++;
  }
  if (added) persist();
  return { added };
}

export function makeId() {
  return (crypto.randomUUID && crypto.randomUUID()) || `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
