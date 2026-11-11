/*
 * 서버(apps-script/Code.gs) 자동 테스트.  실행:  node tests/api.test.js
 * 가짜 구글 서비스(tests/gas-fake.js) 위에서 돌기 때문에 인터넷도, 구글 계정도 필요 없다.
 */
const { createEnv } = require('./gas-fake');
let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; console.log('  통과  ' + name); } catch (e) { fail++; console.log('  실패  ' + name + '\n        ' + e.message); } }
function eq(a, b, m) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((m || '') + ' 기대 ' + JSON.stringify(b) + ' / 실제 ' + JSON.stringify(a)); }
function yes(v, m) { if (!v) throw new Error(m || '참이어야 해요'); }
function err(r, re) { if (r.ok) throw new Error('거절돼야 하는데 통과했어요'); if (re && !re.test(r.error)) throw new Error('오류 문구가 달라요: ' + r.error); }

console.log('\n■ 가입 · 로그인 · 이메일 인증');
{
  const e = createEnv({ quiet: true });
  t('학교 메일이 아니면 인증번호를 보내지 않는다', () => err(e.api('emailCode', { purpose: 'signup', studentId: '20260001', email: 'a@gmail.com' }), /학교 메일/));
  let tok;
  t('인증번호로 가입한다', () => { tok = e.signup('20260001', '김관리', 'admin@kookmin.ac.kr'); yes(tok); });
  t('인증번호 없이는 가입할 수 없다', () => err(e.api('signup', { studentId: '20260002', name: '이학우', password: '123456', email: 'b@kookmin.ac.kr', phone: '01012345678', agree: true }), /인증번호/));
  t('이미 가입한 학번이면 학생회 문의 안내가 붙는다', () => err(e.api('emailCode', { purpose: 'signup', studentId: '20260001', email: 'x@kookmin.ac.kr' }), /학생회에 문의/));
  t('비밀번호를 5번 틀리면 잠긴다', () => {
    for (let i = 0; i < 5; i++) e.api('login', { studentId: '20260001', password: '000000' });
    err(e.api('login', { studentId: '20260001', password: '123456' }), /5번 틀렸/);
    delete e.cache['lgf_20260001'];
    yes(e.ok('login', { studentId: '20260001', password: '123456' }).token);
  });
  t('이메일을 바꾸려면 새 주소 인증번호가 필요하다', () => {
    err(e.api('updateProfile', { token: tok, email: 'new@kookmin.ac.kr', phone: '01011112222' }), /인증번호/);
    delete e.cache['evw_20260001'];
    e.ok('emailCode', { purpose: 'change', token: tok, email: 'new@kookmin.ac.kr' });
    eq(e.ok('updateProfile', { token: tok, email: 'new@kookmin.ac.kr', phone: '01011112222', code: e.lastCode() }).email, 'new@kookmin.ac.kr');
  });
}

console.log('\n■ 시트 수식 주입 막기');
{
  const e = createEnv({ quiet: true });
  const tok = e.signup('20260001', '김관리', 'admin@kookmin.ac.kr');
  t('= 로 시작하는 건의도 글자로 저장된다', () => {
    const r = e.ok('suggest', { category: '기타', content: '=IMPORTXML("http://x","//a")', anonymous: true });
    const row = e.rows('건의').filter(x => x['접수번호'] === r.code)[0];
    eq(row['내용'], '=IMPORTXML("http://x","//a")');
    eq(e.ok('suggestStatus', { codes: [r.code] })[0].content, '=IMPORTXML("http://x","//a")');
  });
  t('- + @ 로 시작하는 글도 그대로 읽힌다', () => {
    ['-해 주세요 과방 정리', '+82 번호로 연락 주세요', '@학생회 확인 부탁'].forEach(c => {
      const r = e.ok('suggest', { category: '기타', content: c, token: tok, anonymous: true });
      eq(e.ok('suggestStatus', { codes: [r.code] })[0].content, c);
    });
  });
  t('강의실 사용 목적에 수식을 적어도 글자로 저장된다', () => {
    const day = e.ymd(1);
    e.sheets['설정'].data.push(['주말 예약', '사용', '']);
    e.ok('roomBook', { token: tok, date: day, start: 10, end: 11, people: 3, purpose: '=1+1' });
    eq(e.rows('예약')[0]['사용 목적'], '=1+1');
  });
}

