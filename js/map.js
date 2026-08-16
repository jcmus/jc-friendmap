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

/**
 * 건물 하나를 나타내는 아이콘.
 * 이모지 대신 SVG/CSS로 그려서 어떤 기기·배율에서도 또렷하게 보이도록 한다.
 * 1명이면 위치를 정확히 가리키는 핀, 2명 이상이면 인원수를 담은 원형으로 표시한다.
 */
function buildingIcon(count) {
  if (count > 1) {
    const size = count >= 100 ? 40 : count >= 10 ? 34 : 30;
    return L.divIcon({
      className: "fm-marker",
      html: `<div class="fm-group" style="width:${size}px;height:${size}px;font-size:${
        count >= 100 ? 12 : 13
      }px">${count}</div>`,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
      popupAnchor: [0, -(size / 2) - 2],
    });
  }
  return L.divIcon({
    className: "fm-marker",
    html: `<svg class="fm-pin" width="24" height="32" viewBox="0 0 24 32" aria-hidden="true">
        <path d="M12 0C5.4 0 0 5.4 0 12c0 8.4 10.5 18.6 11.2 19.3a1.1 1.1 0 0 0 1.6 0C13.5 30.6 24 20.4 24 12 24 5.4 18.6 0 12 0z"/>
        <circle cx="12" cy="12" r="4.6"/>
      </svg>`,
    iconSize: [24, 32],
    iconAnchor: [12, 31],
    popupAnchor: [0, -30],
  });
}

/** 여러 건물이 뭉쳤을 때의 클러스터 아이콘 (기본 초록·노랑·빨강 대신 통일된 색). */
function clusterIcon(cluster) {
  const n = cluster.getChildCount();
  const size = n >= 500 ? 52 : n >= 100 ? 46 : n >= 20 ? 40 : 36;
  const label = n >= 1000 ? Math.round(n / 100) / 10 + "천" : n;
  return L.divIcon({
    className: "fm-marker",
    html: `<div class="fm-cluster" style="width:${size}px;height:${size}px;font-size:${
      n >= 1000 ? 12 : 13
    }px">${label}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

/** 지도를 지정된 요소 id 안에 생성한다. 기본 중심은 서울. */
export function initMap(elementId) {
  map = L.map(elementId).setView([37.5665, 126.978], 12);

  // CARTO Positron: 색이 절제된 밝은 지도라 마커가 훨씬 또렷하게 보인다.
  // {r}은 고해상도 화면에서 @2x 타일을 받아 글자·선이 흐려지지 않게 한다.
  L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/light_all/{z}/{x}/{y}{r}.png", {
    subdomains: "abcd",
    maxZoom: 20,
    detectRetina: true,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
  }).addTo(map);

  markerLayer = L.markerClusterGroup({
    maxClusterRadius: 50,
    spiderfyOnMaxZoom: true,
    chunkedLoading: true, // 수천 개 마커를 끊어서 추가해 렌더링이 멈추지 않도록 함
    iconCreateFunction: clusterIcon,
    showCoverageOnHover: false, // 마우스를 올릴 때 나타나는 다각형이 지도를 어지럽혀 끔
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
