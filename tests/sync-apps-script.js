/*
 * 루트 화면 파일을 apps-script/ 쪽 HTML로 옮긴다.  실행:  node tests/sync-apps-script.js   (확인만: --check)
 *   app.js → Index.html의 <script> · admin.js → Admin.html의 <script> · common.js → Common.html · styles.css → Styles.html의 <style>
 * 두 쪽은 "같은 화면의 다른 버전"이라 내용이 같아야 한다. 루트 파일을 고친 뒤 이 명령을 한 번 돌리면 된다.
 */
const fs = require('fs'), path = require('path');
const R = path.join(__dirname, '..'), check = process.argv.includes('--check');
function splice(html, src, open, close) {
  const file = path.join(R, 'apps-script', html), L = fs.readFileSync(file, 'utf8').split('\n');
  const body = fs.readFileSync(path.join(R, src), 'utf8').replace(/\n+$/, '').split('\n');
  let a = -1, b = -1;
  for (let i = L.length - 1; i >= 0; i--) { if (b < 0 && L[i].trim() === close) b = i; else if (b >= 0 && L[i].trim() === open) { a = i; break; } }
  if (a < 0 || b < 0) throw new Error(html + ': ' + open + ' … ' + close + ' 를 찾지 못했어요');
  const next = L.slice(0, a + 1).concat(body, L.slice(b)).join('\n');
  const same = next === L.join('\n');
  if (!check && !same) fs.writeFileSync(file, next);
  return same;
}
const jobs = [['Index.html', 'app.js', '<script>', '</script>'], ['Admin.html', 'admin.js', '<script>', '</script>'], ['Common.html', 'common.js', '<script>', '</script>'], ['Styles.html', 'styles.css', '<style>', '</style>']];
let diff = 0;
jobs.forEach(j => { const same = splice(...j); if (!same) diff++; console.log((same ? '  같음    ' : check ? '  다름    ' : '  옮김    ') + j[1] + ' → apps-script/' + j[0]); });
if (check && diff) { console.log('\napps-script 쪽이 루트와 달라요.  node tests/sync-apps-script.js  를 돌려 주세요.'); process.exit(1); }