console.log('\n■ 건의 장난 방지 한도');
{
  const e = createEnv({ quiet: true });
  const a = e.signup('20260001', '김관리', 'admin@kookmin.ac.kr'), b = e.signup('20260002', '이학우', 'b@kookmin.ac.kr');
  t('한 사람이 6번째 보내면 막히고, 다른 학우는 보낼 수 있다', () => {
    for (let i = 0; i < 5; i++) e.ok('suggest', { category: '기타', content: '건의 내용 ' + i, token: a, anonymous: true });
    err(e.api('suggest', { category: '기타', content: '여섯 번째 건의', token: a, anonymous: true }), /연달아/);
    yes(e.ok('suggest', { category: '기타', content: '다른 학우의 건의', token: b, anonymous: true }).code);
  });
  t('익명 건의에는 이름·이메일이 저장되지 않는다', () => {
    yes(e.rows('건의').every(r => r['이름'] === '' && r['이메일'] === ''));
  });
}

console.log('\n■ 물품 대여 · 반납');
{
  const e = createEnv({ quiet: true });
  const admin = e.signup('20260001', '김관리', 'admin@kookmin.ac.kr'), stu = e.signup('20260002', '이학우', 'b@kookmin.ac.kr');
  e.add('납부자', { '학번': '20260002', '이름': '이학우' });
  e.add('물품', { '물품번호': 'B-001', '구분': '전공서적', '이름': '교육학개론', '반납 기한': '7일', '상태': '대여가능' });
  e.add('물품', { '물품번호': 'W-001', '구분': '복지물품', '이름': '우산', '반납 기한': '당일', '상태': '대여가능' });
  const at = e.ok('adminLogin', { studentId: '20260001', password: '123456' }).token;
  let rid;
  t('납부자가 아니면 빌릴 수 없다', () => err(e.api('rent', { token: admin, itemIds: ['B-001'] }), /납부자/));
  t('빌리면 물품이 대여중이 된다', () => {
    e.ok('rent', { token: stu, itemIds: ['B-001'] });
    eq(e.rows('물품')[0]['상태'], '대여중'); rid = e.rows('대여기록')[0]['대여ID'];
  });
  t('같은 물품을 다시 빌릴 수 없다', () => err(e.api('rent', { token: stu, itemIds: ['B-001'] }), /방금 다른 사람/));
  t('반납 신청 → 관리자 확인 → 대여가능, 처리자에 관리자 이름', () => {
    e.ok('requestReturn', { token: stu, rentalIds: [rid] });
    e.ok('adminConfirm', { token: at, rentalIds: [rid] });
    eq(e.rows('물품')[0]['상태'], '대여가능'); eq(e.rows('대여기록')[0]['처리자'], '김관리');
  });
  t('대여 중에 사용중지로 바꾼 물품은 반납을 확인해도 사용중지로 남는다', () => {
    e.ok('rent', { token: stu, itemIds: ['W-001'] });
    const r2 = e.rows('대여기록')[1]['대여ID'];
    e.sheets['물품'].data[2][e.H['물품'].indexOf('상태')] = '사용중지';
    e.ok('adminConfirm', { token: at, rentalIds: [r2] });
    eq(e.rows('물품')[1]['상태'], '사용중지');
  });
}

console.log('\n■ 강의실 예약');
{
  const e = createEnv({ quiet: true, settings: { '주말 예약': '사용' } });
  const a = e.signup('20260001', '김관리', 'admin@kookmin.ac.kr'), b = e.signup('20260002', '이학우', 'b@kookmin.ac.kr');
  const day = e.ymd(1);
  t('예약하면 같은 시간은 다른 학우가 잡을 수 없다', () => {
    e.ok('roomBook', { token: a, date: day, start: 13, end: 15, people: 3 });
    err(e.api('roomBook', { token: b, date: day, start: 14, end: 16, people: 3 }), /방금 다른 사람/);
  });
  t('2명은 하루 2시간까지', () => err(e.api('roomBook', { token: b, date: day, start: 9, end: 12, people: 2 }), /2명이면/));
  t('취소하면 그 시간이 다시 열린다', () => {
    const rid = e.ok('roomMine', { token: a })[0].rid;
    e.ok('roomCancel', { token: a, rid });
    yes(e.ok('roomBook', { token: b, date: day, start: 14, end: 16, people: 3 }).rid);
  });
}

