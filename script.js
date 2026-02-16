// 1. 변수 및 상수 설정 (기본 세팅)
const generateBtn = document.getElementById("generate");
const immediateBtn = document.getElementById("immediate-generate");
const resultDiv = document.getElementById("result");
const historyList = document.getElementById("history-list");
const dingSound = document.getElementById("dingSound"); // 효과음 소스

let intervalId = null; // 번호가 순차적으로 나오는 타이머
let timeoutId = null; // 마지막 정렬 애니메이션용 타이머
let currentNumbers = []; // 현재 생성된 번호들
let sortedNumbersCache = []; // 정렬된 번호 저장소
let historyCounter = 0; // 기록실 번호 (1., 2. ...)
let activeRollIntervals = []; // 공이 굴러가는 애니메이션 저장소
let isGenerating = false; // 현재 번호 생성 중인지 확인하는 상태값

// 필터링 기능용 변수
const includeSet = new Set(); // 포함할 번호 (최대 5개)
const excludeSet = new Set(); // 제외할 번호 (최대 38개)

// 회차 및 날짜 계산을 위한 기준 (2026년 기준)
const BASE_ROUND = 1210;
const BASE_DATE_FOR_1210 = new Date("2026-01-31T20:00:00+09:00");
const MS_IN_A_WEEK = 7 * 24 * 60 * 60 * 1000; // 1주일의 밀리초

// 카카오 API 키 (사용자가 직접 발급받은 JS 키를 HTML에 넣어야 함)
// 실제 서비스 시에는 initKakao() 등을 호출

// ★ 기록 저장/복원용 상수
const HISTORY_STORAGE_KEY = "lotto_history_v1";
const HISTORY_MAX = 30;

// ★ 지도 팝업 "찐최종 기획안" 구현용 상태/상수 (추가)
// ✅ 기본 위치: 광화문광장 (초기 로드 시 즉시 표시)
const GWANGHWAMUN_LAT = 37.571648; // 광화문광장 근처
const GWANGHWAMUN_LNG = 126.976866;

// ✅ 장소검색 반경(약 2km)
const LOTTO_SEARCH_RADIUS = 2000;

// ✅ "영구 차단" 안내 배너 1회 노출(localStorage)
const MAP_PERMISSION_BANNER_SHOWN_KEY = "map_permission_banner_shown_v1";

// 지도 객체/상태
let map = null; // 카카오맵 인스턴스
let placesService = null; // 장소 검색 서비스
let mapBaseReady = false; // 초기 광화문 지도 표시 완료 여부
let mapFirstClickHandled = false; // "클릭 1" 처리 시작 여부(권한요청 시작)
let mapFirstClickCompleted = false; // ★ 추가: "클릭 1" 성공/실패 콜백까지 끝났는지
let mapFirstClickInProgress = false; // ★ 추가: 위치 요청 진행 중인지(중복 호출 방지)
let lastKnownLat = GWANGHWAMUN_LAT; // 내 위치를 알면 내 위치, 모르면 광화문
let lastKnownLng = GWANGHWAMUN_LNG;
let lottoMarkers = []; // 생성된 로또 마커들
let myLocationMarker = null; // 내 위치 마커(허용 시)
let mapInfoWindow = null; // 인포윈도우(마커 클릭 시 장소명)
let mapKakaoAvailable = true; // 카카오 SDK 사용 가능 여부

// 2. 초기화 및 화면 업데이트 함수

// 현재 회차와 추첨 날짜를 계산하고 화면(HTML)에 표시하는 함수
function updateRoundNumber() {
  const currentRoundElement = document.getElementById("currentRound");
  const currentDateElement = document.getElementById("currentDate");
  if (!currentRoundElement || !currentDateElement) return;

  const now = new Date();
  let roundNumber;
  let drawDate = new Date(BASE_DATE_FOR_1210);

  if (now.getTime() < BASE_DATE_FOR_1210.getTime()) {
    roundNumber = 1209;
    drawDate = new Date(BASE_DATE_FOR_1210);
  } else {
    const diffMs = now.getTime() - BASE_DATE_FOR_1210.getTime();
    const weeksPassed = Math.floor(diffMs / MS_IN_A_WEEK);
    roundNumber = BASE_ROUND + weeksPassed;
    drawDate.setTime(
      BASE_DATE_FOR_1210.getTime() + (weeksPassed + 1) * MS_IN_A_WEEK,
    );
  }

  currentRoundElement.textContent = roundNumber;
  const year = drawDate.getFullYear();
  const month = String(drawDate.getMonth() + 1).padStart(2, "0");
  const day = String(drawDate.getDate()).padStart(2, "0");
  currentDateElement.textContent = `${year}-${month}-${day}`;
}

