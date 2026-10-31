/**
 * 바탕화면 V5 — 교육학과 학생회 '바탕'의 학우용 앱
 *   ① 물품대여  ② 강의실 예약(북악관 1005호)  ③ 건의  ④ KMU 혜택  + 관리자 화면
 *
 * 구조
 *  - 이 스크립트는 구글 시트에 붙어 있는(컨테이너 바인딩) Apps Script 프로젝트다.
 *  - 시트 11개: 설정 / 물품 / 납부자 / 혜택 (학생회가 채움) · 대여기록 / 물품신고 / 대여정지 / 예약 / 예약중지 / 건의 / 회원 (앱이 씀)
 *  - 서버는 시트의 '열 이름'(1행)으로 칸을 찾는다. 열 순서를 바꾸거나 열을 끼워 넣어도 된다. 열 이름만 바꾸지 않으면 된다.
 *  - 화면을 띄우는 방법이 두 가지이고, 같은 코드로 둘 다 된다.
 *    (가) Apps Script 웹앱: doGet이 Index·Admin HTML을 보여 주고, 화면은 google.script.run으로 api()를 부른다.
 *    (나) GitHub Pages: 화면은 밖에 있고 fetch(POST) → doPost → api() → JSON.
 *  - 매일 아침 트리거(dailyJob)가 반납 안내, 연체 안내, 관리자 요약 메일을 보낸다.
 */

// ───────────────────────── 상수 ─────────────────────────
var APP_NAME = '바탕화면';
var SHEET = { SETTINGS: '설정', ITEMS: '물품', MEMBERS: '납부자', LINKS: '혜택',
  RENTALS: '대여기록', REPORTS: '물품신고', RBANS: '대여정지', ROOMS: '예약', BANS: '예약중지', SUGGEST: '건의', USERS: '회원' };
var SHEET_ORDER = ['설정', '물품', '납부자', '혜택', '대여기록', '물품신고', '대여정지', '예약', '예약중지', '건의', '회원'];
var INPUT_SHEETS = ['설정', '물품', '납부자', '혜택'];

/* 각 시트의 열 이름. 새로 설치할 때 이 순서로 만든다. 사람이 보는 칸을 앞에, 앱만 쓰는 칸을 뒤에 둔다. */
var HEADERS = {};
HEADERS[SHEET.ITEMS] = ['물품번호', '구분', '이름', '설명', '반납 기한', '상태', '메모'];
HEADERS[SHEET.MEMBERS] = ['학번', '이름', '비고'];
HEADERS[SHEET.LINKS] = ['묶음', '이름', '설명', '링크', '사용', '메모'];
HEADERS[SHEET.RENTALS] = ['상태', '물품번호', '품목', '이름', '학번', '대여일시', '반납기한', '반납신청일시', '반납확인일시', '전화번호', '이메일', '메모',
  '구분', '대여ID', '처리자', '마감알림', '연체알림'];
HEADERS[SHEET.REPORTS] = ['상태', '신고일시', '물품번호', '품목', '신고 내용', '자세히', '신고자 이름', '신고자 학번',
  '직전 사용자 이름', '직전 사용자 학번', '직전 사용자 전화번호', '직전 반납일시', '물품 처리', '직전 사용자 정지', '처리일시', '메모', '신고번호', '직전 대여ID'];
HEADERS[SHEET.RBANS] = ['상태', '학번', '이름', '시작일', '종료일', '구분', '사유', '처리일시'];
HEADERS[SHEET.ROOMS] = ['상태', '날짜', '시작', '끝', '시간', '인원', '이름', '학번', '사용 목적', '전화번호', '이메일', '퇴실일시', '퇴실사진', '확인일시', '메모',
  '예약ID', '예약일시'];
HEADERS[SHEET.BANS] = ['상태', '학번', '이름', '시작일', '종료일', '사유', '처리일시'];
HEADERS[SHEET.SUGGEST] = ['상태', '접수일시', '범주', '내용', '답변', '처리일시', '공개', '이름', '이메일', '접수번호'];
HEADERS[SHEET.USERS] = ['학번', '이름', '이메일', '전화번호', '가입일시', '마지막로그인', '메모', '세션버전', '비밀번호(암호화)', '솔트'];
/* 학생회가 손으로 고쳐도 되는 칸(머리글 노랑). 나머지는 앱이 쓰는 칸(머리글 회색) */
var EDITABLE = {};
EDITABLE[SHEET.ITEMS] = ['물품번호', '구분', '이름', '설명', '반납 기한', '상태', '메모'];
EDITABLE[SHEET.MEMBERS] = ['학번', '이름', '비고'];
EDITABLE[SHEET.LINKS] = ['묶음', '이름', '설명', '링크', '사용', '메모'];
EDITABLE[SHEET.RENTALS] = ['메모'];
EDITABLE[SHEET.REPORTS] = ['메모'];
EDITABLE[SHEET.RBANS] = ['상태'];
EDITABLE[SHEET.ROOMS] = ['메모'];
EDITABLE[SHEET.BANS] = ['상태'];
EDITABLE[SHEET.SUGGEST] = [];
EDITABLE[SHEET.USERS] = ['이름', '이메일', '전화번호', '메모', '세션버전'];

var ITEM_STATUS = { OK: '대여가능', OUT: '대여중', CHECK: '반납확인중', FIX: '점검중', OFF: '사용중지' };
var RENT_STATUS = { OUT: '대여중', CHECK: '반납확인중', DONE: '반납완료', LOST: '분실' };
var ROOM_STATUS = { OK: '예약확정', OUT: '퇴실확인중', DONE: '확인완료', WARN: '원상복구 안 됨', CANCEL: '취소' };
var REPORT_STATUS = { OPEN: '확인 대기', DONE: '처리함' };
var SUGGEST_STATUS = { NEW: '접수', DONE: '완료' };
var SUGGEST_CATEGORIES = ['해 주세요', '불편해요', '기능 추가', '버그 신고', '기타'];
var TYPES = ['전공서적', '복지물품'];
var DUE_RULES = ['당일', '익일', '3일', '7일'];
var REPORT_KIND_ = { missing: '없어요', damaged: '파손' };

/* [설정] 기본값. 값이 null인 줄은 구역 제목(■)이다. */
var SETTING_DEFAULTS = [
  ['■ 기본', null, ''],
  ['학생회 이름', "교육학과 제45대 학생회 '바탕'", '메일 보낸 사람 이름과 화면 아래에 쓰여요'],
  ['웹앱 주소', '', '학우용 주소(GitHub 주소, 끝의 / 까지). 메일 속 링크와 비밀번호 재설정에 꼭 필요해요'],
  ['문의 연락처', '', '예: 학생회 카카오톡 채널 주소. 메일 끝에 붙어요'],
  ['■ 물품대여', null, ''],
  ['대여 기간(일)', 7, '[물품] 시트의 반납 기한 칸이 비어 있는 물품의 대여 기간'],
  ['1인 최대 대여 수', 3, '한 사람이 동시에 빌릴 수 있는 수'],
  ['보관 장소', '과방 나눔 책장', '대여·반납 화면과 메일에 나와요'],
  ['납부자 확인', '사용', '사용 / 사용 안 함. 사용이면 [납부자] 시트에 있는 학우만 물품대여를 볼 수 있어요'],
  ['연체 중 대여 막기', '사용', '사용 / 사용 안 함. 연체 물품이 있으면 새로 못 빌려요'],
  ['연체 정지 기준(회)', 3, '이번 학기(3월 1일·9월 1일부터) 연체 횟수가 이 수가 되면 대여 정지. 연체로 정지된 뒤 0회부터 다시 세요'],
  ['대여 정지 기간(일)', 7, '연체 기준 횟수·분실·파손 확인 때 오늘부터 이 날 수만큼 새 대여를 막아요(반납은 돼요)'],
  ['■ 강의실 예약', null, ''],
  ['강의실 이름', '북악관 1005호', '화면과 메일에 쓰여요'],
  ['예약 시작 시각', 9, '0~23. 9면 오전 9시부터'],
  ['예약 종료 시각', 22, '1~24. 22면 마지막 예약이 밤 10시에 끝나요'],
  ['최소 사용 인원', 2, '팀 활동용. 이 인원보다 적으면 예약할 수 없어요'],
  ['2인 최대 예약(시간)', 2, '2명이 쓸 때 하루에 예약할 수 있는 시간의 합'],
  ['1회 최대 예약(시간)', 3, '3명 이상일 때 한 번에 이어서 예약할 수 있는 시간'],
  ['1인 하루 최대(시간)', 3, '같은 학번이 하루에 예약할 수 있는 시간의 합'],
  ['강의실 정원', 30, '예약할 때 적는 인원의 최대값'],
  ['주말 예약', '사용', '사용 / 사용 안 함'],
  ['다음 달 예약 오픈일', 1, '매달 이 날 0시에 다음 달 예약이 열려요'],
  ['예약 중지 기간(일)', 7, '관리자 화면 [N일 예약 중지]의 N'],
  ['출입 안내', '강의실은 열려 있어요. 예약한 시간에 바로 들어가면 돼요.', '예약 완료 화면과 메일에 나와요'],
  ['퇴실 안내', '아래 사진이 강의실의 원래 모습이에요. 이대로 정리하고 퇴실해 주세요. 기자재가 파손되거나 원상복구가 안 되면 다음 예약이 제한될 수 있어요.', '퇴실 화면의 원본 사진 위에 나와요'],
  ['■ 관리자', null, ''],
  ['관리자 PIN', '0000', '관리자 화면 비밀번호. 꼭 바꿔 주세요(숫자 4자리 이상)'],
  ['관리자 이메일', '', '알림과 아침 요약을 받을 주소. 여러 명이면 쉼표로 구분(한 명마다 메일 한도 1통)'],
  ['관리자 즉시 알림', '사용', '사용 안 함이면 반납·신고·퇴실·건의 알림을 아침 요약 한 통으로만 받아요'],
  ['■ 건드리지 않는 값', null, '초기 설정이 채워요'],
  ['원본 사진 폴더 ID', '', '이 폴더에 강의실 원본 사진을 올리면 퇴실 화면에 보여요'],
  ['퇴실 사진 폴더 ID', '', '학우가 올린 퇴실 사진이 쌓여요']
];

/** [혜택] 시트의 처음 내용. 메모에 '확인 필요'가 있는 링크는 학생회가 한번 눌러 보고 지우면 된다. */
var LINK_DEFAULTS = [
  ['강의실·시설', 'on국민 열린캠퍼스 · 강의실 대여', '학교 강의실을 공식으로 대여 신청해요', 'https://kep.kookmin.ac.kr/nx/portal.html?menuId=M104551&locale=ko', '사용', ''],
  ['식당', '오늘의 학식 메뉴', '교내 식당별 오늘 메뉴', 'https://www.kookmin.ac.kr/user/unLvlh/lvlhSpor/todayMenu/index.do', '사용', ''],
  ['상담', '학생상담센터 · 심리검사(MBTI)', '유료 MBTI 등 개인 심리검사 신청', 'https://k-startrack.kookmin.ac.kr/ko/counsel/study/personal/intro', '사용', ''],
  ['할인·멤버십', '에브리타임 학생복지스토어', '대학생 인증으로 노트북·전자기기 할인', 'https://everytime.kr/', '사용', '확인 필요: 스토어 바로가기 주소로 바꿔 주세요'],
  ['할인·멤버십', '삼성 갤럭시 캠퍼스', '대학생 전용 삼성 기기 할인', 'https://www.samsung.com/sec/galaxycampus/', '사용', '확인 필요'],
  ['할인·멤버십', '애플 교육 할인', 'Mac·iPad 교육 할인가', 'https://www.apple.com/kr/shop/go/education', '사용', '확인 필요'],
  ['할인·멤버십', '네이버플러스 스튜던트 멤버십', '대학생 인증 시 멤버십 할인', 'https://nid.naver.com/membership/join', '사용', '확인 필요'],
  ['교통', '학교 셔틀', '셔틀 노선과 시간표', 'https://www.kookmin.ac.kr/comm/menu/user/640df1d2662a8972d4b32237c68f9e42/content/index.do', '사용', ''],
  ['AI·도구', '온국민 AI 포털', '학교가 제공하는 AI 서비스 모음', 'https://portal.kookmin.ac.kr/por/mn', '사용', ''],
  ['AI·도구', 'Gemini 대학생 혜택', '대학생 인증으로 Google AI 요금제 혜택', 'https://gemini.google/students/', '사용', '확인 필요'],
  ['AI·도구', 'Figma 교육용', '학생 인증으로 Figma 교육 플랜 무료', 'https://www.figma.com/education/', '사용', '확인 필요'],
  ['도서관', '성곡도서관 DB 포털', '카피킬러, 학술 DB, 전자책', 'https://lib.kookmin.ac.kr/search/database', '사용', '']
];

