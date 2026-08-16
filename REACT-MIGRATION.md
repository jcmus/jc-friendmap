# React 포팅 가이드 (지인 지도)

이 문서는 현재의 순수 HTML/CSS/JS(ES 모듈) 버전을 나중에 React로 옮길 때 참고할 계획서다.
지금 당장 React로 옮길 필요는 없다 — `js/` 폴더가 이미 "로직 레이어"와 "화면(DOM) 레이어"로 분리되어 있어서, 포팅 시 **로직은 거의 그대로 재사용**하고 화면 레이어만 React 컴포넌트로 바꾸면 된다.

## 1. 왜 지금 구조가 "React 포팅 준비"가 되어 있는가

```
js/store.js    데이터 상태 + localStorage 저장 + 시드 병합 + CRUD   (DOM 접근 없음)
js/geocode.js  Nominatim 지오코딩 + 속도 제한                       (DOM 접근 없음)
js/excel.js    엑셀 가져오기/내보내기/양식 (SheetJS)                 (DOM 접근 없음)
js/map.js      Leaflet 지도/마커/클러스터링/내 위치                  (Leaflet 전용 DOM만 사용)
js/app.js      나머지 모든 document.* 조작 (버튼, 폼, 목록 렌더링)   (유일한 "뷰" 레이어)
```