// 번호가 나오기 전 빈 공(플레이스홀더) 6개를 만드는 함수
function initPlaceholders() {
  resultDiv.innerHTML = "";
  for (let i = 0; i < 6; i++) {
    const ball = document.createElement("div");
    ball.classList.add("ball", "placeholder");
    resultDiv.appendChild(ball);
  }
}

// ★ 기능 1: 필터 버튼 생성 및 초기화
function initFilterButtons() {
  const includeContainer = document.getElementById("include-numbers-container");
  const excludeContainer = document.getElementById("exclude-numbers-container");

  // 1~45 버튼 생성
  for (let i = 1; i <= 45; i++) {
    // 포함 버튼 생성
    const inBtn = document.createElement("button");
    inBtn.textContent = i;
    inBtn.classList.add("filter-btn");
    inBtn.dataset.num = i;
    inBtn.onclick = () => toggleInclude(i, inBtn);
    includeContainer.appendChild(inBtn);

    // 제외 버튼 생성
    const exBtn = document.createElement("button");
    exBtn.textContent = i;
    exBtn.classList.add("filter-btn");
    exBtn.dataset.num = i;
    exBtn.onclick = () => toggleExclude(i, exBtn);
    excludeContainer.appendChild(exBtn);

    // 9개 단위로 줄바꿈을 시각적으로 돕기 위해 (CSS flex-wrap이 처리하지만, DOM 순서 보장)
  }
}

// 포함 번호 토글 (최대 5개, 초록색)
function toggleInclude(num, btn) {
  if (includeSet.has(num)) {
    includeSet.delete(num);
    btn.classList.remove("included");
  } else {
    if (includeSet.size >= 5) {
      alert("포함할 번호는 최대 5개까지만 선택 가능합니다.");
      return;
    }
    if (excludeSet.has(num)) {
      alert("이미 제외된 번호입니다. 제외 목록에서 해제 후 선택해주세요.");
      return;
    }
    includeSet.add(num);
    btn.classList.add("included");
  }
  document.getElementById("include-count").textContent = `${includeSet.size}/5`;
}

// 제외 번호 토글 (최대 38개, 빨간색)
function toggleExclude(num, btn) {
  if (excludeSet.has(num)) {
    excludeSet.delete(num);
    btn.classList.remove("excluded");
  } else {
    // 남은 번호가 최소 6개는 되어야 함 (45 - 38 = 7, 최소 여유)
    if (excludeSet.size >= 38) {
      alert("제외할 번호는 최대 38개까지만 선택 가능합니다.");
      return;
    }
    if (includeSet.has(num)) {
      alert("이미 포함된 번호입니다. 포함 목록에서 해제 후 선택해주세요.");
      return;
    }
    excludeSet.add(num);
    btn.classList.add("excluded");
  }
  document.getElementById("exclude-count").textContent =
    `${excludeSet.size}/38`;
}

// ★ 기능 2: 카카오맵 연동 (지도팝업 찐최종 기획안 반영 - 수정)
// (추가) 지도 위 안내 배너 DOM 얻기
function getMapPermissionBannerEl() {
  return document.getElementById("map-permission-banner"); // HTML에서 추가된 요소
}

// (추가) "영구 차단" 안내 배너 1회 노출
function showPermissionBlockedBannerOnce() {
  const banner = getMapPermissionBannerEl();
  if (!banner) return;

  // 이미 1회 보여줬다면 종료
  const shown = localStorage.getItem(MAP_PERMISSION_BANNER_SHOWN_KEY);
  if (shown === "1") return;

  // 표시
  banner.style.display = "block";

  // 1회 노출 처리
  localStorage.setItem(MAP_PERMISSION_BANNER_SHOWN_KEY, "1");
}

