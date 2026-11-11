// Prueba de extremo a extremo de la sincronización con el servidor central.
//
// Levanta un servidor central real y dos computadores (PC-A y PC-B, cada uno con su
// SQLite temporal). Entre los computadores y el servidor hay un intermediario que permite
// simular cortes de internet y respuestas perdidas a mitad de camino.
//
// Comprueba: envío con internet, guardado local sin conexión y envío automático al volver,
// envíos repetidos sin duplicados, cambio de computador (desbloqueo de niveles y estrellas),
// el mismo alumno en dos equipos a la vez, el mismo alumno creado sin conexión en dos
// equipos, eliminación, reinicio del servidor, respaldos y permisos.
// Uso: node tests/sincronizacion.cjs   (no requiere navegador ni internet)
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { randomBytes } = require('node:crypto');

const raiz = path.resolve(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aprendo-sync-'));
const procesos = new Set();
const pausa = ms => new Promise(r => setTimeout(r, ms));

function puertoLibre() {
  return new Promise((resolve, reject) => {
    const s = net.createServer().listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
    s.on('error', reject);
  });
}

async function esperar(descripcion, condicion, ms = 20000) {
  const limite = Date.now() + ms;
  let ultimo;
  while (Date.now() < limite) {
    try { ultimo = await condicion(); if (ultimo) return ultimo; } catch (error) { ultimo = error; }
    await pausa(150);
  }
  throw new Error(`Tiempo agotado esperando: ${descripcion}${ultimo instanceof Error ? ` (${ultimo.message})` : ''}`);
}

function iniciarProceso(nombre, script, env) {
  const hijo = spawn(process.execPath, [script], { cwd: raiz, env: { ...process.env, ...env }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  hijo.salida = '';
  hijo.stdout.on('data', d => { hijo.salida += d; });
  hijo.stderr.on('data', d => { hijo.salida += d; });
  hijo.nombre = nombre;
  procesos.add(hijo);
  hijo.on('exit', () => procesos.delete(hijo));
  return hijo;
}

async function detener(hijo) {
  if (!hijo || hijo.exitCode !== null) return;
  const fin = new Promise(r => hijo.once('exit', r));
  hijo.kill();
  await fin;
}

// Cliente HTTP con cookies propias (una sesión por cliente).
function cliente(base) {
  let cookie = '';
  return async (method, ruta, body) => {
    const r = await fetch(base + ruta, {
      method,
      headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const nuevas = r.headers.getSetCookie?.() || [];
    if (nuevas.length) cookie = nuevas.map(c => c.split(';')[0]).join('; ');
    return { status: r.status, data: await r.json().catch(() => ({})) };
  };
}

(async () => {
  const claveCentral = randomBytes(32).toString('hex');
  const puertoCentral = await puertoLibre();
  const datosCentral = path.join(tmp, 'central');
  const envCentral = {
    PORT: String(puertoCentral), HOST: '127.0.0.1', DATA_DIR: datosCentral, CENTRAL_DATA_KEY: claveCentral,
    SESSION_SECRET: randomBytes(32).toString('hex'), COOKIE_SECURE: '0',
    ADMIN_USUARIO: 'admin', ADMIN_CLAVE: 'ClaveAdministrador123', ADMIN_NOMBRE: 'Ada', ADMIN_APELLIDO: 'Admin'
  };
  const baseCentral = `http://127.0.0.1:${puertoCentral}`;
  let central = iniciarProceso('central', 'servidor-central/server.js', envCentral);
  const centralListo = () => esperar('servidor central', async () => (await fetch(`${baseCentral}/api/health`)).ok);
  await centralListo();

  // Intermediario: simula la conexión a internet entre los computadores y el servidor.
  const red = { caida: false, cortarSubidas: 0, subidasCortadas: 0 };
  const intermediario = http.createServer((req, res) => {
    if (red.caida) { req.socket.destroy(); return; }
    const cortar = req.url.startsWith('/api/sync/subir') && red.cortarSubidas > 0;
    if (cortar) red.cortarSubidas--;
    const arriba = http.request({ host: '127.0.0.1', port: puertoCentral, path: req.url, method: req.method, headers: req.headers }, respuesta => {
      if (cortar) {
        // El servidor ya guardó el envío, pero la respuesta nunca llega al computador.
        respuesta.resume();
        respuesta.on('end', () => { red.subidasCortadas++; req.socket.destroy(); });
        return;
      }
      res.writeHead(respuesta.statusCode, respuesta.headers);
      respuesta.pipe(res);
    });
    arriba.on('error', () => req.socket.destroy());
    req.pipe(arriba);
  });
  await new Promise(r => intermediario.listen(0, '127.0.0.1', r));
  const urlServidor = `http://127.0.0.1:${intermediario.address().port}`;

  async function iniciarPc(nombre) {
    const puerto = await puertoLibre();
    const env = {
      PORT: String(puerto), DB_FILE: path.join(tmp, `${nombre}.sqlite`), STUDENT_DATA_KEY: randomBytes(32).toString('hex'),
      SESSION_SECRET: randomBytes(32).toString('hex'), PIPER_DISABLED: '1', DESBLOQUEAR_TODO: '0',
      SYNC_INTERVALO_MS: '1500', SYNC_REINTENTO_MS: '300', SYNC_REINTENTO_MAX_MS: '1000', SYNC_ESPERA_CAMBIO_MS: '150'
    };
    const base = `http://127.0.0.1:${puerto}`;
    const proceso = iniciarProceso(nombre, 'backend/server.js', env);
    await esperar(`servidor local ${nombre}`, async () => (await fetch(`${base}/api/health`)).ok);
    const profe = cliente(base);
    assert.equal((await profe('POST', '/api/profesor/registro', { nombre: 'Paula', apellido: nombre, usuario: 'profe', password: 'ClaveDocente1234', confirmacion: 'ClaveDocente1234' })).status, 201);
    assert.equal((await profe('POST', '/api/profesor/login', { usuario: 'profe', password: 'ClaveDocente1234' })).status, 200);
    return { nombre, base, proceso, env, profe };
  }

  const admin = cliente(baseCentral);
  let r = await admin('POST', '/api/panel/login', { usuario: 'admin', password: 'ClaveAdministrador123' });
  assert.equal(r.status, 200, 'el administrador inicia sesión');
  r = await admin('POST', '/api/admin/codigos', { descripcion: 'Sala de computación', dias: 2 });
  assert.equal(r.status, 201);
  const codigo = r.data.codigo;
  assert.match(codigo, /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);

  const A = await iniciarPc('PC-A');
  const B = await iniciarPc('PC-B');

  // ---------- Vinculación ----------
  r = await A.profe('POST', '/api/profesor/sincronizacion/vincular', { servidor: urlServidor, codigo: 'MALO-MALO-MALO', nombreEquipo: 'PC-A' });
  assert.equal(r.status, 403, 'un código inválido no vincula');
  r = await A.profe('POST', '/api/profesor/sincronizacion/vincular', { servidor: 'http://ejemplo.cl', codigo, nombreEquipo: 'PC-A' });
  assert.equal(r.status, 400, 'se exige https fuera de este computador');
  assert.match(r.data.error, /https/);
  r = await A.profe('POST', '/api/profesor/sincronizacion/vincular', { codigo: 'ABCD-EFGH-JKLM', nombreEquipo: 'PC-A' });
  assert.equal(r.status, 400, 'sin dirección conocida, el código solo no alcanza');
  assert.match(r.data.error, /código de conexión completo/);

  // Un registro hecho antes de vincular también debe llegar al servidor.
  r = await A.profe('POST', '/api/profesor/estudiantes', { nombre: 'Ana', apellido: 'Soto' });
  assert.equal(r.status, 200);
  const anaA = r.data.estudiante.EstudianteID;
  r = await A.profe('POST', '/api/profesor/sincronizacion/vincular', { servidor: urlServidor, codigo, nombreEquipo: 'PC-A' });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.vinculado, true);

  // ---------- Alumno en PC-A con internet ----------
  async function ingresar(pc, estudianteId) {
    const alumno = cliente(pc.base);
    assert.equal((await alumno('POST', `/api/estudiantes/${estudianteId}/ingresar`)).status, 200);
    const { data } = await alumno('GET', '/api/actividades');
    alumno.actividades = Object.fromEntries(data.actividades.map(a => [a.Nombre, a]));
    return alumno;
  }
  async function hacerActividad(alumno, nombre, { terminar = true, puntuacion = 80 } = {}) {
    const actividad = alumno.actividades[nombre];
    const ini = await alumno('POST', `/api/actividades/${actividad.ActividadID}/iniciar`);
    assert.equal(ini.status, 200, `${nombre}: ${JSON.stringify(ini.data)}`);
    const id = ini.data.intento.ResultadoID;
    assert.equal((await alumno('POST', `/api/resultados/${id}/avance`, {
      preguntaActual: 2, totalPreguntas: 5, completadas: 1, consigna: `Consigna de ${nombre}`, respuestaActual: 'm', pausada: false, revision: 1
    })).status, 200);
    if (terminar) {
      assert.equal((await alumno('POST', `/api/resultados/${id}/terminar`, {
        puntuacion, aciertos: 4, errores: 1, detalleResultado: JSON.stringify({ actividad: 'letras', respuestas: [{ palabra: 'mesa', correcta: false, letraElegida: 'n', letraCorrecta: 'm' }] })
      })).status, 200);
    }
    return id;
  }
  const resumenCentral = async () => (await admin('GET', '/api/panel/resumen')).data.estudiantes;
  const enCentral = async nombre => (await resumenCentral()).find(e => `${e.Nombre} ${e.Apellido}`.toLowerCase() === nombre.toLowerCase());
  const detalleCentral = async uuid => (await admin('GET', `/api/panel/estudiantes/${uuid}`)).data;
  const estadoSync = async pc => (await pc.profe('GET', '/api/profesor/sincronizacion')).data;
  const sinPendientes = p => p.estudiantes + p.intentos + p.minijuegos + p.eliminaciones === 0;

  let alumnoA = await ingresar(A, anaA);
  assert.equal(alumnoA.actividades['Formo sílabas'].Bloqueada, true);
  await hacerActividad(alumnoA, 'Reconozco las letras');
  const ana = await esperar('Ana con 1 actividad en el servidor central', async () => {
    const e = await enCentral('Ana Soto');
    return e && e.Completadas === 1 && e;
  });
  assert.ok(ana.UltimaRecepcion, 'el panel indica cuándo se recibió el último avance');
  assert.equal(ana.Equipos, 'PC-A');
  console.log('✓ Con internet, los avances llegan al servidor central y el panel muestra la fecha de recepción.');

  // ---------- Corte de internet ----------
  red.caida = true;
  alumnoA = await ingresar(A, anaA); // recarga los desbloqueos
  const intentoOffline = await hacerActividad(alumnoA, 'Formo sílabas', { terminar: false });
  const sinRed = await esperar('PC-A detecta que no hay conexión', async () => {
    const e = await estadoSync(A);
    return e.sinConexion && e.pendientes.intentos >= 1 && e;
  });
  assert.match(sinRed.ultimoError, /Sin conexión/);
  // La actividad sigue funcionando sin internet y queda guardada en el computador.
  assert.equal((await alumnoA('POST', `/api/resultados/${intentoOffline}/terminar`, { puntuacion: 100, aciertos: 5, errores: 0, detalleResultado: '{}' })).status, 200);
  r = await A.profe('GET', `/api/profesor/estudiantes/${anaA}/resultados`);
  assert.equal(r.data.resultados.filter(x => x.Estado === 'Completada').length, 2, 'PC-A guarda el avance localmente');
  assert.equal((await enCentral('Ana Soto')).Completadas, 1, 'sin conexión, el reporte central todavía no lo muestra');
  console.log('✓ Sin internet, las actividades siguen funcionando y los avances quedan pendientes en el computador.');

  // Vuelve la conexión: se envía solo, sin que nadie haga nada.
  red.caida = false;
  await esperar('envío automático al volver la conexión', async () => (await enCentral('Ana Soto'))?.Completadas === 2);
  await esperar('PC-A sin pendientes', async () => sinPendientes((await estadoSync(A)).pendientes));
  console.log('✓ Al volver la conexión, los registros pendientes se envían automáticamente.');

  // ---------- Envío repetido: la respuesta del servidor se pierde ----------
  red.cortarSubidas = 1;
  alumnoA = await ingresar(A, anaA);
  await hacerActividad(alumnoA, 'Uno la palabra con su imagen');
  await esperar('el envío se repite tras perder la respuesta', async () => red.subidasCortadas >= 1 && sinPendientes((await estadoSync(A)).pendientes));
  let detalle = await detalleCentral(ana.EstudianteID);
  assert.equal(detalle.resultados.length, 3, 'el envío repetido actualiza el mismo intento, sin duplicarlo');
  assert.equal(new Set(detalle.resultados.map(x => x.ResultadoID)).size, 3);
  assert.equal((await resumenCentral()).filter(e => e.Nombre === 'Ana').length, 1, 'no se duplica el estudiante');
  // Un minijuego en PC-A, para comprobar que las estrellas viajan con el alumno.
  r = await alumnoA('POST', '/api/tablero/minijuego', { minijuego: 'saltarin', origen: 'tablero', duracionSegundos: 40 });
  assert.equal(r.data.ganadas, 3);
  console.log('✓ Un envío repetido por interrupción no crea registros duplicados.');

  // ---------- Cambio de computador ----------
  r = await B.profe('POST', '/api/profesor/sincronizacion/vincular', { codigo: `${urlServidor}/${codigo}`, nombreEquipo: 'PC-B' });
  assert.equal(r.status, 200);
  const anaB = await esperar('Ana aparece en PC-B', async () => {
    const { data } = await cliente(B.base)('GET', '/api/estudiantes');
    return data.estudiantes.find(e => e.Nombre === 'Ana' && e.Apellido === 'Soto')?.EstudianteID;
  });
  const alumnoB = await esperar('PC-B recibe los niveles completados en PC-A', async () => {
    const alumno = await ingresar(B, anaB);
    return alumno.actividades['Encuentro la letra'].Bloqueada === false && alumno;
  });
  assert.equal(alumnoB.actividades['Aprendo las sílabas'].Bloqueada, true);
  await esperar('PC-B recibe las estrellas de PC-A', async () => (await alumnoB('GET', '/api/tablero')).data.estrellas === 3);
  assert.deepEqual((await alumnoB('GET', '/api/tablero')).data.minijuegos, ['saltarin']);
  await hacerActividad(alumnoB, 'Encuentro la letra');
  await esperar('Ana con 4 actividades y los dos equipos', async () => {
    const e = await enCentral('Ana Soto');
    return e?.Completadas === 4 && e.Equipos.split(',').sort().join(',') === 'PC-A,PC-B';
  });
  console.log('✓ Al cambiar de computador, el alumno conserva sus niveles y estrellas; el reporte indica cada equipo.');

  // ---------- Mismo alumno trabajando a la vez en dos computadores ----------
  alumnoA = await ingresar(A, anaA);
  await Promise.all([
    hacerActividad(alumnoA, 'Reconozco las letras', { puntuacion: 60 }),
    hacerActividad(alumnoB, 'Reconozco las letras', { puntuacion: 90 })
  ]);
  await esperar('se conservan los dos intentos simultáneos', async () => (await detalleCentral(ana.EstudianteID)).resultados.length === 6);
  detalle = await detalleCentral(ana.EstudianteID);
  const letras = detalle.resultados.filter(x => x.Actividad === 'Reconozco las letras');
  assert.equal(letras.length, 3);
  assert.deepEqual(letras.map(x => x.Equipo).sort(), ['PC-A', 'PC-A', 'PC-B']);
  await esperar('PC-A recibe los intentos hechos en PC-B', async () => {
    const { data } = await A.profe('GET', `/api/profesor/estudiantes/${anaA}/resultados`);
    return data.resultados.length === 6 && data.resultados.filter(x => x.Equipo === 'PC-B').length === 2;
  });
  console.log('✓ El mismo alumno en dos equipos a la vez: ambos intentos se guardan por separado.');

  // ---------- Mismo alumno creado sin conexión en los dos computadores ----------
  red.caida = true;
  const luisA = (await A.profe('POST', '/api/profesor/estudiantes', { nombre: 'Luis', apellido: 'Rojas' })).data.estudiante.EstudianteID;
  const luisB = (await B.profe('POST', '/api/profesor/estudiantes', { nombre: 'luis', apellido: 'rojas' })).data.estudiante.EstudianteID;
  await hacerActividad(await ingresar(A, luisA), 'Reconozco las letras');
  await hacerActividad(await ingresar(B, luisB), 'Reconozco las letras');
  await pausa(600);
  red.caida = false;
  const luis = await esperar('un único Luis con los dos intentos', async () => {
    const lista = (await resumenCentral()).filter(e => e.Nombre.toLowerCase() === 'luis');
    return lista.length === 1 && lista[0].Completadas === 2 && lista[0];
  });
  const cuentaLuis = async pc => (await cliente(pc.base)('GET', '/api/estudiantes')).data.estudiantes
    .filter(e => e.Nombre.toLowerCase() === 'luis').length;
  await esperar('cada computador ve un solo Luis', async () => (await cuentaLuis(A)) === 1 && (await cuentaLuis(B)) === 1);
  console.log('✓ El mismo alumno creado sin conexión en dos equipos se une en un solo registro.');

  // ---------- Reinicio del servidor central ----------
  await detener(central);
  central = iniciarProceso('central', 'servidor-central/server.js', envCentral);
  await centralListo();
  r = await admin('GET', '/api/panel/resumen');
  assert.equal(r.status, 200, 'la sesión del panel sobrevive al reinicio');
  assert.equal(r.data.estudiantes.find(e => e.Nombre === 'Ana').Completadas, 6);
  const respaldos = fs.readdirSync(path.join(datosCentral, 'respaldos')).filter(n => n.endsWith('.sqlite'));
  assert.ok(respaldos.length >= 1, 'se crea una copia de respaldo');
  // Respaldo manual con los dos computadores vinculados (se restaura al final).
  const salidaRespaldo = require('node:child_process').execFileSync(process.execPath, ['servidor-central/respaldo.js'],
    { cwd: raiz, env: { ...process.env, ...envCentral }, encoding: 'utf8' });
  const respaldoManual = /Respaldo creado: (.+\.sqlite)/.exec(salidaRespaldo)[1].trim();
  assert.ok(fs.existsSync(respaldoManual));
  console.log('✓ Los datos y las sesiones persisten al reiniciar el servidor; hay copia de respaldo.');

  // ---------- Quitar un estudiante se propaga ----------
  const luisEnA = (await cliente(A.base)('GET', '/api/estudiantes')).data.estudiantes.find(e => e.Nombre.toLowerCase() === 'luis').EstudianteID;
  assert.equal((await A.profe('DELETE', `/api/profesor/estudiantes/${luisEnA}`)).status, 200);
  await esperar('Luis se quita del servidor central', async () => !(await resumenCentral()).some(e => e.EstudianteID === luis.EstudianteID));
  await esperar('Luis se quita de PC-B', async () => (await cuentaLuis(B)) === 0);
  console.log('✓ Quitar un estudiante en un computador lo quita del servidor y de los demás equipos.');

  // ---------- Permisos ----------
  assert.equal((await fetch(`${baseCentral}/api/sync/subir`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 401);
  assert.equal((await fetch(`${baseCentral}/api/sync/cambios?desde=0`, { headers: { Authorization: `Bearer ${'x'.repeat(43)}` } })).status, 401);
  assert.equal((await cliente(baseCentral)('GET', '/api/panel/resumen')).status, 401, 'los reportes exigen iniciar sesión');
  assert.equal((await admin('POST', '/api/admin/usuarios', { nombre: 'Rosa', apellido: 'Díaz', usuario: 'rosa', password: 'ClaveProfesora1234', rol: 'profesor' })).status, 201);
  const profesora = cliente(baseCentral);
  assert.equal((await profesora('POST', '/api/panel/login', { usuario: 'rosa', password: 'ClaveProfesora1234' })).status, 200);
  assert.equal((await profesora('GET', '/api/panel/resumen')).status, 200, 'la profesora ve los reportes');
  assert.equal((await profesora('GET', '/api/admin/codigos')).status, 403, 'la profesora no administra');
  const equipos = (await admin('GET', '/api/panel/equipos')).data.equipos;
  const pcB = equipos.find(e => e.Nombre === 'PC-B');
  assert.ok(pcB.UltimoEnvio && pcB.UltimoContacto);
  assert.equal((await admin('POST', `/api/admin/equipos/${pcB.DispositivoID}/revocar`)).status, 200);
  await B.profe('POST', '/api/profesor/sincronizacion/ahora', {});
  assert.match((await estadoSync(B)).ultimoError || '', /autorizado/, 'un equipo revocado deja de sincronizar');
  // Los nombres se guardan cifrados en la base central.
  const { DatabaseSync } = require('node:sqlite');
  const base = new DatabaseSync(path.join(datosCentral, 'central.sqlite'), { readOnly: true });
  assert.ok(base.prepare('SELECT Nombre FROM Estudiantes').all().every(f => f.Nombre.startsWith('v1.') && !f.Nombre.includes('Ana')));
  base.close();
  console.log('✓ Cuentas y permisos: reportes con sesión, administración solo para administradores, equipos revocables, nombres cifrados.');

  // ---------- Restaurar un respaldo ----------
  await detener(central);
  const archivoCentral = path.join(datosCentral, 'central.sqlite');
  for (const extra of ['-wal', '-shm']) fs.rmSync(archivoCentral + extra, { force: true });
  fs.copyFileSync(respaldoManual, archivoCentral);
  central = iniciarProceso('central', 'servidor-central/server.js', envCentral);
  await centralListo();
  // El respaldo es anterior a quitar a Luis: PC-A detecta la restauración, vuelve a leer
  // los cambios desde el principio y recupera a Luis.
  await A.profe('POST', '/api/profesor/sincronizacion/ahora', {});
  await esperar('PC-A vuelve a leer los cambios tras la restauración', async () => (await cuentaLuis(A)) === 1);
  assert.equal((await estadoSync(A)).ultimoError, null);
  // Al volver a vincular el mismo computador, conserva la autoría de sus intentos.
  assert.equal((await admin('POST', '/api/panel/login', { usuario: 'admin', password: 'ClaveAdministrador123' })).status, 200);
  const codigo2 = (await admin('POST', '/api/admin/codigos', { dias: 1 })).data.codigo;
  await A.profe('POST', '/api/profesor/sincronizacion/desvincular', {});
  r = await A.profe('POST', '/api/profesor/sincronizacion/vincular', { codigo: codigo2, nombreEquipo: 'PC-A nuevo' });
  assert.equal(r.status, 200);
  await esperar('PC-A reenvía todo sin duplicar', async () => sinPendientes((await estadoSync(A)).pendientes));
  const anaRestaurada = await enCentral('Ana Soto');
  assert.equal(anaRestaurada.Completadas, 6);
  assert.equal(anaRestaurada.Equipos.split(',').sort().join(','), 'PC-A nuevo,PC-B');
  assert.equal((await detalleCentral(anaRestaurada.EstudianteID)).resultados.length, 6);
  console.log('✓ Restaurar un respaldo: los computadores vuelven a leer los cambios y al revincular no se duplican registros.');

  console.log('OK: sincronización con el servidor central.');
})().catch(error => {
  console.error(error);
  for (const p of procesos) if (p.salida) console.error(`--- ${p.nombre} ---\n${p.salida.slice(-3000)}`);
  process.exitCode = 1;
}).finally(async () => {
  for (const p of [...procesos]) await detener(p);
  await pausa(300);
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* Windows puede tardar en liberar archivos */ }
  process.exit();
});
