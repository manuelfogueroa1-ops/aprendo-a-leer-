// Grabaciones reales, sin síntesis de voz y sin usar SQLite ni datos de alumnos.
const { chromium } = require('playwright');
const express = require('../node_modules/express');
const path = require('node:path');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const app = express();
app.use(express.json());
const names = ['Reconozco las letras', 'Formo sílabas', 'Uno la palabra con su imagen', 'Encuentro la letra', 'Aprendo las sílabas', 'Practico la pronunciación', 'Completo el cuento'];
const student = { EstudianteID: 999, Nombre: 'Prueba', Apellido: 'Grabaciones', ColorFavorito: 130, TemaInteres: 'Animales' };
const saved = [];
let nextId = 0;
app.get('/api/estudiantes/me', (_req, res) => res.json({ estudiante: student }));
app.get('/api/estudiantes', (_req, res) => res.json({ estudiantes: [student] }));
app.get('/api/voz/config', (_req, res) => res.json({ disponible: false }));
app.get('/api/actividades', (_req, res) => res.json({ actividades: names.map((Nombre, i) => ({ Nombre, ActividadID: i + 1, Bloqueada: false })) }));
app.post('/api/actividades/:id/iniciar', (_req, res) => res.json({ intento: { ResultadoID: ++nextId } }));
app.post('/api/resultados/:id/avance', (_req, res) => res.json({ guardado: true }));
app.post('/api/resultados/:id/terminar', (req, res) => { saved.push(req.body); res.json({ guardado: true, duracionSegundos: 30 }); });
app.use(express.static(path.resolve(__dirname, '../frontend')));
const server = app.listen(0, '127.0.0.1');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
(async () => {
  if (!server.listening) await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
  try {
    const context = await browser.newContext({ baseURL: base });
    const page = await context.newPage();
    const errors = [], ended = [], started = [], artificial = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', req => { if (/\/api\/voz\/(local|piper)$/.test(req.url())) artificial.push(req.url()); });
    await context.exposeBinding('recordedAudioEvent', (_source, type, url) => { (type === 'end' ? ended : started).push(url); });
    await context.addInitScript(() => {
      Object.defineProperty(window, 'speechSynthesis', { value: undefined });
      window.SpeechSynthesisUtterance = undefined;
      window.testAudioRate = 10;
      window.testAudios = [];
      const Original = window.Audio;
      window.Audio = function (...args) {
        const audio = new Original(...args);
        audio.playbackRate = window.testAudioRate;
        audio.addEventListener('playing', () => window.recordedAudioEvent('start', audio.src));
        audio.addEventListener('ended', () => window.recordedAudioEvent('end', audio.src));
        window.testAudios.push(audio);
        return audio;
      };
      window.Audio.prototype = Original.prototype;
    });
    await page.route('https://fonts.googleapis.com/**', route => route.abort());
    const waitFor = async predicate => {
      for (let i=0; i<200; i++) { if (predicate()) return; await delay(60); }
      throw new Error('No se recibió el evento del audio esperado.');
    };
    await page.goto('/actividades/letras-iniciales.html');
    await page.locator('#game:not(.hidden)').waitFor();
    await waitFor(() => started.some(url => url.includes('letras-pregunta-a.wav')));
    await page.locator('.activity-pause-button').click();
    assert.equal(await page.evaluate(() => window.testAudios.every(audio => audio.paused)), true);
    await page.keyboard.press('Escape');
    await waitFor(() => ended.some(url => url.includes('letras-pregunta-a.wav')));
    await page.getByRole('button', { name: 'Escuchar la letra A', exact: true }).click();
    await waitFor(() => started.some(url => url.includes('letras-nombre-a.wav')));
    await page.locator('#choices .choice-button').filter({ hasNotText: /^A$/ }).first().click();
    await waitFor(() => started.some(url => url.includes('letras-reintento.wav')));
    await page.evaluate(() => { window.testAudioRate = 1; });
    await page.getByRole('button', { name: 'Elegir la letra A', exact: true }).click();
    await delay(1300);
    assert.equal(await page.locator('#progress').textContent(), 'Letra 1 de 27', 'El acierto no debe cortarse al segundo.');
    await page.getByText('Letra 2 de 27', { exact: true }).waitFor();
    assert.ok(ended.some(url => url.includes('letras-acierto.wav')));
    // Retomar la última letra permite probar el cierre sin repetir todo el nivel.
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('lectura-progreso:999:Reconozco las letras', JSON.stringify({ round: 26, correct: 26, responses: [] })));
    await page.goto('/actividades/letras-iniciales.html');
    await page.getByText('Letra 27 de 27', { exact: true }).waitFor();
    await page.evaluate(() => { window.testAudioRate = 1; });
    await page.getByRole('button', { name: 'Elegir la letra Z', exact: true }).click();
    await page.waitForURL(base + '/', { timeout: 30000 });
    assert.ok(ended.some(url => url.includes('letras-final.wav')), 'El cierre termina antes del regreso.');
    assert.equal(JSON.parse(saved.at(-1).detalleResultado).actividad, 'letras_iniciales');
    await page.goto('/actividades/silabas-iniciales.html');
    await page.locator('#game:not(.hidden)').waitFor();
    await waitFor(() => ended.some(url => url.includes('silabas-bienvenida.wav')));
    await waitFor(() => ended.some(url => url.includes('silabas-pregunta.wav')));
    await waitFor(() => ended.some(url => url.includes('silaba-pa.wav')));
    await page.locator('#listen').click();
    await waitFor(() => started.some(url => url.includes('silabas-repetir.wav')));
    await page.locator('#choices button').filter({ hasNotText: /^PA$/ }).first().click();
    await waitFor(() => started.some(url => url.includes('silabas-reintento.wav')));
    await page.locator('#choices button').filter({ hasText: /^PA$/ }).click();
    await page.getByText('Sílaba 2 de 90', { exact: true }).waitFor();
    await waitFor(() => ended.some(url => url.includes('silaba-pe.wav')));
    await waitFor(() => started.some(url => url.includes('silabas-pista.wav')));
    assert.equal(await page.locator('.hint-target').textContent(), 'PE');
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('lectura-progreso:999:Formo sílabas', JSON.stringify({ round: 89, correct: 89, total: 90, responses: [] })));
    await page.goto('/actividades/silabas-iniciales.html');
    await page.getByText('Sílaba 90 de 90', { exact: true }).waitFor();
    await page.evaluate(() => { window.testAudioRate = 1; });
    await page.locator('#choices button').filter({ hasText: /^KU$/ }).click();
    await page.waitForURL(base + '/', { timeout: 30000 });
    assert.ok(ended.some(url => url.includes('silabas-final.wav')));
    assert.equal(JSON.parse(saved.at(-1).detalleResultado).actividad, 'silabas_iniciales');
    // Todos los clips del manifiesto apuntan a archivos servidos y decodificables.
    const manifest = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../frontend/grabaciones.js'), 'utf8').replace('window.GrabacionesLectura = ', '').replace(/;\s*$/, ''));
    assert.equal(Object.keys(manifest.clips).length, 185);
    assert.equal(manifest.perfilVoz.nombre, 'grave');
    for (const recording of Object.values(manifest.clips)) {
      const response = await context.request.get(recording.url);
      assert.equal(response.status(), 200, recording.url);
      assert.equal((await response.body()).toString('ascii', 0, 4), 'RIFF');
    }
    assert.deepEqual(artificial, [], 'Las dos actividades no solicitan síntesis de voz.');
    assert.deepEqual(errors, []);
    console.log('OK: 185 audios con perfil grave; preguntas y letras, pausa, reintento, bienvenida, sílabas, pista, acierto completo y cierres antes de regresar. Sin síntesis.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server.close());