console.log('\n■ 학과 공지');
{
  const e = createEnv({ quiet: true });
  const admin = e.signup('20260001', '김관리', 'admin@kookmin.ac.kr'), stu = e.signup('20260002', '이학우', 'b@kookmin.ac.kr');
  const at = e.ok('adminLogin', { studentId: '20260001', password: '123456' }).token;
  const save = o => e.ok('adminNoticeSave', Object.assign({ token: at, category: '학사', content: '내용이에요', target: '전체 학우' }, o));
  t('공지 시트가 없어도 학우 화면은 빈 목록을 받는다', () => { eq(e.ok('notices', { token: stu }).list, []); yes(!e.sheets['공지']); });
  t('관리자가 아니면 공지를 올릴 수 없다', () => err(e.api('adminNoticeSave', { token: stu, category: '학사', title: '제목' }), /로그인/));
  t('로그인하지 않으면 공지를 볼 수 없다', () => err(e.api('notices', {}), /로그인/));
  let ids = {};
  t('공지를 올리면 시트에 한 줄이 생기고 작성자가 남는다', () => {
    ids.soon = save({ title: '수강 정정 안내', deadline: e.ymd(2) }).id;
    ids.later = save({ title: '교육학과 MT 참가 신청', category: '행사', deadline: e.ymd(10), link: 'https://forms.gle/abc' }).id;
    ids.always = save({ title: '과방 이용 수칙', category: '학생회', deadline: '' }).id;
    ids.today = save({ title: '장학금 서류 제출', category: '장학', deadline: e.ymd(0) }).id;
    ids.past = save({ title: '지난 특강 신청', category: '행사', deadline: e.ymd(-3) }).id;
    ids.old = save({ title: '오래전 공지', deadline: e.ymd(-40) }).id;
    eq(e.rows('공지').length, 6); eq(e.rows('공지')[0]['작성자'], '김관리');
  });
  t('순서: 상시 고정 → 마감 가까운 순 → 마감된 공지는 아래로', () => {
    const list = e.ok('notices', { token: stu }).list;
    eq(list.map(n => n.title), ['과방 이용 수칙', '장학금 서류 제출', '수강 정정 안내', '교육학과 MT 참가 신청', '지난 특강 신청']);
    eq(list.map(n => n.closed), [false, false, false, false, true]);
    eq(list.map(n => n.daysLeft), [-9999, 0, 2, 10, -3]);
    eq(list.map(n => n.deadline === ''), [true, false, false, false, false], '상시는 deadline이 빈 글자');
  });
  t('마감한 지 30일이 넘은 공지는 학우 화면에서 사라진다(시트에는 남는다)', () => {
    yes(!e.ok('notices', { token: stu }).list.some(n => n.title === '오래전 공지'));
    yes(e.rows('공지').some(r => r['제목'] === '오래전 공지'));
  });
  t('중요 공지는 맨 위로 올라간다', () => {
    save({ id: ids.later, title: '교육학과 MT 참가 신청', category: '행사', deadline: e.ymd(10), important: true });
    eq(e.ok('notices', { token: stu }).list[0].title, '교육학과 MT 참가 신청');
  });
  t('홈 요약에는 진행 중인 공지만, 내용 없이 실린다', () => {
    const h = e.ok('home', { token: stu });
    eq(h.notices.length, 4); yes(h.notices.every(n => n.content === undefined && !n.closed));
  });
  t('내리면 학우 화면에서 사라지고, 다시 게시하면 돌아온다', () => {
    e.ok('adminNoticeStatus', { token: at, id: ids.soon, status: '내림' });
    yes(!e.ok('notices', { token: stu }).list.some(n => n.id === ids.soon));
    e.ok('adminNoticeStatus', { token: at, id: ids.soon, status: '게시' });
    yes(e.ok('notices', { token: stu }).list.some(n => n.id === ids.soon));
  });
  t('지우면 시트에서 줄이 사라진다', () => { e.ok('adminNoticeDelete', { token: at, id: ids.old }); eq(e.rows('공지').length, 5); });
  t('잘못된 입력은 거절한다(제목 없음·없는 날짜·이상한 링크·없는 분류)', () => {
    err(e.api('adminNoticeSave', { token: at, category: '학사', title: '' }), /제목/);
    err(e.api('adminNoticeSave', { token: at, category: '학사', title: '제목이에요', deadline: '2026-02-31' }), /없는 날짜/);
    err(e.api('adminNoticeSave', { token: at, category: '학사', title: '제목이에요', link: 'javascript:alert(1)' }), /https/);
    err(e.api('adminNoticeSave', { token: at, category: '없는분류', title: '제목이에요' }), /분류/);
  });
  t('시트에서 손으로 추가한 줄(공지ID 없음)도 보이고, 관리자 화면에서 고치면 ID가 붙는다', () => {
    e.add('공지', { '상태': '게시', '분류': '기타', '제목': '시트에서 쓴 공지', '마감일': e.ymd(5) });
    const n = e.ok('notices', { token: stu }).list.filter(x => x.title === '시트에서 쓴 공지')[0];
    yes(/^ROW\d+$/.test(n.id));
    const r = e.ok('adminNoticeSave', { token: at, id: n.id, category: '기타', title: '시트에서 쓴 공지(수정)', deadline: e.ymd(5) });
    yes(/^N\d{6}-/.test(r.id));
  });
  t('공지 작업이 관리기록에 남는다', () => {
    const log = e.rows('관리기록').map(r => r['작업']);
    yes(log.includes('공지 저장') && log.includes('공지 게시·내림') && log.includes('공지 삭제'));
    yes(e.rows('관리기록').every(r => r['처리자'] === '김관리'));
  });
  t('상시 공지도 daysLeft가 숫자다(google.script.run은 null 칸을 빼고 보내서 화면에 D-undefined가 떴다)', () => {
    yes(e.ok('notices', { token: stu }).list.every(n => typeof n.daysLeft === 'number'));
    yes(e.ok('home', { token: stu }).notices.every(n => typeof n.daysLeft === 'number'));
  });
  t('마감 시각을 30분 단위로 정한다: 시트에는 "날짜 시각"으로, 화면에는 시각까지', () => {
    const id = save({ title: '시각 있는 공지', deadline: e.ymd(3), dueTime: '18:30' }).id;
    eq(e.rows('공지').filter(r => r['공지ID'] === id)[0]['마감일'], e.ymd(3) + ' 18:30');
    const n = e.ok('notices', { token: stu }).list.filter(x => x.id === id)[0];
    eq(n.dueTime, '18:30'); yes(/ 18:30$/.test(n.deadlineLabel), n.deadlineLabel);
  });
  t('시각을 안 고르면 그날 23:59', () => {
    const id = save({ title: '시각 없는 공지', deadline: e.ymd(4) }).id;
    eq(e.ok('notices', { token: stu }).list.filter(x => x.id === id)[0].dueTime, '23:59');
  });
  t('30분 단위가 아닌 시각은 거절한다', () => {
    err(e.api('adminNoticeSave', { token: at, category: '학사', title: '이상한 시각', deadline: e.ymd(2), dueTime: '18:15' }), /30분/);
    err(e.api('adminNoticeSave', { token: at, category: '학사', title: '이상한 시각', deadline: e.ymd(2), dueTime: '24:00' }), /30분/);
  });
  t('오늘 이미 지난 시각이면 바로 마감, 아직이면 진행 중', () => {
    const now = new Date(), pad = x => String(x).padStart(2, '0');
    const past = new Date(now.getTime() - 3600000), fut = new Date(now.getTime() + 3600000);
    if (past.getDate() !== now.getDate() || fut.getDate() !== now.getDate()) return; // 자정 무렵에는 건너뛴다
    e.add('공지', { '상태': '게시', '분류': '기타', '제목': '한 시간 전 마감', '마감일': e.ymd(0) + ' ' + pad(past.getHours()) + ':' + pad(past.getMinutes()) });
    e.add('공지', { '상태': '게시', '분류': '기타', '제목': '한 시간 뒤 마감', '마감일': e.ymd(0) + ' ' + pad(fut.getHours()) + ':' + pad(fut.getMinutes()) });
    const l = e.ok('notices', { token: stu }).list;
    eq(l.filter(x => x.title === '한 시간 전 마감')[0].closed, true); eq(l.filter(x => x.title === '한 시간 뒤 마감')[0].closed, false);
  });
  t('시트가 날짜로 바꿔 둔 칸도 읽는다(날짜만이면 23:59, 시각이 있으면 그 시각)', () => {
    const d1 = new Date(); d1.setDate(d1.getDate() + 6); d1.setHours(0, 0, 0, 0);
    const d2 = new Date(d1.getTime()); d2.setHours(14, 30);
    e.add('공지', { '상태': '게시', '분류': '기타', '제목': '날짜 칸', '마감일': d1 });
    e.add('공지', { '상태': '게시', '분류': '기타', '제목': '날짜시각 칸', '마감일': d2 });
    const l = e.ok('notices', { token: stu }).list;
    eq(l.filter(x => x.title === '날짜 칸')[0].dueTime, '23:59'); eq(l.filter(x => x.title === '날짜시각 칸')[0].dueTime, '14:30');
  });
  t('제목에 수식을 적어도 글자로 저장된다', () => {
    save({ title: '=HYPERLINK("http://x")', deadline: '' });
    yes(e.ok('notices', { token: stu }).list.some(n => n.title === '=HYPERLINK("http://x")'));
  });
}

