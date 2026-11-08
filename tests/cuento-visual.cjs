// Cuentos completos y presentación en escritorio/móvil, sin datos reales.
const { chromium } = require('playwright');
const express = require('../node_modules/express');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const app = express();
app.use(express.json());
const saved = [];
let id = 0;
app.get('/api/estudiantes/me', (_req, res) => res.json({ estudiante: { EstudianteID: 999, Nombre: 'Prueba', ColorFavorito: 270 } }));
app.get('/api/estudiantes', (_req, res) => res.json({ estudiantes: [] }));
app.get('/api/voz/config', (_req, res) => res.json({ disponible: false }));
app.get('/api/actividades', (_req, res) => res.json({ actividades: [{ ActividadID: 7, Nombre: 'Completo el cuento', Bloqueada: false }] }));
app.post('/api/actividades/:id/iniciar', (_req, res) => res.json({ intento: { ResultadoID: ++id } }));
app.post('/api/resultados/:id/avance', (_req, res) => res.json({ guardado: true }));
app.post('/api/resultados/:id/terminar', (req, res) => { saved.push(req.body); res.json({ guardado: true, duracionSegundos: 30 }); });
app.use(express.static(path.resolve(__dirname, '../frontend')));
const source = fs.readFileSync(path.join(__dirname, '../frontend/actividades/cuento.js'), 'utf8');
const stories = vm.runInNewContext(source.split('const VOCALES')[0] + '; stories');
const output = path.join(__dirname, '../dist/revision-cuento');
fs.mkdirSync(output, { recursive: true });
const server = app.listen(0, '127.0.0.1');
(async () => {
  if (!server.listening) await new Promise(resolve => server.once('listening', resolve));
  const baseURL = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ baseURL, viewport: { width: 1180, height: 900 }, reducedMotion: 'reduce' });
    const errors = [];
    await page.addLocatorHandler(page.locator('.premio-luego'), button => button.click());
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://fonts.googleapis.com/**', route => route.abort());
    await page.addInitScript(() => {
      Object.defineProperty(window, 'speechSynthesis', { value: undefined });
      window.SpeechSynthesisUtterance = undefined;
    });
    for (const [index, story] of stories.entries()) {
      console.log(`Revisando: ${story.title}`);
      const letters = [...story.text.matchAll(/\[(\p{L})\]/gu)].map(match => match[1]);
      await page.goto('/');
      await page.evaluate(([title, count]) => localStorage.setItem('lectura-progreso:999:Completo el cuento', JSON.stringify({ storyTitle: title, blanks: Array.from({ length: count }, () => ({ filled: false, errors: 0 })), active: 0, correct: 0, responses: [] })), [story.title, letters.length]);
      await page.goto('/actividades/cuento.html');
      await page.locator('#game:not(.hidden)').waitFor();
      assert.equal(await page.locator('.story-blank.active').count(), 1);
      assert.equal(await page.locator('.story-blank').count(), letters.length);
      await page.locator('.story-blank').nth(1).click();
      assert.equal(await page.locator('.story-blank').nth(1).getAttribute('aria-pressed'), 'true');
      await page.locator('.story-blank').first().click();
      await page.locator('#choices button').filter({ hasNotText: new RegExp(`^${letters[0].toUpperCase()}$`) }).first().click();
      assert.equal(await page.locator('.story-blank.filled').count(), 0);
      await page.getByRole('button', { name: `Elegir la letra ${letters[0].toUpperCase()}`, exact: true }).click();
      assert.equal(await page.locator('.story-blank.filled').first().textContent(), letters[0]);
      if (index === 0) {
        for (const [name, width, dark] of [['escritorio-claro', 1180, false], ['escritorio-oscuro', 1180, true], ['movil-claro', 390, false], ['movil-oscuro', 390, true], ['estrecho-claro', 320, false]]) {
          await page.setViewportSize({ width, height: 900 });
          await page.evaluate(dark => Tema.aplicar({ ColorFavorito: 270, ModoOscuro: dark ? 1 : 0 }), dark);
          const style = await page.locator('.story-blank.active').evaluate(el => {
            const style = getComputedStyle(el);
            return { background: style.backgroundColor, color: style.color, border: style.borderStyle, height: el.getBoundingClientRect().height };
          });
          assert.notEqual(style.background, 'rgb(255, 255, 255)');
          assert.notEqual(style.background, style.color);
          assert.equal(style.border, 'solid');
          assert.ok(style.height >= 32);
          const layout = await page.locator('#story').evaluate(el => {
            const bounds = el.getBoundingClientRect();
            return { noOverflow: el.scrollWidth <= el.clientWidth, visible: bounds.left >= 0 && bounds.right <= innerWidth,
              wrapped: [...el.querySelectorAll('.story-word')].every(word => word.getClientRects().length === 1) };
          });
          assert.deepEqual(layout, { noOverflow: true, visible: true, wrapped: true });
          await page.locator('.learning-panel').screenshot({ path: path.join(output, `${name}.png`) });
        }
      }
      for (const letter of letters.slice(1)) await page.getByRole('button', { name: `Elegir la letra ${letter.toUpperCase()}`, exact: true }).click();
      if (await page.locator('.premio-luego').isVisible()) await page.keyboard.press('Escape');
      await page.waitForURL(baseURL + '/');
      const detail = JSON.parse(saved.at(-1).detalleResultado);
      assert.equal(detail.cuento, story.title);
      assert.equal(detail.respuestas.filter(response => response.correcta).length, letters.length);
    }
    assert.deepEqual(errors, []);
    console.log('OK: tres cuentos completos, selección y errores, espacios con color, letras completadas y palabras sin cortes; escritorio/móvil y modo claro/oscuro. Capturas en dist/revision-cuento.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server.close());
