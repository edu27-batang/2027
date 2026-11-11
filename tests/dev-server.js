/*
 * 컴퓨터에서 화면을 열어 보는 연습용 서버.  실행:  node tests/dev-server.js  →  http://localhost:8787
 * 화면 파일은 저장소의 것을 그대로 쓰고, 서버는 apps-script/Code.gs를 가짜 구글 서비스 위에서 돌린다.
 * 운영·테스트 시트와는 아무 관계가 없고, 끄면 데이터가 사라진다. 메일은 보내지 않고 터미널에 인증번호만 찍는다.
 *   연습 계정  관리자 20260001 / 123456 (관리자 화면: /admin.html)   학우 20260002 / 123456
 */
const http = require('http'), fs = require('fs'), path = require('path');
const { createEnv } = require('./gas-fake');
const ROOT = path.join(__dirname, '..'), PORT = Number(process.env.PORT || 8787);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json' };

function seed() {
  const e = createEnv({ quiet: true, settings: { '주말 예약': '사용' } });
  e.signup('20260001', '김관리', 'admin@kookmin.ac.kr');
  e.signup('20260002', '이학우', 'student@kookmin.ac.kr');
  e.add('납부자', { '학번': '20260001', '이름': '김관리' }); e.add('납부자', { '학번': '20260002', '이름': '이학우' });
  [['B-001', '전공서적', '교육학개론', '7일'], ['B-002', '전공서적', '교육심리학', '7일'], ['W-001', '복지물품', '보조배터리', '당일'], ['W-002', '복지물품', '우산', '익일']]
    .forEach(r => e.add('물품', { '물품번호': r[0], '구분': r[1], '이름': r[2], '반납 기한': r[3], '상태': '대여가능' }));
  e.add('혜택', { '묶음': '도서관', '이름': '성곡도서관', '설명': '학술 DB, 전자책', '링크': 'https://lib.kookmin.ac.kr/', '사용': '사용' });
  const at = e.ok('adminLogin', { studentId: '20260001', password: '123456' }).token;
  const n = o => e.ok('adminNoticeSave', Object.assign({ token: at, target: '전체 학우' }, o));
  n({ category: '장학', title: '2학기 교육학과 성적우수 장학금 서류 제출', deadline: e.ymd(0), content: '성적우수 장학금 대상자는 아래 서류를 학과 사무실로 제출해 주세요.\n\n1. 장학금 신청서\n2. 성적증명서\n3. 통장 사본\n\n문의: 학과 사무실 02-910-0000', link: 'https://www.kookmin.ac.kr/' });
  n({ category: '행사', title: '교육학과 가을 MT 참가 신청', deadline: e.ymd(2), dueTime: '18:00', target: '1~3학년', important: true, content: '11월 넷째 주 금~토, 가평에서 진행해요.\n참가비 3만 원(학생회비 납부자 2만 원).\n\n신청 폼: https://forms.gle/example' });
  n({ category: '학사', title: '2027학년도 1학기 복수전공·부전공 신청 안내', deadline: e.ymd(9), content: '신청 기간 안에 종합정보시스템에서 신청해 주세요.' });
  n({ category: '모집', title: '교육봉사 동아리 겨울 활동 참가자 모집', deadline: e.ymd(16), target: '24·25학번', content: '겨울방학 동안 지역아동센터에서 학습 지도 봉사를 해요.' });
  n({ category: '학생회', title: '과방 이용 수칙', deadline: '', content: '1. 쓴 자리는 정리해요.\n2. 음식물은 지정된 통에 버려요.\n3. 밤 10시 이후에는 소등해요.' });
  n({ category: '학사', title: '졸업 요건 한눈에 보기', deadline: '', content: '졸업 이수 학점과 필수 과목은 학과 홈페이지 [학사 안내]를 확인해 주세요.' });
  n({ category: '행사', title: '교육 현장 전문가 초청 특강', deadline: e.ymd(-4), content: '성황리에 마쳤어요. 참석해 준 학우들 고마워요.' });
  e.mails.length = 0;
  return e;
}
const env = seed();
let sentUpTo = 0;

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'POST' && url.pathname === '/api') {
    let body = ''; req.on('data', c => body += c);
    req.on('end', () => {
      let out;
      try { const b = JSON.parse(body || '{}'); out = env.api(String(b.name || ''), b.payload || {}); } catch (e) { out = { ok: false, error: '요청 형식이 잘못됐어요.' }; }
      for (; sentUpTo < env.mails.length; sentUpTo++) console.log('[메일] ' + env.mails[sentUpTo].to + ' · ' + env.mails[sentUpTo].subject);
      const wait = Number(process.env.API_DELAY || 120); // 실제 서버처럼 살짝 늦게
      setTimeout(() => { res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' }); res.end(JSON.stringify(out)); }, wait);
    });
    return;
  }
  if (url.pathname === '/config.js') { // 운영 주소 대신 이 연습용 서버를 부르게 한다(저장소의 config.js는 건드리지 않는다)
    res.writeHead(200, { 'Content-Type': TYPES['.js'] });
    return res.end("window.BATANG_API = location.origin + '/api'; window.BATANG_API_DEV = true;");
  }
  let file = path.normalize(path.join(ROOT, decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)));
  if (!file.startsWith(ROOT) || /[\\/]\.git([\\/]|$)/.test(file)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
}).listen(PORT, () => console.log('연습용 서버: http://localhost:' + PORT + '  (학우 20260002 / 123456 · 관리자 /admin.html 20260001 / 123456)'));
