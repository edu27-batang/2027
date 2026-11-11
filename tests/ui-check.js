/*
 * 화면 자동 점검(선택).  실행:  node tests/ui-check.js [스크린샷 폴더]
 * 연습용 서버(tests/dev-server.js)를 띄우고 실제 브라우저(Playwright)로 눌러 본다. Playwright가 없으면 건너뛴다.
 */
let chromium; try { chromium = require('playwright').chromium; } catch (e) { console.log('Playwright가 없어 화면 점검을 건너뛰어요.'); process.exit(0); }
const { spawn } = require('child_process'), path = require('path'), fs = require('fs');
const OUT = process.argv[2] || path.join(require('os').tmpdir(), 'batang-shots'); fs.mkdirSync(OUT, { recursive: true });
const PORT = 8791, BASE = 'http://localhost:' + PORT;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  통과  ' + m); } else { fail++; console.log('  실패  ' + m); } };
(async () => {
  const srv = spawn(process.execPath, [path.join(__dirname, 'dev-server.js')], { env: Object.assign({}, process.env, { PORT, API_DELAY: 60 }), stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 900));
  const b = await chromium.launch();
  try {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
    const pg = await ctx.newPage(); const errs = [];
    pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); }); // 글꼴 등 바깥 주소가 막힌 환경은 넘어간다
    await pg.addInitScript(() => { try { localStorage.setItem('bth_intro', '1'); localStorage.setItem('bth_a2hs', '1'); } catch (e) { } });
    const shot = n => pg.screenshot({ path: path.join(OUT, n + '.png') });
    const view = () => pg.evaluate(() => stack[stack.length - 1]);
    const settle = () => pg.waitForFunction(() => !document.querySelector('.nav-push') && !document.getElementById('navGhost'), null, { timeout: 3000 });

    console.log('\n■ 학우 화면');
    await pg.goto(BASE + '/index.html'); await pg.waitForSelector('#l_id');
    ok(await pg.evaluate(() => !!document.querySelector('.login .login-card')), '로그인 카드가 로그인 화면 안에 있다');
    await shot('01-login');
    await pg.fill('#l_id', '20260002'); await pg.fill('#l_pw', '123456'); await pg.click('#loginBtn');
    await pg.waitForSelector('#nfab'); await pg.waitForTimeout(1300);
    ok(await pg.textContent('.nfab-n') === '6', '홈 공지 동그라미에 안 읽은 공지 6개');
    ok((await pg.locator('#ntBox .qbar').count()) === 2, '홈 [놓치지 마세요]에 곧 마감 공지 2개');
    await shot('02-home');

    // 넘김 도중: 새 화면이 고정된 한 장으로 들어오고, 이전 화면 복사본이 아래에 있다
    await pg.click('#nfab');
    await pg.waitForTimeout(110);
    const mid = await pg.evaluate(() => { const l = document.querySelector('.fade.nav-push'), g = document.querySelector('#navGhost.push'); return { layer: !!l, ghost: !!g, x: l ? l.getBoundingClientRect().left : null, op: l ? getComputedStyle(l).opacity : null }; });
    ok(mid.layer && mid.ghost && mid.x > 0 && mid.op === '1', '앞으로 넘길 때 새 화면이 불투명한 채 오른쪽에서 들어온다 (x=' + Math.round(mid.x) + ')');
    await shot('03-push-mid');
    await settle();
    ok(await view() === 'notices' && await pg.evaluate(() => getComputedStyle(document.querySelector('#app > .fade')).position === 'static'), '넘김이 끝나면 보통 화면으로 돌아온다');
    await pg.waitForSelector('.nt');
    const titles = await pg.$$eval('.nt .nt-t', els => els.map(e => e.textContent.replace(' (안 읽음)', '').trim()));
    ok(titles[0] === '교육학과 가을 MT 참가 신청', '중요 공지가 맨 위');
    ok((await pg.$$eval('.nt-h', els => els.map(e => e.firstChild.textContent))).join('|') === '중요 공지|상시 공지|진행 중', '중요 → 상시 → 진행 중 순서로 묶인다');
    ok(titles.slice(3).join('|') === '2학기 교육학과 성적우수 장학금 서류 제출|2027학년도 1학기 복수전공·부전공 신청 안내|교육봉사 동아리 겨울 활동 참가자 모집', '진행 중은 마감이 가까운 순');
    ok(await pg.locator('.nt.closed').count() === 0 && await pg.locator('.nt-more').count() === 1, '마감된 공지는 접혀 있다');
    await shot('04-notices');
    await pg.click('.nt-more'); ok(await pg.locator('.nt.closed').count() === 1, '눌러서 마감된 공지를 펼친다');
    // 테스트용(Apps Script) 화면은 google.script.run으로 받는데, 이때 값이 null인 칸은 빠져서 온다 → 같은 상황을 만들어 본다
    const undef = await pg.evaluate(() => { S.notices.list.forEach(n => { if (!n.deadline) delete n.daysLeft; }); renderNotices(); return /undefined|NaN/.test(document.querySelector('#ntList').textContent); });
    ok(!undef, '마감 없는 공지에 D-undefined가 뜨지 않는다(칸이 빠져 와도 "상시")');
    await pg.fill('#nt_q', '장학'); ok(await pg.locator('.nt').count() === 1 && await pg.evaluate(() => document.activeElement.id === 'nt_q'), '찾기: 글자를 쳐도 입력칸이 유지되고 결과만 바뀐다');
    await pg.fill('#nt_q', '없는말'); ok(/맞는 공지가 없어요/.test(await pg.textContent('#ntList')), '찾는 공지가 없으면 안내와 [전체 공지 보기]');
    await shot('05-search-empty');
    await pg.click('text=전체 공지 보기');
    await pg.click('.chips button:has-text("행사")'); ok(await pg.locator('.nt:not(.closed)').count() === 1, '분류 칩으로 거른다');
    await pg.click('.chips button:has-text("전체")');
    await pg.click('.nt-more'); await pg.evaluate(() => window.scrollTo(0, 200)); const y0 = await pg.evaluate(() => window.scrollY);
    await pg.click('.nt:has-text("장학금 서류 제출")'); await settle();
    ok(await view() === 'notice' && /23:59까지/.test(await pg.textContent('.nt-meta')), '공지를 누르면 마감 기한·대상·내용이 보인다');
    ok(await pg.locator('.bottom a.btn').count() === 1 && await pg.locator('.nt-body').count() === 1, '링크가 있으면 아래에 [신청·안내 페이지 열기]');
    await shot('06-notice');
    await pg.click('.top .icon-btn[aria-label="뒤로"]'); await pg.waitForTimeout(120);
    const pop = await pg.evaluate(() => { const g = document.querySelector('#navGhost.pop .nav-mover'); return { ghost: !!g, x: g ? g.getBoundingClientRect().left : 0, under: getComputedStyle(document.querySelector('#app > .fade')).position }; });
    ok(pop.ghost && pop.x > 0 && pop.under === 'static', '뒤로 갈 때 지금 화면이 오른쪽으로 빠지고 이전 화면이 아래에 그대로 있다 (x=' + Math.round(pop.x) + ')');
    await shot('07-pop-mid'); await settle();
    ok(y0 > 50 && Math.abs(await pg.evaluate(() => window.scrollY) - y0) < 4, '뒤로 오면 보던 스크롤 자리로 돌아온다');
    ok(await pg.locator('.nt.unread').count() === 5, '읽은 공지는 안 읽음 표시가 사라진다');
    await pg.click('.top .icon-btn[aria-label="뒤로"]'); await settle(); await pg.waitForTimeout(200);
    ok(await pg.textContent('.nfab-n') === '5', '홈 동그라미 숫자가 5로 줄었다');
    await pg.click('#ntBox .qbar >> nth=0'); await settle();
    ok(await view() === 'notice', '홈 [놓치지 마세요]에서 공지로 바로 간다');
    await pg.click('.top .icon-btn[aria-label="뒤로"]'); await settle();
    ok(await view() === 'home', '거기서 뒤로 가면 홈');

    // 하단 버튼이 있는 화면: 넘김 도중에도 버튼이 화면 바닥에 붙어 있다
    await pg.click('.tile >> nth=1'); await pg.waitForTimeout(140);
    const bb = await pg.evaluate(() => { const el = document.querySelector('#app .bottom'); const r = el.getBoundingClientRect(); return Math.round(window.innerHeight - r.bottom); });
    ok(bb === 0, '넘김 도중에도 하단 버튼이 바닥에 붙어 있다'); await settle();
    await pg.evaluate(() => home()); await settle();
    // 기존 흐름: 빌리기
    await pg.click('.tile >> nth=0'); await settle(); await pg.click('#bigBorrow'); await settle(); await pg.waitForSelector('.item');
    await pg.click('.item >> nth=0'); await pg.click('#pickBtn'); await pg.click('#rentBtn'); await pg.waitForSelector('.due'); await settle();
    ok(await view() === 'rented', '물품 빌리기가 끝까지 된다');
    await pg.click('.bottom .btn'); await settle(); ok(await view() === 'home', '확인을 누르면 홈으로');

    console.log('\n■ 동작 줄이기 설정');
    const c2 = await b.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' }); const p2 = await c2.newPage();
    await p2.addInitScript(() => { try { localStorage.setItem('bth_intro', '1'); } catch (e) { } });
    await p2.goto(BASE + '/index.html'); await p2.fill('#l_id', '20260002'); await p2.fill('#l_pw', '123456'); await p2.click('#loginBtn'); await p2.waitForSelector('#nfab');
    await p2.click('#nfab');
    ok(await p2.evaluate(() => !document.getElementById('navGhost') && !document.querySelector('.nav-push')), '넘김 효과 없이 바로 바뀐다'); await c2.close();

    console.log('\n■ 관리자 화면');
    await pg.goto(BASE + '/admin.html'); await pg.fill('#a_sid', '20260001'); await pg.fill('#a_pw', '123456'); await pg.click('#loginBtn');
    await pg.waitForSelector('.seg'); await pg.click('.seg button:has-text("공지")'); await pg.waitForSelector('#pane .rc');
    ok(await pg.locator('#pane .rc').count() === 6, '진행 중 공지 6개'); await shot('08-admin-notices');
    await pg.click('text=새 공지 쓰기'); await pg.waitForSelector('#nfTitle'); await pg.waitForTimeout(350); await shot('09-admin-form');
    await pg.click('#nfSave'); ok(/분류/.test(await pg.textContent('#toast')), '분류를 안 고르면 알려 준다');
    await pg.click('#nfCat button:has-text("모집")'); await pg.fill('#nfTitle', '학생회 집행부원 모집');
    const d = await pg.evaluate(() => { const x = new Date(); x.setDate(x.getDate() + 1); return x.getFullYear() + '-' + ('0' + (x.getMonth() + 1)).slice(-2) + '-' + ('0' + x.getDate()).slice(-2); });
    ok(await pg.$eval('#nfTime', s => s.disabled && s.options.length === 49 && s.value === '23:59'), '마감 시각은 30분 단위 48칸 + 23:59, 날짜를 고르기 전에는 잠겨 있다');
    await pg.fill('#nfDead', d); await pg.selectOption('#nfTime', '18:30');
    ok(/내일 18:30에 마감/.test(await pg.textContent('#nfDeadHint')), '날짜·시각을 고르면 언제 내려가는지 알려 준다');
    await pg.fill('#nfBody', '함께할 집행부원을 찾아요.'); await pg.click('#nfSave'); await pg.waitForFunction(() => !document.querySelector('#nfTitle'));
    await pg.waitForFunction(() => document.querySelectorAll('#pane .rc').length === 7);
    ok(/18:30까지/.test(await pg.textContent('#pane .rc:has-text("집행부원")')), '공지를 올리면 목록에 바로 보이고, 마감 시각까지 나온다');
    await pg.click('#pane .rc:has-text("집행부원") button:has-text("내리기")'); await pg.click('.overlay .btn.primary'); await pg.waitForFunction(() => document.querySelectorAll('#pane .rc').length === 6);
    await pg.click('.stat:has-text("내린 공지")'); ok(await pg.locator('#pane .rc').count() === 1, '내린 공지는 [내린 공지]로 간다');
    await pg.click('#pane button:has-text("다시 게시")'); await pg.waitForFunction(() => /없어요/.test(document.querySelector('#pane').textContent));
    ok(true, '다시 게시할 수 있다');
    ok(errs.length === 0, '브라우저 오류 없음' + (errs.length ? ': ' + errs.slice(0, 3).join(' / ') : ''));
  } catch (e) { fail++; console.log('  실패  점검이 중간에 멈췄어요: ' + e.message.split('\n')[0]); }
  await b.close(); srv.kill();
  console.log('\n결과: 통과 ' + pass + ' · 실패 ' + fail + ' · 스크린샷 ' + OUT + '\n');
  process.exit(fail ? 1 : 0);
})();