// (추가) 배너 숨김(기본은 숨김 유지)
function hidePermissionBanner() {
  const banner = getMapPermissionBannerEl();
  if (!banner) return;
  banner.style.display = "none";
}

// (추가) 마커 정리
function clearLottoMarkers() {
  if (lottoMarkers && lottoMarkers.length > 0) {
    lottoMarkers.forEach((m) => {
      try {
        m.setMap(null);
      } catch (e) {}
    });
  }
  lottoMarkers = [];
}

// (추가) 내 위치 마커 정리
function clearMyLocationMarker() {
  if (myLocationMarker) {
    try {
      myLocationMarker.setMap(null);
    } catch (e) {}
    myLocationMarker = null;
  }
}

// (추가) 카카오 장소 검색 + 마커 표시 (반경 2km, 키워드 '로또')
function searchAndDisplayLottoMarkers(centerLat, centerLng) {
  if (!map || !placesService || !mapKakaoAvailable) return;

  // 기존 마커/인포윈도우 정리
  clearLottoMarkers();

  if (!mapInfoWindow) {
    mapInfoWindow = new kakao.maps.InfoWindow({ zIndex: 1 });
  } else {
    try {
      mapInfoWindow.close();
    } catch (e) {}
  }

  const locPosition = new kakao.maps.LatLng(centerLat, centerLng);

  placesService.keywordSearch(
    "로또",
    (data, status, pagination) => {
      if (status === kakao.maps.services.Status.OK) {
        for (let i = 0; i < data.length; i++) {
          const place = data[i];

          const marker = new kakao.maps.Marker({
            map: map,
            position: new kakao.maps.LatLng(place.y, place.x),
          });

          lottoMarkers.push(marker);

          // 마커 클릭 시 장소명 표시
          kakao.maps.event.addListener(marker, "click", function () {
            const safeName = place.place_name || "";

            // ✅ XSS 방지: HTML 문자열 결합 금지, 텍스트로만 삽입
            const contentEl = document.createElement("div");
            contentEl.style.cssText =
              "padding:6px 8px;font-size:12px;line-height:1.2;white-space:nowrap;";
            contentEl.textContent = safeName;

            mapInfoWindow.setContent(contentEl);
            mapInfoWindow.open(map, marker);
          });
        }
      }
      // 실패/0건이어도 "막힘" 느낌 주지 않기: 별도 alert/경고 없이 그냥 조용히 유지
    },
    {
      location: locPosition,
      radius: LOTTO_SEARCH_RADIUS,
    },
  );
}

// (추가) 카카오맵 새 탭 열기 (클릭 2 이후)
function openKakaoMapSearchTab(lat, lng) {
  const q = encodeURIComponent("로또");

  // ✅ p는 (lat,lng) 순서로 전달
  const url = `https://m.map.kakao.com/scheme/search?q=${q}&p=${lat},${lng}`;

  window.open(url, "_blank", "noopener,noreferrer");
}

// ✅ 초기 상태(페이지 최초 로드)
// - 기본 위치: 광화문광장
// - 지도는 즉시 표시
// - 위치 권한 요청 없음
// - '로또' 검색 없음
// - 마커 없음
function initMapBaseOnly() {
  const mapContainer = document.getElementById("map");

  // 카카오맵 객체가 로드되지 않았으면(API키 없음 등) 중단하지 않고 안내 표시
  if (typeof kakao === "undefined" || !kakao.maps) {
    mapKakaoAvailable = false;
    if (mapContainer) {
      mapContainer.innerHTML =
        '<p style="padding-top:100px; color:#888;">지도를 불러올 수 없습니다.<br>(API Key 확인 필요)</p>';
    }
    return;
  }

  mapKakaoAvailable = true;

  // 초기 배너는 숨김(표시 조건에서만 노출)
  hidePermissionBanner();

  // 기본 위치: 광화문광장
  lastKnownLat = GWANGHWAMUN_LAT;
  lastKnownLng = GWANGHWAMUN_LNG;

  const mapOption = {
    center: new kakao.maps.LatLng(GWANGHWAMUN_LAT, GWANGHWAMUN_LNG),
    level: 4,
  };

  map = new kakao.maps.Map(mapContainer, mapOption);
  placesService = new kakao.maps.services.Places();

  // 초기 상태: 마커/검색 없음
  clearLottoMarkers();
  clearMyLocationMarker();

  mapBaseReady = true;
}

