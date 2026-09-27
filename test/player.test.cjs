// EMX Player: a picked record runs inside a fresh sandboxed frame (the heart is drawn; the parent,
// its storage and this origin are out of reach), Keep still saves, closing removes the frame, a
// plain page is refused, a file that sends its frame elsewhere is closed (after it loads) or
// refused by the page's frame-src policy (while it still parses), a dropped file opens, and the
// page works offline after one visit, with a service worker that answers from the network first
// (even when a copy can't be kept) and clears only its own old caches. Serves this repo at the site
// root, the way GitHub Pages serves the org site emx-player.github.io; PLAYER_URL points the same
// test at the live site instead.
// The record is pressed from an emx-web checkout (EMX_WEB, required) into a temp file: no record is
// ever committed here.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs'), http = require('node:http'), os = require('node:os'), path = require('node:path');
const ROOT = path.resolve(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
// edition.txt: a file the test changes on the server between fetches; down: the network is gone.
const served = { edition: 1, down: false };
if (!process.env.EMX_WEB) {
  console.error('Set EMX_WEB to an emx-web checkout: the test presses its fixture record from there.');
  process.exit(1);
}

function serve() {
  const server = http.createServer((req, res) => {
    if (served.down) { req.socket.destroy(); return; }
    const { pathname } = new URL(req.url, 'http://localhost');
    if (pathname === '/edition.txt') { res.writeHead(200, { 'Content-Type': 'text/plain' }).end(String(served.edition)); return; }
    const rel = pathname === '/' ? 'index.html' : decodeURIComponent(pathname.slice(1));
    const file = path.join(ROOT, rel);
    const ok = !/^(test|tools|\.git)\//.test(rel) && file.startsWith(ROOT + path.sep) && fs.existsSync(file) && fs.statSync(file).isFile();
    if (!ok) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

(async () => {
  const { buildRecord } = require(path.resolve(process.env.EMX_WEB, 'demo/record-fixtures.cjs'));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'emx-player-'));
  const record = path.join(dir, 'The Light We Left Behind.emx.html');
  fs.writeFileSync(record, buildRecord());
  const plain = path.join(dir, 'notes.html');
  fs.writeFileSync(plain, '<!doctype html><title>Just a page</title><p>Hello</p>');
  const away = path.join(dir, 'away.emx.html');
  fs.writeFileSync(away, `<!doctype html><meta name="emx-record" content="1"><title>Away</title><script>onload = () => { location.href = 'data:text/html,<p>away</p>'; };</script>`);
  const early = path.join(dir, 'early.emx.html');
  fs.writeFileSync(early, `<!doctype html><meta name="emx-record" content="1"><title>Away now</title><script>location.href = 'data:text/html,<p>away</p>';</script><p>record</p>`);
  const server = process.env.PLAYER_URL ? null : await serve();
  const BASE = process.env.PLAYER_URL || `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    const foreign = [];
    page.on('request', r => { const url = r.url(); if (!/^(data|blob|about):/.test(url) && !url.startsWith(new URL(BASE).origin)) foreign.push(url); });
    const recordFrame = async () => {
      await page.waitForSelector('#stage:not([hidden])');
      const frame = await (await page.$('#stage iframe')).contentFrame();
      await frame.waitForURL(/^blob:/);
      return frame;
    };
    // Another cache on this origin (none today: the player has emx-player.github.io to itself) and an
    // older player's, both made before the player's first visit: the player clears only its own.
    await page.goto(new URL('/other-site/', BASE).href);
    await page.evaluate(async () => { await (await caches.open('other-site')).put('/other-site/', new Response('theirs')); await caches.open('emx-player-v1'); });
    await page.goto(BASE);
    assert.equal(await page.textContent('.lead'), 'Your record plays on this device. Nothing is uploaded.');

    // A record opens in the sandboxed frame.
    await page.setInputFiles('#file', record);
    const frame = await recordFrame();
    assert.equal(await page.getAttribute('#stage iframe', 'title'), 'EMX record');
    assert.equal(await page.getAttribute('#stage iframe', 'sandbox'), 'allow-scripts allow-downloads');
    assert.equal(await page.getAttribute('#stage iframe', 'allow'), 'autoplay', 'no fullscreen for a file');
    assert.match(await page.getAttribute('#stage iframe', 'src'), /^blob:/);
    assert.equal(await page.title(), 'The Light We Left Behind · EMX Player');
    await frame.waitForSelector('.listening-heart.is-3d canvas');
    const reach = await frame.evaluate(() => {
      const attempt = fn => { try { fn(); return 'open'; } catch (e) { return e.name; } };
      return { origin, parent: attempt(() => parent.document.title), storage: attempt(() => localStorage.length) };
    });
    assert.deepEqual(reach, { origin: 'null', parent: 'SecurityError', storage: 'SecurityError' }, 'the record can reach nothing else on this origin');
    await frame.click('#drop');
    await frame.waitForFunction(() => document.querySelector('#song').currentTime > .2);
    const [download] = await Promise.all([page.waitForEvent('download'), frame.click('[data-keep=song]')]);
    assert.equal(download.suggestedFilename(), 'The Light We Left Behind.wav', 'Keep works inside the sandbox');
    await page.click('#close');
    assert(await page.isVisible('#choose'));
    assert.equal(await page.title(), 'EMX Player');
    assert.equal(await page.locator('#stage iframe').count(), 0, 'closing removes the frame, and its sound with it');

    // A plain page is refused.
    await page.setInputFiles('#file', plain);
    await page.waitForSelector('#error:not([hidden])');
    assert.equal(await page.textContent('#error'), 'This file isn’t an EMX record.');
    assert(await page.isHidden('#stage'));

    // A file that can't be read (a permission/IO error, or an iPhone Files/iCloud entry that
    // fails to download) shows the error instead of failing silently.
    await page.evaluate(() => { const text = Blob.prototype.text; Blob.prototype.text = function () { Blob.prototype.text = text; return Promise.reject(new DOMException('The file could not be read.', 'NotReadableError')); }; });
    await page.evaluate(() => {
      const dt = new DataTransfer();
      dt.items.add(new File(['x'], 'unreadable.emx.html', { type: 'text/html' }));
      document.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    });
    assert.equal(await page.textContent('#error'), 'This file couldn’t be read. On iPhone, save it to Files first, then open it here.');
    assert(await page.isHidden('#stage'));

    // A file that sends its frame to another page once it has loaded is closed, and the player says
    // why.
    await page.setInputFiles('#file', away);
    await page.waitForFunction(() => document.querySelector('#error').textContent.startsWith('This file tried'));
    assert.equal(await page.textContent('#error'), 'This file tried to open another page, so the player closed it.');
    assert(await page.isHidden('#stage'));
    assert.equal(await page.locator('#stage iframe').count(), 0);
    // One that redirects while it is still parsing fires a single load, which a load count can't tell
    // from a record's: the page's frame-src policy refuses the navigation, so the destination never
    // renders in any frame.
    const visited = [];
    const onNavigated = f => { if (f !== page.mainFrame()) visited.push(f.url()); };
    page.on('framenavigated', onNavigated);
    await page.evaluate(() => { window.refused = new Promise(resolve => document.addEventListener('securitypolicyviolation', e => resolve(e.effectiveDirective), { once: true })); });
    await page.setInputFiles('#file', early);
    // Whichever comes first: the policy refusing the navigation, or a frame arriving at the destination.
    const outcome = await Promise.race([
      page.evaluate(() => window.refused).then(directive => `refused by ${directive}`),
      page.waitForEvent('framenavigated', { predicate: f => f.url().startsWith('data:'), timeout: 5000 }).then(() => 'the destination', () => 'nothing'),
    ]);
    await page.waitForTimeout(300);   // anything the navigation would have rendered has rendered by now
    const shown = await Promise.all(page.frames().filter(f => f !== page.mainFrame()).map(f => f.evaluate(() => document.body?.innerText.trim() ?? '').catch(() => '')));
    page.off('framenavigated', onNavigated);
    assert(!visited.some(url => url.startsWith('data:')), `no frame goes to the destination (${outcome}): ${visited.map(url => url.slice(0, 32)).join(' ')}`);
    assert(!shown.includes('away'), `the destination never renders (${outcome})`);
    if (await page.isVisible('#stage')) await page.click('#close');

    // A dropped record opens.
    await page.evaluate(html => {
      const dt = new DataTransfer();
      dt.items.add(new File([html], 'dropped.emx.html', { type: 'text/html' }));
      document.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    }, fs.readFileSync(record, 'utf8'));
    await (await recordFrame()).waitForSelector('.listening-heart canvas');
    await page.click('#close');

    // Offline after one visit.
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    assert(await page.evaluate(() => !!navigator.serviceWorker.controller), 'the service worker controls the page');
    const cacheNames = await page.evaluate(() => caches.keys());
    assert(cacheNames.includes('other-site') && cacheNames.includes('emx-player-v2') && !cacheNames.includes('emx-player-v1'),
      `the player clears only its own old caches: ${cacheNames.join(', ')}`);
    // Network first: online, a file changed on the server is fresh at once; offline, the kept copy answers.
    const edition = () => page.evaluate(() => fetch('edition.txt').then(response => response.text()));
    if (server) {
      assert.equal(await edition(), '1');
      served.edition = 2;
      assert.equal(await edition(), '2', 'online, the network answers first');
      // A copy that can't be kept (a full quota, say) never costs the fresh response.
      const workers = context.serviceWorkers();
      assert.equal(workers.length, 1, 'one service worker');
      await workers[0].evaluate(() => { self.keep = Cache.prototype.put; Cache.prototype.put = () => Promise.reject(new DOMException('The quota is full.', 'QuotaExceededError')); });
      served.edition = 3;
      assert.equal(await edition(), '3', 'a copy that can’t be kept still serves the network');
      await workers[0].evaluate(() => { Cache.prototype.put = self.keep; });
    }
    // Offline for real: Playwright's setOffline doesn't reach the service worker's own fetches, so the
    // server stops answering too.
    served.down = true;
    await context.setOffline(true);
    await page.reload();
    assert(await page.isVisible('#choose'), 'the player opens offline');
    if (server) assert.equal(await edition(), '2', 'offline, the kept copy');
    await page.setInputFiles('#file', record);
    await (await recordFrame()).waitForSelector('.listening-heart canvas');
    await context.setOffline(false);

    assert.deepEqual(foreign, [], 'no requests beyond the player’s own files');
    assert.deepEqual(errors, []);
    console.log(`PASS EMX Player (${BASE}): sandboxed record with the heart, no reach into the parent, Keep, a fresh frame per record, plain page refused, a file that navigates away closed (after load) or refused (while parsing), drop, network first (even when a copy can't be kept), other caches kept, offline`);
  } finally { await browser.close(); server?.close(); }
})().catch(e => { console.error(e); process.exit(1); });