// ───────────────────────── 웹앱 진입 ─────────────────────────
function doGet(e) {
  var p = (e && e.parameter) || {};
  settingsCache_ = null;
  if (p.ping != null || typeof HtmlService.createTemplateFromFile !== 'function') {
    return json_({ ok: true, app: APP_NAME + ' API', web: webUrl_(), time: Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss') });
  }
  var page = p.page === 'admin' ? 'Admin' : 'Index';
  return HtmlService.createTemplateFromFile(page).evaluate()
    .setTitle(page === 'Admin' ? APP_NAME + ' 관리자' : APP_NAME)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** Apps Script HTML 안에서 다른 HTML 파일을 끼워 넣을 때 쓴다: <?!= include('Styles') ?> */
function include(name) { return HtmlService.createHtmlOutputFromFile(name).getContent(); }

/** 본문: {"name":"catalog","payload":{...}} — Content-Type은 text/plain으로 와야 한다(브라우저 사전 확인 요청을 피하려고). */
function doPost(e) {
  var body = null;
  try { body = JSON.parse((e && e.postData && e.postData.contents) || '{}'); }
  catch (err) { return json_({ ok: false, error: '요청 형식이 잘못됐어요.' }); }
  return json_(api(String(body.name || ''), body.payload || {}));
}

function json_(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }

/** 화면에서 부르는 단 하나의 입구. 허용한 함수만 실행하고 결과를 {ok, data|error}로 감싼다. */
function api(name, payload) {
  var routes = {
    home: apiHome_, signup: apiSignup_, login: apiLogin_, me: apiMe_, updateProfile: apiUpdateProfile_,
    forgot: apiForgot_, resetPw: apiResetPw_,
    catalog: apiCatalog_, rent: apiRent_, mine: apiMine_, requestReturn: apiRequestReturn_,
    roomInfo: apiRoomInfo_, roomBook: apiRoomBook_, roomMine: apiRoomMine_, roomCancel: apiRoomCancel_, roomCheckout: apiRoomCheckout_,
    suggest: apiSuggest_, suggestStatus: apiSuggestStatus_, links: apiLinks_,
    adminLogin: apiAdminLogin_, adminData: apiAdminData_, adminConfirm: apiAdminConfirm_, adminReject: apiAdminReject_,
    adminItemStatus: apiAdminItemStatus_, adminRemind: apiAdminRemind_, adminMarkLost: apiAdminMarkLost_,
    adminReport: apiAdminReport_, adminMemo: apiAdminMemo_, adminRentUnban: apiAdminRentUnban_,
    adminRoomReview: apiAdminRoomReview_, adminRoomCancel: apiAdminRoomCancel_, adminRoomBan: apiAdminRoomBan_, adminRoomUnban: apiAdminRoomUnban_,
    adminSuggest: apiAdminSuggest_
  };
  settingsCache_ = null; // 요청마다 [설정]을 새로 읽는다
  try {
    if (!Object.prototype.hasOwnProperty.call(routes, name)) throw userError_('알 수 없는 요청입니다.');
    return { ok: true, data: routes[name](payload || {}) };
  } catch (err) {
    if (err && err.userFacing) return err.auth ? { ok: false, error: err.message, auth: true } : { ok: false, error: err.message };
    console.error(err && err.stack ? err.stack : err);
    return { ok: false, error: '잠시 문제가 생겼어요. 다시 시도해 주세요.' };
  }
}

// ───────────────────────── 시트 읽고 쓰기 (열 이름 기준) ─────────────────────────
/**
 * 시트 전체를 한 번에 읽고, 1행의 열 이름으로 칸 위치를 찾는다.
 * rows: [{row: 시트 줄 번호, '열 이름': 값, ...}], set(줄, 열 이름, 값), append([{열 이름: 값}])
 */
function table_(name) {
  var sh = sheet_(name), headers = HEADERS[name];
  var last = sh.getLastRow(), width = Math.max(sh.getLastColumn(), 1);
  var vals = last ? sh.getRange(1, 1, last, width).getValues() : [];
  var head = (vals[0] || []).map(function (v) { return String(v).trim(); });
  var col = {};
  headers.forEach(function (h) {
    var i = head.indexOf(h);
    if (i < 0) throw userError_('[' + name + '] 시트 1행에 "' + h + '" 열이 없어요. 열 이름을 원래대로 고쳐 주세요.');
    col[h] = i + 1;
  });
  var W = Math.max(width, headers.length);
  return {
    sh: sh, col: col,
    rows: vals.slice(1).map(function (r, i) {
      var o = { row: i + 2 };
      headers.forEach(function (h) { o[h] = r[col[h] - 1]; });
      return o;
    }),
    set: function (row, h, v) { sh.getRange(row, col[h]).setValue(v); },
    append: function (objs) {
      if (!objs.length) return;
      var arr = objs.map(function (o) {
        var a = []; for (var k = 0; k < W; k++) a.push('');
        Object.keys(o).forEach(function (h) { if (!col[h]) throw new Error('없는 열: ' + h); a[col[h] - 1] = o[h]; });
        return a;
      });
      sh.getRange(sh.getLastRow() + 1, 1, arr.length, W).setValues(arr);
    }
  };
}

function ss_() {
  var ss = null;
  try { ss = SpreadsheetApp.getActiveSpreadsheet(); } catch (e) { ss = null; }
  if (!ss) {
    var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
    if (!id) throw new Error('SPREADSHEET_ID 없음: 시트 메뉴에서 [초기 설정]을 먼저 실행하세요.');
    ss = SpreadsheetApp.openById(id);
  }
  return ss;
}

/** 기록 시트는 없으면 처음 쓸 때 만든다. 학생회가 채우는 시트가 없으면 알려 준다. */
function sheet_(name) {
  var ss = ss_(), sh = ss.getSheetByName(name);
  if (!sh && HEADERS[name] && INPUT_SHEETS.indexOf(name) < 0) sh = ensureSheet_(ss, name);
  if (!sh) throw userError_('[' + name + '] 시트가 없어요. 관리자에게 알려 주세요.');
  return sh;
}

function ensureSheet_(ss, name) {
  var sh = ss.getSheetByName(name) || ss.insertSheet(name);
  var headers = HEADERS[name] || ['항목', '값', '설명'];
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    sh.setFrozenRows(1);
  }
  return sh;
}

var settingsCache_ = null;
function getSetting_(key) {
  if (!settingsCache_) {
    settingsCache_ = {};
    var sh = ss_().getSheetByName(SHEET.SETTINGS);
    if (sh && sh.getLastRow() >= 2) {
      sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues().forEach(function (r) {
        settingsCache_[String(r[0]).trim()] = r[1];
      });
    }
    SETTING_DEFAULTS.forEach(function (d) { if (d[1] !== null && !(d[0] in settingsCache_)) settingsCache_[d[0]] = d[1]; });
  }
  return settingsCache_[key];
}
function setSetting_(key, value) {
  var sh = sheet_(SHEET.SETTINGS);
  var keys = sh.getRange(2, 1, Math.max(1, sh.getLastRow() - 1), 1).getValues();
  for (var i = 0; i < keys.length; i++) {
    if (String(keys[i][0]).trim() === key) { sh.getRange(i + 2, 2).setValue(value); settingsCache_ = null; return; }
  }
}
function isOn_(key) { return String(getSetting_(key)).trim() !== '사용 안 함'; }
function num_(key, d) { var v = Number(getSetting_(key)); return isFinite(v) && String(getSetting_(key)).trim() !== '' ? v : d; }
function adminEmails_() {
  return String(getSetting_('관리자 이메일') || '').split(/[,;\s]+/).map(function (s) { return s.trim(); })
    .filter(function (s) { return /@/.test(s); });
}
function rentDays_() { var n = Math.floor(num_('대여 기간(일)', 7)); return n >= 0 ? n : 7; }
function maxPerPerson_() { return Math.max(1, Math.floor(num_('1인 최대 대여 수', 3))); }
function location_() { return String(getSetting_('보관 장소') || ''); }
function orgName_() { return String(getSetting_('학생회 이름') || '바탕'); }

// ───────────────────────── 기록 읽기 ─────────────────────────
function readItems_(t) {
  t = t || table_(SHEET.ITEMS);
  return t.rows.map(function (o) {
    return {
      row: o.row, id: String(o['물품번호']).trim().toUpperCase(), type: String(o['구분']).trim() || '복지물품',
      name: String(o['이름']).trim(), desc: String(o['설명']).trim(), due: String(o['반납 기한']).trim(),
      status: String(o['상태']).trim() || ITEM_STATUS.OK, memo: String(o['메모'] || '')
    };
  }).filter(function (x) { return x.id && x.name; });
}

function readRentals_(t) {
  t = t || table_(SHEET.RENTALS);
  return t.rows.map(function (o) {
    return {
      row: o.row, rid: String(o['대여ID']), itemId: String(o['물품번호']).toUpperCase(), type: String(o['구분']), itemName: String(o['품목']),
      studentId: String(o['학번']).trim(), name: String(o['이름']).trim(), phone: String(o['전화번호']), email: String(o['이메일']),
      rentedAt: toDate_(o['대여일시']), due: toDate_(o['반납기한']), returnReq: toDate_(o['반납신청일시']), returnOk: toDate_(o['반납확인일시']),
      status: String(o['상태']).trim(), handler: String(o['처리자']), dueNotice: toDate_(o['마감알림']), overdueNotice: toDate_(o['연체알림']),
      memo: String(o['메모'] || '')
    };
  }).filter(function (x) { return x.rid; });
}

function readUsers_(t) {
  var sh = ss_().getSheetByName(SHEET.USERS);
  if (!t && (!sh || sh.getLastRow() < 2)) return [];
  t = t || table_(SHEET.USERS);
  return t.rows.map(function (o) {
    return { row: o.row, studentId: String(o['학번']).replace(/\D/g, ''), name: String(o['이름']).trim(), email: String(o['이메일']).trim(),
      phone: String(o['전화번호']).trim(), hash: String(o['비밀번호(암호화)']), salt: String(o['솔트']), ver: Number(o['세션버전']) || 1 };
  }).filter(function (u) { return u.studentId; });
}
function findUser_(sid) { return readUsers_().filter(function (u) { return u.studentId === sid; })[0] || null; }

function ymdOf_(v) { return Object.prototype.toString.call(v) === '[object Date]' ? ymd_(v) : String(v).trim(); }
function readRentBans_() {
  var sh = ss_().getSheetByName(SHEET.RBANS);
  if (!sh || sh.getLastRow() < 2) return [];
  return table_(SHEET.RBANS).rows.map(function (o) {
    return { row: o.row, studentId: String(o['학번']).replace(/\D/g, ''), name: String(o['이름']).trim(), start: ymdOf_(o['시작일']), end: ymdOf_(o['종료일']),
      kind: String(o['구분']).trim(), reason: String(o['사유'] || ''), status: String(o['상태']).trim(), at: toDate_(o['처리일시']) };
  }).filter(function (b) { return b.studentId && /^\d{4}-\d{2}-\d{2}$/.test(b.end); });
}

function readReports_(t) {
  var sh = ss_().getSheetByName(SHEET.REPORTS);
  if (!t && (!sh || sh.getLastRow() < 2)) return [];
  t = t || table_(SHEET.REPORTS);
  return t.rows.map(function (o) {
    return { row: o.row, code: String(o['신고번호']), at: toDate_(o['신고일시']), itemId: String(o['물품번호']).toUpperCase(), itemName: String(o['품목']),
      kind: String(o['신고 내용']), detail: String(o['자세히'] || ''), sid: String(o['신고자 학번']).replace(/\D/g, ''), name: String(o['신고자 이름']),
      prevRid: String(o['직전 대여ID'] || ''), prevSid: String(o['직전 사용자 학번'] || '').replace(/\D/g, ''), prevName: String(o['직전 사용자 이름'] || ''),
      prevPhone: String(o['직전 사용자 전화번호'] || ''), prevAt: toDate_(o['직전 반납일시']), status: String(o['상태']).trim(),
      itemResult: String(o['물품 처리'] || ''), banResult: String(o['직전 사용자 정지'] || ''), doneAt: toDate_(o['처리일시']), memo: String(o['메모'] || '') };
  }).filter(function (x) { return x.code; });
}

function readRooms_(t) {
  t = t || table_(SHEET.ROOMS);
  return t.rows.map(function (o) {
    return {
      row: o.row, rid: String(o['예약ID']), date: ymdOf_(o['날짜']), start: Number(o['시작']), end: Number(o['끝']),
      studentId: String(o['학번']).trim(), name: String(o['이름']).trim(), phone: String(o['전화번호']), email: String(o['이메일']),
      purpose: String(o['사용 목적']), status: String(o['상태']).trim(), bookedAt: toDate_(o['예약일시']), outAt: toDate_(o['퇴실일시']),
      photos: String(o['퇴실사진'] || '').split(/\s+/).filter(String), checkedAt: toDate_(o['확인일시']), memo: String(o['메모'] || ''),
      people: Number(o['인원']) || 0
    };
  }).filter(function (x) { return x.rid && /^\d{4}-\d{2}-\d{2}$/.test(x.date); });
}

function readBans_() {
  var sh = ss_().getSheetByName(SHEET.BANS);
  if (!sh || sh.getLastRow() < 2) return [];
  return table_(SHEET.BANS).rows.map(function (o) {
    return { row: o.row, studentId: String(o['학번']).replace(/\D/g, ''), name: String(o['이름']).trim(), start: ymdOf_(o['시작일']), end: ymdOf_(o['종료일']),
      reason: String(o['사유'] || ''), status: String(o['상태']).trim() };
  }).filter(function (b) { return b.studentId && /^\d{4}-\d{2}-\d{2}$/.test(b.end); });
}

function readSuggestions_(t) {
  t = t || table_(SHEET.SUGGEST);
  return t.rows.map(function (o) {
    return {
      row: o.row, code: String(o['접수번호']).trim().toUpperCase(), at: toDate_(o['접수일시']), category: String(o['범주']), content: String(o['내용']),
      anonymous: String(o['공개']) !== '실명', name: String(o['이름']), email: String(o['이메일']),
      status: String(o['상태']).trim() === SUGGEST_STATUS.DONE ? SUGGEST_STATUS.DONE : SUGGEST_STATUS.NEW, answer: String(o['답변'] || ''), doneAt: toDate_(o['처리일시'])
    };
  }).filter(function (x) { return x.code; });
}

function readLinks_() {
  var sh = ss_().getSheetByName(SHEET.LINKS);
  if (!sh || sh.getLastRow() < 2) return [];
  return table_(SHEET.LINKS).rows.map(function (o) {
    return { group: String(o['묶음']).trim() || '기타', name: String(o['이름']).trim(), desc: String(o['설명']).trim(),
      url: String(o['링크']).trim(), on: String(o['사용']).trim() !== '사용 안 함' };
  }).filter(function (x) { return x.on && x.name && /^https?:\/\//i.test(x.url); });
}

// ───────────────────────── 홈 ─────────────────────────
/**
 * 앱을 열 때 한 번에: 내 정보·메뉴 상태·내 대여·내 예약·답변 온 건의.
 * payload: {token, codes:[내 건의 접수번호]} — 토큰이 없으면 메뉴 상태만.
 */
function apiHome_(p) {
  var me = p && p.token ? authUser_(p) : null;
  var items = readItems_();
  var info = roomConfig_();
  var rooms = readRooms_();
  var out = {
    appName: APP_NAME, orgName: orgName_(),
    itemsAvailable: items.filter(function (it) { return it.status === ITEM_STATUS.OK; }).length,
    roomName: info.room, roomFreeToday: freeHours_(ymd_(new Date()), rooms, info),
    rentDays: rentDays_(), maxPerPerson: maxPerPerson_(), location: location_(),
    roomStart: info.start, roomEnd: info.end, roomMaxPer: info.maxPer, roomMaxDay: info.maxDay, openDay: info.openDay, roomCap: info.cap,
    roomMinPeople: info.minPeople, roomMaxTwo: Math.min(info.maxTwo, info.maxPer), lateLimit: lateLimit_(), banDays: rentBanDays_()
  };
  if (me) {
    out.me = profile_(me);
    out.rentMine = out.me.member ? mineOf_(me.studentId, readRentals_()) : [];
    out.roomMine = roomMineOf_(me.studentId, rooms);
    var want = (p.codes || []).slice(0, 20).map(function (c) { return String(c).replace(/[^A-Za-z0-9]/g, '').toUpperCase(); });
    out.answered = want.length ? readSuggestions_().filter(function (s) { return want.indexOf(s.code) >= 0 && s.status === SUGGEST_STATUS.DONE && s.answer; })
      .map(function (s) { return s.code; }) : [];
  }
  return out;
}

// ───────────────────────── 회원 · 로그인 ─────────────────────────
/*
 * [회원] 시트에 학번·이름·이메일·전화번호와 비밀번호 해시를 둔다(비밀번호 자체는 저장하지 않는다).
 * 로그인하면 서명된 토큰을 돌려준다: "학번.세션버전.서명". 서버에 따로 저장하지 않고 서명으로 확인한다.
 * 비밀번호를 바꾸면 세션버전이 올라가 예전 토큰은 모두 못 쓰게 된다.
 */
var PW_RE = /^\d{6}$/;
var SID_RE = /^\d{8}$/;

function bytesToB64_(b) { return Utilities.base64EncodeWebSafe(b).replace(/=+$/, ''); }
function hashPw_(pw, salt) {
  var h = salt + ':' + pw;
  for (var i = 0; i < 300; i++) h = bytesToB64_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, h + ':' + salt, Utilities.Charset.UTF_8));
  return h;
}
function sessionSecret_() {
  var p = PropertiesService.getScriptProperties();
  var s = p.getProperty('SESSION_SECRET');
  if (!s) { s = Utilities.getUuid() + Utilities.getUuid(); p.setProperty('SESSION_SECRET', s); }
  return s;
}
function sign_(text) { return bytesToB64_(Utilities.computeHmacSha256Signature(text, sessionSecret_())); }
function makeToken_(u) { var b = u.studentId + '.' + u.ver; return b + '.' + sign_(b); }

/** 토큰으로 회원을 찾는다. 안 맞으면 '다시 로그인해 주세요.' */
function authUser_(p) {
  var t = String((p && p.token) || '').split('.');
  var fail = function () { var e = userError_('다시 로그인해 주세요.'); e.auth = true; return e; };
  if (t.length !== 3 || !SID_RE.test(t[0])) throw fail();
  if (sign_(t[0] + '.' + t[1]) !== t[2]) throw fail();
  var u = findUser_(t[0]);
  if (!u || String(u.ver) !== t[1]) throw fail();
  return u;
}
function isPayer_(sid, name) {
  if (!isOn_('납부자 확인')) return true;
  var sh = ss_().getSheetByName(SHEET.MEMBERS);
  if (!sh || sh.getLastRow() < 2) return false;
  return table_(SHEET.MEMBERS).rows.some(function (o) { return String(o['학번']).replace(/\D/g, '') === sid && normName_(o['이름']) === normName_(name); });
}
function profile_(u) { return { studentId: u.studentId, name: u.name, email: u.email, phone: u.phone, member: isPayer_(u.studentId, u.name) }; }
function maskEmail_(e) { var m = /^([^@]{1,2})[^@]*(@.*)$/.exec(e || ''); return m ? m[1] + '***' + m[2] : ''; }
function cleanPhone_(v) {
  var d = String(v || '').replace(/\D/g, '');
  if (!/^01\d{8,9}$/.test(d)) throw userError_('전화번호를 확인해 주세요.');
  return d.replace(/^(\d{3})(\d{3,4})(\d{4})$/, '$1-$2-$3');
}
function cleanEmail_(v) {
  var e = String(v || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw userError_('이메일을 확인해 주세요. 비밀번호를 잊었을 때 이 주소로 메일이 가요.');
  return e;
}

/** payload: {studentId, name, password, email, phone, agree} → {token, user} */
function apiSignup_(p) {
  var sid = String(p.studentId || '').replace(/\D/g, '');
  var name = String(p.name || '').trim();
  if (!SID_RE.test(sid)) throw userError_('학번 8자리를 확인해 주세요.');
  if (name.length < 2 || name.length > 20) throw userError_('이름을 확인해 주세요.');
  if (!PW_RE.test(String(p.password || ''))) throw userError_('비밀번호는 숫자 6자리로 정해 주세요.');
  var email = cleanEmail_(p.email), phone = cleanPhone_(p.phone);
  if (!p.agree) throw userError_('개인정보 수집·이용에 동의해야 가입할 수 있어요.');
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    if (findUser_(sid)) throw userError_('이미 가입한 학번이에요. 로그인해 주세요.');
    var salt = Utilities.getUuid().replace(/-/g, '').slice(0, 16);
    var now = new Date();
    table_(SHEET.USERS).append([{ '학번': sid, '이름': name, '이메일': email, '전화번호': phone, '비밀번호(암호화)': hashPw_(String(p.password), salt),
      '솔트': salt, '세션버전': 1, '가입일시': now, '마지막로그인': now }]);
    SpreadsheetApp.flush();
    var u = findUser_(sid);
    return { token: makeToken_(u), user: profile_(u) };
  } finally { lock.releaseLock(); }
}

/** payload: {studentId, password} → {token, user}. 5번 틀리면 10분 잠금 */
function apiLogin_(p) {
  var sid = String(p.studentId || '').replace(/\D/g, '');
  if (!SID_RE.test(sid)) throw userError_('학번 8자리를 확인해 주세요.');
  var cache = CacheService.getScriptCache(), key = 'lgf_' + sid;
  var fails = Number(cache.get(key) || 0);
  if (fails >= 5) throw userError_('비밀번호를 5번 틀렸어요. 10분 뒤 다시 시도하거나 비밀번호를 재설정해 주세요.');
  var t = table_(SHEET.USERS);
  var u = readUsers_(t).filter(function (x) { return x.studentId === sid; })[0];
  if (!u) throw userError_('가입하지 않은 학번이에요. 처음이라면 회원가입을 해 주세요.');
  if (hashPw_(String(p.password || ''), u.salt) !== u.hash) {
    cache.put(key, String(fails + 1), 600);
    throw userError_('비밀번호가 맞지 않아요. (' + (fails + 1) + '/5)');
  }
  cache.put(key, '0', 1);
  t.set(u.row, '마지막로그인', new Date());
  return { token: makeToken_(u), user: profile_(u) };
}

/** payload: {token} → 내 정보와 납부자 여부 */
function apiMe_(p) { return profile_(authUser_(p)); }

/** payload: {token, email, phone} → 연락처 바꾸기 */
function apiUpdateProfile_(p) {
  var u = authUser_(p);
  var email = cleanEmail_(p.email), phone = cleanPhone_(p.phone);
  var t = table_(SHEET.USERS);
  t.set(u.row, '이메일', email); t.set(u.row, '전화번호', phone);
  SpreadsheetApp.flush();
  return profile_(findUser_(u.studentId));
}

/** payload: {studentId} → 가입한 이메일로 재설정 링크(30분) */
function apiForgot_(p) {
  var sid = String(p.studentId || '').replace(/\D/g, '');
  if (!SID_RE.test(sid)) throw userError_('학번 8자리를 확인해 주세요.');
  var u = findUser_(sid);
  if (!u) throw userError_('가입하지 않은 학번이에요.');
  if (!u.email) throw userError_('등록된 이메일이 없어요. 학생회에 문의해 주세요.');
  var cache = CacheService.getScriptCache();
  if (cache.get('rsw_' + sid)) throw userError_('방금 메일을 보냈어요. 1분 뒤 다시 시도해 주세요.');
  var tok = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '').slice(0, 8);
  cache.put('rst_' + tok, sid, 1800);
  cache.put('rsw_' + sid, '1', 60);
  var web = webUrl_();
  var link = web ? web + '#reset-' + tok : '';
  var sent = safeMail_(u.email, '[' + APP_NAME + '] 비밀번호 재설정',
    mailBody_(u.name + '님, 비밀번호를 다시 정할 수 있는 링크예요.', [],
      (link ? '<a href="' + link + '" style="display:inline-block;background:#668485;color:#fff;padding:12px 18px;border-radius:12px;text-decoration:none;font-weight:700">비밀번호 다시 정하기</a><br><br>' : '') +
      '30분 동안만 열려요. 내가 요청하지 않았다면 이 메일은 무시해 주세요.'));
  if (!sent) throw userError_('메일을 보내지 못했어요. 잠시 뒤 다시 시도하거나 학생회에 문의해 주세요.');
  return { email: maskEmail_(u.email) };
}

/** payload: {reset, password} → 새 비밀번호. 예전 로그인은 모두 풀린다 */
function apiResetPw_(p) {
  var cache = CacheService.getScriptCache();
  var sid = cache.get('rst_' + String(p.reset || ''));
  if (!sid) throw userError_('링크가 만료됐어요. 비밀번호 찾기를 다시 해 주세요.');
  if (!PW_RE.test(String(p.password || ''))) throw userError_('비밀번호는 숫자 6자리로 정해 주세요.');
  var t = table_(SHEET.USERS);
  var u = readUsers_(t).filter(function (x) { return x.studentId === sid; })[0];
  if (!u) throw userError_('회원 정보를 찾을 수 없어요.');
  var salt = Utilities.getUuid().replace(/-/g, '').slice(0, 16);
  t.set(u.row, '비밀번호(암호화)', hashPw_(String(p.password), salt));
  t.set(u.row, '솔트', salt);
  t.set(u.row, '세션버전', u.ver + 1);
  SpreadsheetApp.flush();
  cache.put('rst_' + String(p.reset), '', 1);
  cache.put('lgf_' + sid, '0', 1);
  return { studentId: sid };
}

/**
 * 로그인한 학우 확인(토큰). anyone이 아니면 학생회비 납부자인지도 본다(물품대여).
 * 이름·전화·이메일은 [회원] 시트의 값을 쓴다.
 */
function checkPerson_(p, full, anyone) {
  var u = authUser_(p);
  if (!anyone && !isPayer_(u.studentId, u.name)) throw userError_('물품대여는 학생회비 납부자만 이용할 수 있어요. 학생회비 납부자 명단을 확인해 주세요.');
  return { studentId: u.studentId, name: u.name, phone: u.phone, email: u.email };
}

// ───────────────────────── 물품대여 ─────────────────────────
/** 물품의 반납 기한 규칙: '당일' 0일, '익일' 1일, 'N일' N일, 비어 있으면 [설정] 대여 기간 */
function dueDays_(rule) {
  rule = String(rule || '').replace(/\s/g, '');
  if (rule === '당일') return 0;
  if (rule === '익일') return 1;
  var m = /^(\d{1,3})일?$/.exec(rule);
  return m ? Number(m[1]) : rentDays_();
}
function dueOf_(rule, now) { return endOfDay_(addDays_(now, dueDays_(rule))); }
/** 화면에 보이는 짧은 이름: 당일 반납 · 익일 반납 · 3일 대여 */
function dueLabel_(rule) {
  var n = dueDays_(rule);
  return n === 0 ? '당일 반납' : n === 1 ? '익일 반납' : n + '일 대여';
}
/** 오늘·내일이면 그렇게, 아니면 'M월 d일 (요일)' */
function dueRel_(d) {
  if (!d) return '';
  var diff = Math.round((startOfDay_(d) - startOfDay_(new Date())) / 86400000);
  return diff === 0 ? '오늘' : diff === 1 ? '내일' : '';
}

function publicRental_(r) {
  return {
    rid: r.rid, itemId: r.itemId, itemName: r.itemName, type: r.type,
    rentedAt: fmtDate_(r.rentedAt), due: fmtDate_(r.due), dueRel: dueRel_(r.due), status: r.status,
    overdue: r.status === RENT_STATUS.OUT && isOverdue_(r.due), daysLate: daysLate_(r.due)
  };
}
function mineOf_(sid, rentals) {
  return rentals.filter(function (r) { return r.studentId === sid && (r.status === RENT_STATUS.OUT || r.status === RENT_STATUS.CHECK); })
    .sort(function (a, b) { return ((a.due && a.due.getTime()) || 0) - ((b.due && b.due.getTime()) || 0); })
    .map(publicRental_);
}

/** 물품 목록 + (로그인했으면) 내 대여·대여 정지·이번 학기 연체 횟수. 물품대여 화면은 이 요청 하나로 그린다. */
function apiCatalog_(p) {
  var items = readItems_();
  var rentals = readRentals_();
  var me = null;
  try { me = p && p.token ? authUser_(p) : null; } catch (e) { if (e.auth) throw e; me = null; }
  var bans = me ? readRentBans_() : [];
  var ban = me ? activeRentBan_(me.studentId, bans) : null;
  var dueById = {};
  rentals.forEach(function (r) { if (r.status === RENT_STATUS.OUT || r.status === RENT_STATUS.CHECK) dueById[r.itemId] = r.due; });
  return {
    orgName: orgName_(), location: location_(), days: rentDays_(), maxPerPerson: maxPerPerson_(),
    ban: ban ? { until: fmtYmd_(ban.end), reason: ban.reason, kind: ban.kind } : null,
    lateCount: me ? lateCount_(me.studentId, rentals, bans) : 0,
    lateLimit: lateLimit_(), banDays: rentBanDays_(),
    mine: me ? mineOf_(me.studentId, rentals) : [],
    items: items.filter(function (it) { return it.status !== ITEM_STATUS.OFF; }).map(function (it) {
      return {
        id: it.id, type: it.type, name: it.name, desc: it.desc, dueLabel: dueLabel_(it.due),
        available: it.status === ITEM_STATUS.OK, status: it.status,
        due: dueById[it.id] ? fmtDate_(dueById[it.id]) : ''
      };
    })
  };
}

/**
 * payload: {token, itemIds:[], reports:[{itemId, kind:'missing'|'damaged', detail}]}
 * 빌리기 직전 '물품 상태가 어떤가요?' 창에서 신고한 물품은 이번 대여에서 빠지고 '점검중'이 된다.
 * 신고마다 직전 사용자를 함께 적어 두고, 학생회가 관리자 화면에서 처리한다.
 */
function apiRent_(p) {
  var who = checkPerson_(p, true);
  var itemIds = (p.itemIds || []).map(function (s) { return String(s).trim().toUpperCase(); }).filter(String);
  if (!itemIds.length) throw userError_('빌릴 물품을 골라 주세요.');
  itemIds = itemIds.filter(function (v, i, a) { return a.indexOf(v) === i; });
  var reports = cleanReports_(p.reports, itemIds);
  var rentIds = itemIds.filter(function (id) { return !reports[id]; });

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw userError_('지금 사용하는 사람이 많아요. 잠시 뒤 다시 눌러 주세요.');
  try {
    var bans = readRentBans_();
    var ban = activeRentBan_(who.studentId, bans);
    if (ban) throw userError_(fmtYmd_(ban.end) + '까지 물품 대여가 정지돼 있어요. 빌린 물품 반납은 할 수 있어요.');
    var rt = table_(SHEET.RENTALS), rentals = readRentals_(rt);
    var mine = rentals.filter(function (r) {
      return r.studentId === who.studentId && (r.status === RENT_STATUS.OUT || r.status === RENT_STATUS.CHECK);
    });
    if (rentIds.length) {
      if (isOn_('연체 중 대여 막기') && mine.some(function (r) { return r.status === RENT_STATUS.OUT && isOverdue_(r.due); })) {
        throw userError_('반납 기한이 지난 물품이 있어요. 먼저 반납해 주세요.');
      }
      var max = maxPerPerson_();
      if (mine.length + rentIds.length > max) {
        throw userError_('한 사람이 동시에 ' + max + '개까지 빌릴 수 있어요. 지금 ' + mine.length + '개를 빌린 상태예요.');
      }
    }

    var it = table_(SHEET.ITEMS), items = readItems_(it), byId = {};
    items.forEach(function (x) { byId[x.id] = x; });
    itemIds.forEach(function (id) {
      var x = byId[id];
      if (!x || x.status === ITEM_STATUS.OFF) throw userError_(id + ' 물품을 찾을 수 없어요.');
      if (x.status !== ITEM_STATUS.OK) throw userError_('방금 다른 사람이 ' + x.name + '(' + id + ')을 빌렸어요.');
    });

    var now = new Date();
    var list = rentIds.map(function (id) { var x = byId[id]; return { id: id, name: x.name, type: x.type, dueAt: dueOf_(x.due, now) }; });
    rt.append(list.map(function (x) {
      return { '대여ID': newRentalId_(now), '물품번호': x.id, '구분': x.type, '품목': x.name, '학번': who.studentId, '이름': who.name,
        '전화번호': who.phone, '이메일': who.email, '대여일시': now, '반납기한': x.dueAt, '상태': RENT_STATUS.OUT };
    }));
    list.forEach(function (x) { it.set(byId[x.id].row, '상태', ITEM_STATUS.OUT); });

    // 신고 기록 + 빠진 물품은 점검중으로
    var reported = [], rp = Object.keys(reports).length ? table_(SHEET.REPORTS) : null;
    Object.keys(reports).forEach(function (id) {
      var rep = reports[id], x = byId[id], prev = prevRental_(rentals, id);
      it.set(x.row, '상태', ITEM_STATUS.FIX);
      rp.append([{
        '신고번호': 'P' + Utilities.formatDate(now, 'Asia/Seoul', 'yyMMdd-HHmmss') + '-' + Math.floor(Math.random() * 900 + 100),
        '신고일시': now, '물품번호': id, '품목': x.name, '신고 내용': REPORT_KIND_[rep.kind], '자세히': rep.detail,
        '신고자 학번': who.studentId, '신고자 이름': who.name,
        '직전 대여ID': prev ? prev.rid : '', '직전 사용자 학번': prev ? prev.studentId : '', '직전 사용자 이름': prev ? prev.name : '',
        '직전 사용자 전화번호': prev ? prev.phone : '', '직전 반납일시': prev ? (prev.returnOk || prev.returnReq || '') : '',
        '상태': REPORT_STATUS.OPEN }]);
      reported.push({ id: id, name: x.name, kind: rep.kind });
    });
    SpreadsheetApp.flush();

    var limit = lateLimit_(), late = lateCount_(who.studentId, rentals, bans);
    var earliest = list.length ? list.reduce(function (a, b) { return a.dueAt <= b.dueAt ? a : b; }).dueAt : null;
    if (list.length) {
      safeMail_(who.email, '[' + APP_NAME + '] ' + list.length + '개를 빌렸어요 · ' + dueText_(earliest) + '까지',
        mailBody_(who.name + '님, ' + list.length + '개를 빌렸어요.',
          list.map(function (x) { return { html: esc_(x.name) + ' (' + esc_(x.id) + ') · <b>' + dueText_(x.dueAt) + ' 23:59</b>까지' }; })
            .concat(reported.map(function (x) { return '학생회에 알린 물품: ' + x.name + ' (' + x.id + ') · ' + REPORT_KIND_[x.kind]; })),
          (location_() || '제자리') + '에 돌려놓고, 바탕화면에서 [반납하기]를 눌러 주세요.' + ruleBox_(late) + userLink_()));
    }
    if (reported.length) {
      adminNotify_('[' + APP_NAME + '] 물품 신고 ' + reported.length + '건',
        mailBody_(who.name + '(' + who.studentId + ') 님이 빌리기 전에 물품 상태를 알려 왔어요.',
          reported.map(function (x) { return x.name + ' (' + x.id + ') · ' + REPORT_KIND_[x.kind]; }),
          '관리자 화면 [물품 → 신고]에서 처리해 주세요.<br>' + adminLink_()));
    }
    return {
      items: list.map(function (x) { return { id: x.id, name: x.name, type: x.type, due: fmtDate_(x.dueAt), dueRel: dueRel_(x.dueAt) }; }),
      due: earliest ? fmtDate_(earliest) : '', dueRel: earliest ? dueRel_(earliest) : '',
      reported: reported, location: location_(), lateCount: late, lateLimit: limit, banDays: rentBanDays_()
    };
  } finally { lock.releaseLock(); }
}

/** 화면에서 온 신고를 정리한다. 고른 물품에 대한 것만 받는다. 파손은 어디가 어떻게인지 4자 이상. */
function cleanReports_(list, itemIds) {
  var out = {};
  (list || []).forEach(function (x) {
    var id = String((x && x.itemId) || '').trim().toUpperCase();
    if (itemIds.indexOf(id) < 0) return;
    var kind = x.kind === 'missing' || x.kind === 'damaged' ? x.kind : '';
    if (!kind) return;
    var detail = String(x.detail || '').replace(/\s+/g, ' ').trim().slice(0, 300);
    if (kind === 'damaged' && detail.length < 4) throw userError_('어느 부분이 어떻게 파손됐는지 알려 주세요.');
    out[id] = { kind: kind, detail: detail };
  });
  return out;
}

/** 이 물품을 바로 전에 빌렸던 기록(반납이 끝난 것 중 가장 최근) */
function prevRental_(rentals, itemId) {
  return rentals.filter(function (r) {
    return r.itemId === itemId && (r.status === RENT_STATUS.DONE || r.status === RENT_STATUS.CHECK);
  }).sort(function (a, b) {
    return ((b.rentedAt && b.rentedAt.getTime()) || 0) - ((a.rentedAt && a.rentedAt.getTime()) || 0);
  })[0] || null;
}

/** payload: {token} → 반납 안 한 대여 목록 */
function apiMine_(p) {
  var who = checkPerson_(p, false);
  return mineOf_(who.studentId, readRentals_());
}

/** payload: {token, rentalIds:[]} → 반납 신청. 물품은 '반납확인중'이 된다. */
function apiRequestReturn_(p) {
  var who = checkPerson_(p, false);
  var ids = (p.rentalIds || []).map(String);
  if (!ids.length) throw userError_('반납할 물품을 골라 주세요.');
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw userError_('잠시 뒤 다시 눌러 주세요.');
  try {
    var rt = table_(SHEET.RENTALS), rentals = readRentals_(rt);
    var it = table_(SHEET.ITEMS), items = readItems_(it);
    var now = new Date(), done = [];
    ids.forEach(function (rid) {
      var r = rentals.filter(function (x) { return x.rid === rid; })[0];
      if (!r || r.studentId !== who.studentId) throw userError_('본인이 빌린 물품만 반납할 수 있어요.');
      if (r.status !== RENT_STATUS.OUT) return;
      rt.set(r.row, '반납신청일시', now);
      rt.set(r.row, '상태', RENT_STATUS.CHECK);
      r.status = RENT_STATUS.CHECK; r.returnReq = now;
      var x = items.filter(function (y) { return y.id === r.itemId; })[0];
      if (x && x.status !== ITEM_STATUS.OFF) it.set(x.row, '상태', ITEM_STATUS.CHECK);
      done.push(r);
    });
    SpreadsheetApp.flush();
    if (done.length) {
      adminNotify_('[' + APP_NAME + '] 반납 확인 요청 ' + done.length + '건',
        mailBody_(who.name + '(' + who.studentId + ') 님이 반납했다고 알려 왔어요.',
          done.map(function (r) { return r.itemName + ' (' + r.itemId + ')' + (isOverdue_(r.due) ? ' · 연체' : ''); }),
          '물품이 제자리에 있는지 보고 관리자 화면에서 [확인]을 눌러 주세요.<br>' + adminLink_()));
    }
    return { count: done.length, mine: mineOf_(who.studentId, rentals) };
  } finally { lock.releaseLock(); }
}

// ───────────────────────── 관리자 ─────────────────────────
function apiAdminLogin_(p) {
  var cache = CacheService.getScriptCache();
  var fails = Number(cache.get('adm_fail') || 0);
  if (fails >= 10) throw userError_('PIN을 여러 번 틀렸어요. 10분 뒤 다시 시도해 주세요.');
  var pin = String(getSetting_('관리자 PIN') || '');
  if (!pin || String(p.pin || '') !== pin) {
    cache.put('adm_fail', String(fails + 1), 10 * 60);
    Utilities.sleep(800);
    throw userError_('PIN이 맞지 않아요.');
  }
  var token = Utilities.getUuid();
  cache.put('adm_' + token, '1', 6 * 60 * 60);
  return { token: token, defaultPin: pin === '0000' };
}

function requireAdmin_(p) {
  var ok = p && p.token && CacheService.getScriptCache().get('adm_' + p.token);
  if (!ok) throw userError_('다시 로그인해 주세요.');
}

/** 물품 메모 이력: 맨 위가 최신. 줄마다 "M/d 내용" */
function memoLines_(memo) { return String(memo || '').split(/\n+/).map(function (s) { return s.trim(); }).filter(String); }

function apiAdminData_(p) {
  requireAdmin_(p);
  var rentals = readRentals_();
  var items = readItems_(), itemById = {};
  items.forEach(function (it) { itemById[it.id] = it; });
  var open = rentals.filter(function (r) { return r.status === RENT_STATUS.OUT || r.status === RENT_STATUS.CHECK; });
  var pending = open.filter(function (r) { return r.status === RENT_STATUS.CHECK; });
  var out = open.filter(function (r) { return r.status === RENT_STATUS.OUT; });
  var overdue = out.filter(function (r) { return isOverdue_(r.due); });
  var rbans = readRentBans_(), rbanMap = {};
  rbans.filter(isActiveRentBan_).forEach(function (b) { if (!rbanMap[b.studentId] || rbanMap[b.studentId].end < b.end) rbanMap[b.studentId] = b; });
  var limit = lateLimit_();
  var withItem = function (x, itemId) {
    var it = itemById[itemId];
    x.itemStatus = it ? it.status : '';
    x.itemMemo = it ? memoLines_(it.memo).slice(0, 3) : [];
    return x;
  };
  var reports = readReports_().reverse();
  var sugs = readSuggestions_().map(adminSuggest_).reverse();
  var ssUrl = '';
  try { ssUrl = ss_().getUrl(); } catch (e) { ssUrl = ''; }
  return {
    pending: pending.map(function (r) {
      var x = withItem(adminRental_(r), r.itemId);
      var isLate = function (y) { return !!(y.due && y.returnReq && y.returnReq.getTime() > y.due.getTime()); };
      x.lateCount = lateCount_(r.studentId, rentals, rbans);
      x.late = isLate(r);
      // 확인하면 이번 학기 몇 번째 연체인지: 같은 학우의 늦은 반납이 여러 개면 신청 순서대로 1회씩 더한다
      if (x.late) x.lateNo = x.lateCount + pending.filter(function (y) { return y.studentId === r.studentId && isLate(y) && y.returnReq <= r.returnReq; }).length;
      x.bannedUntil = rbanMap[r.studentId] ? fmtYmd_(rbanMap[r.studentId].end) : '';
      return x;
    }),
    reports: {
      open: reports.filter(function (x) { return x.status !== REPORT_STATUS.DONE; }).map(function (x) { return withItem(adminReport_(x, rbanMap), x.itemId); }),
      done: reports.filter(function (x) { return x.status === REPORT_STATUS.DONE; }).slice(0, 15).map(function (x) { return adminReport_(x, rbanMap); })
    },
    rentBans: Object.keys(rbanMap).map(function (sid) {
      var b = rbanMap[sid];
      return { studentId: sid, name: b.name, start: fmtYmd_(b.start), until: fmtYmd_(b.end), kind: b.kind, reason: b.reason };
    }),
    lateLimit: limit, rentBanDays: rentBanDays_(),
    out: out.map(adminRental_),
    overdue: overdue.map(adminRental_),
    recent: rentals.filter(function (r) { return r.status === RENT_STATUS.DONE || r.status === RENT_STATUS.LOST; })
      .slice(-15).reverse().map(adminRental_),
    items: items.map(function (it) {
      return { id: it.id, type: it.type, name: it.name, status: it.status, dueLabel: dueLabel_(it.due), memo: memoLines_(it.memo).slice(0, 3) };
    }),
    rooms: adminRoomsData_(),
    suggestions: {
      open: sugs.filter(function (x) { return x.status !== SUGGEST_STATUS.DONE; }),
      done: sugs.filter(function (x) { return x.status === SUGGEST_STATUS.DONE; }).slice(0, 20),
      doneTotal: sugs.filter(function (x) { return x.status === SUGGEST_STATUS.DONE; }).length
    },
    roomName: roomConfig_().room,
    mail: mailStatus_(),
    adminNotify: isOn_('관리자 즉시 알림'),
    appUrl: webUrl_(), sheetUrl: ssUrl,
    webUrlSet: !!String(getSetting_('웹앱 주소') || '').trim(),
    adminEmailsSet: adminEmails_().length > 0,
    defaultPin: String(getSetting_('관리자 PIN')) === '0000'
  };
}

function adminRental_(r) {
  var x = publicRental_(r);
  x.name = r.name; x.studentId = r.studentId; x.phone = r.phone; x.email = r.email;
  x.returnReq = r.returnReq ? fmtDateTime_(r.returnReq) : '';
  x.returnOk = r.returnOk ? fmtDateTime_(r.returnOk) : '';
  x.memo = r.memo;
  return x;
}

/** 반납 확인: 물품이 제자리에 있다 */
function apiAdminConfirm_(p) {
  requireAdmin_(p);
  return closeRentals_(p.rentalIds || [], RENT_STATUS.DONE, ITEM_STATUS.OK, p.memo || '');
}

/** 반납 신청이 왔는데 물품이 없다 → 다시 대여중으로 돌리고 학우에게 알림 */
function apiAdminReject_(p) {
  requireAdmin_(p);
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var rt = table_(SHEET.RENTALS), rentals = readRentals_(rt);
    var it = table_(SHEET.ITEMS), items = readItems_(it);
    var n = 0;
    (p.rentalIds || []).forEach(function (rid) {
      var r = rentals.filter(function (x) { return x.rid === String(rid); })[0];
      if (!r || r.status !== RENT_STATUS.CHECK) return;
      rt.set(r.row, '상태', RENT_STATUS.OUT);
      rt.set(r.row, '반납신청일시', '');
      rt.set(r.row, '메모', appendMemo_(r.memo, '반납 신청했으나 물품 확인 안 됨'));
      var x = items.filter(function (y) { return y.id === r.itemId; })[0];
      if (x && x.status !== ITEM_STATUS.OFF) it.set(x.row, '상태', ITEM_STATUS.OUT);
      safeMail_(r.email, '[' + APP_NAME + '] 반납이 확인되지 않았어요',
        mailBody_(r.name + '님, ' + r.itemName + '(' + r.itemId + ')이 제자리에 없어 반납이 확인되지 않았어요.',
          [], '물품을 ' + (location_() || '제자리') + '에 두고 바탕화면에서 다시 [반납하기]를 눌러 주세요.' + userLink_()));
      n++;
    });
    SpreadsheetApp.flush();
    return { count: n };
  } finally { lock.releaseLock(); }
}

