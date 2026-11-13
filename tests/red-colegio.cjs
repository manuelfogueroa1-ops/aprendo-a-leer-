// Arranca el servidor del colegio en una IP local con una base vacía y una CA temporal.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const https = require('node:https');
const { X509Certificate } = require('node:crypto');
const { spawn, execFile } = require('node:child_process');
const { once } = require('node:events');
const { promisify } = require('node:util');

const raiz = path.resolve(__dirname, '..');
const temporal = fs.mkdtempSync(path.join(os.tmpdir(), 'aprendo-colegio-'));

function pedir(url, ca, method = 'GET', datos, cookie) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { ca, method, headers: {
      ...(datos ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {})
    } }, res => {
      let cuerpo = '';
      res.setEncoding('utf8');
      res.on('data', trozo => { cuerpo += trozo; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, cuerpo }));
    });
    req.setTimeout(3000, () => req.destroy(new Error('El servidor no respondió')));
    req.on('error', reject);
    req.end(datos ? JSON.stringify(datos) : undefined);
  });
}

(async () => {
  const interfaz = Object.values(os.networkInterfaces()).flat().find(info => !info.internal && info.family === 'IPv4' && /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(info.address));
  assert.ok(interfaz, 'Conecta el equipo a una red privada para ejecutar esta prueba');
  const ip = interfaz.address;
  const escucha = net.createServer().listen(0, ip);
  await once(escucha, 'listening');
  const puerto = escucha.address().port;
  await new Promise(resolve => escucha.close(resolve));
  const base = `https://${ip}:${puerto}`;
  const proceso = spawn(process.execPath, ['servidor-central/iniciar-colegio.js', ip], {
    cwd: raiz, env: { ...process.env, LOCALAPPDATA: temporal, PUERTO_COLEGIO: String(puerto) }, windowsHide: true
  });
  let salida = '';
  let errores = '';
  proceso.stdout.on('data', datos => { salida += datos; });
  proceso.stderr.on('data', datos => { errores += datos; });
  try {
    for (let i = 0; i < 100 && !salida.includes('Servidor central disponible'); i++) {
      if (proceso.exitCode !== null) throw new Error(errores);
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(salida.includes('Servidor central disponible'), 'El servidor del colegio debe iniciar');
    const ca = fs.readFileSync(path.join(temporal, 'AprendoALeerCentral', 'certificado-colegio.crt'));
    const caWindows = fs.readFileSync(path.join(temporal, 'AprendoALeerCentral', 'certificado-colegio.cer'));
    assert.ok(new X509Certificate(ca).raw.equals(caWindows));
    await assert.rejects(pedir(`${base}/api/health`), { code: 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' });
    const salud = await pedir(`${base}/api/health`, ca);
    assert.equal(salud.status, 200);
    assert.deepEqual(JSON.parse(salud.cuerpo), { ok: true });
    const clave = salida.match(/Contraseña inicial: ([^\r\n]+)/)?.[1];
    assert.ok(clave);
    const acceso = await pedir(`${base}/api/panel/login`, ca, 'POST', { usuario: 'admin', password: clave });
    assert.equal(acceso.status, 200);
    const sesion = acceso.headers['set-cookie'][0];
    assert.match(sesion, /; Secure/);
    const codigo = await pedir(`${base}/api/admin/codigos`, ca, 'POST', { descripcion: 'Prueba', dias: 1 }, sesion.split(';')[0]);
    assert.equal(codigo.status, 201);
    await promisify(execFile)(process.execPath, ['-e', `
      const assert = require('node:assert/strict');
      const db = require('./backend/database');
      const sync = require('./backend/sync')(db);
      (async () => {
        const estado = await sync.vincular({ codigo: process.env.CONEXION_COLEGIO_PRUEBA });
        assert.equal(estado.vinculado, true);
        assert.equal(await sync.sincronizarAhora(), true);
      })().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => db.close());
    `], { cwd: raiz, timeout: 25000, windowsHide: true, env: {
      ...process.env, DB_FILE: path.join(temporal, 'equipo.sqlite'), STUDENT_DATA_KEY: require('node:crypto').randomBytes(32).toString('hex'),
      NODE_EXTRA_CA_CERTS: path.join(temporal, 'AprendoALeerCentral', 'certificado-colegio.crt'),
      CONEXION_COLEGIO_PRUEBA: `${base}/${JSON.parse(codigo.cuerpo).codigo}`
    } });
    console.log('OK: IP privada, certificado HTTPS, sesión segura y sincronización de un equipo vinculado.');
  } finally {
    if (proceso.exitCode === null) {
      const terminado = once(proceso, 'exit');
      proceso.kill();
      await terminado;
    }
  }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  assert.equal(path.dirname(fs.realpathSync(temporal)), fs.realpathSync(os.tmpdir()));
  fs.rmSync(temporal, { recursive: true, force: true, maxRetries: 3 });
});
