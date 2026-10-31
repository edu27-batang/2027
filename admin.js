/* 바탕화면 관리자 화면 (V5): 물품 · 강의실 · 건의
 * 버튼을 누르면 카드가 바로 정리되고, 전체 새로고침은 뒤에서 한다. 쓰던 답변·메모는 자동 새로고침에 지워지지 않는다. */
var A = { token: null, data: null, sec: 'items', tab: { items: 'pending', rooms: 'toCheck', sug: 'open' }, drafts: {} };
try { A.token = sessionStorage.getItem('bth_admin'); } catch (e) { }
try { var s0 = sessionStorage.getItem('bth_admin_sec'); if (s0) A.sec = s0; } catch (e) { }

function render() {
  if (!A.token) return renderLogin();
  if (!A.data) { $('#app').innerHTML = adminTop() + '<div class="list" style="margin-top:20px"><div class="skel"></div><div class="skel"></div></div>'; return refresh(); }
  var d = A.data;
  var cnt = { items: d.pending.length + d.overdue.length + d.reports.open.length, rooms: d.rooms.toCheck.length + d.rooms.noPhoto.length, sug: d.suggestions.open.length };
  var total = cnt.items + cnt.rooms + cnt.sug;
  document.title = (total ? '(' + total + ') ' : '') + '바탕화면 관리자';
  var html = adminTop();
  if (d.defaultPin) html += note('관리자 PIN이 처음 값(0000)이에요. 시트의 [설정]에서 바꿔 주세요.');
  if (!d.webUrlSet) html += note('시트 [설정]의 웹앱 주소가 비어 있어요. GitHub 주소를 적어야 메일 속 링크와 비밀번호 재설정이 돼요.');
  if (!d.adminEmailsSet) html += note('관리자 이메일이 비어 있어 알림 메일을 받을 수 없어요. 시트의 [설정]에 적어 주세요.');
  html += '<div class="seg" style="margin-top:10px">' + secBtn('items', '물품', cnt.items) + secBtn('rooms', '강의실', cnt.rooms) + secBtn('sug', '건의', cnt.sug) + '</div>';
  if (d.mail && d.mail.skipped) html += note('오늘 메일 한도가 모자라 ' + d.mail.skipped + '통을 보내지 못했어요. 한도는 그날 첫 메일을 보낸 때부터 24시간 뒤에 다시 채워져요.');
  else if (d.mail && d.mail.left != null && d.mail.left < 15) html += note('오늘 보낼 수 있는 메일이 ' + d.mail.left + '통 남았어요.');
  html += SECTIONS[A.sec](d);
  html += '<p class="foot">' + (d.mail && d.mail.left != null ? '오늘 남은 메일 ' + d.mail.left + '통 · ' : '') + '관리자 즉시 알림 ' + (d.adminNotify ? '켜짐' : '꺼짐(아침 요약만)') + '</p>';
  $('#app').innerHTML = html;
  restoreDrafts();
  // 탭·구역을 바꿀 때만 내용이 부드럽게 들어온다(자동 새로고침 때는 그대로)
  if (A.anim) {
    (A.anim === 'sec' ? ['.stats', '.tabs', '#pane'] : ['#pane']).forEach(function (q, i) {
      var el = $(q); if (el) { el.classList.add('pane-in'); el.style.animationDelay = (i * 0.04) + 's'; }
    });
    A.anim = null;
  }
  var on = $('.tabs .on'); if (on) on.parentNode.scrollLeft = Math.max(0, on.offsetLeft - 24);
  syncFab();
}
function note(t) { return '<div class="note"><b class="mk">!</b><div>' + t + '</div></div>'; }
function secBtn(k, label, n) { return '<button class="' + (A.sec === k ? 'on' : '') + '" onclick="setSec(\'' + k + '\')">' + label + (n ? ' <span class="chip bad" style="height:20px;padding:0 6px;margin-left:2px">' + n + '</span>' : '') + '</button>'; }
function setSec(k) { A.sec = k; A.anim = 'sec'; try { sessionStorage.setItem('bth_admin_sec', k); } catch (e) { } render(); }
function adminTop() {
  var d = A.data || {};
  return '<div class="top"><div class="brand">' + logoHw(132, 'top-logo') + '<span>관리자</span></div><div class="row" style="gap:4px">' +
    (A.token ? '<button class="icon-btn" aria-label="QR 인쇄" title="QR 인쇄" onclick="openQr()">' + I.qr + '</button>' +
      (d.sheetUrl ? '<a class="icon-btn" aria-label="시트 열기" title="시트 열기" href="' + esc(d.sheetUrl) + '" target="_blank" rel="noopener">' + I.sheet + '</a>' : '') +
      '<button class="icon-btn" aria-label="새로고침" title="새로고침" onclick="refresh(true)">' + I.refresh + '</button>' + helpBtn() : '') + '</div></div>';
}
function stats(list) {
  return '<div class="stats' + (list.length === 2 ? ' two' : '') + '">' + list.map(function (s) {
    return '<button class="stat' + (s.hot ? ' hot' : '') + (A.tab[A.sec] === s.key ? ' on' : '') + '" onclick="setTab(\'' + s.key + '\')"><small>' + s.label + '</small><b>' + s.n + '</b></button>';
  }).join('') + '</div>';
}
function tabs(list) {
  return '<div class="tabs">' + list.map(function (t) { return '<button class="' + (A.tab[A.sec] === t[0] ? 'on' : '') + '" onclick="setTab(\'' + t[0] + '\')">' + t[1] + '</button>'; }).join('') + '</div>';
}
function setTab(t) { A.tab[A.sec] = t; A.anim = 'tab'; render(); }
function empty(t) { return '<div class="card empty" style="margin-top:10px">' + t + '</div>'; }
function who(r) { return esc(r.name) + ' · ' + esc(r.studentId) + ' · <a href="tel:' + esc(r.phone) + '">' + esc(r.phone) + '</a>'; }