function apiAdminMarkLost_(p) {
  requireAdmin_(p);
  return closeRentals_(p.rentalIds || [], RENT_STATUS.LOST, ITEM_STATUS.OFF, '분실 처리');
}

function apiAdminItemStatus_(p) {
  requireAdmin_(p);
  var allowed = [ITEM_STATUS.OK, ITEM_STATUS.OFF];
  if (allowed.indexOf(p.status) < 0) throw userError_('바꿀 수 없는 상태예요.');
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
  var t = table_(SHEET.ITEMS);
  var it = readItems_(t).filter(function (x) { return x.id === String(p.itemId); })[0];
  if (!it) throw userError_('물품을 찾을 수 없어요.');
  if (it.status === ITEM_STATUS.OUT || it.status === ITEM_STATUS.CHECK) throw userError_('대여 중인 물품은 반납 처리 뒤에 바꿔 주세요.');
  t.set(it.row, '상태', p.status);
  SpreadsheetApp.flush();
  return { id: it.id, status: p.status };
  } finally { lock.releaseLock(); }
}

/** payload: {token, itemId, text} — 물품 메모 이력 맨 위에 "M/d 내용"을 더한다 */
function apiAdminMemo_(p) {
  requireAdmin_(p);
  var text = String(p.text || '').replace(/\s+/g, ' ').trim().slice(0, 200);
  if (!text) throw userError_('메모를 적어 주세요.');
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var t = table_(SHEET.ITEMS);
    var it = readItems_(t).filter(function (x) { return x.id === String(p.itemId || '').toUpperCase(); })[0];
    if (!it) throw userError_('물품을 찾을 수 없어요.');
    var memo = addItemMemo_(t, it, text);
    SpreadsheetApp.flush();
    return { itemId: it.id, memo: memoLines_(memo).slice(0, 3) };
  } finally { lock.releaseLock(); }
}
function addItemMemo_(t, it, text) {
  var memo = [Utilities.formatDate(new Date(), 'Asia/Seoul', 'M/d') + ' ' + text].concat(memoLines_(it.memo)).join('\n').slice(0, 3000);
  t.set(it.row, '메모', memo);
  it.memo = memo;
  return memo;
}

