// Verifica el paquete de Windows sin instalarlo ni abrir datos de la persona.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const asar = require('@electron/asar');
const root = path.resolve(__dirname, '..');
const archive = path.join(root, 'dist/win-unpacked/resources/app.asar');
const packaged = name => asar.extractFile(archive, path.normalize(name));
const manifest = JSON.parse(packaged('frontend/grabaciones.js').toString().replace('window.GrabacionesLectura = ', '').replace(/;\s*$/, ''));
assert.equal(Object.keys(manifest.clips).length, 185);
assert.deepEqual(manifest.perfilVoz, { nombre: 'grave', semitonos: -2.5 });
for (const file of ['backend/sync.js', 'frontend/index.html', 'frontend/fuentes.css', 'frontend/grabaciones.js', 'frontend/voz.js', 'frontend/actividades/actividad.js', 'frontend/actividades/cuento.css',
  ...['letra', 'silabas', 'unir-palabra-imagen', 'letras-iniciales', 'silabas-iniciales', 'cuento'].flatMap(name => [`frontend/actividades/${name}.js`, `frontend/actividades/${name}.html`])]) {
  assert.ok(packaged(file).equals(fs.readFileSync(path.join(root, file))), `Archivo desactualizado: ${file}`);
}
for (const [key, clip] of Object.entries(manifest.clips)) {
  assert.match(clip.url, /^\/assets\/audio\/grabaciones\/grave\//);
  const file = 'frontend' + clip.url.split('?')[0];
  assert.ok(packaged(file).equals(fs.readFileSync(path.join(root, file))), `Audio desactualizado: ${key}`);
}
const version = require('../package.json').version;
assert.equal(JSON.parse(packaged('package.json').toString()).version, version);
const files = asar.listPackage(archive);
assert.equal(files.some(file => /(?:^|[/\\])\.env$|\.sqlite(?:-|$)/i.test(file)), false, 'El paquete no debe incluir claves ni registros locales.');
console.log(`OK: paquete ${version}, 185 grabaciones graves y actividades actuales; sin base de datos ni .env.`);

const temporaryParent = path.join(root, '.tmp-desktop-tests');
fs.mkdirSync(temporaryParent, { recursive: true });
const temporary = fs.mkdtempSync(path.join(temporaryParent, 'paquete-'));
try {
  const code = `
    const path = require('node:path');
    const tls = require('node:tls');
    if (typeof tls.setDefaultCACertificates !== 'function' || !Array.isArray(tls.getCACertificates('system'))) {
      throw new Error('El ejecutable debe poder leer los certificados de confianza de Windows.');
    }
    const archive = process.env.PACKAGE_TEST_ASAR;
    const { startServer } = require(path.join(archive, 'backend/server.js'));
    const db = require(path.join(archive, 'backend/database.js'));
    (async () => {
      const server = await startServer(0, '127.0.0.1');
      try {
        const base = 'http://127.0.0.1:' + server.address().port;
        const response = await fetch(base + '/api/health');
        if (!response.ok || !(await response.json()).ok) throw new Error('Falló SQLite empaquetado.');
        const sync = await fetch(base + '/api/profesor/sincronizacion');
        if (sync.status !== 401) throw new Error('Falta la ruta de sincronización protegida.');
        const audio = await fetch(base + '/assets/audio/grabaciones/grave/silaba-llo.wav');
        if (!audio.ok || Buffer.from(await audio.arrayBuffer()).toString('ascii', 0, 4) !== 'RIFF') throw new Error('Falta audio en el servidor empaquetado.');
        console.log('OK: ejecutable Windows inicia servidor y SQLite temporales y sirve la voz nueva.');
      } finally { await new Promise(resolve => server.close(resolve)); db.close(); }
    })().catch(error => { console.error(error); process.exitCode = 1; });
  `;
  const result = execFileSync(path.join(root, 'dist/win-unpacked/Aprendo a Leer.exe'), ['-e', code], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', PACKAGE_TEST_ASAR: archive,
      SESSION_SECRET: randomBytes(32).toString('hex'), STUDENT_DATA_KEY: randomBytes(32).toString('hex'),
      DB_FILE: path.join(temporary, 'prueba.sqlite'), PIPER_DISABLED: '1' },
    timeout: 30000, encoding: 'utf8', windowsHide: true
  });
  process.stdout.write(result);
} finally {
  fs.rmSync(temporary, { recursive: true, force: true, maxRetries: 3 });
}