var SECTIONS = {
  /* ───────── 물품 ───────── */
  items: function (d) {
    return stats([{ key: 'pending', label: '반납 확인', n: d.pending.length, hot: d.pending.length > 0 },
      { key: 'reports', label: '물품 신고', n: d.reports.open.length, hot: d.reports.open.length > 0 }, { key: 'overdue', label: '연체', n: d.overdue.length, hot: d.overdue.length > 0 }]) +
      tabs([['pending', '반납 확인'], ['reports', '신고'], ['out', '대여 중'], ['overdue', '연체'], ['rbans', '대여 정지' + (d.rentBans.length ? ' ' + d.rentBans.length : '')], ['items', '물품'], ['recent', '기록']]) +
      '<div id="pane">' + ITEM_PANES[A.tab.items](d) + '</div>';
  },
  /* ───────── 강의실 ───────── */
  rooms: function (d) {
    var R = d.rooms;
    return stats([{ key: 'toCheck', label: '퇴실 확인', n: R.toCheck.length, hot: R.toCheck.length > 0 },
      { key: 'noPhoto', label: '사진 없음', n: R.noPhoto.length, hot: R.noPhoto.length > 0 }, { key: 'upcoming', label: '예정', n: R.upcoming.length }]) +
      tabs([['toCheck', '퇴실 확인'], ['noPhoto', '사진 없음'], ['upcoming', '예정·이용 중'], ['bans', '예약 중지' + (R.bans.length ? ' ' + R.bans.length : '')], ['recent', '기록']]) +
      '<div id="pane">' + ROOM_PANES[A.tab.rooms](R) + '</div>' +
      '<p class="foot">' + esc(d.roomName) + ' · 시간·규칙·안내문·중지 기간(' + R.banDays + '일)은 시트 [설정]에서, 원본 사진은 드라이브 「바탕화면 사진 › 강의실 원본 사진」에서 바꿔요</p>';
  },
  /* ───────── 건의: [새 건의] [완료] 두 개 ───────── */
  sug: function (d) {
    var S2 = d.suggestions, tab = A.tab.sug === 'done' ? 'done' : 'open';
    return stats([{ key: 'open', label: '새 건의', n: S2.open.length, hot: S2.open.length > 0 }, { key: 'done', label: '완료', n: S2.doneTotal }]) +
      '<div id="pane">' + (tab === 'done' ? SUG_DONE(S2.done) : SUG_OPEN(S2.open)) + '</div>';
  }
};

/* 물품 상태 칩 + 메모 버튼 (반납 확인·신고 카드 오른쪽 위) */
var ITEM_CHIP = { '대여가능': 'ok', '대여중': 'mute', '반납확인중': 'warn', '점검중': 'warn', '사용중지': 'bad' };
function itemTools(itemId, status) {
  return (status ? '<span class="chip ' + (ITEM_CHIP[status] || 'mute') + '">' + esc(status) + '</span>' : '') +
    '<button class="memo-btn" onclick="openMemo(\'' + jsq(itemId) + '\')" aria-label="' + esc(itemId) + ' 메모">' + I.memo + '메모</button>';
}
function memoLine(lines) { return lines && lines.length ? '<div class="memo-last">' + I.memo + '<span>' + esc(lines[0]) + '</span></div>' : ''; }
function head(r, right) { return '<div class="row"><span class="num">' + esc(r.itemId) + '</span><div class="grow nm">' + esc(r.itemName) + '</div>' + (right || '') + '</div>'; }
function dueChip(r) { return r.overdue ? '<span class="chip bad">' + r.daysLate + '일 연체</span>' : '<span class="chip mute">' + esc(r.due) + '</span>'; }