// ✅ 클릭 1 (지도 클릭)
// - 즉시 위치 권한 요청(브라우저 팝업)
// - 허용: 내 위치로 중심 + 로또 검색/마커
// - 거부/실패: 광화문 유지 + 로또 검색/마커
// - "영구 차단"(PERMISSION_DENIED): 지도 위 오버레이 안내(1회)
function handleMapFirstClick() {
  if (!mapBaseReady || !mapKakaoAvailable) return;

  // 이미 완료됐으면(성공/실패 콜백까지 끝) 재실행 안 함
  if (mapFirstClickCompleted) return;

  // 진행 중이면 중복 호출 방지
  if (mapFirstClickInProgress) return;

  mapFirstClickHandled = true;
  mapFirstClickInProgress = true;

  // 즉시 위치 권한 요청 (브라우저 기본 팝업만)
  if (
    !navigator.geolocation ||
    typeof navigator.geolocation.getCurrentPosition !== "function"
  ) {
    // 위치 기능 자체가 없으면: 광화문 기준으로 검색만 진행
    lastKnownLat = GWANGHWAMUN_LAT;
    lastKnownLng = GWANGHWAMUN_LNG;

    try {
      map.setCenter(new kakao.maps.LatLng(lastKnownLat, lastKnownLng));
    } catch (e) {}

    searchAndDisplayLottoMarkers(lastKnownLat, lastKnownLng);

    // ★ 완료 처리
    mapFirstClickInProgress = false;
    mapFirstClickCompleted = true;
    return;
  }

  navigator.geolocation.getCurrentPosition(
    function (position) {
      // ✅ 허용 시
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;

      lastKnownLat = lat;
      lastKnownLng = lng;

      const locPosition = new kakao.maps.LatLng(lat, lng);
      map.setCenter(locPosition);

      // 내 위치 마커
      clearMyLocationMarker();
      myLocationMarker = new kakao.maps.Marker({
        map: map,
        position: locPosition,
      });

      // 주변 '로또' 키워드 검색 + 마커 표시
      searchAndDisplayLottoMarkers(lat, lng);

      // ★ 완료 처리(여기서부터 클릭2가 "내 위치"를 확실히 씀)
      mapFirstClickInProgress = false;
      mapFirstClickCompleted = true;
    },
    function (error) {
      // ❌ 거부/실패 시: 광화문 유지 + 광화문 기준 검색
      lastKnownLat = GWANGHWAMUN_LAT;
      lastKnownLng = GWANGHWAMUN_LNG;

      try {
        map.setCenter(new kakao.maps.LatLng(lastKnownLat, lastKnownLng));
      } catch (e) {}

      // "영구 차단" 상태 UX (PERMISSION_DENIED)
      if (error && error.code === 1) {
        showPermissionBlockedBannerOnce();
      }

      searchAndDisplayLottoMarkers(lastKnownLat, lastKnownLng);

      // ★ 완료 처리
      mapFirstClickInProgress = false;
      mapFirstClickCompleted = true;
    },
    {
      enableHighAccuracy: false,
      timeout: 8000,
      maximumAge: 0,
    },
  );
}

// ✅ 클릭 2 이후 (지도 재클릭)
// - 카카오맵 새 탭 열기
// - '로또' 검색 결과로 바로 이동
// - 기준 위치: 내 위치 알면 내 위치, 모르면 광화문
function handleMapReClickOpenTab() {
  // 카카오 SDK가 없어도 링크는 열 수 있음(검색 UX를 카카오맵 네이티브로 넘김)
  // 다만 기준 좌표는 마지막으로 알고 있는 좌표를 사용
  const lat = lastKnownLat || GWANGHWAMUN_LAT;
  const lng = lastKnownLng || GWANGHWAMUN_LNG;
  openKakaoMapSearchTab(lat, lng);
}