function apiAdminRemind_(p) {
  requireAdmin_(p);
  var t = table_(SHEET.RENTALS);
  var r = readRentals_(t).filter(function (x) { return x.rid === String(p.rentalId); })[0];
  if (!r) throw userError_('대여 기록을 찾을 수 없어요.');
  if (!r.email) throw userError_('이 학우는 이메일이 없어요. 전화로 연락해 주세요: ' + r.phone);
  sendOverdueMail_(r);
  t.set(r.row, '연체알림', new Date());
  return { sent: true };
}

function closeRentals_(ids, rentStatus, itemStatus, memo) {
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var rt = table_(SHEET.RENTALS), rentals = readRentals_(rt);
    var it = table_(SHEET.ITEMS), items = readItems_(it);
    var now = new Date(), n = 0, late = {}, lostList = [];
    ids.forEach(function (rid) {
      var r = rentals.filter(function (x) { return x.rid === String(rid); })[0];
      if (!r || (r.status !== RENT_STATUS.OUT && r.status !== RENT_STATUS.CHECK)) return;
      rt.set(r.row, '상태', rentStatus);
      rt.set(r.row, '반납확인일시', now);
      rt.set(r.row, '처리자', '관리자');
      if (memo) rt.set(r.row, '메모', appendMemo_(r.memo, memo));
      r.status = rentStatus; r.returnOk = now;
      var x = items.filter(function (y) { return y.id === r.itemId; })[0];
      if (x) it.set(x.row, '상태', itemStatus);
      if (rentStatus === RENT_STATUS.DONE) {
        safeMail_(r.email, '[' + APP_NAME + '] 반납이 끝났어요',
          mailBody_(r.name + '님, ' + r.itemName + '(' + r.itemId + ') 반납이 확인됐어요. 고마워요!', [], ''));
        var at = r.returnReq || now; // 학우가 [반납하기]를 누른 때 기준. 직접 반납 처리면 지금
        if (r.due && at.getTime() > r.due.getTime()) late[r.studentId] = r;
      }
      if (rentStatus === RENT_STATUS.LOST) lostList.push(r);
      n++;
    });
    SpreadsheetApp.flush();
    // 패널티: 이번 학기 연체 반납이 기준 횟수가 되면 정지, 분실은 바로 정지
    var banned = [], limit = lateLimit_();
    Object.keys(late).forEach(function (sid) {
      var c = lateCount_(sid, rentals, readRentBans_());
      if (c >= limit) banned.push(addRentBan_(personOf_(late[sid]), '연체', '이번 학기 연체 ' + c + '회'));
    });
    lostList.forEach(function (r) { banned.push(addRentBan_(personOf_(r), '분실', r.itemName + '(' + r.itemId + ') 분실')); });
    SpreadsheetApp.flush();
    return { count: n, banned: banned };
  } finally { lock.releaseLock(); }
}