var ITEM_PANES = {
  pending: function (d) {
    if (!d.pending.length) return empty('확인할 반납이 없어요');
    var lim = d.lateLimit;
    return (d.pending.length > 1 ? '<div class="row" style="justify-content:flex-end;margin-top:6px"><button class="btn sm dark" onclick="confirmAll(this)">모두 확인 ' + d.pending.length + '</button></div>' : '') +
      d.pending.map(function (r) {
        var lateLine = r.late
          ? '<div class="who' + (r.lateNo >= lim ? ' warnline' : '') + '">늦은 반납 · 확인하면 이번 학기 연체 ' + r.lateNo + '회째' +
            (r.lateNo >= lim ? (r.bannedUntil ? ' → 대여 정지 기간이 늘어나요' : ' → ' + d.rentBanDays + '일 대여 정지') : '') + '</div>' : '';
        return '<div class="rc">' + head(r, itemTools(r.itemId, r.itemStatus)) +
          '<div class="who">' + who(r) + (r.lateCount ? ' <span class="chip bad late-chip">이번 학기 연체 ' + r.lateCount + '회</span>' : '') + '</div>' +
          '<div class="who">반납 신청 ' + esc(r.returnReq) + ' · 기한 ' + esc(r.due) + '</div>' + lateLine +
          (r.bannedUntil ? '<div class="who"><span class="chip bad">대여 정지 · ' + esc(r.bannedUntil) + '까지</span></div>' : '') + memoLine(r.itemMemo) +
          '<div class="acts"><button class="btn line" onclick="act(\'adminReject\',{rentalIds:[\'' + r.rid + '\']},this,\'자리에 없다고 알렸어요\')">자리에 없어요</button>' +
          '<button class="btn primary" onclick="act(\'adminConfirm\',{rentalIds:[\'' + r.rid + '\']},this,\'반납 확인했어요\')">확인</button></div></div>';
      }).join('');
  },
  out: function (d) {
    if (!d.out.length) return empty('대여 중인 물품이 없어요');
    return d.out.slice().sort(function (a, b) { return b.daysLate - a.daysLate; }).map(function (r) {
      return '<div class="rc">' + head(r, dueChip(r)) + '<div class="who">' + who(r) + '</div><div class="who">대여 ' + esc(r.rentedAt) + '</div>' +
        '<div class="acts"><button class="btn line" onclick="lost(\'' + r.rid + '\',this)">분실</button>' +
        '<button class="btn line" onclick="act(\'adminConfirm\',{rentalIds:[\'' + r.rid + '\']},this,\'반납 처리했어요\')">직접 반납 처리</button></div></div>';
    }).join('');
  },
  overdue: function (d) {
    if (!d.overdue.length) return empty('연체가 없어요');
    return d.overdue.map(function (r) {
      return '<div class="rc">' + head(r, dueChip(r)) + '<div class="who">' + who(r) + '</div>' +
        '<div class="acts"><a class="btn line" href="tel:' + esc(r.phone) + '">' + I.phone.replace('<svg', '<svg width="18" height="18"') + ' 전화</a>' +
        '<button class="btn primary" onclick="remind(\'' + r.rid + '\',this)">메일 다시 보내기</button></div></div>';
    }).join('');
  },
  reports: function (d) {
    var open = d.reports.open, done = d.reports.done;
    var html = open.length ? open.map(function (x) { return reportCard(x, d, true); }).join('') : empty('처리할 신고가 없어요');
    if (done.length) html += '<div class="h2">처리한 신고</div>' + done.map(function (x) { return reportCard(x, d, false); }).join('');
    return html + '<p class="foot">물품을 직접 보고 골라 주세요. 전체 기록은 시트의 [물품신고]에 있어요</p>';
  },
  rbans: function (d) {
    if (!d.rentBans.length) return empty('대여가 정지된 학우가 없어요');
    return d.rentBans.map(function (b) {
      return '<div class="rc"><div class="row"><div class="grow"><div class="nm">' + esc(b.name || '이름 없음') + ' · ' + esc(b.studentId) + '</div>' +
        '<div class="ds">' + esc(b.start) + ' ~ ' + esc(b.until) + ' · ' + esc(b.reason) + '</div></div><span class="chip bad">' + esc(b.kind) + '</span></div>' +
        '<div class="acts"><button class="btn line" onclick="unbanRent(\'' + jsq(b.studentId) + '\',this)">정지 풀기</button></div></div>';
    }).join('') + '<p class="foot">정지된 동안에는 새로 빌릴 수 없고 반납만 돼요. 기간이 지나면 저절로 풀려요</p>';
  },
  items: function (d) {
    if (!d.items.length) return empty('시트의 [물품]에 물품을 적어 주세요');
    return '<div class="list">' + d.items.map(function (it) {
      var canToggle = it.status === '대여가능' || it.status === '사용중지' || it.status === '점검중';
      return '<div class="item"><span class="num">' + esc(it.id) + '</span><div class="grow"><div class="nm">' + esc(it.name) + '</div>' +
        '<div class="ds">' + esc(it.type) + ' · ' + esc(it.dueLabel) + (it.memo[0] ? ' · ' + esc(it.memo[0]) : '') + '</div></div>' +
        '<button class="memo-btn icon" onclick="openMemo(\'' + jsq(it.id) + '\')" aria-label="' + esc(it.id) + ' 메모">' + I.memo + '</button>' +
        (canToggle ? '<button class="chip ' + ITEM_CHIP[it.status] + '" style="height:32px;padding:0 12px" onclick="toggleItem(\'' + jsq(it.id) + '\',\'' + it.status + '\',this)">' + it.status + '</button>'
          : '<span class="chip ' + (ITEM_CHIP[it.status] || 'mute') + '">' + esc(it.status) + '</span>') + '</div>';
    }).join('') + '</div><p class="foot">물품 추가·이름·반납 기한은 시트의 [물품]에서 바꿔요. 상태를 누르면 대여가능 ↔ 사용중지</p>';
  },
  recent: function (d) {
    if (!d.recent.length) return empty('아직 기록이 없어요');
    return '<div class="list">' + d.recent.map(function (r) {
      return '<div class="item"><span class="num">' + esc(r.itemId) + '</span><div class="grow"><div class="nm">' + esc(r.itemName) + '</div><div class="ds">' + esc(r.name) + ' · ' + esc(r.returnOk) + '</div></div>' +
        '<span class="chip ' + (r.status === '분실' ? 'bad' : 'ok') + '">' + esc(r.status) + '</span></div>';
    }).join('') + '</div><p class="foot">전체 기록은 시트의 [대여기록]에 있어요</p>';
  }
};

var REPORT_CHIP = { '없어요': ['bad', '자리에 없어요'], '파손': ['warn', '파손'] };
function reportCard(x, d, open) {
  var c = REPORT_CHIP[x.kind] || ['mute', x.kind];
  var html = '<div class="rc"><div class="row"><span class="num">' + esc(x.itemId) + '</span><div class="grow nm">' + esc(x.itemName) + '</div>' +
    (open ? itemTools(x.itemId, x.itemStatus) : '') + '</div>' +
    '<div class="who"><span class="chip ' + c[0] + '">' + esc(c[1]) + '</span> 신고 ' + esc(x.name) + ' · ' + esc(x.at) + '</div>' +
    (x.detail ? '<div class="quote">' + esc(x.detail) + '</div>' : '') +
    '<div class="prev"><small>직전 사용자</small>' + (x.prevSid
      ? '<b>' + esc(x.prevName) + ' · ' + esc(x.prevSid) + '</b><span>' + (x.prevPhone ? '<a href="tel:' + esc(x.prevPhone) + '">' + esc(x.prevPhone) + '</a> · ' : '') + '반납 ' + esc(x.prevAt || '-') + '</span>' +
        (x.prevBannedUntil ? '<span class="chip bad" style="margin-top:6px">대여 정지 · ' + esc(x.prevBannedUntil) + '까지</span>' : '')
      : '<b>기록 없음</b><span>이 물품을 빌린 기록이 없어요</span>') + '</div>' + (open ? memoLine(x.itemMemo) : '');
  if (open) {
    html += '<div class="acts acts3"><button class="btn line" onclick="decideReport(\'' + jsq(x.code) + '\',\'사용중지\',this)">사용 중지</button>' +
      '<button class="btn line" onclick="decideReport(\'' + jsq(x.code) + '\',\'대여가능\',this)">대여 가능</button>' +
      (x.prevSid ? '<button class="btn danger" onclick="banReport(\'' + jsq(x.code) + '\',this)">' + d.rentBanDays + '일 대여 정지</button>' : '') + '</div>';
  } else {
    html += '<div class="who">' + esc(x.doneAt) + ' · 물품 ' + esc(x.itemResult || '-') + (x.banResult === '정지함' ? ' · <b class="bad-t">직전 사용자 정지</b>' : '') + '</div>';
  }
  return html + '</div>';
}