`store.js`, `geocode.js`, `excel.js`는 순수 함수와 상태만 다루고 `document`를 전혀 참조하지 않는다.
`map.js`는 Leaflet 인스턴스만 다루며 앱의 나머지 DOM(#sidebar, #friend-list 등)에는 관여하지 않는다.
따라서 React로 옮길 때 **이 4개 파일은 거의 수정 없이 재사용**할 수 있고, `js/app.js`에 있는 `document.getElementById` / `addEventListener` / `innerHTML` 코드만 React 컴포넌트로 다시 쓰면 된다.

## 2. 추천 스택

- **빌드 도구**: Vite (`npm create vite@latest friend-map-react -- --template react`)
  - 소규모 개인 프로젝트에 가볍고, `server.ps1` 같은 수동 서버 없이 `npm run dev`로 바로 실행된다.
- **지도**: `react-leaflet` (Leaflet을 React 컴포넌트로 감싼 라이브러리) + `react-leaflet-cluster` 또는 `react-leaflet-markercluster` (Leaflet.markercluster를 그대로 감싼 래퍼)
  - 지금 CDN으로 쓰는 `leaflet`, `leaflet.markercluster`를 npm 패키지(`leaflet`, `leaflet.markercluster`)로 그대로 설치하면 되므로 API가 동일하다.
- **엑셀**: `xlsx` (SheetJS) npm 패키지 — 지금 쓰는 `cdn.sheetjs.com` 빌드와 API가 같다 (`XLSX.utils.*`, `XLSX.writeFile` 등). `js/excel.js`는 `import * as XLSX from "xlsx"`로 상단 한 줄만 바꾸면 그대로 동작한다.
- **상태 관리**: 별도 라이브러리 없이 **React Context + useReducer** 정도로 충분하다 (지인 수가 수천 명이어도 배열 하나이므로 Redux/Zustand까지는 불필요). 다만 팀이 이미 익숙하다면 Zustand를 써도 무방 — `store.js`의 함수들을 Zustand 스토어의 액션으로 그대로 옮기기 쉽다.

## 3. 컴포넌트 분해 제안

```
<App>
 ├─ <Sidebar>
 │   ├─ <Toolbar />            내 위치 / 지인 추가 / 엑셀 가져오기·내보내기·양식 버튼
 │   ├─ <SearchBox />          검색 입력 (전체 목록 대상, store의 search() 재사용)
 │   └─ <FriendList>           가상화(virtualized) 목록 — react-window 사용 권장
 │       └─ <FriendListItem /> 항목 1개 (이름/직책·부서·회사/⚠ 경고)
 ├─ <MapView>                  react-leaflet <MapContainer>
 │   └─ <MarkerClusterGroup>   지인 수만큼 <Marker>, 클릭 시 <Popup>
 │       └─ <FriendPopup />    이름/직책·부서/전화·근무처전화/이메일/주소 + 수정·삭제 버튼
 └─ <FriendForm />             추가/수정 모달 (지금의 #form-overlay)
```

- **FriendList 가상화**: 지금은 "더 보기" 버튼으로 150개씩 늘려가며 DOM 노드 수를 억제하고 있다. React에서는 `react-window`(또는 `@tanstack/react-virtual`)로 바꾸면 스크롤 기반의 완전한 가상 스크롤이 되어 "더 보기" 버튼 없이도 2,891개를 부드럽게 스크롤할 수 있다. `store.search()`는 그대로 두고, 그 결과 배열을 `FixedSizeList`에 넘기기만 하면 된다.
- **MarkerClusterGroup**: `react-leaflet-cluster` 패키지가 지금 쓰는 `leaflet.markercluster`를 그대로 감싸고 있어 `maxClusterRadius`, `chunkedLoading` 등 옵션명이 동일하다.
- **FriendPopup**: 지금 `popupHtml()`이 만드는 문자열 템플릿을 JSX로 바꾸면 된다. `tel:`/`mailto:` 링크, HTML 이스케이프(React는 기본적으로 텍스트를 이스케이프하므로 `esc()` 함수가 필요 없어진다)도 그대로 유지.

## 4. 상태 관리 제안 (구체적으로)

```jsx
// contexts/FriendsContext.jsx
import { createContext, useContext, useEffect, useReducer } from "react";
import * as store from "../lib/store"; // js/store.js를 그대로 복사

const FriendsContext = createContext(null);

function reducer(state, action) {
  switch (action.type) {
    case "SET_ALL": return action.friends;
    // upsert/remove/addMany는 store.js가 이미 localStorage까지 갱신하므로
    // 리듀서는 store.getAll()을 다시 읽어와 반영하기만 하면 된다.
    default: return state;
  }
}

export function FriendsProvider({ children }) {
  const [friends, dispatch] = useReducer(reducer, [], () => store.loadFriends());

  useEffect(() => {
    store.mergeSeedData().then(({ added }) => {
      if (added) dispatch({ type: "SET_ALL", friends: store.getAll() });
    });
  }, []);

  const actions = {
    upsert: (record) => { store.upsert(record); dispatch({ type: "SET_ALL", friends: store.getAll() }); },
    remove: (id) => { store.remove(id); dispatch({ type: "SET_ALL", friends: store.getAll() }); },
    addMany: (records) => { store.addMany(records); dispatch({ type: "SET_ALL", friends: store.getAll() }); },
  };

  return (
    <FriendsContext.Provider value={{ friends, ...actions }}>
      {children}
    </FriendsContext.Provider>
  );
}

export const useFriends = () => useContext(FriendsContext);
```

이렇게 하면 `store.js`는 "진짜 데이터베이스처럼" 그대로 남고, React는 그 위에 얇은 구독 레이어만 얹는 구조가 된다. 나중에 3단계(회원가입/클라우드 DB)로 갈 때도 `store.js`의 함수 시그니처(`getAll`, `upsert`, `remove`, `addMany`, `search`, `mergeSeedData`)를 유지한 채 내부 구현만 Firebase/Supabase 호출로 바꾸면 되므로, `FriendsContext`나 컴포넌트는 거의 손댈 필요가 없다.

## 5. 데이터 이전 (data/friends.json + localStorage)

- **`data/friends.json`(시드 데이터)**: Vite 프로젝트의 `public/data/friends.json`에 그대로 복사하면 된다. `fetch("data/friends.json")` 호출 경로도 동일하게 동작한다 (Vite는 `public/` 이하를 정적 파일로 그대로 서빙).
- **localStorage 마이그레이션**: React 앱을 같은 브라우저(같은 origin, 즉 같은 `localhost:포트`)에서 열면 `localStorage`의 `friendmap.friends.v1`, `friendmap.deletedSeedIds.v1` 키를 그대로 읽을 수 있어 **데이터 이전 작업이 필요 없다**. 단, origin(도메인+포트)이 달라지면 localStorage는 공유되지 않으므로, 이 경우 지금 앱의 "엑셀 내보내기" 기능으로 백업한 뒤 React 앱에서 "엑셀 가져오기"로 복원하거나, 브라우저 개발자 도구 콘솔에서 `copy(localStorage.getItem('friendmap.friends.v1'))`로 값을 복사해 새 origin에 주입하면 된다.
- **3단계(클라우드 DB)로 갈 때**: `store.js`의 `mergeSeedData()`와 동일한 패턴으로, 앱 시작 시 `localStorage`에 남아있는 레코드를 한 번 클라우드 DB로 업로드하는 "1회성 마이그레이션 함수"를 추가하면 기존 사용자의 데이터 손실 없이 전환할 수 있다.

## 6. 마이그레이션 체크리스트

1. `npm create vite@latest friend-map-react -- --template react`
2. `npm i leaflet react-leaflet leaflet.markercluster react-leaflet-cluster xlsx`
3. `js/store.js`, `js/geocode.js`, `js/excel.js`를 `src/lib/`에 그대로 복사 (SheetJS import 구문만 CDN 전역 `XLSX` → `import * as XLSX from "xlsx"`로 교체)
4. `data/friends.json`을 `public/data/friends.json`으로 복사
5. `js/map.js`의 로직을 참고해 `<MapView>` 컴포넌트 작성 (Leaflet 인스턴스 직접 생성 대신 `react-leaflet`의 `<MapContainer>`/`<TileLayer>`/`<Marker>` 사용)
6. `js/app.js`의 이벤트 핸들러들을 `<Sidebar>`, `<FriendList>`, `<FriendForm>` 컴포넌트의 이벤트 핸들러로 옮기기
7. 팝업의 HTML 문자열(`popupHtml()`)을 `<FriendPopup>` JSX로 변환 (이스케이프 함수 `esc()`는 React가 대신 처리하므로 제거 가능)
8. 기존 `index.html` 진입 시 보이던 동작(시드 병합, 지도 범위 맞춤, 검색, 클러스터링)을 하나씩 비교하며 회귀 테스트
