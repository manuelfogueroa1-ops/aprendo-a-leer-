// Recorre pronunciación completa con micrófono simulado y bloqueo de niveles activo.
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
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'lectura-pronunciacion-'));
  Object.assign(process.env, { DB_FILE: path.join(tmp, 'prueba.sqlite'), STUDENT_DATA_KEY: randomBytes(32).toString('hex'), SESSION_SECRET: randomBytes(32).toString('hex'), DESBLOQUEAR_TODO: '0', PIPER_DISABLED: '1' });
  const db = require('../backend/database');
  const { encryptStudentName } = require('../backend/student-name-crypto');
  const previous = ['Reconozco las letras', 'Formo sílabas', 'Uno la palabra con su imagen', 'Encuentro la letra', 'Aprendo las sílabas'];
  for (const name of ['Grabacion', 'Recuperacion', 'Manual']) {
    const student = Number(db.prepare('INSERT INTO Estudiantes (Nombre, Apellido, ColorFavorito, TemaInteres) VALUES (?, ?, 130, ?)').run(encryptStudentName(name, 'nombre'), encryptStudentName('Prueba', 'apellido'), 'Animales').lastInsertRowid);
    for (const activity of previous) {
      const { ActividadID } = db.prepare('SELECT ActividadID FROM Actividades WHERE Nombre = ?').get(activity);
      db.prepare(`INSERT INTO ResultadosActividades (EstudianteID, ActividadID, FechaInicio, Estado, Puntuacion, Aciertos, Errores) VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'Completada', 100, 1, 0)`).run(student, ActividadID);
    }
  }
  db.close();
  const port = net.createServer();
  await new Promise(resolve => port.listen(0, '127.0.0.1', resolve));
  process.env.PORT = String(port.address().port);
  await new Promise(resolve => port.close(resolve));
  const base = `http://127.0.0.1:${process.env.PORT}`;
  const child = spawn(process.execPath, ['backend/server.js'], { cwd: root, env: process.env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let logs = ''; child.stdout.on('data', data => { logs += data; }); child.stderr.on('data', data => { logs += data; });
  let browser;
  try {
    let healthy = false;
    for (let i = 0; i < 80; i++) { try { healthy = (await fetch(base + '/api/health')).ok; } catch {} if (healthy) break; await delay(100); }
    assert.ok(healthy, logs);
    browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
    const context = await browser.newContext({ baseURL: base, permissions: ['microphone'] });
    await context.request.post('/api/estudiantes/1/ingresar');
    const activities = async ctx => (await (await ctx.request.get('/api/actividades')).json()).actividades;
    const story = (await activities(context)).find(activity => activity.Nombre === 'Completo el cuento');
    assert.equal(story.Bloqueada, true);
    assert.equal((await context.request.post(`/api/actividades/${story.ActividadID}/iniciar`)).status(), 403);
    const page = await context.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.route('https://fonts.googleapis.com/**', route => route.abort());
    let saves = 0;
    await page.route('**/api/resultados/*/terminar', route => {
      saves++;
      return saves <= 3 ? route.fulfill({ status: 503, json: { error: 'Fallo temporal simulado' } }) : route.continue();
    });
    await page.goto('/actividades/pronunciar.html');
    await page.locator('#game:not(.hidden)').waitFor();
    for (const [index, word] of ['gato', 'mariposa', 'pelota', 'manzana', 'caballo'].entries()) {
      assert.equal(await page.locator('#word').textContent(), word);
      await page.locator('#speak').click();
      await page.getByText('Grabando… di la palabra', { exact: false }).waitFor();
      await delay(900);
      await page.locator('#speak').click();
      await page.locator('#recordedAudio:not(.hidden)').waitFor();
      const upload = page.waitForResponse(response => response.url().includes('/audio?palabra='));
      await page.locator('#practice').click();
      const uploaded = await upload;
      assert.equal(uploaded.status(), 201, await uploaded.text());
      if (index < 4) await page.getByText(`Palabra ${index + 2} de 5`, { exact: true }).waitFor();
    }
    await page.locator('#retrySave:not(.hidden)').waitFor();
    assert.equal(saves, 3);
    assert.equal((await activities(context)).find(a => a.ActividadID === story.ActividadID).Bloqueada, true);
    await page.locator('#retrySave').click();
    await page.locator('a[href="/actividades/cuento.html"]').waitFor();
    assert.equal((await activities(context)).find(a => a.ActividadID === story.ActividadID).Bloqueada, false);
    await page.locator('a[href="/actividades/cuento.html"]').click();
    await page.locator('#game:not(.hidden)').waitFor();
    const { DatabaseSync } = require('node:sqlite');
    const check = new DatabaseSync(process.env.DB_FILE);
    const completed = check.prepare(`SELECT R.DetalleResultado FROM ResultadosActividades R JOIN Actividades A ON A.ActividadID=R.ActividadID WHERE R.EstudianteID=1 AND A.Nombre='Practico la pronunciación' AND R.Estado='Completada'`).get();
    assert.equal(JSON.parse(completed.DetalleResultado).respuestas.length, 5);
    assert.equal(check.prepare('SELECT COUNT(*) AS total FROM AudiosPronunciacion WHERE EstudianteID=1').get().total, 5);
    check.close();
    // Una práctica completada antes de esta corrección se recupera sin repetirla.
    const recovered = await browser.newContext({ baseURL: base });
    await recovered.request.post('/api/estudiantes/2/ingresar');
    const recoveredPage = await recovered.newPage();
    await recoveredPage.addInitScript(() => localStorage.setItem('lectura-progreso:2:Practico la pronunciación', JSON.stringify({ round: 5, correct: 5, responses: ['gato','mariposa','pelota','manzana','caballo'].map(palabra => ({palabra, intentos: [], confirmadaComoPracticada: true})) })));
    await recoveredPage.route('https://fonts.googleapis.com/**', route => route.abort());
    await recoveredPage.goto('/actividades/pronunciar.html');
    await recoveredPage.locator('a[href="/actividades/cuento.html"]').waitFor();
    assert.equal((await activities(recovered)).find(a => a.ActividadID === story.ActividadID).Bloqueada, false);
    // También se puede completar con la alternativa manual si no hay micrófono.
    const manual = await browser.newContext({ baseURL: base });
    await manual.request.post('/api/estudiantes/3/ingresar');
    const manualPage = await manual.newPage();
    await manualPage.addInitScript(() => {
      window.SpeechRecognition = window.webkitSpeechRecognition = undefined;
      if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = undefined;
    });
    await manualPage.route('https://fonts.googleapis.com/**', route => route.abort());
    await manualPage.goto('/actividades/pronunciar.html');
    await manualPage.locator('#game:not(.hidden)').waitFor();
    for (let index=0; index<5; index++) await manualPage.locator('#practice').click();
    await manualPage.locator('a[href="/actividades/cuento.html"]').waitFor();
    assert.equal((await activities(manual)).find(a => a.ActividadID === story.ActividadID).Bloqueada, false);
    assert.deepEqual(errors, []);
    console.log('OK: 5 grabaciones, guardado de respuestas, fallo y reintento, recuperación, modo manual y desbloqueo real de Completo el cuento.');
  } finally {
    await browser?.close();
    const exited = once(child, 'exit'); child.kill(); await exited;
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