function roomHead(r, chip) {
  return '<div class="row"><div class="grow"><div class="nm" style="font-variant-numeric:tabular-nums">' + esc(r.dateLabel) + ' ' + esc(r.time) + '</div>' +
    '<div class="ds">' + (r.people ? r.people + '명' : '인원 미기재') + (r.purpose ? ' · ' + esc(r.purpose) : '') + '</div></div>' +
    (r.warnCount ? '<span class="chip bad">경고 ' + r.warnCount + '</span>' : '') + (chip || '') + '</div>';
}
/* 경고가 쌓인 학우: 예약 중지 버튼 또는 중지 표시 */
function banLine(r) {
  var days = A.data.rooms.banDays;
  if (r.bannedUntil) return '<div class="banline"><span class="chip bad">예약 중지 · ' + esc(r.bannedUntil) + '까지</span></div>';
  return '<div class="banline"><button class="btn sm danger" onclick="banStudent(\'' + jsq(r.studentId) + '\',this)">' + days + '일 예약 중지</button></div>';
}
function photoStrip(r) {
  if (!r.photos || !r.photos.length) return '';
  return '<div class="photos">' + r.photos.map(function (p, i) {
    return '<a class="ph" href="' + esc(p.view) + '" target="_blank" rel="noopener" aria-label="퇴실 사진 ' + (i + 1) + ' 크게 보기">' +
      '<img src="' + esc(p.thumb) + '" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement(\'span\'),{className:\'empty\',textContent:\'사진 ' + (i + 1) + ' 열기\'}))"></a>';
  }).join('') + '</div>';
}
var ROOM_STATUS_CHIP = { '확인완료': 'ok', '원상복구 안 됨': 'bad' };
var ROOM_PANES = {
  toCheck: function (R) {
    if (!R.toCheck.length) return empty('확인할 퇴실이 없어요');
    return R.toCheck.map(function (r) {
      return '<div class="rc">' + roomHead(r) + '<div class="who">' + who(r) + '</div><div class="who">퇴실 ' + esc(r.outAt) + ' · 사진 ' + r.photos.length + '장</div>' +
        photoStrip(r) + reviewActs(r) + (r.warnCount ? banLine(r) : '') + '</div>';
    }).join('');
  },
  noPhoto: function (R) {
    if (!R.noPhoto.length) return empty('사진 없이 끝난 예약이 없어요');
    return '<p class="hint" style="margin-top:4px">시간이 끝났는데 퇴실 사진을 올리지 않은 예약이에요. 강의실을 보고 판단해 주세요.</p>' +
      R.noPhoto.map(function (r) { return '<div class="rc">' + roomHead(r, '<span class="chip bad">사진 없음</span>') + '<div class="who">' + who(r) + '</div>' + reviewActs(r) + banLine(r) + '</div>'; }).join('');
  },
  upcoming: function (R) {
    if (!R.upcoming.length) return empty('예정된 예약이 없어요');
    return R.upcoming.map(function (r) {
      return '<div class="rc">' + roomHead(r, r.started ? '<span class="chip warn">이용 중</span>' : '') + '<div class="who">' + who(r) + '</div>' +
        (r.started ? '' : '<div class="acts"><button class="btn line" onclick="cancelRoom(\'' + r.rid + '\',this)">학생회 사정으로 취소</button></div>') +
        (r.warnCount ? banLine(r) : '') + '</div>';
    }).join('');
  },
  bans: function (R) {
    if (!R.bans.length) return empty('예약이 중지된 학우가 없어요');
    return R.bans.map(function (b) {
      return '<div class="rc"><div class="row"><div class="grow"><div class="nm">' + esc(b.name || '이름 없음') + ' · ' + esc(b.studentId) + '</div>' +
        '<div class="ds">' + esc(b.start) + ' ~ ' + esc(b.until) + (b.reason ? ' · ' + esc(b.reason) : '') + '</div></div>' +
        (b.warnCount ? '<span class="chip bad">경고 ' + b.warnCount + '</span>' : '') + '</div>' +
        '<div class="acts"><button class="btn line" onclick="unbanStudent(\'' + jsq(b.studentId) + '\',this)">중지 풀기</button></div></div>';
    }).join('') + '<p class="foot">중지된 동안에는 새 예약을 할 수 없어요. 기간이 지나면 저절로 풀려요</p>';
  },
  recent: function (R) {
    if (!R.recent.length) return empty('아직 기록이 없어요');
    return R.recent.map(function (r) {
      return '<div class="rc">' + roomHead(r, '<span class="chip ' + (ROOM_STATUS_CHIP[r.status] || 'mute') + '">' + esc(r.status) + '</span>') +
        '<div class="who">' + who(r) + '</div>' + (r.memo ? '<div class="who">메모 ' + esc(r.memo) + '</div>' : '') + photoStrip(r) +
        (r.status === '원상복구 안 됨' ? banLine(r) : '') + '</div>';
    }).join('') + '<p class="foot">전체 기록은 시트의 [예약]에 있어요</p>';
  }
};
function reviewActs(r) {
  return '<div class="acts"><button class="btn line" onclick="reviewRoom(\'' + r.rid + '\',\'warn\',this)">원상복구 안 됨</button>' +
    '<button class="btn primary" onclick="reviewRoom(\'' + r.rid + '\',\'ok\',this)">확인</button></div>';
}

