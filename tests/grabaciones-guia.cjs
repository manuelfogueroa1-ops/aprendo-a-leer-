// Las tres actividades nuevas con archivos reales y sesiones ficticias, sin DB.
const { chromium } = require('playwright');
const express = require('../node_modules/express');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');
const soloNuevas = process.argv.includes('--solo-silabas-nuevas');
const app = express();
app.use(express.json());
const saved = [];
let id = 0;
app.get('/api/estudiantes/me', (_req, res) => res.json({ estudiante: { EstudianteID: 999, Nombre: 'Prueba', Apellido: 'Audios' } }));
app.get('/api/estudiantes', (_req, res) => res.json({ estudiantes: [] }));
app.get('/api/voz/config', (_req, res) => res.json({ disponible: false }));
app.get('/api/actividades', (_req, res) => res.json({ actividades: ['Uno la palabra con su imagen', 'Encuentro la letra', 'Aprendo las sílabas'].map((Nombre, index) => ({ Nombre, ActividadID: index + 1, Bloqueada: false })) }));
app.post('/api/actividades/:id/iniciar', (_req, res) => res.json({ intento: { ResultadoID: ++id } }));
app.post('/api/resultados/:id/avance', (_req, res) => res.json({ guardado: true }));
app.post('/api/resultados/:id/terminar', (req, res) => { saved.push(req.body); res.json({ guardado: true, duracionSegundos: 30 }); });
app.use(express.static(path.resolve(__dirname, '../frontend')));
const server = app.listen(0, '127.0.0.1');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
(async () => {
  if (!server.listening) await new Promise(resolve => server.once('listening', resolve));
  const baseURL = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
  try {
    const context = await browser.newContext({ baseURL });
    const page = await context.newPage();
    const started = [], ended = [], errors = [], synthetic = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('request', req => { if (/\/api\/voz\/(local|piper)$/.test(req.url())) synthetic.push(req.url()); });
    await context.exposeBinding('audioEvent', (_source, event, url) => (event === 'end' ? ended : started).push(url));
    await context.addInitScript(() => {
      Object.defineProperty(window, 'speechSynthesis', { value: undefined });
      window.SpeechSynthesisUtterance = undefined;
      window.audioRate = 10;
      window.audios = [];
      const Original = window.Audio;
      window.Audio = function (...args) {
        const audio = new Original(...args);
        audio.playbackRate = window.audioRate;
        audio.addEventListener('playing', () => window.audioEvent('start', audio.src));
        audio.addEventListener('ended', () => window.audioEvent('end', audio.src));
        window.audios.push(audio);
        return audio;
      };
      window.Audio.prototype = Original.prototype;
    });
    await page.route('https://fonts.googleapis.com/**', route => route.abort());
    const waitAudio = async (key, events = ended, previous = 0) => {
      for (let i = 0; i < 300; i++) {
        if (events.filter(url => url.includes(`/${key}.wav`)).length > previous) return;
        await delay(60);
      }
      throw new Error(`No se reprodujo ${key}`);
    };
    const choose = text => page.locator('#choices button').filter({ hasText: new RegExp(`^${text}$`) }).click();
    const seed = async (activity, state, file) => {
      await page.goto('/');
      await page.evaluate(([name, progress]) => localStorage.setItem(`lectura-progreso:999:${name}`, JSON.stringify(progress)), [activity, state]);
      await page.goto(`/actividades/${file}.html`);
      await page.locator('#game:not(.hidden)').waitFor();
    };

    if (!soloNuevas) {
    console.log('Probando parejas...');
    await page.goto('/actividades/unir-palabra-imagen.html');
    await waitAudio('parejas-bienvenida');
    await page.locator('#words button').filter({ hasText: /^DEDO$/ }).click();
    await waitAudio('parejas-primero-imagen');
    await page.getByRole('button', { name: 'Dibujo de un dedo', exact: true }).click();
    await waitAudio('parejas-elegir-palabra');
    await page.locator('#words button').filter({ hasText: /^DADO$/ }).click();
    await waitAudio('parejas-reintento');
    await page.getByRole('button', { name: 'Dibujo de un dedo', exact: true }).click();
    await page.locator('#words button').filter({ hasText: /^DEDO$/ }).click();
    await waitAudio('parejas-acierto');
    await seed('Uno la palabra con su imagen', { responses: ['dedo', 'dado', 'mano', 'mapa', 'lupa'].map(palabra => ({ palabra })), correctFirstTry: 5, errors: 0 }, 'unir-palabra-imagen');
    assert.equal(await page.locator('#progress').textContent(), 'Parejas unidas: 5 de 6');
    await page.evaluate(() => { window.audioRate = 1; });
    await page.getByRole('button', { name: 'Dibujo de la luna', exact: true }).click();
    await page.locator('#words button').filter({ hasText: /^LUNA$/ }).click();
    await page.waitForURL(baseURL + '/');
    assert.ok(ended.some(url => url.includes('/parejas-final.wav')));
    assert.equal(JSON.parse(saved.at(-1).detalleResultado).actividad, 'unir-palabra-imagen');

    console.log('Probando Encuentro la letra...');
    await page.goto('/actividades/letra.html');
    await waitAudio('encuentra-bienvenida');
    await waitAudio('encuentra-instruccion');
    await waitAudio('encuentra-pista', started);
    assert.equal(await page.locator('.hint-target').textContent(), 'G');
    await choose('P');
    await waitAudio('letras-nombre-p');
    await waitAudio('encuentra-apoyo');
    assert.ok(ended.findIndex(url => url.includes('/letras-nombre-p.wav')) < ended.findIndex(url => url.includes('/encuentra-apoyo.wav')), 'Primero se escucha la letra y después el apoyo.');
    await waitAudio('encuentra-siguiente');
    await page.locator('#next').click();
    await choose('N');
    await waitAudio('letras-nombre-n');
    await waitAudio('encuentra-acierto');
    await seed('Encuentro la letra', { round: 19, correct: 19, responses: [] }, 'letra');
    await page.evaluate(() => { window.audioRate = 1; });
    await choose('P');
    await page.waitForURL(baseURL + '/');
    assert.ok(ended.some(url => url.includes('/encuentra-final.wav')));
    assert.equal(JSON.parse(saved.at(-1).detalleResultado).actividad, 'letras');

    console.log('Probando Aprendo las sílabas...');
    await page.goto('/actividades/silabas.html');
    await waitAudio('ordeno-bienvenida');
    await waitAudio('ordeno-instruccion');
    await waitAudio('ordeno-quitar');
    await page.locator('#check').click();
    await waitAudio('ordeno-faltan');
    await choose('sa');
    await waitAudio('silaba-sa');
    await waitAudio('ordeno-pista-quitar', started);
    assert.equal(await page.locator('#answer .hint-target').textContent(), 'sa');
    const saBeforeRemoval = ended.filter(url => url.includes('/silaba-sa.wav')).length;
    await page.locator('#answer .filled').click();
    await waitAudio('silaba-sa', ended, saBeforeRemoval);
    await waitAudio('ordeno-pista', started);
    assert.equal(await page.locator('#choices .hint-target').textContent(), 'ca');
    await choose('sa');
    await choose('ca');
    await waitAudio('silaba-ca');
    await waitAudio('ordeno-revisar');
    assert.ok(ended.findIndex(url => url.includes('/silaba-ca.wav')) < ended.findIndex(url => url.includes('/ordeno-revisar.wav')), 'La instrucción de revisar no corta la última sílaba.');
    assert.ok(await page.evaluate(() => window.audios.filter(audio => !audio.paused).length <= 1), 'Los clics seguidos no superponen las voces.');
    await page.locator('#check').click();
    await waitAudio('ordeno-reintento');
    await choose('ca');
    await choose('sa');
    await page.evaluate(() => { window.audioRate = 1; });
    await page.locator('#check').click();
    await waitAudio('ordeno-acierto', started);
    await page.locator('.activity-pause-button').click();
    assert.equal(await page.evaluate(() => window.audios.every(audio => audio.paused)), true);
    await delay(1600);
    assert.equal(await page.locator('#progress').textContent(), 'Palabra 1 de 20');
    await page.keyboard.press('Escape');
    await page.getByText('Palabra 2 de 20', { exact: true }).waitFor();
    assert.ok(ended.some(url => url.includes('/ordeno-acierto.wav')));
    await seed('Aprendo las sílabas', { round: 19, correct: 19, responses: [], answer: [] }, 'silabas');
    await page.evaluate(() => { window.audioRate = 1; });
    for (const syllable of ['e', 'le', 'fan', 'te']) {
      await choose(syllable);
      await waitAudio(syllable === 'e' ? 'letras-nombre-e' : `silaba-${syllable}`);
    }
    await page.locator('#check').click();
    await page.waitForURL(baseURL + '/');
    assert.ok(ended.some(url => url.includes('/ordeno-final.wav')));
    assert.equal(JSON.parse(saved.at(-1).detalleResultado).actividad, 'silabas');
    }

    // Las ocho nuevas tomas se reproducen desde sus palabras reales.
    for (const [round, syllable] of [[4, 'llo'], [13, 'man'], [14, 'he'], [16, 'es'], [17, 'tre'], [17, 'lla'], [18, 'col'], [19, 'fan']]) {
      const previous = ended.filter(url => url.includes(`/silaba-${syllable}.wav`)).length;
      await seed('Aprendo las sílabas', { round, correct: 0, responses: [], answer: [] }, 'silabas');
      await choose(syllable);
      await waitAudio(`silaba-${syllable}`, ended, previous);
    }

    const manifest = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../frontend/grabaciones.js'), 'utf8').replace('window.GrabacionesLectura = ', '').replace(/;\s*$/, ''));
    const keys = Object.keys(manifest.clips).filter(key => /^(parejas|encuentra|ordeno)-/.test(key));
    assert.equal(Object.keys(manifest.clips).length, 185);
    assert.deepEqual(manifest.perfilVoz, { nombre: 'grave', semitonos: -2.5 });
    const source = fs.readFileSync(path.resolve(__dirname, '../frontend/actividades/silabas.js'), 'utf8');
    const questions = vm.runInNewContext(source.split('const $')[0] + '; questions');
    const extras = vm.runInNewContext(source.match(/const SILABAS_EXTRA = (\[[^;]+\]);/)[1]);
    for (const syllable of new Set([...questions.flatMap(question => question.syllables), ...extras])) {
      const key = /^[aeiou]$/.test(syllable) ? `letras-nombre-${syllable}` : `silaba-${syllable}`;
      assert.ok(manifest.clips[key], `Falta audio de ${syllable}`);
      assert.match(manifest.clips[key].url, /\/grave\//);
    }
    assert.equal(keys.length, 23);
    for (const key of keys) {
      const url = manifest.clips[key].url;
      assert.match(url, /\/grave\//);
      if (!soloNuevas) assert.ok(started.some(played => played.endsWith(url)), `${key} debe usarse en la actividad`);
      assert.equal((await context.request.get(url)).status(), 200);
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(synthetic, []);
    console.log(soloNuevas ? 'OK: las ocho sílabas nuevas se reproducen en sus palabras; todas las sílabas y distractores tienen grabación con filtro grave. Sin síntesis.' : 'OK: 23 instrucciones, letras y sílabas al tocarlas, ocho sílabas nuevas, vocales solas, quitar sílabas, pistas, pausas y cierres completos con voz grave. Sin síntesis.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server.close());