// 기존 함수명 유지 (원본 유지하면서 내부는 "찐최종 기획안" 흐름으로 변경)
function initMap() {
  // ✅ 초기 로드: 광화문 지도만 표시 (조용)
  if (!mapBaseReady) {
    initMapBaseOnly();
  }

  // map-container-box 클릭 로직
  const mapBox = document.getElementById("map-container-box");
  if (!mapBox) return;

  // (중복 바인딩 방지)
  if (mapBox.dataset.mapClickBound === "1") return;
  mapBox.dataset.mapClickBound = "1";

  mapBox.addEventListener("click", () => {
    // 클릭 1: 권한요청 + (허용/거부) 기준으로 검색/마커
    // ★ 완료되기 전(콜백 전)에는 절대 클릭2로 넘어가지 않게 막음
    if (!mapFirstClickHandled || !mapFirstClickCompleted) {
      handleMapFirstClick();
      return;
    }

    // 클릭 2 이후: 카카오맵 새 탭(로또 검색 결과)
    handleMapReClickOpenTab();
  });
}

// ★ 기능 3: 카카오톡 공유 초기화
function initKakaoShare() {
  try {
    if (!Kakao.isInitialized()) {
      Kakao.init("e7792702246bec1c4bf599bf666f71aa"); // HTML의 키와 동일한 키 사용
    }
  } catch (e) {
    console.log("Kakao SDK init failed (Check API Key)");
  }

  document.getElementById("kakao-share-btn").addEventListener("click", () => {
    if (currentNumbers.length !== 6) {
      alert("먼저 번호를 생성해주세요!");
      return;
    }

    const numStr = sortedNumbersCache.join(", ");

    try {
      Kakao.Share.sendDefault({
        objectType: "text",
        text: `🍀 로또 행운 번호 도착!\n\n이번 주 추천 번호:\n[ ${numStr} ]\n\n1등 당첨을 기원합니다!`,
        link: {
          mobileWebUrl: window.location.href,
          webUrl: window.location.href,
        },
        buttonTitle: "나도 번호 받으러 가기",
      });
    } catch (err) {
      alert("카카오톡 공유 기능을 사용할 수 없습니다. (API 키 확인 필요)");
    }
  });
}

// ★ 기록 저장/복원 관련 함수
function _safeParseJSON(str, fallback) {
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

function loadHistoryFromStorage() {
  const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
  const data = _safeParseJSON(raw, []);
  if (!Array.isArray(data)) return [];
  // 방어: 형태가 깨졌을 경우 최소한으로 정리
  return data
    .filter(
      (item) =>
        item && Array.isArray(item.numbers) && item.numbers.length === 6,
    )
    .map((item) => ({
      id: typeof item.id === "number" ? item.id : Date.now(),
      numbers: item.numbers,
    }))
    .slice(0, HISTORY_MAX);
}

function saveHistoryToStorage(historyArr) {
  localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(historyArr));
}

function renderHistoryItem(item) {
  const historyItem = document.createElement("div");
  historyItem.classList.add("history-item");
  historyItem.dataset.historyId = String(item.id);

  const historyNumberPrefix = document.createElement("div");
  historyNumberPrefix.classList.add("history-number-prefix");
  historyNumberPrefix.textContent = `${item.id}.`; // 몇 번째 기록인지
  historyItem.prepend(historyNumberPrefix);

  const numbersDiv = document.createElement("div");
  historyDiv = document.createElement("div"); // 수정: 변수명 오류 방지용 (혹시 모를 오류 대비)
  numbersDiv.classList.add("history-numbers");

  item.numbers.forEach((number) => {
    const ball = document.createElement("div");
    ball.classList.add("history-ball");
    ball.textContent = number;
    ball.style.backgroundColor = getBallColor(number);
    numbersDiv.appendChild(ball);
  });

  historyItem.appendChild(numbersDiv);

  // ★ 액션 버튼 영역 (복사 / 삭제)
  const actions = document.createElement("div");
  actions.classList.add("history-actions");

  const copyBtn = document.createElement("button");
  copyBtn.classList.add("history-action-btn");
  copyBtn.type = "button";
  copyBtn.textContent = "📋";

  const deleteBtn = document.createElement("button");
  deleteBtn.classList.add("history-action-btn");
  deleteBtn.type = "button";
  deleteBtn.textContent = "❌";

  copyBtn.addEventListener("click", () => {
    const text = item.numbers.join(", ");
    copyToClipboard(text)
      .then(() => {
        showCopyToast(copyBtn, "복사됨");
      })
      .catch(() => {
        // 클립보드 실패 시에도 최소 피드백
        showCopyToast(copyBtn, "복사 실패");
      });
  });

  deleteBtn.addEventListener("click", () => {
    deleteHistoryItemById(item.id);
  });

  actions.appendChild(copyBtn);
  actions.appendChild(deleteBtn);
  historyItem.appendChild(actions);

  return historyItem;
}