/* ── 건의 ── */
function sgHead(s) {
  var real = !s.anonymous;
  return '<div class="row"><span class="chip mute">' + esc(s.category) + '</span>' +
    '<span class="meta grow">' + esc(s.code) + ' · ' + esc(s.at) + ' · ' + (real ? esc(s.name) : '익명') + '</span></div>' +
    '<div class="txt">' + esc(s.content) + '</div>';
}
function SUG_OPEN(list) {
  if (!list.length) return empty('새 건의가 없어요');
  return list.map(function (s) {
    var mail = !s.anonymous && s.email;
    return '<div class="sg" id="sg_' + s.code + '">' + sgHead(s) +
      '<label class="field" style="margin:12px 0 0"><textarea data-draft="sg_' + s.code + '" maxlength="1000" style="min-height:96px" aria-label="답변" placeholder="답변을 적어 주세요">' + esc(A.drafts['sg_' + s.code] || '') + '</textarea></label>' +
      '<div class="sg-acts"><span class="grow sg-who">' + (mail ? '보내면 ' + esc(s.name) + '님 메일로도 가요' : '접수번호로 답변을 봐요') + '</span>' +
      '<button class="linkish" onclick="closeSug(\'' + s.code + '\',this)">답변 없이 완료</button>' +
      '<button class="btn sm primary" onclick="sendSug(\'' + s.code + '\',this)">답변 보내기</button></div></div>';
  }).join('');
}
function SUG_DONE(list) {
  if (!list.length) return empty('완료한 건의가 없어요');
  return list.map(function (s) {
    return '<div class="sg">' + sgHead(s) +
      (s.answer ? '<div class="answer"><b>보낸 답변 · ' + esc(s.doneAt) + '</b>' + esc(s.answer) + '</div>' : '<div class="who" style="margin-top:8px">' + esc(s.doneAt) + ' · 답변 없이 완료</div>') + '</div>';
  }).join('') + '<p class="foot">최근 20개예요. 전체 기록은 시트의 [건의]에 있어요</p>';
}

/* 쓰던 답변·메모 지키기 */
document.addEventListener('input', function (e) {
  var k = e.target && e.target.getAttribute && e.target.getAttribute('data-draft');
  if (k) A.drafts[k] = e.target.value;
});
function restoreDrafts() {
  $$('[data-draft]').forEach(function (t) { var v = A.drafts[t.getAttribute('data-draft')]; if (v != null && t.value !== v) t.value = v; });
}
/* 지금 화면에 있는 입력칸에 쓰던 글이 있을 때만 새로고침을 미룬다(닫은 창·사라진 건의의 초안은 세지 않는다) */
function hasDraft() { return $$('[data-draft]').some(function (t) { return t.value.trim(); }); }
function pruneDrafts(d) {
  var keep = {};
  d.suggestions.open.forEach(function (x) { keep['sg_' + x.code] = 1; });
  d.items.forEach(function (x) { keep['memo_' + x.id] = 1; });
  Object.keys(A.drafts).forEach(function (k) { if (!keep[k]) delete A.drafts[k]; });
}

/* ── 로그인 ── */
function renderLogin() {
  $('#app').innerHTML = '<div class="fade" style="max-width:400px;margin:0 auto;width:100%">' + adminTop() +
    '<div class="done" style="padding-top:20px">' + taang('hello', 168) + '<h1 class="title" style="margin-top:10px">관리자 PIN</h1></div>' +
    '<label class="field"><input id="pin" class="pin" type="password" inputmode="numeric" autocomplete="off" maxlength="12" placeholder="••••" aria-label="관리자 PIN"></label>' +
    '<button class="btn primary" id="loginBtn" onclick="login(this)">들어가기</button></div>';
  var p = $('#pin'); p.focus();
  p.addEventListener('keydown', function (e) { if (e.key === 'Enter') login($('#loginBtn')); });
}
function login(btn) {
  var pin = $('#pin').value.trim();
  if (!pin) return toast('PIN을 입력해 주세요');
  busy(btn, true);
  call('adminLogin', { pin: pin }).then(function (r) {
    A.token = r.token; try { sessionStorage.setItem('bth_admin', r.token); } catch (e) { }
    A.data = null; A.anim = 'sec'; render();
  }).catch(function (e) { busy(btn, false); $('#pin').value = ''; toast(e.message); });
}
function onAuthFail(e) {
  if (/로그인/.test(e.message)) { A.token = null; A.data = null; try { sessionStorage.removeItem('bth_admin'); } catch (x) { } render(); }
  toast(e.message);
}