console.log('\n■ 회원 관리 · 관리자 권한');
{
  const e = createEnv({ quiet: true });
  e.signup('20260001', '김관리', 'admin@kookmin.ac.kr'); const stu = e.signup('20260002', '이학우', 'b@kookmin.ac.kr');
  t('관리자 학번이 아니면 관리자 로그인이 거절된다', () => err(e.api('adminLogin', { studentId: '20260002', password: '123456' }), /관리자로 등록된/));
  const at = e.ok('adminLogin', { studentId: '20260001', password: '123456' }).token;
  t('회원 찾기에 가입일이 연-월-일 시:분으로 나온다', () => yes(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(e.ok('adminMembers', { token: at, q: '이학' }).list[0].joined)));
  t('로그인 풀기 뒤에는 예전 토큰이 무효가 된다', () => { e.ok('adminMemberLogout', { token: at, studentId: '20260002' }); err(e.api('me', { token: stu }), /로그인/); });
  t('회원 삭제는 학번을 똑같이 적어야 한다', () => {
    err(e.api('adminMemberDelete', { token: at, studentId: '20260002', confirm: '20260009' }));
    e.ok('adminMemberDelete', { token: at, studentId: '20260002', confirm: '20260002' }); eq(e.rows('회원').length, 1);
  });
  t('관리자 학번에서 빠지면 바로 막힌다', () => { e.sheets['설정'].data.find(r => r[0] === '관리자 학번')[1] = '20269999'; err(e.api('adminData', { token: at }), /로그인/); });
}

