// Voz local real + SQLite temporal + reproducción en Edge. No usa la base del proyecto.
const { chromium } = require('playwright');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { randomBytes } = require('node:crypto');
const assert = require('node:assert/strict');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
(async () => {
  const root = path.resolve(__dirname, '..');
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'lectura-piper-'));
  Object.assign(process.env, {
    DB_FILE: path.join(tmp, 'prueba.sqlite'), STUDENT_DATA_KEY: randomBytes(32).toString('hex'),
    SESSION_SECRET: randomBytes(32).toString('hex'), DESBLOQUEAR_TODO: '1', PIPER_DISABLED: '0'
  });
  const db = require('../backend/database');
  const { encryptStudentName } = require('../backend/student-name-crypto');
  db.prepare('INSERT INTO Estudiantes (Nombre, Apellido) VALUES (?, ?)').run(encryptStudentName('Prueba', 'nombre'), encryptStudentName('Voz', 'apellido'));
  db.close();
  const port = net.createServer();
  await new Promise(resolve => port.listen(0, '127.0.0.1', resolve));
  process.env.PORT = String(port.address().port);
  await new Promise(resolve => port.close(resolve));
  const base = `http://127.0.0.1:${process.env.PORT}`;
  const child = spawn(process.execPath, ['backend/server.js'], { cwd: root, env: process.env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let logs = '';
  child.stdout.on('data', data => { logs += data; }); child.stderr.on('data', data => { logs += data; });
  let browser;
  try {
    let healthy = false;
    for (let i = 0; i < 100; i++) {
      try { healthy = (await fetch(base + '/api/health')).ok; } catch {}
      if (healthy) break;
      await delay(100);
    }
    assert.ok(healthy, logs);
    browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
    const context = await browser.newContext({ baseURL: base });
    const info = await (await context.request.get('/api/voz/config')).json();
    assert.equal(info.disponible, true);
    assert.equal((await context.request.post('/api/voz/local', { data: { texto: 'Hola' } })).status(), 401);
    await context.request.post('/api/estudiantes/1/ingresar');
    assert.equal((await context.request.post('/api/voz/local', { data: { texto: 'x'.repeat(1001) } })).status(), 400);
    const body = { texto: 'La casa. La luna. El gato.', tipo: 'lectura' };
    const response = await context.request.post('/api/voz/local', { data: body });
    assert.equal(response.status(), 200);
    assert.match(response.headers()['content-type'], /audio\/wav/);
    assert.match(response.headers()['cache-control'], /no-store/);
    const audio = await response.body();
    assert.equal(audio.toString('ascii', 0, 4), 'RIFF');
    assert.ok(audio.length > 10000);
    const cached = await (await context.request.post('/api/voz/local', { data: body })).body();
    assert.deepEqual(cached, audio);
    if (info.motor === 'kokoro') {
      assert.equal(info.id, 'kokoro:ef_dora');
      const alex = await context.request.post('/api/voz/local', { data: { ...body, voz: 'kokoro:em_alex' } });
      assert.equal(alex.status(), 200);
      assert.notDeepEqual(await alex.body(), audio);
    }
    const simultaneous = await Promise.all([1, 2, 3].map(() => context.request.post('/api/voz/local', { data: { texto: 'pa, pe, pi, po, pu.', tipo: 'letras' } })));
    const simultaneousAudio = await Promise.all(simultaneous.map(result => result.body()));
    assert.deepEqual(simultaneousAudio[0], simultaneousAudio[1]);
    assert.deepEqual(simultaneousAudio[0], simultaneousAudio[2]);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://fonts.googleapis.com/**', route => route.abort());
    await page.addInitScript(() => {
      window.testAudios = [];
      const OriginalAudio = window.Audio;
      window.Audio = function (...args) { const audio = new OriginalAudio(...args); window.testAudios.push(audio); return audio; };
      window.Audio.prototype = OriginalAudio.prototype;
    });
    await page.goto('/actividades/pronunciar.html');
    await page.locator('#game:not(.hidden)').waitFor();
    await page.waitForFunction(() => window.VozInfantil.seleccionada()?.piper);
    assert.equal(await page.evaluate(() => VozInfantil.seleccionada().voiceURI), info.id);
    await page.locator('#listen').click();
    await page.waitForFunction(() => window.testAudios.some(audio => !audio.paused && audio.currentTime > 0));
    await page.locator('.activity-pause-button').click();
    assert.equal(await page.evaluate(() => window.testAudios.every(audio => audio.paused)), true);
    await page.keyboard.press('Escape');
    // Una respuesta de audio que llega después de pausar nunca debe reproducirse.
    await page.route('**/api/voz/local', async route => {
      await delay(800);
      try { await route.continue(); } catch { /* petición cancelada por la pausa */ }
    });
    const request = page.waitForRequest('**/api/voz/local');
    await page.locator('#listen').click(); await request;
    await page.locator('.activity-pause-button').click();
    await delay(1200);
    assert.equal(await page.evaluate(() => window.testAudios.every(audio => audio.paused)), true);
    await page.unroute('**/api/voz/local');
    await page.keyboard.press('Escape');
    // Los eventos end permiten que las secuencias de letras sigan avanzando.
    await page.evaluate(() => {
      const utterance = VozInfantil.crear('pa', { tipo: 'letras' });
      window.testEnd = false;
      utterance.addEventListener('end', () => { window.testEnd = true; });
      VozInfantil.reproducir(utterance);
    });
    await page.waitForFunction(() => window.testEnd, { timeout: 20000 });
    assert.deepEqual(errors, []);
    console.log('OK: Voz local real, WAV válido, caché, autenticación, reproducción, pausa, cancelación tardía y evento end.');
  } finally {
    await browser?.close();
    const exited = once(child, 'exit'); child.kill(); await exited;
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