/* ── 데이터 ── */
var refreshing = null;
function refresh(manual) {
  if (refreshing) return refreshing;
  refreshing = call('adminData', { token: A.token }).then(function (d) {
    refreshing = null;
    A.data = d; pruneDrafts(d); var y = window.scrollY; render(); window.scrollTo(0, y); if (manual) toast('새로 불러왔어요');
  }).catch(function (e) { refreshing = null; onAuthFail(e); });
  return refreshing;
}
/* 처리한 카드는 바로 접어 없애고, 새 숫자는 뒤에서 받는다 */
function dropCard(btn) {
  var card = btn && btn.closest('.rc, .sg'); if (!card) return;
  if (reduceMotion()) { card.remove(); return; }
  card.style.height = card.offsetHeight + 'px'; card.getBoundingClientRect();
  card.classList.add('leaving'); card.style.height = '0px';
  setTimeout(function () { card.remove(); }, 260);
}
function act(name, extra, btn, msg) {
  busy(btn, true);
  return call(name, Object.assign({ token: A.token }, extra)).then(function (res) {
    var b = (res && res.banned) || [];
    toast(msg + (b.length ? ' · ' + b.map(function (x) { return x.name + ' ' + x.until + '까지 대여 정지'; }).join(', ') : ''));
    dropCard(btn);
    setTimeout(refresh, 280);
    return res;
  }).catch(function (e) { busy(btn, false); onAuthFail(e); });
}
function confirmAll(btn) {
  busy(btn, true);
  call('adminConfirm', { token: A.token, rentalIds: A.data.pending.map(function (r) { return r.rid; }) }).then(function (res) {
    var b = (res && res.banned) || [];
    toast(res.count + '건 확인했어요' + (b.length ? ' · ' + b.length + '명 대여 정지' : ''));
    $$('#pane .rc').forEach(function (c) { dropCard(c.firstChild); });
    setTimeout(refresh, 280);
  }).catch(function (e) { busy(btn, false); onAuthFail(e); });
}
function lost(rid, btn) {
  ask('분실로 처리할까요?', '물품은 사용중지로 바뀌고, 이 학우는 오늘부터 ' + A.data.rentBanDays + '일 동안 물품 대여가 정지돼요(메일로 알려요).', '분실 처리').then(function (yes) { if (yes) act('adminMarkLost', { rentalIds: [rid] }, btn, '분실 처리했어요'); });
}
function remind(rid, btn) {
  busy(btn, true);
  call('adminRemind', { token: A.token, rentalId: rid }).then(function () { busy(btn, false); btn.textContent = '보냈어요'; btn.disabled = true; toast('메일을 보냈어요'); })
    .catch(function (e) { busy(btn, false); onAuthFail(e); });
}
var ITEM_LABEL = { '사용중지': '사용 중지', '대여가능': '대여 가능' };
/* 신고: [사용 중지] / [대여 가능] — 물품 상태를 바로 바꾸고 신고를 닫는다 */
function decideReport(code, item, btn) {
  act('adminReport', { code: code, item: item }, btn, '물품을 ' + ITEM_LABEL[item] + '으로 바꿨어요');
}
/* 신고: [7일 대여 정지] — 한 창에서 물품 상태도 함께 고른다 */
function banReport(code, btn) {
  var x = A.data.reports.open.filter(function (r) { return r.code === code; })[0]; if (!x) return;
  var days = A.data.rentBanDays, pick = '사용중지';
  var m = document.createElement('div'); m.className = 'overlay';
  m.innerHTML = '<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="banT"><b id="banT" style="font-size:19px;display:block">' + esc(x.prevName) + ' 님을 ' + days + '일 동안 대여 정지할까요?</b>' +
    '<p class="lead" style="margin:8px 0 0">물품을 직접 보고, 이 학우가 쓴 뒤에 생긴 문제일 때만 눌러 주세요. 사유와 함께 메일이 가요.</p>' +
    '<div class="h2" style="margin:18px 4px 8px">' + esc(x.itemName) + '(' + esc(x.itemId) + ')은</div>' +
    '<div class="seg" id="banItem"><button class="on" data-i="사용중지">사용 중지</button><button data-i="대여가능">대여 가능</button></div>' +
    '<div class="row" style="margin-top:20px"><button class="btn soft" data-v="0">아니요</button><button class="btn danger strong" data-v="1">' + days + '일 정지</button></div></div>';
  m.onclick = function (e) {
    var i = e.target.closest('[data-i]');
    if (i) { pick = i.dataset.i; $$('#banItem button', m).forEach(function (b) { b.classList.toggle('on', b === i); }); return; }
    var v = e.target.closest('[data-v]');
    if (e.target === m || (v && v.dataset.v === '0')) return closeOverlay(m);
    if (v && v.dataset.v === '1') {
      closeOverlay(m);
      busy(btn, true);
      call('adminReport', { token: A.token, code: code, item: pick, ban: true }).then(function (r) {
        toast(x.prevName + ' 님 ' + r.ban.until + '까지 정지 · 물품 ' + ITEM_LABEL[pick]);
        dropCard(btn); setTimeout(refresh, 280);
      }).catch(function (e) { busy(btn, false); onAuthFail(e); });
    }
  };
  openOverlay(m);
}
/* 메모: 물품 이력 맨 위에 날짜와 함께 쌓인다 */
function itemMemos(itemId) {
  var it = (A.data.items || []).filter(function (x) { return x.id === itemId; })[0];
  return it ? it.memo : [];
}
function openMemo(itemId) {
  var it = (A.data.items || []).filter(function (x) { return x.id === itemId; })[0] || { id: itemId, name: '' };
  var key = 'memo_' + itemId, lines = itemMemos(itemId);
  var m = document.createElement('div'); m.className = 'overlay sheet-up';
  m.innerHTML = '<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="memoT"><div class="row"><span class="num">' + esc(itemId) + '</span><b id="memoT" class="grow" style="font-size:18px">' + esc(it.name) + ' 메모</b>' +
    '<button class="icon-btn" aria-label="닫기" data-x>' + I.close + '</button></div>' +
    (lines.length ? '<ul class="memo-list">' + lines.map(function (l) { return '<li>' + esc(l) + '</li>'; }).join('') + '</ul>' : '<p class="hint" style="margin:12px 4px 0">아직 메모가 없어요</p>') +
    '<label class="field" style="margin:14px 0 0"><textarea data-draft="' + key + '" maxlength="200" style="min-height:84px" placeholder="예: 표지 모서리 테이프로 붙임" aria-label="새 메모">' + esc(A.drafts[key] || '') + '</textarea></label>' +
    '<button class="btn primary" style="margin-top:12px" data-save>오늘 날짜로 남기기</button>' +
    '<p class="foot" style="margin-top:12px">시트 [물품]의 메모 칸에 이력으로 쌓여요</p></div>';
  m.onclick = function (e) {
    if (e.target === m || e.target.closest('[data-x]')) return closeOverlay(m);
    var b = e.target.closest('[data-save]'); if (!b) return;
    var text = ($('textarea', m).value || '').trim();
    if (!text) return toast('메모를 적어 주세요');
    busy(b, true);
    call('adminMemo', { token: A.token, itemId: itemId, text: text }).then(function (r) {
      delete A.drafts[key];
      (A.data.items || []).forEach(function (x) { if (x.id === itemId) x.memo = r.memo; });
      A.data.pending.concat(A.data.reports.open).forEach(function (x) { if (x.itemId === itemId) x.itemMemo = r.memo; });
      closeOverlay(m); toast('메모를 남겼어요');
      var y = window.scrollY; render(); window.scrollTo(0, y);
    }).catch(function (e) { busy(b, false); onAuthFail(e); });
  };
  openOverlay(m);
  setTimeout(function () { var t = $('textarea', m); if (t) t.focus(); }, 60);
}
function unbanRent(sid, btn) { act('adminRentUnban', { studentId: sid }, btn, '대여 정지를 풀었어요'); }
function toggleItem(id, status, btn) {
  var next = status === '대여가능' ? '사용중지' : '대여가능';
  var run = function () {
    btn.disabled = true;
    call('adminItemStatus', { token: A.token, itemId: id, status: next }).then(function () {
      (A.data.items || []).forEach(function (x) { if (x.id === id) x.status = next; });
      btn.className = 'chip ' + ITEM_CHIP[next]; btn.textContent = next; btn.disabled = false;
      btn.setAttribute('onclick', "toggleItem('" + id + "','" + next + "',this)");
      toast(id + ' · ' + next); refresh();
    }).catch(function (e) { btn.disabled = false; onAuthFail(e); });
  };
  if (status === '점검중') return ask(id + ' 점검을 마쳤나요?', '대여가능으로 돌리면 학우들이 다시 빌릴 수 있어요.', '대여가능으로').then(function (yes) { if (yes) run(); });
  run();
}
function reviewRoom(rid, result, btn) {
  if (result === 'ok') return act('adminRoomReview', { rid: rid, result: 'ok' }, btn, '퇴실을 확인했어요');
  ask('원상복구 안 됨으로 표시할까요?', '이 학우가 다음에 예약하면 관리자 화면에 경고가 보여요. 예약을 막지는 않아요.', '표시하기').then(function (yes) {
    if (yes) act('adminRoomReview', { rid: rid, result: 'warn' }, btn, '경고로 표시했어요');
  });
}
function cancelRoom(rid, btn) {
  ask('이 예약을 취소할까요?', '학우에게 취소 안내 메일이 가요.', '취소하기').then(function (yes) {
    if (yes) act('adminRoomCancel', { rid: rid }, btn, '예약을 취소하고 메일을 보냈어요');
  });
}
function banStudent(sid, btn) {
  var days = A.data.rooms.banDays, R = A.data.rooms;
  var hit = [].concat(R.toCheck, R.noPhoto, R.upcoming, R.recent).filter(function (r) { return r.studentId === sid; })[0];
  var name = hit ? hit.name : sid;
  ask(name + ' 님의 강의실 예약을 ' + days + '일 동안 중지할까요?', '오늘부터 ' + days + '일 동안 새 예약을 할 수 없어요. 그 기간에 잡혀 있던 예약은 함께 취소되고, 학우에게 안내 메일이 가요.', days + '일 중지').then(function (yes) {
    if (!yes) return;
    busy(btn, true);
    call('adminRoomBan', { token: A.token, studentId: sid, name: name }).then(function (r) {
      toast(r.until + '까지 중지했어요' + (r.cancelled ? ' · 예약 ' + r.cancelled + '건 취소' : '')); return refresh();
    }).catch(function (e) { busy(btn, false); onAuthFail(e); });
  });
}
function unbanStudent(sid, btn) { act('adminRoomUnban', { studentId: sid }, btn, '중지를 풀었어요'); }
function sendSug(code, btn) {
  var t = $('#sg_' + code + ' textarea'), answer = t.value.trim();
  if (!answer) { toast('답변을 적어 주세요'); return t.focus(); }
  act('adminSuggest', { code: code, answer: answer }, btn, '답변을 보냈어요').then(function (r) {
    if (r) { delete A.drafts['sg_' + code]; if (r.mailed) toast('답변을 보냈어요 · 메일로도 알렸어요'); }
  });
}
function closeSug(code, btn) {
  ask('답변 없이 완료할까요?', '학우에게는 답변 없이 처리 완료로 보여요. 완료한 건의는 다시 바꿀 수 없어요.', '완료').then(function (yes) {
    if (yes) act('adminSuggest', { code: code, close: true }, btn, '완료했어요').then(function (r) { if (r) delete A.drafts['sg_' + code]; });
  });
}