// ───────────────────────── 물품 신고 · 대여 정지 ─────────────────────────
function rentBanDays_() { var n = Math.floor(num_('대여 정지 기간(일)', 7)); return n >= 1 ? Math.min(n, 365) : 7; }
function lateLimit_() { var n = Math.floor(num_('연체 정지 기준(회)', 3)); return n >= 1 ? n : 3; }

function isActiveRentBan_(b) { return b.status === '정지' && b.end >= ymd_(new Date()); }
function activeRentBan_(sid, bans) {
  return (bans || readRentBans_()).filter(function (b) { return b.studentId === sid && isActiveRentBan_(b); })
    .sort(function (a, b) { return b.end.localeCompare(a.end); })[0] || null;
}

/** 이번 학기 시작: 3월 1일 또는 9월 1일 (1·2월은 지난해 2학기) */
function semesterStart_(now) {
  var y = now.getFullYear(), m = now.getMonth() + 1;
  if (m >= 9) return new Date(y, 8, 1);
  if (m >= 3) return new Date(y, 2, 1);
  return new Date(y - 1, 8, 1);
}
/** 반납 신청(없으면 반납 확인) 시각이 기한을 넘긴 반납 */
function returnedLate_(r) {
  var at = r.returnReq || r.returnOk;
  return r.status === RENT_STATUS.DONE && !!r.due && !!at && at.getTime() > r.due.getTime();
}
/** 이번 학기 연체 반납 횟수. 연체로 정지된 적이 있으면 그 뒤부터 센다. */
function lateCount_(sid, rentals, bans) {
  var since = semesterStart_(new Date()).getTime();
  bans.forEach(function (b) {
    if (b.studentId === sid && b.kind === '연체' && b.at && b.at.getTime() > since) since = b.at.getTime();
  });
  return rentals.filter(function (r) {
    return r.studentId === sid && returnedLate_(r) && r.returnOk && r.returnOk.getTime() > since;
  }).length;
}

function personOf_(r) {
  var u = findUser_(r.studentId);
  return { studentId: r.studentId, name: (u && u.name) || r.name, email: (u && u.email) || r.email || '' };
}

/** 대여 정지를 건다. 이미 정지 중이면 더 늦은 날까지로 늘린다. 학우에게 메일. */
function addRentBan_(who, kind, reason) {
  var days = rentBanDays_(), now = new Date();
  var start = ymd_(now), end = ymd_(addDays_(now, days - 1));
  var cur = activeRentBan_(who.studentId);
  if (cur && cur.end > end) end = cur.end;
  table_(SHEET.RBANS).append([{ '학번': who.studentId, '이름': who.name, '시작일': start, '종료일': end, '구분': kind, '사유': reason, '상태': '정지', '처리일시': now }]);
  SpreadsheetApp.flush();
  safeMail_(who.email, '[' + APP_NAME + '] 물품 대여가 ' + fmtYmd_(end) + '까지 정지됐어요',
    mailBody_((who.name || '학우') + '님, 물품 대여가 ' + fmtYmd_(end) + '까지 정지됐어요.', ['사유: ' + reason],
      '정지 기간에도 빌린 물품 반납은 할 수 있어요. 궁금한 점은 학생회에 문의해 주세요.' + userLink_()));
  return { studentId: who.studentId, name: who.name, kind: kind, until: fmtYmd_(end) };
}

function adminReport_(x, banMap) {
  return { code: x.code, at: fmtDateTime_(x.at), itemId: x.itemId, itemName: x.itemName, kind: x.kind, detail: x.detail,
    studentId: x.sid, name: x.name, prevSid: x.prevSid, prevName: x.prevName, prevPhone: x.prevPhone, prevAt: x.prevAt ? fmtDateTime_(x.prevAt) : '',
    prevBannedUntil: banMap[x.prevSid] ? fmtYmd_(banMap[x.prevSid].end) : '',
    status: x.status, itemResult: x.itemResult, banResult: x.banResult, doneAt: x.doneAt ? fmtDateTime_(x.doneAt) : '', memo: x.memo };
}

/**
 * payload: {token, code, item:'대여가능'|'사용중지', ban:true|false, memo}
 * 신고 카드 한 장으로 끝낸다: 물품 상태를 바꾸고, 필요하면 직전 사용자를 정지한다.
 */
function apiAdminReport_(p) {
  requireAdmin_(p);
  var itemStatus = p.item === ITEM_STATUS.OFF ? ITEM_STATUS.OFF : p.item === ITEM_STATUS.OK ? ITEM_STATUS.OK : '';
  if (!itemStatus) throw userError_('물품을 사용 중지할지, 대여 가능으로 돌릴지 골라 주세요.');
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var rp = table_(SHEET.REPORTS);
    var x = readReports_(rp).filter(function (r) { return r.code === String(p.code || ''); })[0];
    if (!x) throw userError_('신고를 찾을 수 없어요.');
    if (x.status === REPORT_STATUS.DONE) throw userError_('이미 처리한 신고예요.');
    var ban = p.ban === true, res = { code: x.code, item: itemStatus };
    if (ban && !x.prevSid) throw userError_('직전 사용자 기록이 없어 정지할 수 없어요.');

    var it = table_(SHEET.ITEMS), item = readItems_(it).filter(function (y) { return y.id === x.itemId; })[0];
    if (item) {
      if (item.status === ITEM_STATUS.OUT || item.status === ITEM_STATUS.CHECK) throw userError_('지금 대여 중인 물품이에요. 반납 처리 뒤에 바꿔 주세요.');
      it.set(item.row, '상태', itemStatus);
      addItemMemo_(it, item, (x.kind === '없어요' ? '없어요' : '파손') + ' 신고 확인 → ' + itemStatus + (ban ? ' · 직전 사용자 정지' : ''));
    }
    if (ban) {
      var prev = readRentals_().filter(function (r) { return r.rid === x.prevRid; })[0];
      var who = personOf_(prev || { studentId: x.prevSid, name: x.prevName, email: '' });
      var what = x.kind === '없어요' ? '분실' : '파손';
      res.ban = addRentBan_(who, what, x.itemName + '(' + x.itemId + ') ' + what + ' 확인');
    }
    rp.set(x.row, '상태', REPORT_STATUS.DONE);
    rp.set(x.row, '물품 처리', itemStatus === ITEM_STATUS.OK ? '대여 가능' : '사용 중지');
    rp.set(x.row, '직전 사용자 정지', ban ? '정지함' : (x.prevSid ? '정지 안 함' : '기록 없음'));
    rp.set(x.row, '처리일시', new Date());
    var memo = String(p.memo || '').trim().slice(0, 100);
    if (memo) rp.set(x.row, '메모', appendMemo_(x.memo, memo));
    SpreadsheetApp.flush();
    return res;
  } finally { lock.releaseLock(); }
}

/** payload: {token, studentId} — 대여 정지를 푼다 */
function apiAdminRentUnban_(p) {
  requireAdmin_(p);
  var sid = String(p.studentId || '').replace(/\D/g, '');
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
  var t = table_(SHEET.RBANS), n = 0;
  readRentBans_().forEach(function (b) {
    if (b.studentId === sid && isActiveRentBan_(b)) { t.set(b.row, '상태', '해제'); t.set(b.row, '처리일시', new Date()); n++; }
  });
  if (!n) throw userError_('대여가 정지된 학우가 아니에요.');
  SpreadsheetApp.flush();
  return { studentId: sid };
  } finally { lock.releaseLock(); }
}

// ───────────────────────── 강의실 예약 ─────────────────────────
function roomConfig_() {
  var start = Math.max(0, Math.min(23, Math.floor(num_('예약 시작 시각', 9))));
  var end = Math.max(start + 1, Math.min(24, Math.floor(num_('예약 종료 시각', 22))));
  return {
    room: String(getSetting_('강의실 이름') || '강의실'), start: start, end: end,
    maxPer: Math.max(1, Math.floor(num_('1회 최대 예약(시간)', 3))),
    maxDay: Math.max(1, Math.floor(num_('1인 하루 최대(시간)', 3))),
    minPeople: Math.max(1, Math.floor(num_('최소 사용 인원', 2))),
    maxTwo: Math.max(1, Math.floor(num_('2인 최대 예약(시간)', 2))),
    cap: Math.max(1, Math.floor(num_('강의실 정원', 30))),
    weekend: isOn_('주말 예약'),
    openDay: Math.max(1, Math.min(28, Math.floor(num_('다음 달 예약 오픈일', 1)))),
    entry: String(getSetting_('출입 안내') || ''), exit: String(getSetting_('퇴실 안내') || '')
  };
}

/** 예약할 수 있는 마지막 날짜(yyyy-MM-dd)와 다음 오픈 안내 문구 */
function roomWindow_(cfg, now) {
  var t = ymd_(now).split('-').map(Number); // [y, m, d]
  var open = t[2] >= cfg.openDay;            // 이번 달 오픈일이 지났으면 다음 달까지 열림
  var last = open ? new Date(t[0], t[1] + 1, 0) : new Date(t[0], t[1], 0);
  var mm = function (k) { return ((k - 1) % 12 + 12) % 12 + 1; };
  var note = open
    ? mm(t[1] + 2) + '월 예약은 ' + mm(t[1] + 1) + '월 ' + cfg.openDay + '일에 열려요'
    : mm(t[1] + 1) + '월 예약은 ' + t[1] + '월 ' + cfg.openDay + '일에 열려요';
  return { from: ymd_(now), to: ymd_(last), note: note };
}

function isLiveRoom_(r) { return r.status !== ROOM_STATUS.CANCEL; }
function roomStartAt_(r) { return dateAt_(r.date, r.start); }
function roomEndAt_(r) { return dateAt_(r.date, r.end); }
/** 사진을 내지 않은 채 끝난 예약 */
function isNoPhoto_(r) { return r.status === ROOM_STATUS.OK && new Date().getTime() >= roomEndAt_(r).getTime(); }

/** date 하루 중 지금 예약 가능한 빈 시간 수 */
function freeHours_(date, rooms, cfg) {
  if (!cfg.weekend && isWeekend_(date)) return 0;
  var taken = {};
  rooms.forEach(function (r) { if (r.date === date && isLiveRoom_(r)) for (var h = r.start; h < r.end; h++) taken[h] = true; });
  var now = new Date().getTime(), n = 0;
  for (var h = cfg.start; h < cfg.end; h++) if (!taken[h] && dateAt_(date, h + 1).getTime() > now) n++;
  return n;
}

function apiRoomInfo_() {
  var cfg = roomConfig_();
  var now = new Date();
  var win = roomWindow_(cfg, now);
  var booked = readRooms_().filter(function (r) { return isLiveRoom_(r) && r.date >= win.from && r.date <= win.to; })
    .map(function (r) { return { date: r.date, start: r.start, end: r.end }; });
  return {
    room: cfg.room, start: cfg.start, end: cfg.end, maxPer: cfg.maxPer, maxDay: cfg.maxDay, weekend: cfg.weekend, cap: cfg.cap,
    minPeople: cfg.minPeople, maxTwo: Math.min(cfg.maxTwo, cfg.maxPer),
    today: win.from, until: win.to, openNote: win.note, nowHour: Number(Utilities.formatDate(now, 'Asia/Seoul', 'H')),
    nowMin: Number(Utilities.formatDate(now, 'Asia/Seoul', 'm')),
    entry: cfg.entry, exit: cfg.exit, booked: booked, originals: originalPhotos_()
  };
}

/** payload: {token, date:'2026-11-03', start:10, end:12, people:4, purpose} */
function apiRoomBook_(p) {
  var who = checkPerson_(p, true, true);
  var ban = activeBan_(who.studentId);
  if (ban) throw userError_(fmtYmd_(ban.end) + '까지 강의실 예약이 중지돼 있어요. 궁금한 점은 학생회에 문의해 주세요.');
  var cfg = roomConfig_();
  var date = String(p.date || '');
  var start = Number(p.start), end = Number(p.end);
  var purpose = String(p.purpose || '').trim().slice(0, 60);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw userError_('날짜를 골라 주세요.');
  if (!(start % 1 === 0 && end % 1 === 0 && start < end)) throw userError_('시간을 골라 주세요.');
  if (start < cfg.start || end > cfg.end) throw userError_(pad2_(cfg.start) + ':00~' + pad2_(cfg.end) + ':00 사이로 골라 주세요.');
  var people = Number(p.people);
  if (!(people % 1 === 0 && people >= 1)) throw userError_('사용 인원을 적어 주세요.');
  if (people < cfg.minPeople) throw userError_('강의실은 팀 활동용이라 ' + cfg.minPeople + '명부터 예약할 수 있어요.');
  if (people > cfg.cap) throw userError_('이 강의실은 ' + cfg.cap + '명까지 쓸 수 있어요.');
  // 2명이면 하루 2시간까지, 3명 이상이면 한 번에 3시간까지
  var small = people <= 2, maxTwo = Math.min(cfg.maxTwo, cfg.maxPer);
  if (small && end - start > maxTwo) throw userError_('2명이면 ' + maxTwo + '시간까지 예약할 수 있어요. 3명 이상이면 ' + cfg.maxPer + '시간까지 돼요.');
  if (end - start > cfg.maxPer) throw userError_('한 번에 ' + cfg.maxPer + '시간까지 예약할 수 있어요.');

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw userError_('지금 예약하는 사람이 많아요. 잠시 뒤 다시 눌러 주세요.');
  try {
    var now = new Date();
    var win = roomWindow_(cfg, now);
    if (date < win.from) throw userError_('지난 날짜는 예약할 수 없어요.');
    if (date > win.to) throw userError_('아직 열리지 않은 날짜예요. ' + win.note + '.');
    if (!cfg.weekend && isWeekend_(date)) throw userError_('주말에는 예약할 수 없어요.');
    if (dateAt_(date, start + 1).getTime() <= now.getTime()) throw userError_('이미 지난 시간이에요. 다른 시간을 골라 주세요.');

    var t = table_(SHEET.ROOMS), rooms = readRooms_(t);
    var clash = rooms.filter(function (r) { return isLiveRoom_(r) && r.date === date && r.start < end && start < r.end; })[0];
    if (clash) throw userError_('방금 다른 사람이 ' + pad2_(clash.start) + ':00~' + pad2_(clash.end) + ':00을 예약했어요. 다른 시간을 골라 주세요.');
    var mineToday = rooms.filter(function (r) { return isLiveRoom_(r) && r.date === date && r.studentId === who.studentId; });
    var used = mineToday.reduce(function (s, r) { return s + (r.end - r.start); }, 0);
    if (used + (end - start) > cfg.maxDay) {
      throw userError_('한 사람이 하루에 ' + cfg.maxDay + '시간까지 예약할 수 있어요. 이 날 이미 ' + used + '시간을 예약했어요.');
    }
    if (small) {
      var usedSmall = mineToday.filter(function (r) { return r.people <= 2; }).reduce(function (s, r) { return s + (r.end - r.start); }, 0);
      if (usedSmall + (end - start) > maxTwo) {
        throw userError_('2명 예약은 하루 ' + maxTwo + '시간까지예요. 이 날 이미 2명으로 ' + usedSmall + '시간을 예약했어요.');
      }
    }

    var rid = 'K' + Utilities.formatDate(now, 'Asia/Seoul', 'yyMMdd-HHmmss') + '-' + Math.floor(Math.random() * 900 + 100);
    t.append([{ '예약ID': rid, '날짜': date, '시작': start, '끝': end, '시간': end - start, '학번': who.studentId, '이름': who.name,
      '전화번호': who.phone, '이메일': who.email, '사용 목적': purpose, '상태': ROOM_STATUS.OK, '예약일시': now, '인원': people }]);
    SpreadsheetApp.flush();

    var when = fmtYmd_(date) + ' ' + timeRange_(start, end);
    safeMail_(who.email, '[' + APP_NAME + '] ' + cfg.room + ' 예약이 확정됐어요',
      mailBody_(who.name + '님, ' + cfg.room + ' 예약이 확정됐어요.', [{ html: '<b>' + esc_(when) + '</b> · ' + people + '명' + (purpose ? ' · ' + esc_(purpose) : '') }],
        esc_(cfg.entry) + '<br>쓰고 난 뒤에는 원래 상태로 정리하고, 바탕화면의 [내 예약]에서 강의실 사진을 올려 주세요.' + userLink_()));
    return { rid: rid, room: cfg.room, date: date, dateLabel: fmtYmd_(date), time: timeRange_(start, end), people: people, entry: cfg.entry };
  } finally { lock.releaseLock(); }
}