console.log('\n■ 매일 알림');
{
  const e = createEnv({ quiet: true });
  e.props['mail_skip_2020-01-01'] = '3';
  t('dailyJob이 오류 없이 돌고, 오래된 "못 보낸 메일" 기록을 지운다', () => { e.ctx.dailyJob(); yes(!('mail_skip_2020-01-01' in e.props)); });
}

console.log('\n■ 화면 파일 짝 맞춤');
{
  const fs = require('fs'), path = require('path'), R = path.join(__dirname, '..');
  const inner = (file, open, close) => { const s = fs.readFileSync(path.join(R, 'apps-script', file), 'utf8'); const b = s.lastIndexOf('\n' + close); const a = s.lastIndexOf(open + '\n', b); return s.slice(a + open.length + 1, b); };
  [['Index.html', 'app.js', '<script>', '</script>'], ['Admin.html', 'admin.js', '<script>', '</script>'], ['Common.html', 'common.js', '<script>', '</script>'], ['Styles.html', 'styles.css', '<style>', '</style>']].forEach(j => {
    t('apps-script/' + j[0] + ' 안의 내용이 ' + j[1] + '와 같다', () => yes(inner(j[0], j[2], j[3]) === fs.readFileSync(path.join(R, j[1]), 'utf8').replace(/\n+$/, ''), '다르면 node tests/sync-apps-script.js 를 돌려 주세요'));
  });
  t('루트 화면 스크립트에 문법 오류가 없다', () => ['app.js', 'admin.js', 'common.js', 'sw.js'].forEach(f => new Function(fs.readFileSync(path.join(R, f), 'utf8'))));
}

console.log('\n결과: 통과 ' + pass + ' · 실패 ' + fail + '\n');
process.exit(fail ? 1 : 0);
