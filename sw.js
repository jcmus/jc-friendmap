/* ================================================================
 * sw.js — 서비스 워커
 * 앱 껍데기(HTML/CSS/JS와 지도 라이브러리)를 캐시해 두어,
 * 홈 화면에서 실행했을 때 네트워크가 느리거나 끊겨도 앱이 뜨도록 한다.
 *
 * 지도 타일과 지인 데이터는 캐시하지 않는다.
 *  - 타일은 용량이 크고 이동할수록 계속 늘어난다
 *  - 지인 정보는 localStorage에 있으므로 서비스 워커가 다룰 이유가 없다
 * ================================================================ */

const VERSION = "v2";
const SHELL_CACHE = "friendmap-shell-" + VERSION;

// 앱이 뜨는 데 반드시 필요한 파일들
const SHELL = [
  ".",
  "index.html",
  "style.css",
  "js/app.js",
  "js/store.js",
  "js/map.js",
  "js/geocode.js",
  "js/excel.js",
  "manifest.json",
  "icons/icon-192.png",
  "icons/icon-512.png",
];

// 지도·엑셀 라이브러리 (CDN). 실패해도 설치는 계속 진행한다.
const VENDOR = [
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js",
  "https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css",
  "https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css",
  "https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js",
  "https://cdn.sheetjs.com/xlsx-0.20.2/package/dist/xlsx.full.min.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      await cache.addAll(SHELL);
      // CDN은 개별로 담아 하나가 실패해도 설치가 통째로 실패하지 않게 한다.
      // cache.add()는 no-cors 응답(status 0, opaque)을 거부하므로
      // 직접 fetch 해서 put 한다.
      await Promise.all(
        VENDOR.map(async (url) => {
          try {
            const req = new Request(url, { mode: "no-cors" });
            const res = await fetch(req);
            if (res && (res.ok || res.type === "opaque")) await cache.put(req, res);
          } catch (err) {
            /* 네트워크가 불안정하면 건너뛴다. 이후 fetch 단계에서 다시 채워진다. */
          }
        })
      );
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k.startsWith("friendmap-shell-") && k !== SHELL_CACHE)
            .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // 지도 타일은 캐시하지 않고 그대로 네트워크로 보낸다.
  if (/tile\.openstreetmap\.org|arcgisonline\.com/.test(url.hostname)) return;

  // 페이지 이동은 네트워크 우선, 실패하면 캐시된 앱 껍데기로 띄운다.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() => caches.match("index.html", { ignoreSearch: true }))
    );
    return;
  }

  // 나머지는 캐시 우선. 캐시에 없으면 받아서 채워 둔다.
  event.respondWith(
    (async () => {
      const hit = await caches.match(req, { ignoreSearch: true });
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res && (res.ok || res.type === "opaque")) {
          const cache = await caches.open(SHELL_CACHE);
          cache.put(req, res.clone());
        }
        return res;
      } catch (err) {
        return new Response("", { status: 504, statusText: "offline" });
      }
    })()
  );
});