function roomMineOf_(sid, rooms) {
  var since = ymd_(addDays_(new Date(), -14));
  return rooms.filter(function (r) { return r.studentId === sid && isLiveRoom_(r) && r.date >= since; })
    .sort(function (a, b) { return (a.date + pad2_(a.start)).localeCompare(b.date + pad2_(b.start)); })
    .map(publicRoom_);
}
/** payload: {token} → 최근 2주와 앞으로의 예약 */
function apiRoomMine_(p) {
  var who = checkPerson_(p, false, true);
  return roomMineOf_(who.studentId, readRooms_());
}

function publicRoom_(r) {
  var now = new Date().getTime();
  var started = now >= roomStartAt_(r).getTime(), ended = now >= roomEndAt_(r).getTime();
  return {
    rid: r.rid, date: r.date, dateLabel: fmtYmd_(r.date), start: r.start, end: r.end, time: timeRange_(r.start, r.end),
    status: r.status, purpose: r.purpose, people: r.people, started: started, ended: ended,
    canCancel: r.status === ROOM_STATUS.OK && !started,
    canCheckout: r.status === ROOM_STATUS.OK && started,
    noPhoto: isNoPhoto_(r), photoCount: r.photos.length
  };
}

function ownRoom_(p, t) {
  var who = checkPerson_(p, false, true);
  var r = readRooms_(t).filter(function (x) { return x.rid === String(p.rid || ''); })[0];
  if (!r || r.studentId !== who.studentId) throw userError_('본인 예약만 바꿀 수 있어요.');
  return r;
}

/** payload: {token, rid} */
function apiRoomCancel_(p) {
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var t = table_(SHEET.ROOMS), r = ownRoom_(p, t);
    if (r.status !== ROOM_STATUS.OK) throw userError_('취소할 수 없는 예약이에요.');
    if (new Date().getTime() >= roomStartAt_(r).getTime()) throw userError_('이미 시작한 예약은 취소할 수 없어요.');
    t.set(r.row, '상태', ROOM_STATUS.CANCEL);
    t.set(r.row, '메모', appendMemo_(r.memo, '본인 취소'));
    SpreadsheetApp.flush();
    return { rid: r.rid, roomMine: roomMineOf_(r.studentId, readRooms_()) };
  } finally { lock.releaseLock(); }
}

/** payload: {token, rid, photos:['data:image/jpeg;base64,...', ...]} — 1~3장 */
function apiRoomCheckout_(p) {
  var photos = (p.photos || []).filter(String);
  if (photos.length < 1) throw userError_('강의실 사진을 1장 이상 올려 주세요.');
  if (photos.length > 3) throw userError_('사진은 3장까지 올릴 수 있어요.');
  var blobs = photos.map(function (d, i) {
    var m = /^data:(image\/(jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(d));
    if (!m) throw userError_('사진 파일을 읽을 수 없어요. 다시 골라 주세요.');
    if (m[3].length > 7000000) throw userError_('사진이 너무 커요. 다시 골라 주세요.');
    return { mime: m[1], ext: m[2] === 'jpeg' ? 'jpg' : m[2], data: m[3], i: i };
  });
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var t = table_(SHEET.ROOMS), r = ownRoom_(p, t);
    if (r.status !== ROOM_STATUS.OK) throw userError_('이미 퇴실 사진을 올렸어요.');
    if (new Date().getTime() < roomStartAt_(r).getTime()) throw userError_('예약 시간이 시작된 뒤에 올려 주세요.');
    var folder = photoFolder_('퇴실 사진 폴더 ID');
    var ids = blobs.map(function (b) {
      var name = r.date + ' ' + pad2_(r.start) + '시 ' + r.name + ' ' + (b.i + 1) + '.' + b.ext;
      return folder.createFile(Utilities.newBlob(Utilities.base64Decode(b.data), b.mime, name)).getId();
    });
    t.set(r.row, '상태', ROOM_STATUS.OUT);
    t.set(r.row, '퇴실일시', new Date());
    t.set(r.row, '퇴실사진', ids.join('\n'));
    SpreadsheetApp.flush();
    adminNotify_('[' + APP_NAME + '] 퇴실 확인 요청 · ' + fmtYmd_(r.date) + ' ' + timeRange_(r.start, r.end),
      mailBody_(r.name + '(' + r.studentId + ') 님이 ' + roomConfig_().room + '에서 퇴실했어요.',
        ids.map(function (id, i) { return '사진 ' + (i + 1) + ': ' + driveView_(id); }),
        '사진과 강의실 상태를 보고 관리자 화면에서 [확인]을 눌러 주세요.<br>' + adminLink_()));
    return { rid: r.rid, count: ids.length };
  } finally { lock.releaseLock(); }
}

/** [설정]의 폴더 ID로 드라이브 폴더를 연다 */
function photoFolder_(key) {
  var id = String(getSetting_(key) || '').trim();
  if (!id) throw userError_('사진 폴더가 아직 준비되지 않았어요. 학생회에 알려 주세요.');
  try { return DriveApp.getFolderById(id); } catch (e) { throw userError_('사진 폴더를 열 수 없어요. 학생회에 알려 주세요.'); }
}

/** 원본 사진 폴더의 이미지 목록. 10분 동안 기억해 둔다. */
function originalPhotos_() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get('orig_photos');
  if (hit) { try { return JSON.parse(hit); } catch (e) { } }
  var out = [];
  try {
    var it = photoFolder_('원본 사진 폴더 ID').getFiles();
    var files = [];
    while (it.hasNext()) files.push(it.next());
    files.filter(function (f) { return /^image\//.test(f.getMimeType()); })
      .sort(function (a, b) { return a.getName().localeCompare(b.getName()); })
      .slice(0, 12).forEach(function (f) {
        // 학우 화면에서 보이도록 '링크가 있는 사람 보기'로 연다(원본 사진만)
        try { f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) { }
        out.push({ name: f.getName().replace(/\.[^.]+$/, ''), url: driveThumb_(f.getId()) });
      });
  } catch (e) { out = []; }
  cache.put('orig_photos', JSON.stringify(out), 600);
  return out;
}

function driveThumb_(id) { return 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(id) + '&sz=w1600'; }
function driveView_(id) { return 'https://drive.google.com/file/d/' + encodeURIComponent(id) + '/view'; }

function adminRoom_(r, warns, bans) {
  var x = publicRoom_(r);
  var b = bans && bans[r.studentId];
  x.bannedUntil = b ? fmtYmd_(b.end) : '';
  x.name = r.name; x.studentId = r.studentId; x.phone = r.phone; x.email = r.email; x.memo = r.memo;
  x.outAt = r.outAt ? fmtDateTime_(r.outAt) : '';
  x.photos = r.photos.map(function (id) { return { view: driveView_(id), thumb: driveThumb_(id) }; });
  x.warnCount = warns[r.studentId] || 0;
  return x;
}

/** 학번별 경고 수: '원상복구 안 됨' + 사진 없이 끝난 예약 */
function roomWarnCounts_(rooms) {
  var w = {};
  rooms.forEach(function (r) { if (r.status === ROOM_STATUS.WARN || isNoPhoto_(r)) w[r.studentId] = (w[r.studentId] || 0) + 1; });
  return w;
}

function adminRoomsData_() {
  var rooms = readRooms_();
  var warns = roomWarnCounts_(rooms);
  var now = new Date().getTime();
  var key = function (r) { return r.date + pad2_(r.start); };
  var active = readBans_().filter(isActiveBan_);
  var banMap = {};
  active.forEach(function (b) { banMap[b.studentId] = b; });
  var map = function (list) { return list.map(function (r) { return adminRoom_(r, warns, banMap); }); };
  return {
    upcoming: map(rooms.filter(function (r) { return r.status === ROOM_STATUS.OK && roomEndAt_(r).getTime() > now; })
      .sort(function (a, b) { return key(a).localeCompare(key(b)); })),
    toCheck: map(rooms.filter(function (r) { return r.status === ROOM_STATUS.OUT; })),
    noPhoto: map(rooms.filter(isNoPhoto_).sort(function (a, b) { return key(b).localeCompare(key(a)); })),
    recent: map(rooms.filter(function (r) { return r.status === ROOM_STATUS.DONE || r.status === ROOM_STATUS.WARN; })
      .sort(function (a, b) { return key(b).localeCompare(key(a)); }).slice(0, 20)),
    bans: active.map(function (b) {
      return { studentId: b.studentId, name: b.name, start: fmtYmd_(b.start), until: fmtYmd_(b.end), reason: b.reason, warnCount: warns[b.studentId] || 0 };
    }),
    banDays: banDays_()
  };
}

/** payload: {token, rid, result:'ok'|'warn', memo} — 퇴실 확인. 사진 없이 끝난 예약에도 쓸 수 있다. */
function apiAdminRoomReview_(p) {
  requireAdmin_(p);
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var t = table_(SHEET.ROOMS);
    var r = readRooms_(t).filter(function (x) { return x.rid === String(p.rid || ''); })[0];
    if (!r) throw userError_('예약을 찾을 수 없어요.');
    if (!(r.status === ROOM_STATUS.OUT || isNoPhoto_(r) || r.status === ROOM_STATUS.DONE || r.status === ROOM_STATUS.WARN)) {
      throw userError_('아직 끝나지 않은 예약이에요.');
    }
    var warn = p.result === 'warn';
    t.set(r.row, '상태', warn ? ROOM_STATUS.WARN : ROOM_STATUS.DONE);
    t.set(r.row, '확인일시', new Date());
    var note = warn ? '원상복구 안 됨' : (r.photos.length ? '' : '사진 없이 확인');
    var memo = [note, String(p.memo || '').trim()].filter(String).join(' · ');
    if (memo) t.set(r.row, '메모', appendMemo_(r.memo, memo));
    SpreadsheetApp.flush();
    return { rid: r.rid, status: warn ? ROOM_STATUS.WARN : ROOM_STATUS.DONE };
  } finally { lock.releaseLock(); }
}

/** payload: {token, rid, memo} — 학생회 사정으로 예약 취소. 학우에게 메일이 간다. */
function apiAdminRoomCancel_(p) {
  requireAdmin_(p);
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var t = table_(SHEET.ROOMS);
    var r = readRooms_(t).filter(function (x) { return x.rid === String(p.rid || ''); })[0];
    if (!r || r.status !== ROOM_STATUS.OK) throw userError_('취소할 수 없는 예약이에요.');
    t.set(r.row, '상태', ROOM_STATUS.CANCEL);
    t.set(r.row, '메모', appendMemo_(r.memo, '관리자 취소' + (p.memo ? ' · ' + p.memo : '')));
    SpreadsheetApp.flush();
    safeMail_(r.email, '[' + APP_NAME + '] 강의실 예약이 취소됐어요',
      mailBody_(r.name + '님, ' + fmtYmd_(r.date) + ' ' + timeRange_(r.start, r.end) + ' 예약이 학생회 사정으로 취소됐어요.',
        p.memo ? ['사유: ' + p.memo] : [], '불편을 드려 죄송해요. 다른 시간으로 다시 예약해 주세요.' + userLink_()));
    return { rid: r.rid };
  } finally { lock.releaseLock(); }
}

// ───────────────────────── 강의실 예약 중지 ─────────────────────────
function banDays_() { var n = Math.floor(num_('예약 중지 기간(일)', 7)); return n >= 1 ? Math.min(n, 365) : 7; }
function isActiveBan_(b) { return b.status === '중지' && b.end >= ymd_(new Date()); }
function activeBan_(studentId) {
  return readBans_().filter(function (b) { return b.studentId === studentId && isActiveBan_(b); })
    .sort(function (a, b) { return b.end.localeCompare(a.end); })[0] || null;
}

/**
 * payload: {token, studentId, name, reason} — 오늘부터 [예약 중지 기간(일)]만큼 새 예약을 막는다.
 * 그 기간에 이미 잡힌(아직 시작 안 한) 예약은 함께 취소하고 학우에게 메일로 알린다.
 */
function apiAdminRoomBan_(p) {
  requireAdmin_(p);
  var sid = String(p.studentId || '').replace(/\D/g, '');
  if (!/^\d{8,10}$/.test(sid)) throw userError_('학번을 확인해 주세요.');
  var days = banDays_();
  var now = new Date();
  var start = ymd_(now), end = ymd_(addDays_(now, days - 1));
  var reason = String(p.reason || '').trim().slice(0, 100);
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var rt = table_(SHEET.ROOMS), rooms = readRooms_(rt);
    var mine = rooms.filter(function (r) { return r.studentId === sid; });
    var u = findUser_(sid);
    var name = String(p.name || (u && u.name) || (mine[0] && mine[0].name) || '').trim();
    var email = (u && u.email) || (mine.filter(function (r) { return r.email; }).slice(-1)[0] || {}).email || '';
    var bt = table_(SHEET.BANS);
    var cur = activeBan_(sid);
    if (cur && cur.end >= end) end = cur.end;
    if (cur) { bt.set(cur.row, '종료일', end); bt.set(cur.row, '사유', reason || cur.reason); bt.set(cur.row, '상태', '중지'); bt.set(cur.row, '처리일시', now); }
    else bt.append([{ '학번': sid, '이름': name, '시작일': start, '종료일': end, '사유': reason, '상태': '중지', '처리일시': now }]);
    var cancelled = [];
    mine.forEach(function (r) {
      if (r.status === ROOM_STATUS.OK && r.date <= end && roomStartAt_(r).getTime() > now.getTime()) {
        rt.set(r.row, '상태', ROOM_STATUS.CANCEL);
        rt.set(r.row, '메모', appendMemo_(r.memo, '예약 중지로 취소'));
        cancelled.push(fmtYmd_(r.date) + ' ' + timeRange_(r.start, r.end));
      }
    });
    SpreadsheetApp.flush();
    if (email) {
      safeMail_(email, '[' + APP_NAME + '] 강의실 예약이 ' + fmtYmd_(end) + '까지 중지됐어요',
        mailBody_((name || '학우') + '님, ' + roomConfig_().room + ' 예약이 ' + fmtYmd_(end) + '까지 중지됐어요.',
          (reason ? ['사유: ' + reason] : []).concat(cancelled.map(function (c) { return '취소된 예약: ' + c; })),
          '강의실을 쓴 뒤 원래 상태로 정리하고 퇴실 사진을 올려 주세요. 궁금한 점은 학생회에 문의해 주세요.'));
    }
    return { studentId: sid, until: fmtYmd_(end), cancelled: cancelled.length };
  } finally { lock.releaseLock(); }
}

/** payload: {token, studentId} — 예약 중지를 푼다 */
function apiAdminRoomUnban_(p) {
  requireAdmin_(p);
  var sid = String(p.studentId || '').replace(/\D/g, '');
  var t = table_(SHEET.BANS), n = 0;
  readBans_().forEach(function (b) {
    if (b.studentId === sid && isActiveBan_(b)) { t.set(b.row, '상태', '해제'); t.set(b.row, '처리일시', new Date()); n++; }
  });
  if (!n) throw userError_('중지된 학우가 아니에요.');
  SpreadsheetApp.flush();
  return { studentId: sid };
}