function copyToClipboard(text) {
  if (
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === "function"
  ) {
    return navigator.clipboard.writeText(text);
  }
  // fallback
  return new Promise((resolve, reject) => {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      ok ? resolve() : reject();
    } catch (e) {
      reject(e);
    }
  });
}

function showCopyToast(btnEl, message) {
  const actions = btnEl.closest(".history-actions");
  if (!actions) return;

  // 기존 토스트 있으면 제거
  const old = actions.querySelector(".copy-toast");
  if (old) old.remove();

  const toast = document.createElement("span");
  toast.className = "copy-toast";
  toast.textContent = message;
  // 복사 버튼 바로 뒤에 붙이기
  btnEl.insertAdjacentElement("afterend", toast);

  setTimeout(() => {
    if (toast && toast.parentNode) toast.remove();
  }, 1200); // 1~1.5초 느낌으로 1.2초 적용
}

function renderHistoryFromStorage() {
  historyList.innerHTML = "";
  const historyArr = loadHistoryFromStorage();

  // id(번호) 최대값을 historyCounter로 맞춰두기
  const maxId = historyArr.reduce((acc, cur) => Math.max(acc, cur.id), 0);
  historyCounter = maxId;

  // 저장된 것은 "최신이 위"라고 가정하고 그대로 렌더
  // (저장 구조: 새 기록 prepend 기준으로 배열 0이 최신)
  historyArr.forEach((item) => {
    const el = renderHistoryItem(item);
    historyList.appendChild(el);
  });
}

function deleteHistoryItemById(id) {
  const historyArr = loadHistoryFromStorage();
  const next = historyArr.filter((item) => item.id !== id);
  saveHistoryToStorage(next);

  // DOM에서도 제거
  const el = historyList.querySelector(
    `.history-item[data-history-id="${id}"]`,
  );
  if (el) el.remove();
}

function clearAllHistory() {
  localStorage.removeItem(HISTORY_STORAGE_KEY);
  historyList.innerHTML = "";
  historyCounter = 0;
}

// 페이지가 처음 켜질 때 실행
window.addEventListener("load", () => {
  initPlaceholders();
  updateRoundNumber();
  initFilterButtons(); // 필터 버튼 생성
  initKakaoShare(); // 카카오 공유 설정

  // ★ 저장된 기록 불러오기
  renderHistoryFromStorage();

  // ★ 전체 삭제 버튼
  const clearBtn = document.getElementById("history-clear-btn");
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      const ok = confirm("전체 기록을 삭제할까요?");
      if (!ok) return;
      clearAllHistory();
    });
  }

  // ★ 지도: "초기 로드 즉시 광화문 지도 표시" + 클릭 플로우는 initMap()에 위임 (수정)
  // ✅ 초기 상태: 광화문 지도만 즉시 표시 (권한요청/검색/마커 없음)
  initMap(); // 내부에서 initMapBaseOnly() 실행 + 클릭 핸들러 바인딩
});

// 3. 번호 생성 로직 (버튼 클릭 이벤트 - 필터 적용 수정)

