/*
 * 구글 서비스(시트·캐시·메일·잠금) 가짜 구현.
 * apps-script/Code.gs를 컴퓨터에서 그대로 실행해 보기 위한 것이다. 운영·테스트 시트는 건드리지 않는다.
 *   const env = require('./gas-fake').createEnv();  env.api('login', {...})
 */
process.env.TZ = 'Asia/Seoul'; // Code.gs의 dateAt_()는 스크립트 시간대(서울)를 쓴다
const fs = require('fs'), path = require('path'), crypto = require('crypto'), vm = require('vm');

function fmt(d, f) {
  const p = (n, w) => String(n).padStart(w, '0');
  const map = { yyyy: d.getFullYear(), yy: p(d.getFullYear() % 100, 2), MM: p(d.getMonth() + 1, 2), M: d.getMonth() + 1, dd: p(d.getDate(), 2), d: d.getDate(),
    HH: p(d.getHours(), 2), H: d.getHours(), mm: p(d.getMinutes(), 2), m: d.getMinutes(), ss: p(d.getSeconds(), 2), u: d.getDay() === 0 ? 7 : d.getDay() };
  return f.replace(/yyyy|yy|MM|M|dd|d|HH|H|mm|m|ss|u/g, k => map[k]);
}

function createEnv(opts) {
  opts = opts || {};
  const sheets = {}, cache = {}, props = { SESSION_SECRET: 'test-secret' }, mails = [];
  let quota = opts.mailQuota == null ? 100 : opts.mailQuota;
  // 시트가 하는 일을 흉내 낸다: 작은따옴표로 시작하면 글자로, = 로 시작하면 수식으로
  const store = v => (typeof v === 'string' && v[0] === "'") ? v.slice(1) : (typeof v === 'string' && /^=/.test(v)) ? { formula: v } : v;
  function mkSheet(name, rows) {
    const sh = { name, data: (rows || []).map(r => r.slice()),
      getLastRow() { return this.data.length; }, getLastColumn() { return this.data.reduce((m, r) => Math.max(m, r.length), 0); },
      getRange(r, c, nr, nc) {
        const self = this;
        if (typeof r === 'string') return { setBackground() { return this; }, setNumberFormat() { return this; }, setDataValidation() { return this; }, setFontWeight() { return this; } };
        nr = nr || 1; nc = nc || 1;
        const api = {
          getValues() { const out = []; for (let i = 0; i < nr; i++) { const row = []; for (let j = 0; j < nc; j++) { const v = (self.data[r - 1 + i] || [])[c - 1 + j]; row.push(v == null ? '' : v); } out.push(row); } return out; },
          setValues(v) { v.forEach((row, i) => { self.data[r - 1 + i] = self.data[r - 1 + i] || []; row.forEach((x, j) => self.data[r - 1 + i][c - 1 + j] = store(x)); }); return api; },
          setValue(x) { self.data[r - 1] = self.data[r - 1] || []; self.data[r - 1][c - 1] = store(x); return api; },
          setFontWeight() { return api; }, setBackground() { return api; }, setNumberFormat() { return api; }, setNote() { return api; }, setDataValidation() { return api; }
        };
        return api;
      },
      deleteRow(r) { this.data.splice(r - 1, 1); }, setFrozenRows() { }, setTabColor() { }, setColumnWidth() { }, setConditionalFormatRules() { }
    };
    sheets[name] = sh; return sh;
  }
  const ss = { getSheetByName: n => sheets[n] || null, insertSheet: n => mkSheet(n, []), getId: () => 'fake', getUrl: () => 'https://sheet.example/fake', getSheets: () => Object.values(sheets) };
  const ctx = { console: opts.quiet ? { log() { }, warn() { }, error() { } } : console,
    Date, JSON, Math, Object, String, Number, Array, RegExp, Error, isFinite, isNaN, parseInt, parseFloat,
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, flush() { }, openById: () => ss },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] == null ? null : props[k], setProperty: (k, v) => { props[k] = String(v); }, deleteProperty: k => { delete props[k]; }, getKeys: () => Object.keys(props) }) },
    CacheService: { getScriptCache: () => ({ get: k => cache[k] == null ? null : cache[k], put: (k, v) => { cache[k] = String(v); }, remove: k => { delete cache[k]; }, removeAll: ks => ks.forEach(k => delete cache[k]) }) },
    LockService: { getScriptLock: () => ({ waitLock() { }, tryLock() { return true; }, releaseLock() { } }) },
    MailApp: { getRemainingDailyQuota: () => quota, sendEmail: o => { quota--; mails.push(o); } },
    ScriptApp: { getService: () => ({ getUrl: () => '' }) },
    DriveApp: { getFolderById() { throw new Error('no drive'); }, Access: {}, Permission: {} },
    Utilities: { getUuid: () => crypto.randomUUID(), sleep() { },
      base64EncodeWebSafe: b => Buffer.from(typeof b === 'string' ? b : Buffer.from(b)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_'),
      base64Decode: s => [...Buffer.from(s, 'base64')], newBlob: (d, m, n) => ({ d, m, n }),
      computeDigest: (a, s) => [...crypto.createHash('sha256').update(s, 'utf8').digest()],
      computeHmacSha256Signature: (t, k) => [...crypto.createHmac('sha256', k).update(t).digest()],
      formatDate: (d, tz, f) => fmt(d, f), DigestAlgorithm: { SHA_256: 1 }, Charset: { UTF_8: 1 } },
    HtmlService: {}, ContentService: {} };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8'), ctx, { filename: 'Code.gs' });
  const H = ctx.HEADERS;
  mkSheet('설정', [['항목', '값', '설명']].concat(Object.entries(Object.assign({ '관리자 학번': '20260001', '관리자 이메일': 'admin@kookmin.ac.kr', '웹앱 주소': 'https://example.github.io/2027/' }, opts.settings || {})).map(([k, v]) => [k, v, ''])));
  ['물품', '납부자', '혜택', '대여기록', '물품신고', '대여정지', '예약', '예약중지', '건의', '회원'].forEach(n => mkSheet(n, [H[n]]));
  const env = { ctx, sheets, cache, props, mails, mkSheet, H,
    api: (n, p) => ctx.api(n, p || {}),
    ok(n, p) { const r = ctx.api(n, p || {}); if (!r.ok) throw new Error(n + ' 실패: ' + r.error); return r.data; },
    rows(name) { const sh = sheets[name]; if (!sh) return []; const h = sh.data[0]; return sh.data.slice(1).map(r => Object.fromEntries(h.map((k, i) => [k, r[i] == null ? '' : r[i]]))); },
    add(name, obj) { const h = sheets[name].data[0]; sheets[name].data.push(h.map(k => obj[k] == null ? '' : obj[k])); },
    lastCode() { for (let i = mails.length - 1; i >= 0; i--) { const m = /인증번호 (\d{6})/.exec(mails[i].subject); if (m) return m[1]; } return null; },
    /** 인증번호까지 거쳐 가입시키고 토큰을 돌려준다 */
    signup(sid, name, email) {
      delete cache['evw_' + sid];
      env.ok('emailCode', { purpose: 'signup', studentId: sid, name, email });
      return env.ok('signup', { studentId: sid, name, password: '123456', email, phone: '010-1234-5678', agree: true, code: env.lastCode() }).token;
    },
    ymd(offsetDays) { const d = new Date(); d.setDate(d.getDate() + (offsetDays || 0)); return fmt(d, 'yyyy-MM-dd'); }
  };
  return env;
}
module.exports = { createEnv, fmt };