/* ── QR 인쇄 ── */
function pageBase() { return location.origin + location.pathname.replace(/[^/]*$/, ''); }
function qrUrl() { return (A.data && A.data.appUrl) || (/^https?:/.test(location.protocol) ? pageBase() : ''); }
function openQr() {
  var url = qrUrl();
  var m = document.createElement('div'); m.className = 'overlay';
  m.innerHTML = '<div class="sheet">' +
    '<div class="row" style="justify-content:space-between;margin-bottom:12px"><b style="font-size:18px">과방·강의실에 붙일 QR</b><button class="icon-btn" aria-label="닫기" data-x>' + I.close + '</button></div>' +
    '<div class="poster">' + logoCircle(92) + '<h2>바탕화면</h2><p>교육학과 학우를 위한 한 화면</p>' +
    '<div class="qr" id="qrBox"></div>' +
    '<div class="steps"><span>물품대여</span><span>강의실 예약</span><span>건의</span><span>KMU 혜택</span></div></div>' +
    (url ? '<p class="url">' + esc(url) + '</p>' : '<p class="url">배포한 뒤에 QR이 만들어져요</p>') +
    '<div class="row" style="margin-top:14px"><button class="btn soft" data-copy>주소 복사</button>' +
    (window.LocalApi ? '' : '<button class="btn primary" onclick="window.print()">인쇄</button>') + '</div></div>';
  m.onclick = function (e) {
    if (e.target === m || e.target.closest('[data-x]')) closeOverlay(m);
    if (e.target.closest('[data-copy]')) copyUrl();
  };
  openOverlay(m);
  if (url && window.QRCode) new QRCode($('#qrBox', m), { text: url, width: 440, height: 440, colorDark: '#213536', colorLight: '#FFFFFF', correctLevel: QRCode.CorrectLevel.M });
}
function copyUrl() {
  var url = qrUrl(), fallback = function () { toast('주소를 길게 눌러 복사해 주세요'); };
  try { navigator.clipboard.writeText(url).then(function () { toast('주소를 복사했어요'); }, fallback); } catch (e) { fallback(); }
}