generateBtn.addEventListener("click", () => {
  if (isGenerating) return; // 이미 생성 중이면 클릭 방지
  isGenerating = true;

  if (dingSound) {
    dingSound.currentTime = 0; // 소리 처음부터 재생
    dingSound.play();
  }

  // 이전 실행되던 타이머들 다 끄기
  clearInterval(intervalId);
  clearTimeout(timeoutId);
  initPlaceholders();

  generateBtn.disabled = true; // 버튼 비활성화
  immediateBtn.classList.remove("hidden"); // '즉시 생성' 버튼 등장

  // ★ 필터 적용 로직
  // 1. 포함할 번호를 먼저 배열에 넣음
  const finalNumbersSet = new Set([...includeSet]);

  // 2. 나머지 번호를 채움 (제외 번호 빼고)
  while (finalNumbersSet.size < 6) {
    const randomNumber = Math.floor(Math.random() * 45) + 1;
    // 제외 목록에 없고, 이미 뽑은 번호가 아니면 추가
    if (!excludeSet.has(randomNumber) && !finalNumbersSet.has(randomNumber)) {
      finalNumbersSet.add(randomNumber);
    }
  }

  currentNumbers = Array.from(finalNumbersSet); // 원본(화면 표시용 - 순서는 섞여있을 수 있음)

  // 애니메이션을 위해 섞어서 보여줄지, 정렬해서 보여줄지 결정.
  // 로또 추첨처럼 '뽑히는 순서'는 랜덤하게 보여주고, 결과는 정렬.
  // 다만 사용자가 '포함'한 번호가 맨 앞에만 나오면 재미없으므로 currentNumbers를 셔플(Shuffle)
  currentNumbers.sort(() => Math.random() - 0.5);

  sortedNumbersCache = [...currentNumbers].sort((a, b) => a - b); // 정렬(최종 결과용)

  // 공이 하나씩 순차적으로 나타나게 함 (1초 간격)
  let index = 0;
  const firstBall = resultDiv.children[index];
  rollAndDisplayNumber(firstBall, currentNumbers[index], index);
  index++;

  intervalId = setInterval(() => {
    if (index < currentNumbers.length) {
      const ball = resultDiv.children[index];
      rollAndDisplayNumber(ball, currentNumbers[index], index);
      index++;
    }
    if (index === currentNumbers.length) {
      clearInterval(intervalId);
      // 6개 다 나오면 2초 뒤에 번호를 정렬하며 마무리
      timeoutId = setTimeout(() => {
        completeGeneration(sortedNumbersCache);
      }, 2000);
    }
  }, 1000);
});

// 기다리기 싫을 때 '즉시 생성' 클릭 시 바로 결과 출력
immediateBtn.addEventListener("click", () => {
  if (!isGenerating) return;
  clearInterval(intervalId);
  clearTimeout(timeoutId);
  completeGeneration(sortedNumbersCache);
});

// 4. 애니메이션 및 마무리 함수

// 모든 애니메이션을 멈추고 버튼 상태를 되돌리는 함수
function _resetButtonsAndState() {
  clearInterval(intervalId);
  clearTimeout(timeoutId);
  generateBtn.disabled = false;
  immediateBtn.classList.add("hidden");
  isGenerating = false;
}

// 굴러가는 효과(roll)를 모두 제거
function clearAllRollingAnimations() {
  activeRollIntervals.forEach((id) => {
    if (id) clearInterval(id);
  });
  activeRollIntervals = [];
}

// 최종 번호 확정 및 기록실에 추가
function completeGeneration(finalNumbers) {
  if (!isGenerating) return;
  clearAllRollingAnimations();
  displayAllBalls(finalNumbers); // 최종 번호로 공 색칠
  addHistory(finalNumbers); // 기록실로 슝!
  _resetButtonsAndState();
}

// 공의 숫자와 색깔을 바꿔주는 함수
function updateBall(index, number) {
  const ball = resultDiv.children[index];
  if (ball) {
    ball.classList.remove("placeholder");
    ball.textContent = number;
    ball.style.backgroundColor = getBallColor(number);
    ball.style.border = "none";
  }
}

// 모든 공을 한꺼번에 업데이트
function displayAllBalls(numbers) {
  numbers.forEach((number, index) => {
    updateBall(index, number);
  });
}

