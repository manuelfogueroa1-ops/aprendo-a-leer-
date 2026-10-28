// Prueba integrada con SQLite temporal y cuentas ficticias. No abre la base real.
const { chromium, request } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const { once } = require('node:events');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function esperar(check) {
  for (let i = 0; i < 80; i++) { const value = await check(); if (value) return value; await delay(100); }
  throw new Error('Se agotó la espera de sincronización.');
}

(async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'lectura-avance-'));
  process.env.DB_FILE = path.join(tmp, 'prueba.sqlite');
  process.env.STUDENT_DATA_KEY = randomBytes(32).toString('hex');
  process.env.SESSION_SECRET = randomBytes(32).toString('hex');
  process.env.DESBLOQUEAR_TODO = '1';
  const db = require('../backend/database');
  const { encryptStudentName } = require('../backend/student-name-crypto');
  const bcrypt = require('../node_modules/bcryptjs');
  db.prepare('INSERT INTO Profesores (Nombre, Apellido, Correo, Usuario, PasswordHash) VALUES (?, ?, ?, ?, ?)')
    .run('Profesora', 'Prueba', 'prueba@example.test', 'prueba', bcrypt.hashSync('SoloParaEstaPrueba123', 4));
  for (const nombre of ['Alumno', 'Otro']) db.prepare('INSERT INTO Estudiantes (Nombre, Apellido) VALUES (?, ?)')
    .run(encryptStudentName(nombre, 'nombre'), encryptStudentName('Prueba', 'apellido'));
  db.close();
  const portServer = net.createServer();
  await new Promise(resolve => portServer.listen(0, '127.0.0.1', resolve));
  process.env.PORT = String(portServer.address().port);
  await new Promise(resolve => portServer.close(resolve));
  const base = `http://127.0.0.1:${process.env.PORT}`;
  const child = spawn(process.execPath, ['backend/server.js'], { cwd: path.resolve(__dirname, '..'), env: process.env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let logs = '';
  child.stdout.on('data', data => { logs += data; });
  child.stderr.on('data', data => { logs += data; });
  let browser, anonymous;
  try {
    await esperar(async () => { try { return (await fetch(base + '/api/health')).ok; } catch { return false; } });
    browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
    const student = await browser.newContext({ baseURL: base, viewport: { width: 1280, height: 900 } });
    const teacher = await browser.newContext({ baseURL: base, viewport: { width: 1280, height: 900 } });
    anonymous = await request.newContext({ baseURL: base });
    assert.equal((await student.request.post('/api/estudiantes/1/ingresar')).status(), 200);
    assert.equal((await teacher.request.post('/api/profesor/login', { data: { usuario: 'prueba', password: 'SoloParaEstaPrueba123' } })).status(), 200);
    const page = await student.newPage();
    // Clic físico sobre la pista animada, sin esperar a que termine su movimiento.
    const clickHint = async selector => {
      const box = await page.locator(selector).boundingBox();
      assert.ok(box);
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    };
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://fonts.googleapis.com/**', route => route.abort());
    await page.clock.install();
    const records = async () => (await (await teacher.request.get('/api/profesor/estudiantes/1/resultados')).json()).resultados;
    const latest = async () => (await records()).sort((a, b) => b.ResultadoID - a.ResultadoID)[0];
    for (const [file, text] of [['silabas-iniciales', 'PA'], ['letra', 'G'], ['silabas', 'ca']]) {
      await page.goto(`/actividades/${file}.html`);
      await page.locator('#game:not(.hidden)').waitFor();
      await page.clock.runFor(9000);
      assert.equal(await page.locator('.hint-target').count(), 0);
      await page.locator('.activity-pause-button').click();
      await page.clock.runFor(5000);
      assert.equal(await page.locator('.hint-target').count(), 0, 'La pista espera mientras está pausada.');
      await page.keyboard.press('Escape');
      await page.clock.runFor(1200);
      assert.equal(await page.locator('.hint-target').textContent(), text);
      const row = await esperar(async () => { const r = await latest(); return r?.avance && r; });
      assert.equal(row.avance.PreguntaActual, 1);
      assert.equal(row.avance.Completadas, 0);
    }
    // La pista de orden señala qué quitar y luego la siguiente sílaba.
    await page.locator('#choices button').filter({ hasText: /^sa$/ }).click();
    await page.clock.runFor(10500);
    assert.equal(await page.locator('#answer .hint-target').textContent(), 'sa');
    await clickHint('#answer .hint-target');
    await page.clock.runFor(10500);
    assert.equal(await page.locator('#choices .hint-target').textContent(), 'ca');
    await clickHint('#choices .hint-target');
    await page.clock.runFor(10500);
    assert.equal(await page.locator('#choices .hint-target').textContent(), 'sa');
    await page.screenshot({ path: path.join(__dirname, 'pista-silabas.png') });
    await clickHint('#choices .hint-target');
    await page.clock.runFor(10500);
    assert.equal(await page.locator('#check.hint-target').count(), 1);
    await page.locator('#check').click();
    await page.clock.runFor(1800);
    await esperar(async () => (await latest()).avance?.Completadas === 1);
    const saved = await latest();
    assert.match(saved.avance.Consigna, /pelota/);
    assert.equal(saved.avance.PreguntaActual, 2);
    // Sin conexión, aparece un aviso y el avance llega al recuperar la conexión.
    await student.setOffline(true);
    await page.locator('#choices button').filter({ hasText: /^pe$/ }).click();
    await page.clock.runFor(500);
    await page.getByText('Avance pendiente de enviar a la profesora.', { exact: false }).waitFor();
    await student.setOffline(false);
    await page.clock.runFor(16000);
    await esperar(async () => (await latest()).avance?.RespuestaActual.includes('pe'));
    await page.locator('.activity-pause-button').click();
    await esperar(async () => (await latest()).avance?.Pausada === 1);
    const pausedRow = await latest();
    // La profesora consulta el mismo avance en otra sesión y conserva el detalle al actualizar.
    const teacherPage = await teacher.newPage();
    teacherPage.on('pageerror', error => errors.push(error.message));
    await teacherPage.route('https://fonts.googleapis.com/**', route => route.abort());
    await teacherPage.goto('/');
    await teacherPage.locator('#teacherLink').click();
    await teacherPage.locator('#teacherStudentCards [data-id="1"]').click();
    const detail = teacherPage.locator(`details[data-intento="${pausedRow.ResultadoID}"]`);
    await detail.locator('summary').click();
    assert.match(await detail.textContent(), /1 de 20 completadas/);
    assert.match(await detail.textContent(), /pelota/);
    assert.match(await detail.textContent(), /en pausa al guardar/);
    await teacherPage.locator('#refreshStudentRecords').click();
    await teacherPage.getByText('Registros actualizados.', { exact: true }).waitFor();
    assert.equal(await detail.getAttribute('open'), '');
    await teacherPage.screenshot({ path: path.join(__dirname, 'avance-profesora.png'), fullPage: true });
    // Validación y control de acceso del endpoint; una petición antigua no retrocede el avance.
    const url = `/api/resultados/${pausedRow.ResultadoID}/avance`;
    const payload = { preguntaActual: 2, totalPreguntas: 20, completadas: 1, consigna: 'Ordenar las sílabas de pelota', respuestaActual: 'pe', pausada: true, revision: 10000 };
    assert.equal((await anonymous.post(url, { data: payload })).status(), 401);
    const other = await browser.newContext({ baseURL: base });
    await other.request.post('/api/estudiantes/2/ingresar');
    assert.equal((await other.request.post(url, { data: payload })).status(), 404);
    assert.equal((await student.request.post(url, { data: { ...payload, completadas: 21 } })).status(), 400);
    assert.equal((await student.request.post(url, { data: payload })).status(), 200);
    await student.request.post(url, { data: { ...payload, preguntaActual: 1, completadas: 0, revision: 9999 } });
    assert.equal((await latest()).avance.PreguntaActual, 2);
    assert.equal((await latest()).avance.Completadas, 1);
    // Los siete niveles publican un punto de avance con la consigna de su propio ejercicio.
    for (const file of ['letras-iniciales', 'silabas-iniciales', 'unir-palabra-imagen', 'letra', 'silabas', 'pronunciar', 'cuento']) {
      await page.goto(`/actividades/${file}.html`);
      await page.locator('#game:not(.hidden)').waitFor();
      await page.clock.runFor(700);
      const row = await esperar(async () => { const r = await latest(); return r?.avance && r; });
      assert.ok(row.avance.TotalPreguntas > 0, file);
      assert.ok(row.avance.Consigna.length > 0, file);
    }
    await page.goto('/actividades/letra.html');
    await page.locator('#game:not(.hidden)').waitFor();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.clock.runFor(11000);
    assert.equal(await page.locator('.hint-target').evaluate(el => getComputedStyle(el).animationName), 'none');
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.locator('.activity-hint').isVisible(), true);
    await page.screenshot({ path: path.join(__dirname, 'pista-letra-movil.png'), fullPage: true });
    assert.deepEqual(errors, []);
    // El dato persiste en SQLite y no depende de la sesión del alumno.
    const { DatabaseSync } = require('node:sqlite');
    const check = new DatabaseSync(process.env.DB_FILE);
    assert.ok(check.prepare('SELECT COUNT(*) AS total FROM AvanceActividad').get().total >= 7);
    check.close();
    console.log('OK: pistas a los 10 s, pausas, orden de sílabas, siete niveles, sincronización, reconexión, panel docente, SQLite y permisos.');
  } catch (error) { console.error(logs); throw error; }
  finally {
    await anonymous?.dispose();
    await browser?.close();
    const exited = once(child, 'exit'); child.kill(); await exited;
    // Se conserva el directorio temporal para poder inspeccionar la base de prueba.
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
