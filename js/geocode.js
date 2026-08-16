/* ================================================================
 * js/geocode.js
 * Nominatim(OpenStreetMap) 지오코딩 — 주소 문자열을 위경도로 변환한다.
 * 정책상 초당 1건 이하만 허용되므로 마지막 호출 시각을 기록해 속도를 제한한다.
 * 순수 로직만 담당 — DOM에 접근하지 않는다.
 * ================================================================ */

let lastGeocodeAt = 0;

/**
 * @param {string} address
 * @returns {Promise<{lat:number, lng:number} | null>}
 */
export async function geocode(address) {
  const wait = 1100 - (Date.now() - lastGeocodeAt);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastGeocodeAt = Date.now();

  const url =
    "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=" +
    encodeURIComponent(address);
  const res = await fetch(url, { headers: { "Accept-Language": "ko,en" } });
  if (!res.ok) throw new Error("지오코딩 서버 오류 (" + res.status + ")");
  const data = await res.json();
  if (!data.length) return null;
  return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
}
