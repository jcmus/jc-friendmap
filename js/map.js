/* ================================================================
 * js/map.js
 * Leaflet 지도 초기화, 마커/클러스터링, 내 위치 표시.
 * (전역 L(Leaflet)만 사용 — 앱 UI DOM(#app, #sidebar 등)은 다루지 않는다.)
 * ================================================================ */

/* global L */

let map = null;
let markerLayer = null; // L.markerClusterGroup
let markers = {}; // id -> L.Marker
let myLocationMarker = null;

const friendIcon = L.divIcon({
  className: "",
  html: `<div style="font-size:28px;line-height:28px;filter:drop-shadow(0 2px 2px rgba(0,0,0,.35))">🏢</div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 26],
  popupAnchor: [0, -24],
});

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

  return map;
}

export function getMap() {
  return map;
}

/**
 * 지인 배열을 받아 마커를 다시 그린다 (클러스터 레이어 사용).
 * @param {object[]} friends
 * @param {(f: object) => string} popupHtmlFn - 팝업 HTML을 만드는 함수 (app.js에서 주입)
 */
export function renderMarkers(friends, popupHtmlFn) {
  markerLayer.clearLayers();
  markers = {};
  const toAdd = [];
  for (const f of friends) {
    if (f.lat == null || f.lng == null) continue;
    const m = L.marker([f.lat, f.lng], { icon: friendIcon }).bindPopup(popupHtmlFn(f));
    markers[f.id] = m;
    toAdd.push(m);
  }
  markerLayer.addLayers(toAdd);
}

export function flyToFriend(f) {
  if (f.lat == null || !map) return;
  map.flyTo([f.lat, f.lng], 15, { duration: 0.8 });
}

export function openPopup(id) {
  const m = markers[id];
  if (!m) return;
  // 클러스터에 묶여 있으면 먼저 펼친 뒤 팝업을 연다.
  if (markerLayer.zoomToShowLayer) {
    markerLayer.zoomToShowLayer(m, () => m.openPopup());
  } else {
    m.openPopup();
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
