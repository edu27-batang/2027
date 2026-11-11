/*
 * 바탕화면 서비스 워커 (V8)
 * - 화면 파일(HTML·JS·CSS)은 "네트워크 우선": 항상 새로 받는다 → 배포 후 옛 화면이 남지 않는다.
 * - 인터넷이 끊긴 채 화면을 열면 offline.html('연결을 확인해 주세요')을 보여 준다.
 * - 이미지·아이콘은 "저장본 우선": 거의 안 바뀌어서 빨리 뜬다. 이미지를 바꾸면 아래 VERSION을 올린다.
 * - 서버(script.google.com)·글꼴 등 다른 주소로 가는 요청, POST 요청, 관리자 화면은 건드리지 않는다.
 *
 * 비상 해제: 문제가 생기면 이 파일 내용을 아래 세 줄로 바꿔 배포하면 모든 기기에서 서비스 워커가 꺼진다.
 *   self.addEventListener('install', function () { self.skipWaiting(); });
 *   self.addEventListener('activate', function () { self.registration.unregister(); });
 *   self.addEventListener('fetch', function () { });
 */
var VERSION = 'v8.0';
var CACHE = 'bth-' + VERSION;
var CORE = ['offline.html', 'styles.css', 'common.js', 'app.js', 'config.js', 'logos.js', 'manifest.webmanifest',
  'img/taang_sorry.svg', 'img/icon-192.png', 'img/favicon.png', 'img/logo-hwamyeon.webp'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    // 하나가 실패해도 설치는 되게 하나씩 담는다
    return Promise.all(CORE.map(function (u) { return c.add(new Request(u, { cache: 'reload' })).catch(function () { }); }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf('bth-') === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

function isAdmin(url) { return /\/admin(\.html|\.js|\.css)?$/.test(url.pathname); }
function isAsset(url) { return /\.(png|webp|svg|jpg|jpeg|gif|ico)$/i.test(url.pathname); }

function save(req, res) {
  if (res && res.ok && res.type === 'basic') { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); }
  return res;
}

self.addEventListener('fetch', function (e) {
  var req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || isAdmin(url)) return;

  // 화면 열기: 항상 새로 받고, 인터넷이 끊겼으면 '연결을 확인해 주세요' 안내
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(function () { return caches.match('offline.html'); }));
    return;
  }
  if (isAsset(url)) {
    e.respondWith(caches.match(req, { ignoreSearch: true }).then(function (hit) {
      return hit || fetch(req).then(function (res) { return save(req, res); });
    }));
    return;
  }
  // 화면 파일: 네트워크 우선, 끊기면 저장본(?v= 차이는 무시)
  e.respondWith(fetch(req).then(function (res) { return save(req, res); }).catch(function () {
    return caches.match(req, { ignoreSearch: true });
  }));
});