/* ── 관리자 사용 설명서 ── */
function adminHelp() {
  var d = A.data || {}, R = d.rooms || {}, days = R.banDays || 7, bd = d.rentBanDays || 7;
  return [
    { key: 'daily', title: '매일 할 일', html: '<ol><li>아침 9시에 <b>오늘 확인할 것</b> 메일이 와요.</li><li>과방·강의실에 들를 때 이 화면의 빨간 숫자부터 처리해요.</li><li>물품은 [반납 확인]·[신고], 강의실은 [퇴실 확인]·[사진 없음], 건의는 [새 건의] 순서로 보면 돼요.</li><li>위쪽 표 아이콘을 누르면 시트가 바로 열려요.</li></ol>' },
    { key: 'items', title: '물품', html: '<ul><li><b>확인</b>: 물품이 제자리에 있으면 눌러요. 학우에게 반납 완료 메일이 가요.</li><li><b>자리에 없어요</b>: 다시 대여 중으로 돌리고 학우에게 알려요.</li>' +
      '<li><b>이번 학기 연체 N회</b> 빨간 칩: 이 학우가 이번 학기에 늦게 반납한 횟수예요. ' + (d.lateLimit || 3) + '회가 되면 반납 확인 순간 자동으로 ' + bd + '일 정지돼요.</li>' +
      '<li><b>메모</b>: 물품 상태 옆 [메모]로 적으면 시트 [물품] 메모 칸에 날짜와 함께 쌓여요(물품 이력).</li>' +
      '<li><b>직접 반납 처리</b>: 학우가 앱 없이 손으로 건넨 경우. <b>분실</b>: 끝내 돌아오지 않을 때(학우는 바로 대여 정지).</li></ul>' +
      '<p><b>신고</b> (빌리기 직전 학우가 알려 온 물품 상태)</p><ul><li>물품을 직접 보고 <b>[사용 중지]</b> 또는 <b>[대여 가능]</b>을 누르면 물품 상태가 바로 바뀌고 신고가 닫혀요.</li>' +
      '<li><b>[' + bd + '일 대여 정지]</b>: 직전 사용자가 망가뜨리거나 잃어버린 게 맞을 때만. 창에서 물품 상태도 함께 골라요. 허위 신고일 수 있으니 꼭 물품을 확인해요.</li></ul>' +
      '<p><b>반납 기한</b>은 시트 [물품]의 반납 기한 칸(당일·익일·3일·7일)에서 바꿔요. 언제 빌려도 그날 23:59 기준이에요.</p>' },
    { key: 'rooms', title: '강의실', html: '<ul><li><b>퇴실 확인</b>: 학우가 올린 사진을 원본과 비교해 [확인] 또는 [원상복구 안 됨].</li><li><b>사진 없음</b>: 시간이 끝났는데 사진을 안 올린 예약이에요. 강의실을 보고 판단해요.</li>' +
      '<li><b>인원 규칙</b>: 2명부터 예약할 수 있어요. 2명은 하루 2시간까지, 3명 이상은 한 번에 3시간까지예요.</li><li><b>경고 N</b>: 원상복구 안 됨 + 사진 없음 횟수예요.</li><li><b>' + days + '일 예약 중지</b>: 오늘부터 ' + days + '일 동안 새 예약을 막고, 그 기간의 예약은 취소하며 학우에게 메일을 보내요.</li>' +
      '<li>원본 사진은 드라이브 「바탕화면 사진 › 강의실 원본 사진」에 올려요. 파일 이름 순서대로 보여요.</li></ul>' },
    { key: 'sug', title: '건의', html: '<ul><li>[새 건의]에서 답변을 적고 <b>[답변 보내기]</b>를 누르면 바로 완료돼요. 실명이고 이메일이 있으면 메일로도 가요.</li><li>답할 필요가 없는 건의(장난·중복)는 <b>[답변 없이 완료]</b>.</li><li>학우는 접수번호로 답변을 봐요. 보낸 답변은 고치지 않아요(학우가 헷갈리지 않도록).</li><li>쓰던 답변은 새로고침해도 지워지지 않아요.</li></ul>' },
    { key: 'mail', title: '메일 한도', html: '<p>Google이 정한 하루 메일 한도는 <b>받는 사람 수</b>로 세요. 학생회 계정(Google Workspace Business Starter)은 <b>하루 1,500명</b>이에요. 한도는 첫 메일을 보낸 때부터 24시간 뒤에 다시 채워져요. 무료 체험 기간에는 더 낮을 수 있어요.</p>' +
      '<ul><li>한도가 모자라면 앱이 멈추지 않고 그 메일만 건너뛰어요. 이 화면 위에 몇 통을 못 보냈는지 나와요.</li>' +
      '<li>아끼려면 시트 [설정]의 <b>관리자 즉시 알림</b>을 <b>사용 안 함</b>으로 바꿔요.</li></ul>' },
    { key: 'sheet', title: '시트에서 바꾸는 것', html: '<ul><li>머리글이 <b>노란 칸</b>은 손으로 고쳐도 되고, <b>회색 칸</b>은 앱이 쓰는 칸이에요. 열 이름만 바꾸지 않으면 열 순서는 옮겨도 돼요.</li><li>[설정]: 대여 기간, 최대 수, PIN, 관리자 이메일, 강의실 시간·규칙, 안내문</li><li>[물품] [납부자] [혜택]: 학생회가 채우는 시트(초록 탭)</li><li>나머지(회색 탭)는 기록이에요. 가능하면 이 화면에서 처리해요.</li></ul>' }
  ];
}
setupHelp(adminHelp, function () { return { items: 'items', rooms: 'rooms', sug: 'sug' }[A.sec] || 'daily'; },
  function () { return '관리자 · ' + ({ items: '물품', rooms: '강의실', sug: '건의' }[A.sec] || '') + ' · ' + (A.tab[A.sec] || ''); });

render();
/* 1분마다 새로 받는다. 창이 열려 있거나, 입력 중이거나, 쓰던 답변·메모가 있으면 미룬다 */
setInterval(function () {
  if (A.token && A.data && !document.hidden && !OVERLAYS.length && !hasDraft() && !document.activeElement.matches('textarea,input')) refresh();
}, 60000);