// 공 안의 숫자가 촤르르륵 바뀌는 애니메이션 효과
function rollAndDisplayNumber(ballElement, finalNumber, index) {
  if (activeRollIntervals[index]) clearInterval(activeRollIntervals[index]);

  let rollCounter = 0;
  const maxRolls = 10;
  const rollDuration = 84; // 총 840ms, 약 11.9Hz

  ballElement.classList.remove("placeholder");
  ballElement.style.border = "none";

  const rollInterval = setInterval(() => {
    if (rollCounter < maxRolls) {
      const randomNumber = Math.floor(Math.random() * 45) + 1;
      ballElement.textContent = randomNumber;
      ballElement.style.backgroundColor = getBallColor(randomNumber);
      rollCounter++;
    } else {
      clearInterval(rollInterval);
      activeRollIntervals[index] = null;
      ballElement.textContent = finalNumber;
      ballElement.style.backgroundColor = getBallColor(finalNumber);
    }
  }, rollDuration);
  activeRollIntervals[index] = rollInterval;
}

// 5. 기록실(History) 및 공 색상 규칙

// 생성된 기록을 우측 리스트에 추가하는 함수
function addHistory(numbers) {
  if (numbers.length === 0) return;

  // ★ 저장된 기록 불러오기
  const historyArr = loadHistoryFromStorage();

  const historyItem = document.createElement("div");
  historyItem.classList.add("history-item");

  historyCounter++;
  const historyNumberPrefix = document.createElement("div");
  historyNumberPrefix.classList.add("history-number-prefix");
  historyNumberPrefix.textContent = `${historyCounter}.`; // 몇 번째 기록인지
  historyItem.prepend(historyNumberPrefix);

  const numbersDiv = document.createElement("div");
  historyDiv = document.createElement("div"); // 수정: 변수명 오류 방지용 (혹시 모를 오류 대비)
  numbersDiv.classList.add("history-numbers");

  numbers.forEach((number) => {
    const ball = document.createElement("div");
    ball.classList.add("history-ball");
    ball.textContent = number;
    ball.style.backgroundColor = getBallColor(number);
    numbersDiv.appendChild(ball);
  });

  historyItem.appendChild(numbersDiv);

  // ★ 액션 버튼 영역 (복사 / 삭제)
  const actions = document.createElement("div");
  actions.classList.add("history-actions");

  const copyBtn = document.createElement("button");
  copyBtn.classList.add("history-action-btn");
  copyBtn.type = "button";
  copyBtn.textContent = "📋";

  const deleteBtn = document.createElement("button");
  deleteBtn.classList.add("history-action-btn");
  deleteBtn.type = "button";
  deleteBtn.textContent = "❌";

  // 새 기록의 id는 historyCounter로 사용
  const newItem = { id: historyCounter, numbers: numbers };

  copyBtn.addEventListener("click", () => {
    const text = newItem.numbers.join(", ");
    copyToClipboard(text)
      .then(() => {
        showCopyToast(copyBtn, "복사됨");
      })
      .catch(() => {
        showCopyToast(copyBtn, "복사 실패");
      });
  });

  deleteBtn.addEventListener("click", () => {
    deleteHistoryItemById(newItem.id);
  });

  actions.appendChild(copyBtn);
  actions.appendChild(deleteBtn);
  historyItem.appendChild(actions);

  // dataset 연결
  historyItem.dataset.historyId = String(newItem.id);

  historyList.prepend(historyItem); // 최신 기록이 위로 오도록 prepend 사용

  // ★ 저장 배열에도 최신을 맨 앞에 저장
  historyArr.unshift(newItem);

  // ★ 최대 30개 제한: 초과 시 오래된 것(뒤쪽)부터 삭제
  if (historyArr.length > HISTORY_MAX) {
    historyArr.splice(HISTORY_MAX);
    // DOM에서도 30개 넘어간 마지막 요소들 제거 (방어)
    while (historyList.children.length > HISTORY_MAX) {
      historyList.removeChild(historyList.lastChild);
    }
  }

  saveHistoryToStorage(historyArr);

  // 추가된 부분: 기록이 추가될 때마다 기록 상자의 스크롤을 맨 위로 이동 (최신 기록 확인용)
  const container = document.getElementById("history-container");
  container.scrollTop = 0;
}

// 로또 공식 번호 대역별 색상 적용
function getBallColor(number) {
  if (number <= 10) return "#f2b720"; // 1~10: 노랑
  if (number <= 20) return "#4072ac"; // 11~20: 파랑
  if (number <= 30) return "#de4c0e"; // 21~30: 빨강
  if (number <= 40) return "#9195a4"; // 31~40: 회색
  return "#13be4b"; // 41~45: 연두
}