// ───────────────────────── 건의 ─────────────────────────
/** payload: {category, content, anonymous:true|false, token} → {code} */
function apiSuggest_(p) {
  var category = String(p.category || '');
  if (SUGGEST_CATEGORIES.indexOf(category) < 0) throw userError_('어떤 건의인지 골라 주세요.');
  var content = String(p.content || '').replace(/\r/g, '').trim();
  if (content.length < 5) throw userError_('내용을 5자 이상 적어 주세요.');
  if (content.length > 1000) throw userError_('1000자까지 적을 수 있어요.');
  var anonymous = p.anonymous !== false;
  var name = '', email = '';
  if (!anonymous) { // 실명: 로그인한 회원의 이름·이메일
    var me = authUser_(p);
    name = me.name; email = p.noMail ? '' : me.email;
  }
  // 장난 방지: 10분에 30건이 넘으면 잠시 막는다
  var cache = CacheService.getScriptCache();
  var cnt = Number(cache.get('sg_cnt') || 0);
  if (cnt >= 30) throw userError_('지금 건의가 많이 들어오고 있어요. 잠시 뒤 다시 보내 주세요.');
  cache.put('sg_cnt', String(cnt + 1), 600);

  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var t = table_(SHEET.SUGGEST), have = {};
    readSuggestions_(t).forEach(function (s) { have[s.code] = true; });
    var code;
    do { code = newCode_(); } while (have[code]);
    var now = new Date();
    t.append([{ '접수번호': code, '접수일시': now, '범주': category, '내용': content, '공개': anonymous ? '익명' : '실명', '이름': name, '이메일': email, '상태': SUGGEST_STATUS.NEW }]);
    SpreadsheetApp.flush();
    adminNotify_('[' + APP_NAME + '] 새 건의 · ' + category,
      mailBody_((anonymous ? '익명' : name) + ' 님의 건의가 들어왔어요. (' + code + ')', [content.slice(0, 300)],
        '관리자 화면의 [건의]에서 답변을 보낼 수 있어요.<br>' + adminLink_()));
    return { code: code, at: fmtDateTime_(now) };
  } finally { lock.releaseLock(); }
}

/** payload: {codes:['A7K2QM', ...]} → 각 건의의 처리 상태와 답변 */
function apiSuggestStatus_(p) {
  var want = (p.codes || []).slice(0, 20).map(function (c) { return String(c).replace(/[^A-Za-z0-9]/g, '').toUpperCase(); });
  var map = {};
  readSuggestions_().forEach(function (s) { map[s.code] = s; });
  return want.filter(function (c) { return map[c]; }).map(function (c) {
    var s = map[c];
    return { code: s.code, at: s.at ? fmtDateTime_(s.at) : '', category: s.category, content: s.content,
      status: s.status, answer: s.answer, doneAt: s.doneAt ? fmtDateTime_(s.doneAt) : '' };
  });
}

function adminSuggest_(s) {
  return { code: s.code, at: s.at ? fmtDateTime_(s.at) : '', category: s.category, content: s.content,
    anonymous: s.anonymous, name: s.name, email: s.email, status: s.status, answer: s.answer,
    doneAt: s.doneAt ? fmtDateTime_(s.doneAt) : '' };
}

/**
 * payload: {token, code, answer, close}
 *  - 답변이 있으면 '답변 보내기': 완료로 바꾸고, 실명이면서 이메일이 있으면 메일로 보낸다.
 *  - close:true이고 답변이 없으면 '답변 없이 완료'.
 *  - 이미 완료한 건의는 다시 바꾸지 않는다(학우에게 혼란을 주지 않도록).
 */
function apiAdminSuggest_(p) {
  requireAdmin_(p);
  var answer = String(p.answer || '').trim().slice(0, 1000);
  if (!answer && p.close !== true) throw userError_('답변을 적어 주세요.');
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var t = table_(SHEET.SUGGEST);
    var s = readSuggestions_(t).filter(function (x) { return x.code === String(p.code || '').toUpperCase(); })[0];
    if (!s) throw userError_('건의를 찾을 수 없어요.');
    if (s.status === SUGGEST_STATUS.DONE) throw userError_('이미 완료한 건의예요.');
    t.set(s.row, '상태', SUGGEST_STATUS.DONE);
    t.set(s.row, '답변', answer);
    t.set(s.row, '처리일시', new Date());
    SpreadsheetApp.flush();
    var mailed = false;
    if (answer && !s.anonymous && s.email) {
      mailed = safeMail_(s.email, '[' + APP_NAME + '] 건의에 답변이 왔어요',
        mailBody_(s.name + '님이 보낸 건의(' + s.code + ')에 학생회가 답변했어요.', [s.content.slice(0, 200)],
          '<b>학생회 답변</b><br>' + esc_(answer).replace(/\n/g, '<br>') + userLink_()));
    }
    return { code: s.code, status: SUGGEST_STATUS.DONE, mailed: mailed };
  } finally { lock.releaseLock(); }
}

function newCode_() {
  var abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 헷갈리는 I, O, 0, 1은 뺐다
  var s = '';
  for (var i = 0; i < 6; i++) s += abc.charAt(Math.floor(Math.random() * abc.length));
  return s;
}

// ───────────────────────── KMU 혜택 ─────────────────────────
function apiLinks_() {
  var groups = [], idx = {};
  readLinks_().forEach(function (l) {
    if (!(l.group in idx)) { idx[l.group] = groups.length; groups.push({ group: l.group, items: [] }); }
    groups[idx[l.group]].items.push({ name: l.name, desc: l.desc, url: l.url });
  });
  return groups;
}

// ───────────────────────── 매일 알림 ─────────────────────────
/** 매일 아침 9시 트리거. 반납 안내(내일까지·오늘까지) → 연체 안내 → 관리자 요약 */
function dailyJob() {
  settingsCache_ = null;
  var rt = table_(SHEET.RENTALS), rentals = readRentals_(rt);
  var today = startOfDay_(new Date());
  var tomorrow = addDays_(today, 1);
  var overdue = [], pending = [];

  rentals.forEach(function (r) {
    if (r.status === RENT_STATUS.CHECK) pending.push(r);
    if (r.status !== RENT_STATUS.OUT || !r.due) return;
    var dueDay = startOfDay_(r.due).getTime();
    // 내일이 기한이면 '내일까지', 오늘이 기한인데 어제 이전에 빌렸으면(익일 반납 등) '오늘까지'
    var when = dueDay === tomorrow.getTime() ? '내일' : (dueDay === today.getTime() && r.rentedAt && r.rentedAt < today ? '오늘' : '');
    if (when && !r.dueNotice) {
      safeMail_(r.email, '[' + APP_NAME + '] ' + when + '까지 반납해 주세요',
        mailBody_(r.name + '님, ' + r.itemName + '(' + r.itemId + ') 반납 기한이 ' + when + '(' + fmtDate_(r.due) + ') 23:59예요.', [],
          (location_() || '제자리') + '에 돌려놓고 바탕화면에서 [반납하기]를 눌러 주세요.' + userLink_()));
      rt.set(r.row, '마감알림', new Date());
    }
    if (isOverdue_(r.due)) {
      overdue.push(r);
      var last = r.overdueNotice ? startOfDay_(r.overdueNotice).getTime() : 0;
      // 연체 첫날, 그 뒤로는 3일마다 다시 보낸다
      var daysLate = Math.round((today - startOfDay_(r.due)) / 86400000);
      if (!last || (daysLate % 3 === 1 && last !== today.getTime())) {
        sendOverdueMail_(r);
        rt.set(r.row, '연체알림', new Date());
      }
    }
  });

  var rooms = readRooms_();
  var roomCheck = rooms.filter(function (r) { return r.status === ROOM_STATUS.OUT; });
  var roomNoPhoto = rooms.filter(function (r) { return isNoPhoto_(r) && r.date >= ymd_(addDays_(today, -1)); });
  var newSug = readSuggestions_().filter(function (x) { return x.status !== SUGGEST_STATUS.DONE; });
  var openRep = readReports_().filter(function (x) { return x.status !== REPORT_STATUS.DONE; });
  if (overdue.length || pending.length || roomCheck.length || roomNoPhoto.length || newSug.length || openRep.length) {
    var lines = [];
    openRep.forEach(function (x) { lines.push('물품 신고 · ' + x.itemName + ' (' + x.itemId + ') ' + x.kind + ' · 직전 ' + (x.prevName || '기록 없음')); });
    pending.forEach(function (r) { lines.push('반납 확인 대기 · ' + r.itemName + ' (' + r.itemId + ') · ' + r.name); });
    overdue.forEach(function (r) { lines.push('연체 ' + daysLate_(r.due) + '일 · ' + r.itemName + ' (' + r.itemId + ') · ' + r.name + ' ' + r.phone); });
    roomCheck.forEach(function (r) { lines.push('퇴실 확인 대기 · ' + fmtYmd_(r.date) + ' ' + timeRange_(r.start, r.end) + ' · ' + r.name); });
    roomNoPhoto.forEach(function (r) { lines.push('퇴실 사진 없음 · ' + fmtYmd_(r.date) + ' ' + timeRange_(r.start, r.end) + ' · ' + r.name + ' ' + r.phone); });
    if (newSug.length) lines.push('새 건의 ' + newSug.length + '건');
    safeMail_(adminEmails_().join(','), '[' + APP_NAME + '] 오늘 확인할 것 ' + lines.length + '건',
      mailBody_('물품 반납 확인 ' + pending.length + '건, 물품 신고 ' + openRep.length + '건, 연체 ' + overdue.length + '건, 강의실 퇴실 확인 ' + roomCheck.length + '건, 새 건의 ' + newSug.length + '건이 있어요.', lines, adminLink_()));
  }
  SpreadsheetApp.flush();
}

function sendOverdueMail_(r) {
  safeMail_(r.email, '[' + APP_NAME + '] 반납 기한이 지났어요',
    mailBody_(r.name + '님, ' + r.itemName + '(' + r.itemId + ') 반납 기한(' + fmtDate_(r.due) + ')이 ' + daysLate_(r.due) + '일 지났어요.', [],
      '다음 학우가 기다리고 있어요. ' + (location_() || '제자리') + '에 돌려놓고 바탕화면에서 [반납하기]를 눌러 주세요.' +
      (isOn_('연체 중 대여 막기') ? '<br>반납 전까지는 새로 빌릴 수 없어요.' : '') + ruleBox_(-1) + userLink_()));
}

// ───────────────────────── 시트 메뉴 · 초기 설정 ─────────────────────────
function onOpen() {
  SpreadsheetApp.getUi().createMenu(APP_NAME)
    .addItem('① 초기 설정 (시트 만들기)', 'setup')
    .addItem('② 매일 알림 켜기 (아침 9시)', 'installDailyTrigger')
    .addSeparator()
    .addItem('주소 보기 (API · 웹앱)', 'showAppUrl')
    .addItem('지금 알림 보내기 (테스트)', 'dailyJob')
    .addToUi();
}

function colLetter_(n) { var s = ''; while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }
/** 시트 1행에서 열 이름의 실제 위치(1부터). 없으면 0. 학생회가 열을 옮겨도 그 자리를 찾는다. */
function colIdx_(sh, h) {
  var n = sh.getLastColumn(); if (!n) return 0;
  return sh.getRange(1, 1, 1, n).getValues()[0].map(function (v) { return String(v).trim(); }).indexOf(h) + 1;
}
/** 열 이름 → 2행부터 끝까지 범위 (그 열이 없으면 null) */
function colRange_(sh, h) { var c = colIdx_(sh, h); if (!c) return null; var L = colLetter_(c); return sh.getRange(L + '2:' + L); }

var COLOR_ = { input: '#668485', record: '#B7C4C4', edit: '#FFF2CC', app: '#E6ECEC', section: '#E2EFEE',
  good: ['#E1F0EA', '#2F6B57'], warn: ['#FBEBD0', '#8A5A12'], bad: ['#F8E1DF', '#A23F3A'], mute: ['#EEF1F1', '#6B7D7E'] };
/* 초기 설정이 만드는 상태 칸 색 규칙. 시트마다 모아 두었다가 마지막에 한 번에 바꿔 끼운다(다시 실행해도 쌓이지 않게). */
var CF_ = {};
/** 상태 칸 자동 색. map: {값: 'good'|'warn'|'bad'|'mute'} */
function statusColors_(sh, h, map) {
  var range = colRange_(sh, h); if (!range) return;
  var list = CF_[sh.getName()] = CF_[sh.getName()] || [];
  Object.keys(map).forEach(function (v) {
    var c = COLOR_[map[v]];
    list.push(SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(v).setBackground(c[0]).setFontColor(c[1]).setRanges([range]).build());
  });
}
function listRule_(sh, h, list) {
  var r = colRange_(sh, h);
  if (r) r.setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(list, true).setAllowInvalid(false).build());
}
function textCols_(sh, cols) { cols.forEach(function (h) { var r = colRange_(sh, h); if (r) r.setNumberFormat('@'); }); }
function timeCols_(sh, cols) { cols.forEach(function (h) { var r = colRange_(sh, h); if (r) r.setNumberFormat('yyyy-mm-dd hh:mm'); }); }
function width_(sh, h, w) { var c = colIdx_(sh, h); if (c) sh.setColumnWidth(c, w); }
function note_(sh, h, text) { var c = colIdx_(sh, h); if (c) sh.getRange(1, c).setNote(text); }

/** 머리글 색(손으로 고치는 칸 노랑 / 앱 칸 회색)과 탭 색, 첫 줄 고정. 머리글 글자는 새 시트일 때만 ensureSheet_가 쓴다. */
function dressSheet_(sh, name) {
  var edit = EDITABLE[name] || [];
  HEADERS[name].forEach(function (h) {
    var c = colIdx_(sh, h);
    if (c) sh.getRange(1, c).setFontWeight('bold').setBackground(edit.indexOf(h) >= 0 ? COLOR_.edit : COLOR_.app);
  });
  sh.setFrozenRows(1);
  sh.setTabColor(INPUT_SHEETS.indexOf(name) >= 0 ? COLOR_.input : COLOR_.record);
}

