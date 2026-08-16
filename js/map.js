/* ================================================================
 * js/map.js
 * Leaflet 지도 초기화, 마커/클러스터링, 내 위치 표시.
 * (전역 L(Leaflet)만 사용 — 앱 UI DOM(#app, #sidebar 등)은 다루지 않는다.)
 * ================================================================ */

/* global L */

let map = null;
let markerLayer = null; // L.markerClusterGroup
let markers = {}; // 지인 id -> 그 지인이 속한 건물 마커 (같은 건물이면 여러 id가 같은 마커를 가리킨다)
let myLocationMarker = null;
let currentPopup = null;

/** 같은 좌표(=같은 건물)를 하나로 묶기 위한 키. */
function locationKey(f) {
  return f.lat.toFixed(6) + "," + f.lng.toFixed(6);
}

/** 건물 하나를 나타내는 아이콘. 2명 이상이면 인원수 배지를 함께 표시한다. */
function buildingIcon(count) {
  const badge =
    count > 1
      ? `<span style="position:absolute;top:-6px;right:-8px;min-width:16px;height:16px;
           padding:0 4px;border-radius:9px;background:#2563eb;color:#fff;
           font-size:11px;font-weight:700;line-height:16px;text-align:center;
           box-shadow:0 1px 3px rgba(0,0,0,.4)">${count}</span>`
      : "";
  return L.divIcon({
    className: "",
    html: `<div style="position:relative;font-size:28px;line-height:28px;
             filter:drop-shadow(0 2px 2px rgba(0,0,0,.35))">🏢${badge}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 26],
    popupAnchor: [0, -24],
  });
}

/** 지도를 지정된 요소 id 안에 생성한다. 기본 중심은 서울. */
export function initMap(elementId) {
  map = L.map(elementId).setView([37.5665, 126.978], 12);

  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);

  markerLayer = L.markerClusterGroup({
    maxClusterRadius: 50,
    spiderfyOnMaxZoom: true,
    chunkedLoading: true, // 수천 개 마커를 끊어서 추가해 렌더링이 멈추지 않도록 함
  });
  map.addLayer(markerLayer);

  // 열려 있는 팝업을 기억해 둔다. 건물 명단에서 이름을 눌렀을 때
  // 팝업을 닫지 않고 내용만 상세정보로 바꾸기 위해 필요하다.
  map.on("popupopen", (e) => { currentPopup = e.popup; });
  map.on("popupclose", () => { currentPopup = null; });

  return map;
}

/** 현재 열려 있는 팝업의 내용만 교체한다 (명단 ↔ 상세정보 전환). */
export function setOpenPopupContent(html) {
  if (currentPopup) currentPopup.setContent(html);
}

export function getMap() {
  return map;
}

/**
 * 지인 배열을 받아 마커를 다시 그린다 (클러스터 레이어 사용).
 * 같은 좌표에 있는 지인들은 건물 마커 하나로 묶인다.
 * @param {object[]} friends
 * @param {(group: object[]) => string} popupHtmlFn - 건물에 속한 지인 배열로 팝업 HTML을 만드는 함수
 */
export function renderMarkers(friends, popupHtmlFn) {
  markerLayer.clearLayers();
  markers = {};

  const groups = new Map();
  for (const f of friends) {
    if (f.lat == null || f.lng == null) continue;
    const key = locationKey(f);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(f);
  }

  const toAdd = [];
  for (const group of groups.values()) {
    const m = L.marker([group[0].lat, group[0].lng], { icon: buildingIcon(group.length) })
      .bindPopup(() => popupHtmlFn(group));
    for (const f of group) markers[f.id] = m;
    toAdd.push(m);
  }
  markerLayer.addLayers(toAdd);
}

/** 특정 지인이 속한 건물에 함께 있는 지인이 몇 명인지 알려준다. */
export function hasMarker(id) {
  return Boolean(markers[id]);
}

export function flyToFriend(f) {
  if (f.lat == null || !map) return;
  map.flyTo([f.lat, f.lng], 15, { duration: 0.8 });
}

/**
 * 지인의 건물 마커 팝업을 연다.
 * @param {string} id
 * @param {string} [content] - 지정하면 팝업 내용을 이것으로 바꿔서 연다
 *   (건물 명단 대신 특정 인물의 상세정보를 바로 보여줄 때 사용).
 */
export function openPopup(id, content) {
  const m = markers[id];
  if (!m) return;
  const show = () => {
    m.openPopup();
    if (content) m.setPopupContent(content);
  };
  // 클러스터에 묶여 있으면 먼저 펼친 뒤 팝업을 연다.
  if (markerLayer.zoomToShowLayer) {
    markerLayer.zoomToShowLayer(m, show);
  } else {
    show();
  }
}

export function fitToFriends(friends) {
  const pts = friends.filter((f) => f.lat != null && f.lng != null).map((f) => [f.lat, f.lng]);
  if (pts.length && map) map.fitBounds(L.latLngBounds(pts).pad(0.2));
}

function showMyLocationMarker(lat, lng) {
  if (myLocationMarker) map.removeLayer(myLocationMarker);
  myLocationMarker = L.circleMarker([lat, lng], {
    radius: 9,
    color: "#fff",
    weight: 3,
    fillColor: "#2563eb",
    fillOpacity: 1,
  })
    .addTo(map)
    .bindPopup("📍 내 현재 위치");
  map.flyTo([lat, lng], 14, { duration: 0.8 });
}

/** 브라우저 위치 API로 현재 위치를 구해 지도에 표시한다. */
export function locateMe() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("이 브라우저는 위치 기능을 지원하지 않습니다."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        showMyLocationMarker(lat, lng);
        resolve({ lat, lng });
      },
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
}
