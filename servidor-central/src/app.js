// Servidor central de Aprendo a Leer: recibe los avances de todos los computadores y
// ofrece el panel web donde la profesora o el administrador consultan los reportes.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { randomInt } = require('node:crypto');
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const bcrypt = require('bcryptjs');
const { AlmacenSesiones } = require('./sesiones');
const { crearLimitador } = require('./limitador');
const { hashToken } = require('./cifrado');
const { listarRespaldos } = require('./respaldos');
const instalarApiSync = require('./sync-api');

const ahora = () => new Date().toISOString();
const limpiarNombre = valor => (typeof valor === 'string' ? valor.trim().replace(/\s+/g, ' ') : '');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const USUARIO = /^[A-Za-z0-9_.-]{3,50}$/;
// Sin letras ni números que se confundan (O/0, I/1/L).
const ALFABETO_CODIGO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function nuevoCodigo() {
  let codigo = '';
  for (let i = 0; i < 12; i++) codigo += ALFABETO_CODIGO[randomInt(ALFABETO_CODIGO.length)];
  return codigo.match(/.{4}/g).join('-');
}

function crearApp({ db, cifrado, secretoSesion, cookieSegura = true, confiarProxy = false, nombreServidor,
  carpetaFrontend, carpetaRespaldos }) {
  if (!secretoSesion || secretoSesion.length < 32) throw new Error('Configura SESSION_SECRET con al menos 32 caracteres.');
  const app = express();
  app.disable('x-powered-by');
  if (confiarProxy) app.set('trust proxy', confiarProxy);
  app.use(helmet({
    contentSecurityPolicy: { directives: { 'script-src': ["'self'"], 'style-src': ["'self'"], 'img-src': ["'self'", 'data:'], 'font-src': ["'self'"] } },
    crossOriginEmbedderPolicy: false
  }));

  const almacen = new AlmacenSesiones(db);
  app.locals.cerrar = () => almacen.close();

  // La API de los computadores usa su propio token, no la sesión del panel.
  instalarApiSync(app, { db, cifrado, nombreServidor });

  app.use(express.json({ limit: '30kb' }));
  app.use(session({
    name: 'aprendo-central.sid',
    secret: secretoSesion,
    store: almacen,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: { httpOnly: true, sameSite: 'strict', secure: cookieSegura, maxAge: 8 * 60 * 60 * 1000 }
  }));
  app.use('/api', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

  // ---------- Archivos del panel ----------
  app.use(express.static(path.join(__dirname, '..', 'public'), { index: 'index.html' }));
  // Archivos compartidos con la aplicación de los computadores (estilos e informe docente).
  const compartidos = { '/compartido/styles.css': 'styles.css', '/compartido/informe-docente.js': 'informe-docente.js', '/fuentes.css': 'fuentes.css' };
  for (const [ruta, archivo] of Object.entries(compartidos)) {
    app.get(ruta, (_req, res) => res.sendFile(path.join(carpetaFrontend, archivo)));
  }
  app.use('/assets/fuentes', express.static(path.join(carpetaFrontend, 'assets', 'fuentes')));

  app.get('/api/health', (_req, res) => {
    try { res.json({ ok: db.prepare('SELECT 1 AS ok').get().ok === 1 }); } catch { res.status(500).json({ ok: false }); }
  });

  // ---------- Cuentas y permisos ----------
  const usuarioActivo = id => db.prepare('SELECT UsuarioID, Nombre, Apellido, Usuario, Rol FROM Usuarios WHERE UsuarioID = ? AND Activo = 1').get(id);
  function requireUsuario(req, res, next) {
    const usuario = req.session.usuarioId && usuarioActivo(req.session.usuarioId);
    if (!usuario) return res.status(401).json({ error: 'Inicia sesión para ver los reportes.' });
    req.usuario = usuario;
    next();
  }
  function requireAdmin(req, res, next) {
    requireUsuario(req, res, () => {
      if (req.usuario.Rol !== 'admin') return res.status(403).json({ error: 'Esta acción es solo para administradores.' });
      next();
    });
  }

  const limiteLogin = crearLimitador({ maximo: 5, bloqueoMs: 60 * 1000 });
  app.post('/api/panel/login', async (req, res) => {
    const usuario = typeof req.body?.usuario === 'string' ? req.body.usuario.trim() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!usuario || !password || password.length > 128) return res.status(400).json({ error: 'Ingresa usuario y contraseña.' });
    const clave = `${req.ip}|${usuario.toLowerCase()}`;
    const espera = limiteLogin.espera(clave);
    if (espera) return res.status(429).set('Retry-After', String(espera)).json({ error: `Demasiados intentos. Espera ${espera} segundos.`, retryAfter: espera });
    try {
      const fila = db.prepare('SELECT UsuarioID, Nombre, Apellido, Rol, PasswordHash FROM Usuarios WHERE Usuario = ? AND Activo = 1').get(usuario);
      if (!fila || !(await bcrypt.compare(password, fila.PasswordHash))) {
        const quedan = limiteLogin.fallo(clave);
        if (!quedan) return res.status(429).json({ error: `Demasiados intentos. Espera ${limiteLogin.segundosBloqueo} segundos.`, retryAfter: limiteLogin.segundosBloqueo });
        return res.status(401).json({ error: 'Usuario o contraseña incorrectos.', intentosRestantes: quedan });
      }
      limiteLogin.exito(clave);
      req.session.regenerate(error => {
        if (error) return res.status(500).json({ error: 'No se pudo iniciar sesión.' });
        req.session.usuarioId = fila.UsuarioID;
        db.prepare('UPDATE Usuarios SET UltimoAcceso = ? WHERE UsuarioID = ?').run(ahora(), fila.UsuarioID);
        res.json({ nombre: `${fila.Nombre} ${fila.Apellido}`, rol: fila.Rol });
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'No se pudo iniciar sesión.' });
    }
  });

  app.post('/api/panel/logout', (req, res) => {
    req.session.destroy(() => res.clearCookie('aprendo-central.sid').json({ ok: true }));
  });

  app.get('/api/panel/me', requireUsuario, (req, res) => {
    res.json({ nombre: `${req.usuario.Nombre} ${req.usuario.Apellido}`, usuario: req.usuario.Usuario, rol: req.usuario.Rol, nombreServidor });
  });

  app.post('/api/panel/clave', requireUsuario, async (req, res) => {
    const actual = typeof req.body?.actual === 'string' ? req.body.actual : '';
    const nueva = typeof req.body?.nueva === 'string' ? req.body.nueva : '';
    if (nueva.length < 12 || nueva.length > 128) return res.status(400).json({ error: 'La nueva contraseña debe tener entre 12 y 128 caracteres.' });
    const fila = db.prepare('SELECT PasswordHash FROM Usuarios WHERE UsuarioID = ?').get(req.usuario.UsuarioID);
    if (!(await bcrypt.compare(actual, fila.PasswordHash))) return res.status(403).json({ error: 'La contraseña actual no es correcta.' });
    db.prepare('UPDATE Usuarios SET PasswordHash = ? WHERE UsuarioID = ?').run(await bcrypt.hash(nueva, 12), req.usuario.UsuarioID);
    // Cierra las demás sesiones de esta cuenta.
    for (const s of db.prepare('SELECT SID, Datos FROM Sesiones').all()) {
      try { if (JSON.parse(s.Datos).usuarioId === req.usuario.UsuarioID && s.SID !== req.sessionID) db.prepare('DELETE FROM Sesiones WHERE SID = ?').run(s.SID); } catch { /* sesión ilegible */ }
    }
    res.json({ ok: true });
  });

  // ---------- Reportes ----------
  const descifrarEstudiante = e => ({ ...e, Nombre: cifrado.descifrar(e.Nombre, 'nombre'), Apellido: cifrado.descifrar(e.Apellido, 'apellido') });

  app.get('/api/panel/resumen', requireUsuario, (_req, res) => {
    try {
      const estudiantes = db.prepare(`SELECT E.EstudianteUUID AS EstudianteID, E.Nombre, E.Apellido,
          SUM(CASE WHEN I.Estado = 'Completada' THEN 1 ELSE 0 END) AS Completadas,
          AVG(CASE WHEN I.Estado = 'Completada' THEN I.Puntuacion END) AS Promedio,
          MAX(I.FechaInicio) AS UltimaVez,
          MAX(COALESCE(MAX(I.FechaRecepcion), ''), E.FechaRecepcion,
            COALESCE((SELECT MAX(M.FechaRecepcion) FROM Minijuegos M WHERE M.EstudianteUUID = E.EstudianteUUID), '')) AS UltimaRecepcion,
          GROUP_CONCAT(DISTINCT D.Nombre) AS Equipos
        FROM Estudiantes E
        LEFT JOIN Intentos I ON I.EstudianteUUID = E.EstudianteUUID
        LEFT JOIN Dispositivos D ON D.DispositivoID = I.DispositivoID
        WHERE E.Activo = 1
        GROUP BY E.EstudianteUUID`).all()
        .map(descifrarEstudiante)
        .sort((a, b) => `${a.Nombre} ${a.Apellido}`.localeCompare(`${b.Nombre} ${b.Apellido}`, 'es'));
      const equipos = db.prepare(`SELECT Nombre, UltimoContacto, UltimoEnvio FROM Dispositivos WHERE Activo = 1 ORDER BY Nombre`).all();
      res.json({ estudiantes, equipos, ahora: ahora() });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'No se pudo cargar el resumen de estudiantes.' });
    }
  });

  app.get('/api/panel/estudiantes/:uuid', requireUsuario, (req, res) => {
    if (!UUID.test(req.params.uuid)) return res.status(400).json({ error: 'Estudiante no válido.' });
    try {
      const fila = db.prepare(`SELECT EstudianteUUID AS EstudianteID, Nombre, Apellido, FechaRecepcion
        FROM Estudiantes WHERE EstudianteUUID = ? AND Activo = 1`).get(req.params.uuid);
      if (!fila) return res.status(404).json({ error: 'No se encontró este estudiante.' });
      const estudiante = descifrarEstudiante(fila);
      const resultados = db.prepare(`SELECT I.IntentoUUID AS ResultadoID, I.Actividad, I.FechaInicio, I.FechaTermino,
          I.DuracionSegundos, I.Puntuacion, I.Aciertos, I.Errores, I.Estado, I.DetalleResultado, I.Avance,
          I.FechaRecepcion, D.Nombre AS Equipo
        FROM Intentos I JOIN Dispositivos D ON D.DispositivoID = I.DispositivoID
        WHERE I.EstudianteUUID = ? ORDER BY I.FechaInicio DESC LIMIT 300`).all(req.params.uuid)
        .map(({ DetalleResultado, Avance, ...r }) => {
          let detalle = null;
          let avance = null;
          try { detalle = DetalleResultado ? JSON.parse(DetalleResultado) : null; } catch { /* detalle ilegible */ }
          try {
            const a = Avance ? JSON.parse(Avance) : null;
            if (a) avance = { PreguntaActual: a.preguntaActual, TotalPreguntas: a.totalPreguntas, Completadas: a.completadas,
              Consigna: a.consigna, RespuestaActual: a.respuestaActual, Pausada: a.pausada, FechaActualizacion: a.fechaActualizacion };
          } catch { /* avance ilegible */ }
          return { ...r, detalle, avance };
        });
      const minijuegos = db.prepare(`SELECT COUNT(*) AS Jugados, COALESCE(SUM(Estrellas), 0) AS Estrellas,
        MAX(FechaRecepcion) AS UltimaRecepcion FROM Minijuegos WHERE EstudianteUUID = ?`).get(req.params.uuid);
      const ultimaRecepcion = [estudiante.FechaRecepcion, minijuegos.UltimaRecepcion, ...resultados.map(r => r.FechaRecepcion)]
        .filter(Boolean).sort().at(-1) || null;
      res.json({ estudiante, resultados, audios: [], minijuegos, ultimaRecepcion });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'No se pudieron consultar los resultados del estudiante.' });
    }
  });

  app.get('/api/panel/equipos', requireUsuario, (_req, res) => {
    res.json({
      equipos: db.prepare(`SELECT DispositivoID, Nombre, FechaVinculo, UltimoContacto, UltimoEnvio, VersionApp, Activo
        FROM Dispositivos ORDER BY Activo DESC, Nombre`).all(),
      ahora: ahora()
    });
  });

  // ---------- Administración ----------
  app.post('/api/admin/equipos/:id/revocar', requireAdmin, (req, res) => {
    if (!UUID.test(req.params.id)) return res.status(400).json({ error: 'Equipo no válido.' });
    const r = db.prepare('UPDATE Dispositivos SET Activo = 0 WHERE DispositivoID = ?').run(req.params.id);
    if (!r.changes) return res.status(404).json({ error: 'No se encontró el equipo.' });
    res.json({ ok: true });
  });

  app.get('/api/admin/codigos', requireAdmin, (_req, res) => {
    res.json({
      codigos: db.prepare(`SELECT C.CodigoID, C.Descripcion, C.FechaCreacion, C.Expira, C.Usos, C.Activo,
          U.Usuario AS CreadoPor
        FROM CodigosVinculacion C LEFT JOIN Usuarios U ON U.UsuarioID = C.CreadoPor
        ORDER BY C.FechaCreacion DESC LIMIT 50`).all(),
      ahora: ahora()
    });
  });

  app.post('/api/admin/codigos', requireAdmin, (req, res) => {
    const descripcion = limpiarNombre(req.body?.descripcion).slice(0, 120) || null;
    const dias = Number(req.body?.dias ?? 7);
    if (!Number.isInteger(dias) || dias < 1 || dias > 30) return res.status(400).json({ error: 'La vigencia debe ser de 1 a 30 días.' });
    const codigo = nuevoCodigo();
    const expira = new Date(Date.now() + dias * 24 * 3600 * 1000).toISOString();
    db.prepare('INSERT INTO CodigosVinculacion (CodigoHash, Descripcion, CreadoPor, Expira) VALUES (?, ?, ?, ?)')
      .run(hashToken(codigo.replace(/-/g, '')), descripcion, req.usuario.UsuarioID, expira);
    res.status(201).json({ codigo, expira });
  });

  app.post('/api/admin/codigos/:id/desactivar', requireAdmin, (req, res) => {
    const r = db.prepare('UPDATE CodigosVinculacion SET Activo = 0 WHERE CodigoID = ?').run(Number(req.params.id));
    if (!r.changes) return res.status(404).json({ error: 'No se encontró el código.' });
    res.json({ ok: true });
  });

  app.get('/api/admin/usuarios', requireAdmin, (_req, res) => {
    res.json({ usuarios: db.prepare(`SELECT UsuarioID, Nombre, Apellido, Usuario, Rol, Activo, FechaRegistro, UltimoAcceso
      FROM Usuarios ORDER BY Activo DESC, Nombre, Apellido`).all() });
  });

  app.post('/api/admin/usuarios', requireAdmin, async (req, res) => {
    const nombre = limpiarNombre(req.body?.nombre);
    const apellido = limpiarNombre(req.body?.apellido);
    const usuario = typeof req.body?.usuario === 'string' ? req.body.usuario.trim() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const rol = req.body?.rol === 'admin' ? 'admin' : 'profesor';
    if (!nombre || nombre.length > 80 || !apellido || apellido.length > 80 || !USUARIO.test(usuario)
        || password.length < 12 || password.length > 128) {
      return res.status(400).json({ error: 'Completa nombre, apellido, usuario válido y contraseña de 12 a 128 caracteres.' });
    }
    if (db.prepare('SELECT 1 FROM Usuarios WHERE Usuario = ?').get(usuario)) return res.status(409).json({ error: 'Ese usuario ya existe.' });
    const hash = await bcrypt.hash(password, 12);
    const r = db.prepare('INSERT INTO Usuarios (Nombre, Apellido, Usuario, PasswordHash, Rol) VALUES (?, ?, ?, ?, ?)')
      .run(nombre, apellido, usuario, hash, rol);
    res.status(201).json({ usuario: { UsuarioID: Number(r.lastInsertRowid), Usuario: usuario, Rol: rol } });
  });

  app.post('/api/admin/usuarios/:id/activo', requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    const activo = req.body?.activo === true;
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Usuario no válido.' });
    if (id === req.usuario.UsuarioID && !activo) return res.status(400).json({ error: 'No puedes desactivar tu propia cuenta.' });
    const r = db.prepare('UPDATE Usuarios SET Activo = ? WHERE UsuarioID = ?').run(activo ? 1 : 0, id);
    if (!r.changes) return res.status(404).json({ error: 'No se encontró el usuario.' });
    if (!activo) {
      for (const s of db.prepare('SELECT SID, Datos FROM Sesiones').all()) {
        try { if (JSON.parse(s.Datos).usuarioId === id) db.prepare('DELETE FROM Sesiones WHERE SID = ?').run(s.SID); } catch { /* sesión ilegible */ }
      }
    }
    res.json({ ok: true });
  });

  app.get('/api/admin/respaldos', requireAdmin, (_req, res) => {
    res.json({ carpeta: carpetaRespaldos, respaldos: listarRespaldos(carpetaRespaldos).slice(-14).reverse()
      .map(r => ({ nombre: r.nombre, fecha: r.fecha.toISOString(), tamano: fs.statSync(r.ruta).size })) });
  });

  app.use('/api', (_req, res) => res.status(404).json({ error: 'Ruta no encontrada.' }));
  app.use((error, _req, res, _next) => {
    if (error.type === 'entity.too.large') return res.status(413).json({ error: 'El envío es demasiado grande.' });
    if (error.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON no válido.' });
    console.error(error);
    res.status(500).json({ error: 'Error interno del servidor.' });
  });
  return app;
}

// Crea la primera cuenta de administrador (desde el script o desde variables de entorno).
async function crearAdministrador(db, { usuario, password, nombre = 'Administrador', apellido = 'Escuela' }) {
  if (!USUARIO.test(usuario || '')) throw new Error('El usuario debe tener 3 a 50 letras sin tildes, números, punto o guion.');
  if (typeof password !== 'string' || password.length < 12 || password.length > 128) throw new Error('La contraseña debe tener entre 12 y 128 caracteres.');
  if (db.prepare('SELECT 1 FROM Usuarios WHERE Usuario = ?').get(usuario)) throw new Error('Ese usuario ya existe.');
  const hash = await bcrypt.hash(password, 12);
  db.prepare("INSERT INTO Usuarios (Nombre, Apellido, Usuario, PasswordHash, Rol) VALUES (?, ?, ?, ?, 'admin')")
    .run(limpiarNombre(nombre) || 'Administrador', limpiarNombre(apellido) || 'Escuela', usuario, hash);
}

module.exports = { crearApp, crearAdministrador, nuevoCodigo };