/** 새로 설치할 때 한 번. 이미 있는 시트와 데이터는 지우지 않는다. */
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', ss.getId());
  try { ss.setSpreadsheetTimeZone('Asia/Seoul'); } catch (e) { }
  CF_ = {};

  // [설정]: 구역 제목 줄(■)로 나눈다
  var st = ensureSheet_(ss, SHEET.SETTINGS);
  if (st.getLastRow() < 2) {
    st.getRange(2, 1, SETTING_DEFAULTS.length, 3).setValues(SETTING_DEFAULTS.map(function (d) { return [d[0], d[1] === null ? '' : d[1], d[2]]; }));
    SETTING_DEFAULTS.forEach(function (d, i) {
      if (d[1] === null) st.getRange(i + 2, 1, 1, 3).setFontWeight('bold').setBackground(COLOR_.section);
    });
    st.setColumnWidth(1, 160); st.setColumnWidth(2, 240); st.setColumnWidth(3, 520);
  } else {
    var have = st.getRange(2, 1, st.getLastRow() - 1, 1).getValues().map(function (r) { return String(r[0]).trim(); });
    var missing = SETTING_DEFAULTS.filter(function (d) { return d[1] !== null && have.indexOf(d[0]) < 0; });
    if (missing.length) st.getRange(st.getLastRow() + 1, 1, missing.length, 3).setValues(missing);
  }
  st.getRange(1, 1, 1, 3).setFontWeight('bold').setBackground(COLOR_.app);
  st.getRange('B2:B').setBackground(COLOR_.edit);
  st.setFrozenRows(1); st.setTabColor(COLOR_.input);
  settingsCache_ = null;

  SHEET_ORDER.slice(1).forEach(function (name) { var sh = ensureSheet_(ss, name); dressSheet_(sh, name); });

  // [물품]
  var it = ss.getSheetByName(SHEET.ITEMS);
  if (it.getLastRow() < 2) {
    var cols = ['물품번호', '구분', '이름', '설명', '반납 기한', '상태'];
    table_(SHEET.ITEMS).append([
      ['B-001', '전공서적', '교육학개론', '예시 · 저자/판 정보를 적어 주세요', '7일'], ['B-002', '전공서적', '교육심리학', '예시', '7일'],
      ['B-003', '전공서적', '교육사회학', '예시', '7일'], ['W-001', '복지물품', '보조배터리', '예시 · C타입', '당일'],
      ['W-002', '복지물품', '우산', '예시 · 장우산', '익일'], ['W-003', '복지물품', '발표용 프레젠터', '예시', '3일']
    ].map(function (r) { var o = {}; cols.forEach(function (c, i) { o[c] = c === '상태' ? ITEM_STATUS.OK : r[i]; }); return o; }));
  }
  listRule_(it, '구분', TYPES);
  listRule_(it, '반납 기한', DUE_RULES);
  listRule_(it, '상태', [ITEM_STATUS.OK, ITEM_STATUS.OUT, ITEM_STATUS.CHECK, ITEM_STATUS.FIX, ITEM_STATUS.OFF]);
  statusColors_(it, '상태', { '대여가능': 'good', '대여중': 'mute', '반납확인중': 'warn', '점검중': 'warn', '사용중지': 'bad' });
  note_(it, '반납 기한', '당일 / 익일 / 3일 / 7일. 언제 빌려도 그날 23:59가 기준이에요. 비워 두면 [설정]의 대여 기간(일).');
  note_(it, '메모', '물품 이력. 관리자 화면의 [메모]로 적으면 맨 위에 날짜와 함께 쌓여요.');
  width_(it, '이름', 200); width_(it, '설명', 240); width_(it, '메모', 320);

  var mb = ss.getSheetByName(SHEET.MEMBERS);
  if (mb.getLastRow() < 2) table_(SHEET.MEMBERS).append([{ '학번': '20260000', '이름': '홍길동', '비고': '예시 · 지우고 납부자 명단을 붙여 넣으세요' }]);
  textCols_(mb, ['학번']);

  var lk = ss.getSheetByName(SHEET.LINKS);
  if (lk.getLastRow() < 2) table_(SHEET.LINKS).append(LINK_DEFAULTS.map(function (r) { var o = {}; HEADERS[SHEET.LINKS].forEach(function (h, i) { o[h] = r[i]; }); return o; }));
  listRule_(lk, '사용', ['사용', '사용 안 함']);
  width_(lk, '이름', 220); width_(lk, '설명', 280); width_(lk, '링크', 340);

  var rt = ss.getSheetByName(SHEET.RENTALS);
  textCols_(rt, ['학번', '전화번호']);
  timeCols_(rt, ['대여일시', '반납기한', '반납신청일시', '반납확인일시', '마감알림', '연체알림']);
  statusColors_(rt, '상태', { '대여중': 'mute', '반납확인중': 'warn', '반납완료': 'good', '분실': 'bad' });

  var rp = ss.getSheetByName(SHEET.REPORTS);
  textCols_(rp, ['신고자 학번', '직전 사용자 학번', '직전 사용자 전화번호']);
  timeCols_(rp, ['신고일시', '직전 반납일시', '처리일시']);
  statusColors_(rp, '상태', { '확인 대기': 'bad', '처리함': 'good' });
  statusColors_(rp, '직전 사용자 정지', { '정지함': 'bad' });
  width_(rp, '자세히', 280);

  var rb = ss.getSheetByName(SHEET.RBANS);
  textCols_(rb, ['학번', '시작일', '종료일']);
  timeCols_(rb, ['처리일시']);
  listRule_(rb, '상태', ['정지', '해제']);
  statusColors_(rb, '상태', { '정지': 'bad', '해제': 'mute' });

  var rm = ss.getSheetByName(SHEET.ROOMS);
  textCols_(rm, ['날짜', '학번', '전화번호']);
  timeCols_(rm, ['퇴실일시', '확인일시', '예약일시']);
  statusColors_(rm, '상태', { '예약확정': 'mute', '퇴실확인중': 'warn', '확인완료': 'good', '원상복구 안 됨': 'bad', '취소': 'mute' });

  var bn = ss.getSheetByName(SHEET.BANS);
  textCols_(bn, ['학번', '시작일', '종료일']);
  timeCols_(bn, ['처리일시']);
  listRule_(bn, '상태', ['중지', '해제']);
  statusColors_(bn, '상태', { '중지': 'bad', '해제': 'mute' });

  var sg = ss.getSheetByName(SHEET.SUGGEST);
  timeCols_(sg, ['접수일시', '처리일시']);
  statusColors_(sg, '상태', { '접수': 'bad', '완료': 'good' });
  width_(sg, '내용', 360); width_(sg, '답변', 280);

  var us = ss.getSheetByName(SHEET.USERS);
  textCols_(us, ['학번', '전화번호']);
  timeCols_(us, ['가입일시', '마지막로그인']);
  note_(us, '세션버전', '숫자를 1 올리면 그 학우의 모든 기기가 로그아웃돼요(휴대폰 분실 등).');

  Object.keys(CF_).forEach(function (n) { ss.getSheetByName(n).setConditionalFormatRules(CF_[n]); });

  // 탭 순서: 학생회가 채우는 시트 → 기록 시트
  SHEET_ORDER.forEach(function (name, i) {
    var sh = ss.getSheetByName(name);
    if (sh && ss.moveActiveSheet) { ss.setActiveSheet(sh); ss.moveActiveSheet(i + 1); }
  });

  ensurePhotoFolders_();

  var def = ss.getSheetByName('시트1') || ss.getSheetByName('Sheet1');
  if (def && def.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(def);
  ss.setActiveSheet(st);
  try {
    SpreadsheetApp.getUi().alert('초기 설정이 끝났어요.\n\n[설정] 시트의 노란 칸(관리자 PIN·이메일·웹앱 주소)을 채우고, [물품]·[납부자] 시트를 채워 주세요.\n' +
      '강의실 원본 사진은 내 드라이브의 「' + APP_NAME + ' 사진 › 강의실 원본 사진」 폴더에 올리면 돼요.');
  } catch (e) { /* 편집기에서 실행하면 UI가 없다 */ }
}

/** 드라이브에 사진 폴더 두 개를 만들고 ID를 [설정]에 적는다. 이미 있으면 그대로 둔다. */
function ensurePhotoFolders_() {
  var need = ['원본 사진 폴더 ID', '퇴실 사진 폴더 ID'].filter(function (k) {
    var id = String(getSetting_(k) || '').trim();
    if (!id) return true;
    try { DriveApp.getFolderById(id); return false; } catch (e) { return true; }
  });
  if (!need.length) return;
  var parent = DriveApp.createFolder(APP_NAME + ' 사진');
  need.forEach(function (k) {
    var f = parent.createFolder(k === '원본 사진 폴더 ID' ? '강의실 원본 사진' : '강의실 퇴실 사진');
    setSetting_(k, f.getId());
  });
}

function installDailyTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'dailyJob') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('dailyJob').timeBased().atHour(9).everyDays(1).inTimezone('Asia/Seoul').create();
  try { SpreadsheetApp.getUi().alert('매일 아침 9시에 알림을 보내도록 설정했어요.'); } catch (e) { }
}

function showAppUrl() {
  settingsCache_ = null;
  var apiUrl = ScriptApp.getService().getUrl();
  var web = webUrl_(), adm = adminUrl_();
  var s = 'font-family:sans-serif;font-size:14px;line-height:1.6';
  var html = '<div style="' + s + '">' +
    '<b>① 학우용 주소</b> (QR로 만드는 주소)<br>' +
    (web ? '<a target="_blank" href="' + web + '">' + web + '</a>' : '아직 배포하지 않았어요. [배포] → [새 배포] → 유형 [웹 앱]으로 배포해 주세요.') +
    '<br><br><b>② 관리자 주소</b><br>' + (adm ? '<a target="_blank" href="' + adm + '">' + adm + '</a>' : '-') +
    '<br><br><b>③ Apps Script 주소</b> (GitHub의 config.js에 넣는 주소)<br>' +
    (apiUrl ? '<code style="word-break:break-all">' + apiUrl + '</code>' : '-') +
    '</div>';
  SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutput(html).setWidth(560).setHeight(320), APP_NAME + ' 주소');
}

// ───────────────────────── 날짜·변환 도우미 ─────────────────────────
function ymd_(d) { return Utilities.formatDate(d, 'Asia/Seoul', 'yyyy-MM-dd'); }
/** 'yyyy-MM-dd' + 시(0~24) → Date (스크립트 시간대 = 서울) */
function dateAt_(ymd, h) { var t = ymd.split('-').map(Number); return new Date(t[0], t[1] - 1, t[2], h, 0, 0, 0); }
function isWeekend_(ymd) { var w = dateAt_(ymd, 12).getDay(); return w === 0 || w === 6; }
function fmtYmd_(ymd) { return fmtDate_(dateAt_(ymd, 12)); }
function pad2_(n) { return (n < 10 ? '0' : '') + n; }
function timeRange_(s, e) { return pad2_(s) + ':00~' + pad2_(e) + ':00'; }

function normName_(s) { return String(s || '').replace(/\s+/g, ''); }
function userError_(msg) { var e = new Error(msg); e.userFacing = true; return e; }
function appendMemo_(old, add) {
  var stamp = Utilities.formatDate(new Date(), 'Asia/Seoul', 'M/d');
  return (old ? old + ' / ' : '') + stamp + ' ' + add;
}
function newRentalId_(now) { return 'R' + Utilities.formatDate(now, 'Asia/Seoul', 'yyMMdd-HHmmss') + '-' + Math.floor(Math.random() * 900 + 100); }
function toDate_(v) {
  if (!v) return null;
  if (Object.prototype.toString.call(v) === '[object Date]') return isNaN(v.getTime()) ? null : v;
  var d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}
function addDays_(d, n) { var x = new Date(d.getTime()); x.setDate(x.getDate() + n); return x; }
function startOfDay_(d) { var x = new Date(d.getTime()); x.setHours(0, 0, 0, 0); return x; }
function endOfDay_(d) { var x = new Date(d.getTime()); x.setHours(23, 59, 59, 999); return x; } // 23:59:59까지 기한 안
function isOverdue_(due) { return !!due && new Date().getTime() > due.getTime(); }
function daysLate_(due) {
  if (!due || !isOverdue_(due)) return 0;
  return Math.max(1, Math.round((startOfDay_(new Date()) - startOfDay_(due)) / 86400000));
}
var WEEK_ = ['일', '월', '화', '수', '목', '금', '토'];
function fmtDate_(d) {
  if (!d) return '';
  return Utilities.formatDate(d, 'Asia/Seoul', 'M월 d일') + ' (' + WEEK_[Number(Utilities.formatDate(d, 'Asia/Seoul', 'u')) % 7] + ')';
}
function fmtDateTime_(d) { return d ? Utilities.formatDate(d, 'Asia/Seoul', 'M/d HH:mm') : ''; }
/** 메일용: '오늘(11월 1일)' · '내일(11월 2일)' · '11월 8일 (일)' */
function dueText_(d) {
  var rel = dueRel_(d);
  return rel ? rel + '(' + Utilities.formatDate(d, 'Asia/Seoul', 'M월 d일') + ')' : fmtDate_(d);
}

// ───────────────────────── 주소 · 메일 ─────────────────────────
/**
 * 학우용 주소. [설정]의 웹앱 주소를 쓰고, 비어 있으면 지금 배포된 Apps Script 주소를 쓴다.
 * GitHub Pages 주소는 'https://…/' 꼴(끝에 /), Apps Script 주소는 '…/exec' 꼴로 돌려준다.
 */
function webUrl_() {
  var u = String(getSetting_('웹앱 주소') || '').trim();
  if (!/^https?:\/\//i.test(u)) {
    try { u = ScriptApp.getService().getUrl() || ''; } catch (e) { u = ''; }
  }
  if (!u) return '';
  if (/script\.google\.com/.test(u)) return u.replace(/[?#].*$/, '');
  return u.replace(/(index|admin)\.html?$/i, '').replace(/\/*$/, '/');
}
function adminUrl_() {
  var web = webUrl_();
  if (!web) return '';
  return /script\.google\.com/.test(web) ? web + '?page=admin' : web + 'admin.html';
}
function userLink_() { var web = webUrl_(); return web ? '<br><a href="' + web + '">' + APP_NAME + ' 열기</a>' : ''; }
function adminLink_() { var a = adminUrl_(); return a ? '<a href="' + a + '">관리자 화면 열기</a>' : ''; }

/** 대여 정지 규칙 안내(주황 박스). late ≥ 1이면 '지금 이번 학기 연체 N회'를 먼저 적는다. */
function ruleBox_(late) {
  return '<div style="background:#FFF3DF;border-radius:12px;padding:12px 14px;color:#6E4A12;margin:14px 0;line-height:1.6">' +
    (late > 0 ? '지금 이번 학기 연체 <b>' + late + '회</b>예요.<br>' : '') +
    '이번 학기에 연체 횟수가 <b>' + lateLimit_() + '회</b>가 되거나 <b>분실·파손</b>이 확인되면 <b>' + rentBanDays_() + '일</b> 동안 대여가 정지돼요.</div>';
}

/** lines: 문자열(그대로 이스케이프) 또는 {html: '...'}(굵게 등 서식) */
function mailBody_(lead, lines, tail) {
  var contact = String(getSetting_('문의 연락처') || '');
  var list = (lines && lines.length)
    ? '<ul style="padding-left:18px;margin:12px 0">' + lines.map(function (l) {
      return '<li style="margin:4px 0">' + (l && typeof l === 'object' ? l.html : esc_(l)) + '</li>';
    }).join('') + '</ul>'
    : '';
  return '<div style="font-family:Pretendard,Apple SD Gothic Neo,sans-serif;font-size:15px;line-height:1.6;color:#213536;max-width:480px">' +
    '<p style="font-size:17px;font-weight:700;margin:0 0 8px">' + esc_(lead) + '</p>' + list +
    (tail ? '<div style="margin:12px 0">' + tail + '</div>' : '') +
    '<p style="color:#7A8B8C;font-size:13px;margin-top:20px">' + esc_(orgName_()) + ' · ' + APP_NAME + (contact ? '<br>문의 ' + esc_(contact) : '') + '</p></div>';
}

function esc_(s) {
  return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
}

/**
 * 메일 보내기. 하루 한도(받는 사람 수 기준)가 모자라면 보내지 않고 '못 보낸 메일' 수를 센다.
 * 학생회 계정은 Google Workspace(Business Starter): 하루 1,500명(같은 도메인 안은 2,000명). 무료 체험 기간에는 더 낮을 수 있다.
 */
function safeMail_(to, subject, html) {
  var list = String(to || '').split(',').map(function (x) { return x.trim(); }).filter(String);
  if (!list.length) return false;
  try {
    var left = MailApp.getRemainingDailyQuota();
    if (left < list.length) { countSkipped_(); console.warn('메일 한도 부족: ' + subject); return false; }
    MailApp.sendEmail({ to: list.join(','), subject: subject, htmlBody: html, name: orgName_() || APP_NAME });
    return true;
  } catch (e) {
    console.error('메일 실패: ' + to + ' ' + e);
    countSkipped_();
    return false;
  }
}

/** 관리자에게 바로 보내는 알림. [설정] '관리자 즉시 알림'이 꺼져 있으면 보내지 않는다(아침 요약에는 들어간다). */
function adminNotify_(subject, html) {
  if (!isOn_('관리자 즉시 알림')) return false;
  return safeMail_(adminEmails_().join(','), subject, html);
}

function countSkipped_() {
  try {
    var p = PropertiesService.getScriptProperties(), k = 'mail_skip_' + ymd_(new Date());
    p.setProperty(k, String(Number(p.getProperty(k) || 0) + 1));
  } catch (e) { }
}

function mailStatus_() {
  var left = null, skipped = 0;
  try { left = MailApp.getRemainingDailyQuota(); } catch (e) { left = null; }
  try { skipped = Number(PropertiesService.getScriptProperties().getProperty('mail_skip_' + ymd_(new Date())) || 0); } catch (e) { }
  return { left: left, skipped: skipped };
}
