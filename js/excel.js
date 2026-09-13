/* ================================================================
 * js/excel.js
 * 엑셀 가져오기/내보내기/입력양식 다운로드 (SheetJS 전역 XLSX 사용)
 * 파일 입출력만 다루고 DOM 요소는 직접 만지지 않는다 (버튼 이벤트는 app.js에서 연결).
 * ================================================================ */

/* global XLSX */

export const COLUMNS = [
  "성명", "전화번호", "직책", "부서", "근무처전화", "이메일", "회사명", "주소", "위도", "경도",
];
const TEMPLATE_COLUMNS = COLUMNS.slice(0, 8); // 위도/경도는 양식에서 제외
const COL_WIDTHS = [
  { wch: 10 }, { wch: 16 }, { wch: 10 }, { wch: 12 },
  { wch: 16 }, { wch: 22 }, { wch: 18 }, { wch: 40 },
];
const COL_WIDTHS_EXPORT = COL_WIDTHS.concat([{ wch: 12 }, { wch: 12 }]);

/** 입력 양식(예시 1행 포함) 엑셀 파일을 다운로드한다. */
export function downloadTemplate() {
  const ws = XLSX.utils.aoa_to_sheet([
    TEMPLATE_COLUMNS,
    [
      "홍길동", "010-1234-5678", "과장", "영업부", "02-1234-5678",
      "hong@example.com", "주식회사 예시", "서울특별시 강남구 테헤란로 152",
    ],
  ]);
  ws["!cols"] = COL_WIDTHS;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "지인목록");
  XLSX.writeFile(wb, "지인지도_입력양식.xlsx");
}

/** 현재 지인 목록을 엑셀 파일로 내보낸다. */
export function exportFriends(friends) {
  const rows = friends.map((f) => ({
    성명: f.name,
    전화번호: f.phone,
    직책: f.title,
    부서: f.department,
    근무처전화: f.workPhone,
    이메일: f.email,
    회사명: f.company,
    주소: f.address,
    위도: f.lat,
    경도: f.lng,
  }));
  const ws = XLSX.utils.json_to_sheet(rows, { header: COLUMNS });
  ws["!cols"] = COL_WIDTHS_EXPORT;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "지인목록");
  XLSX.writeFile(wb, "지인지도_목록.xlsx");
}

function isCsv(file) {
  return /\.csv$/i.test(file.name || "") || /csv/i.test(file.type || "");
}

/**
 * CSV 바이트를 글자로 푼다.
 * SheetJS는 CSV를 바이트 그대로 읽어 한글을 깨뜨리므로(이름 -> ì´ë¦) 직접 해독한다.
 * 한국에서 만든 CSV는 UTF-8 아니면 엑셀이 저장하는 CP949(EUC-KR)이라,
 * UTF-8로 풀어 보고 깨짐 문자가 나오면 CP949로 다시 푼다.
 */
function decodeCsv(buf) {
  const bytes = new Uint8Array(buf);
  // UTF-8 BOM이 있으면 UTF-8이 확실하다.
  const hasBom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  const utf8 = new TextDecoder("utf-8").decode(hasBom ? bytes.subarray(3) : bytes);
  if (hasBom || !utf8.includes("�")) return utf8;
  try {
    return new TextDecoder("euc-kr").decode(bytes);
  } catch {
    return utf8; // 브라우저가 euc-kr을 모르면 UTF-8 결과라도 쓴다
  }
}

/**
 * 엑셀/CSV 파일을 읽어 지인 레코드 배열로 변환한다 (좌표가 있으면 그대로 사용).
 * @param {File} file
 * @param {() => string} makeId
 * @returns {Promise<object[]>}
 */
export async function readImportFile(file, makeId) {
  const buf = await file.arrayBuffer();
  const wb = isCsv(file) ? XLSX.read(decodeCsv(buf), { type: "string" }) : XLSX.read(buf);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });

  // 열 이름은 파일마다 제각각이다(내보내기 파일은 "성명/주소", 명함 정리 파일은
  // "이름/지오코딩주소"). 띄어쓰기와 영문 대소문자를 무시하고 맞춰 본다.
  const norm = (s) => String(s).replace(/\s+/g, "").toLowerCase();
  const normalizedRow = (row) => {
    const map = new Map();
    for (const key of Object.keys(row)) map.set(norm(key), row[key]);
    return map;
  };

  const pickFrom = (map, ...names) => {
    for (const n of names) {
      const v = map.get(norm(n));
      if (v !== undefined && String(v).trim() !== "") return String(v).trim();
    }
    return "";
  };

  /** 위 목록에 없는 이름이어도 "…주소"로 끝나는 열이 있으면 주소로 받아들인다. */
  const pickAddress = (map) => {
    const direct = pickFrom(
      map,
      "주소", "회사주소", "회사 주소", "근무지주소", "지오코딩주소", "원본주소",
      "address", "Address", "work address"
    );
    if (direct) return direct;
    for (const [key, value] of map) {
      if (key.endsWith("주소") && String(value).trim() !== "") return String(value).trim();
    }
    return "";
  };

  const num = (v) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : null;
  };

  return rows
    .map((row) => {
      const m = normalizedRow(row);
      return {
        id: makeId(),
        name: pickFrom(m, "성명", "이름", "name", "Name"),
        phone: pickFrom(m, "전화번호", "전화", "휴대폰", "핸드폰", "phone", "Phone", "mobile"),
        workPhone: pickFrom(m, "근무처전화", "근무처 전화", "회사전화", "회사 전화", "사무실전화", "workPhone"),
        title: pickFrom(m, "직책", "직위", "직급", "직함", "title", "Title", "position"),
        department: pickFrom(m, "부서", "소속", "department", "Department"),
        email: pickFrom(m, "이메일", "메일", "email", "Email", "E-mail"),
        company: pickFrom(m, "회사명", "회사", "근무처", "직장", "company", "Company"),
        address: pickAddress(m),
        country: pickFrom(m, "국가", "country", "Country"),
        region: pickFrom(m, "지역", "region", "Region"),
        addressType: pickFrom(m, "주소유형", "addressType"),
        registeredAt: pickFrom(m, "등록일", "registeredAt"),
        lat: num(pickFrom(m, "위도", "lat", "latitude")),
        lng: num(pickFrom(m, "경도", "lng", "lon", "longitude")),
      };
    })
    .filter((f) => f.name);
}
