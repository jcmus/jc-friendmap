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

/**
 * 엑셀/CSV 파일을 읽어 지인 레코드 배열로 변환한다 (좌표가 있으면 그대로 사용).
 * @param {File} file
 * @param {() => string} makeId
 * @returns {Promise<object[]>}
 */
export async function readImportFile(file, makeId) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });

  const pick = (row, ...names) => {
    for (const n of names) {
      for (const key of Object.keys(row)) {
        if (key.trim() === n) return String(row[key]).trim();
      }
    }
    return "";
  };

  return rows
    .map((row) => ({
      id: makeId(),
      name: pick(row, "성명", "이름", "name", "Name"),
      phone: pick(row, "전화번호", "전화", "휴대폰", "phone", "Phone"),
      workPhone: pick(row, "근무처전화", "근무처 전화", "회사전화", "회사 전화", "workPhone"),
      title: pick(row, "직책", "직위", "직급", "title", "Title"),
      department: pick(row, "부서", "department", "Department"),
      email: pick(row, "이메일", "email", "Email", "E-mail"),
      company: pick(row, "회사명", "회사", "근무처", "company", "Company"),
      address: pick(row, "주소", "회사주소", "회사 주소", "address", "Address"),
      country: pick(row, "국가", "country", "Country"),
      region: pick(row, "지역", "region", "Region"),
      addressType: "",
      registeredAt: "",
      lat: parseFloat(pick(row, "위도", "lat", "latitude")) || null,
      lng: parseFloat(pick(row, "경도", "lng", "lon", "longitude")) || null,
    }))
    .filter((f) => f.name);
}
