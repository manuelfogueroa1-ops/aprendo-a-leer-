// Ejecutar con Node y Playwright disponible en NODE_PATH. Usa datos ficticios, sin SQLite.
const { chromium } = require('playwright');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../frontend');
const names = ['Reconozco las letras', 'Formo sílabas', 'Uno la palabra con su imagen', 'Encuentro la letra', 'Aprendo las sílabas', 'Practico la pronunciación', 'Completo el cuento'];
const pages = ['letras-iniciales', 'silabas-iniciales', 'unir-palabra-imagen', 'letra', 'silabas', 'pronunciar', 'cuento'];
const server = http.createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  try {
    const data = await fs.readFile(file);
    res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.png': 'image/png' })[path.extname(file)] || 'application/octet-stream');
    res.end(data);
  } catch { res.writeHead(404).end(); }
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://fonts.googleapis.com/**', route => route.abort());
    await page.route('**/api/**', route => {
      const url = route.request().url();
      const data = url.endsWith('/api/actividades') ? { actividades: names.map((Nombre, i) => ({ Nombre, ActividadID: i + 1 })) }
        : url.endsWith('/iniciar') ? { intento: { ResultadoID: 1 } }
        : url.endsWith('/terminar') ? { guardado: true, duracionSegundos: 20 }
        : url.endsWith('/avance') ? { guardado: true }
        : { estudiante: { EstudianteID: 999, Nombre: 'Prueba', Apellido: 'Local', BuhoColor: 'azul', BuhoAccesorio: 'lentes' } };
      return route.fulfill({ json: data });
    });
    await page.clock.install();
    const base = `http://127.0.0.1:${server.address().port}`;
    await page.goto(base + '/actividades/letra.html');
    await page.locator('#game:not(.hidden)').waitFor();
    await page.waitForFunction(() => getComputedStyle(document.documentElement).getPropertyValue('--student-cursor').includes('data:image/png'));
    await page.clock.runFor(49000);
    assert.equal(await page.locator('.activity-pause-overlay.visible').count(), 0);
    await page.clock.runFor(2000);
    assert.equal(await page.locator('#pauseTitle').textContent(), '¿Seguimos aprendiendo?');
    assert.equal(await page.locator('main').evaluate(el => el.inert), true);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('main').evaluate(el => el.inert), false);
    await page.clock.runFor(51000);
    await page.locator('.activity-resume-button').click();
    // Tras el período de descanso, los clics en opciones y controles no disparan la ayuda.
    await page.clock.runFor(49000);
    await page.mouse.move(500, 300);
    await page.clock.runFor(12000);
    await page.locator('#choices button').first().click();
    await page.locator('#next').click();
    // Clics reales sobre un área sin respuesta, dentro de la actividad.
    for (let i = 0; i < 10; i++) await page.locator('#word').click();
    assert.equal(await page.locator('.activity-pause-overlay.visible').count(), 0);
    await page.locator('#word').click();
    assert.equal(await page.locator('#pauseTitle').textContent(), 'Hagamos una pausa');
    assert.equal(await page.locator('.breathing-guide').isVisible(), true);
    assert.equal(await page.locator('.breathing-start').isVisible(), false);
    assert.match(await page.locator('.breathing-instruction').textContent(), /Toma aire/);
    await page.clock.runFor(4000);
    assert.match(await page.locator('.breathing-instruction').textContent(), /Suelta el aire/);
    await page.screenshot({ path: path.join(__dirname, 'pausa-buho.png') });
    await page.clock.runFor(26000);
    assert.match(await page.locator('.breathing-instruction').textContent(), /Muy bien/);
    assert.equal(await page.locator('.breathing-start').isVisible(), true);
    await page.locator('.activity-resume-button').click();
    await page.locator('.cursor-preference').click();
    assert.equal(await page.locator('html').evaluate(el => el.classList.contains('student-cursor')), false);
    await page.reload();
    assert.equal(await page.locator('.cursor-preference').getAttribute('aria-pressed'), 'false');
    await page.locator('.cursor-preference').click();
    // Todas las actividades cargan y conservan la pregunta durante una pausa manual.
    for (const name of pages) {
      await page.goto(`${base}/actividades/${name}.html`);
      await page.locator('#game:not(.hidden)').waitFor();
      const progress = await page.locator('#progress').textContent();
      await page.locator('.activity-pause-button').click();
      await page.clock.runFor(10000);
      assert.equal(await page.locator('#progress').textContent(), progress, name);
      await page.keyboard.press('Tab');
      assert.equal(await page.locator('.activity-pause-overlay').evaluate(el => el.contains(document.activeElement)), true);
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#progress').textContent(), progress, name);
    }
    // Una transición pendiente se suspende y se ejecuta una sola vez al continuar.
    for (const [name, answer] of [['letras-iniciales', 'A'], ['silabas-iniciales', 'PA']]) {
      await page.goto(`${base}/actividades/${name}.html`);
      await page.locator('#game:not(.hidden)').waitFor();
      await page.locator('#choices button').filter({ hasText: new RegExp(`^${answer}$`) }).click();
      const progress = await page.locator('#progress').textContent();
      await page.locator('.activity-pause-button').click();
      await page.clock.runFor(10000);
      assert.equal(await page.locator('#progress').textContent(), progress);
      await page.keyboard.press('Escape');
      await page.clock.runFor(5000);
      assert.notEqual(await page.locator('#progress').textContent(), progress);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.locator('.activity-pause-button').click();
    assert.equal(await page.locator('.activity-resume-button').isVisible(), true);
    assert.equal(await page.locator('.breathing-circle').evaluate(el => getComputedStyle(el).transitionDuration), '0s');
    await page.screenshot({ path: path.join(__dirname, 'pausa-buho-movil.png') });
    assert.deepEqual(errors, []);
    console.log('OK: inactividad, clics, respiración, foco, cursor, siete actividades, transiciones y móvil.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server.close());
