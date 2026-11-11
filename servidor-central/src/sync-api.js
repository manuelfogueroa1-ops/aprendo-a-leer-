// API que usan los computadores de la escuela para enviar y recibir registros.
//
// Garantías:
// - Idempotente: cada estudiante, intento y minijuego llega con su UUID. Repetir un envío
//   (por un corte a mitad de camino) actualiza el mismo registro y nunca crea otro.
// - Un intento solo lo modifica el computador que lo creó, y nunca retrocede de versión
//   ni vuelve de «Completada» a «En progreso».
// - Mismo alumno creado en dos computadores sin conexión (igual nombre y apellido):
//   se une al registro existente y se informa el UUID definitivo al computador.
'use strict';
const express = require('express');
const { randomBytes, randomUUID } = require('node:crypto');
const { hashToken } = require('./cifrado');
const { crearLimitador } = require('./limitador');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FECHA = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const ESTADOS = ['En progreso', 'Completada', 'Abandonada'];
const MINIJUEGOS = ['saltarin', 'mitades', 'lluvia', 'memoria'];
const ORIGENES = ['tablero', 'premio'];
const ahora = () => new Date().toISOString();
const texto = (valor, max) => typeof valor === 'string' && valor.length <= max;
const entero = (valor, min, max) => Number.isInteger(valor) && valor >= min && valor <= max;
const enteroONulo = (valor, min, max) => valor === null || valor === undefined || entero(valor, min, max);
const limpiarNombre = valor => (typeof valor === 'string' ? valor.trim().replace(/\s+/g, ' ') : '');

function estudianteValido(e) {
  return e && UUID.test(e.uuid || '') && entero(e.version, 1, Number.MAX_SAFE_INTEGER)
    && limpiarNombre(e.nombre).length >= 1 && limpiarNombre(e.nombre).length <= 80
    && limpiarNombre(e.apellido).length >= 1 && limpiarNombre(e.apellido).length <= 80
    && FECHA.test(e.actualizadoEn || '')
    && enteroONulo(e.colorFavorito, 0, 359)
    && (e.temaInteres == null || texto(e.temaInteres, 30))
    && (e.buhoColor == null || texto(e.buhoColor, 30))
    && (e.buhoAccesorio == null || texto(e.buhoAccesorio, 30));
}

function avanceValido(a) {
  if (a === null || a === undefined) return true;
  return entero(a.totalPreguntas, 1, 1000) && entero(a.preguntaActual, 1, a.totalPreguntas)
    && entero(a.completadas, 0, a.totalPreguntas) && texto(a.consigna, 300) && texto(a.respuestaActual, 300)
    && typeof a.pausada === 'boolean' && entero(a.revision, 1, Number.MAX_SAFE_INTEGER) && FECHA.test(a.fechaActualizacion || '');
}

function intentoValido(i) {
  return i && UUID.test(i.uuid || '') && UUID.test(i.estudianteUuid || '') && entero(i.version, 1, Number.MAX_SAFE_INTEGER)
    && texto(i.actividad, 150) && i.actividad.trim() && ESTADOS.includes(i.estado) && FECHA.test(i.fechaInicio || '')
    && (i.fechaTermino == null || FECHA.test(i.fechaTermino))
    && enteroONulo(i.duracionSegundos, 0, 10 * 24 * 3600)
    && (i.puntuacion == null || (Number.isFinite(i.puntuacion) && i.puntuacion >= 0 && i.puntuacion <= 100))
    && enteroONulo(i.aciertos, 0, 100000) && enteroONulo(i.errores, 0, 100000)
    && (i.detalleResultado == null || texto(i.detalleResultado, 4000))
    && avanceValido(i.avance);
}

function minijuegoValido(m) {
  return m && UUID.test(m.uuid || '') && UUID.test(m.estudianteUuid || '') && MINIJUEGOS.includes(m.minijuego)
    && ORIGENES.includes(m.origen) && entero(m.duracionSegundos, 0, 3600) && entero(m.estrellas, 0, 3)
    && FECHA.test(m.fecha || '')
    && entero(m.version, 1, Number.MAX_SAFE_INTEGER);
}

module.exports = function instalarApiSync(app, { db, cifrado, nombreServidor }) {
  const limiteVinculo = crearLimitador({ maximo: 10, bloqueoMs: 15 * 60 * 1000 });
  const enTransaccion = fn => {
    db.exec('BEGIN IMMEDIATE');
    try { const r = fn(); db.exec('COMMIT'); return r; } catch (error) { db.exec('ROLLBACK'); throw error; }
  };
  const registrarCambio = (tipo, uuid, dispositivoId) =>
    db.prepare('INSERT OR REPLACE INTO Cambios (Tipo, UUID, DispositivoID) VALUES (?, ?, ?)').run(tipo, uuid, dispositivoId);
  const fueEliminado = uuid => Boolean(db.prepare("SELECT 1 FROM Eliminados WHERE Tipo = 'estudiante' AND UUID = ?").get(uuid));
  const resolverEstudiante = uuid => {
    if (db.prepare('SELECT 1 FROM Estudiantes WHERE EstudianteUUID = ?').get(uuid)) return uuid;
    return db.prepare('SELECT CanonicoUUID FROM AliasEstudiantes WHERE UUID = ?').get(uuid)?.CanonicoUUID || null;
  };

  function datosEstudiante(uuid) {
    const e = db.prepare(`SELECT EstudianteUUID, Nombre, Apellido, Activo, ColorFavorito, TemaInteres, ModoOscuro,
      BuhoColor, BuhoAccesorio, ActualizadoEn FROM Estudiantes WHERE EstudianteUUID = ?`).get(uuid);
    if (!e) return null;
    return {
      uuid: e.EstudianteUUID,
      nombre: cifrado.descifrar(e.Nombre, 'nombre'),
      apellido: cifrado.descifrar(e.Apellido, 'apellido'),
      activo: e.Activo === 1,
      colorFavorito: e.ColorFavorito,
      temaInteres: e.TemaInteres,
      modoOscuro: e.ModoOscuro === 1,
      buhoColor: e.BuhoColor,
      buhoAccesorio: e.BuhoAccesorio,
      actualizadoEn: e.ActualizadoEn
    };
  }

  function datosIntento(uuid) {
    const i = db.prepare(`SELECT I.*, D.Nombre AS Equipo FROM Intentos I
      JOIN Dispositivos D ON D.DispositivoID = I.DispositivoID WHERE I.IntentoUUID = ?`).get(uuid);
    if (!i) return null;
    let avance = null;
    try { avance = i.Avance ? JSON.parse(i.Avance) : null; } catch { /* avance ilegible */ }
    return {
      uuid: i.IntentoUUID, estudianteUuid: i.EstudianteUUID, estudiante: datosEstudiante(i.EstudianteUUID),
      actividad: i.Actividad, fechaInicio: i.FechaInicio, fechaTermino: i.FechaTermino,
      duracionSegundos: i.DuracionSegundos, puntuacion: i.Puntuacion, aciertos: i.Aciertos, errores: i.Errores,
      estado: i.Estado, detalleResultado: i.DetalleResultado, avance, version: i.Version, equipo: i.Equipo
    };
  }

  function datosMinijuego(uuid) {
    const m = db.prepare(`SELECT M.*, D.Nombre AS Equipo FROM Minijuegos M
      JOIN Dispositivos D ON D.DispositivoID = M.DispositivoID WHERE M.MinijuegoUUID = ?`).get(uuid);
    if (!m) return null;
    return {
      uuid: m.MinijuegoUUID, estudianteUuid: m.EstudianteUUID, estudiante: datosEstudiante(m.EstudianteUUID),
      minijuego: m.Minijuego, origen: m.Origen, duracionSegundos: m.DuracionSegundos, estrellas: m.Estrellas,
      fecha: m.Fecha, equipo: m.Equipo
    };
  }

  // ---------- Autorización de cada computador ----------
  function requireDispositivo(req, res, next) {
    const coincidencia = /^Bearer ([A-Za-z0-9_-]{20,200})$/.exec(req.get('authorization') || '');
    if (!coincidencia) return res.status(401).json({ error: 'Falta la autorización de este computador.' });
    const dispositivo = db.prepare('SELECT DispositivoID, Nombre FROM Dispositivos WHERE TokenHash = ? AND Activo = 1')
      .get(hashToken(coincidencia[1]));
    if (!dispositivo) return res.status(401).json({ error: 'Este computador ya no está autorizado. Pide un nuevo código al administrador.' });
    db.prepare('UPDATE Dispositivos SET UltimoContacto = ? WHERE DispositivoID = ?').run(ahora(), dispositivo.DispositivoID);
    req.dispositivo = dispositivo;
    next();
  }

  const jsonGrande = express.json({ limit: '3mb' });

  // ---------- Vinculación: canjea un código entregado por el administrador ----------
  app.post('/api/sync/vincular', jsonGrande, (req, res) => {
    const clave = `vinculo|${req.ip}`;
    const espera = limiteVinculo.espera(clave);
    if (espera) return res.status(429).set('Retry-After', String(espera)).json({ error: `Demasiados intentos. Espera ${Math.ceil(espera / 60)} minutos.` });
    const codigo = String(req.body?.codigo || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const nombre = limpiarNombre(req.body?.nombreEquipo).slice(0, 80) || 'Computador';
    const versionApp = texto(req.body?.versionApp, 30) ? req.body.versionApp : null;
    try {
      const resultado = enTransaccion(() => {
        const fila = codigo.length >= 8 && db.prepare(`SELECT CodigoID FROM CodigosVinculacion
          WHERE CodigoHash = ? AND Activo = 1 AND Expira > ?`).get(hashToken(codigo), ahora());
        if (!fila) return null;
        const token = randomBytes(32).toString('base64url');
        const dispositivoId = randomUUID();
        db.prepare(`INSERT INTO Dispositivos (DispositivoID, Nombre, TokenHash, CodigoID, VersionApp, UltimoContacto)
          VALUES (?, ?, ?, ?, ?, ?)`).run(dispositivoId, nombre, hashToken(token), fila.CodigoID, versionApp, ahora());
        db.prepare('UPDATE CodigosVinculacion SET Usos = Usos + 1 WHERE CodigoID = ?').run(fila.CodigoID);
        // Mismo computador que se vuelve a vincular: conserva la autoría de sus intentos.
        const anterior = /^[A-Za-z0-9_-]{20,200}$/.test(req.body?.tokenAnterior || '')
          && db.prepare('SELECT DispositivoID FROM Dispositivos WHERE TokenHash = ?').get(hashToken(req.body.tokenAnterior));
        if (anterior) {
          for (const tabla of ['Intentos', 'Minijuegos', 'Estudiantes']) {
            db.prepare(`UPDATE ${tabla} SET DispositivoID = ? WHERE DispositivoID = ?`).run(dispositivoId, anterior.DispositivoID);
          }
          db.prepare('UPDATE Dispositivos SET Activo = 0 WHERE DispositivoID = ?').run(anterior.DispositivoID);
        }
        return { dispositivoId, token };
      });
      if (!resultado) {
        limiteVinculo.fallo(clave);
        return res.status(403).json({ error: 'El código de vinculación no es válido o ya venció. Pide uno nuevo al administrador.' });
      }
      limiteVinculo.exito(clave);
      res.status(201).json({ ...resultado, nombreServidor });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'No se pudo vincular el computador.' });
    }
  });

  // ---------- Envío de registros pendientes ----------
  app.post('/api/sync/subir', requireDispositivo, jsonGrande, (req, res) => {
    const cuerpo = req.body || {};
    const listas = ['estudiantes', 'intentos', 'minijuegos', 'eliminaciones'];
    if (listas.some(nombre => cuerpo[nombre] !== undefined && (!Array.isArray(cuerpo[nombre]) || cuerpo[nombre].length > 500))) {
      return res.status(400).json({ error: 'Paquete de sincronización no válido.' });
    }
    const dispositivoId = req.dispositivo.DispositivoID;
    const recibido = ahora();
    try {
      const respuesta = enTransaccion(() => {
        const r = { estudiantes: [], intentos: [], minijuegos: [], eliminaciones: [] };
        let hayDatos = false;

        for (const e of cuerpo.estudiantes || []) {
          if (!estudianteValido(e)) { r.estudiantes.push({ uuid: e?.uuid, version: e?.version, invalido: true }); continue; }
          if (fueEliminado(e.uuid)) { r.estudiantes.push({ uuid: e.uuid, version: e.version, eliminado: true }); continue; }
          const nombre = limpiarNombre(e.nombre);
          const apellido = limpiarNombre(e.apellido);
          const claveNombre = cifrado.claveNombre(nombre, apellido);
          let canonico = resolverEstudiante(e.uuid);
          if (!canonico) {
            const mismo = db.prepare('SELECT EstudianteUUID FROM Estudiantes WHERE ClaveNombre = ? ORDER BY FechaRecepcion LIMIT 1').get(claveNombre);
            if (mismo) {
              db.prepare('INSERT OR REPLACE INTO AliasEstudiantes (UUID, CanonicoUUID) VALUES (?, ?)').run(e.uuid, mismo.EstudianteUUID);
              canonico = mismo.EstudianteUUID;
            }
          }
          const valores = [cifrado.cifrar(nombre, 'nombre'), cifrado.cifrar(apellido, 'apellido'), claveNombre,
            e.activo === false ? 0 : 1, e.colorFavorito ?? null, e.temaInteres ?? null, e.modoOscuro ? 1 : 0,
            e.buhoColor ?? null, e.buhoAccesorio ?? null, e.actualizadoEn, dispositivoId, recibido];
          if (!canonico) {
            db.prepare(`INSERT INTO Estudiantes (Nombre, Apellido, ClaveNombre, Activo, ColorFavorito, TemaInteres, ModoOscuro,
                BuhoColor, BuhoAccesorio, ActualizadoEn, DispositivoID, FechaRecepcion, EstudianteUUID)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(...valores, e.uuid);
            registrarCambio('estudiante', e.uuid, dispositivoId);
            canonico = e.uuid;
            hayDatos = true;
          } else {
            // Preferencias: gana la modificación más reciente.
            const guardado = db.prepare('SELECT ActualizadoEn FROM Estudiantes WHERE EstudianteUUID = ?').get(canonico);
            if (e.actualizadoEn > guardado.ActualizadoEn) {
              db.prepare(`UPDATE Estudiantes SET Nombre = ?, Apellido = ?, ClaveNombre = ?, Activo = ?, ColorFavorito = ?,
                  TemaInteres = ?, ModoOscuro = ?, BuhoColor = ?, BuhoAccesorio = ?, ActualizadoEn = ?, DispositivoID = ?,
                  FechaRecepcion = ? WHERE EstudianteUUID = ?`).run(...valores, canonico);
              registrarCambio('estudiante', canonico, dispositivoId);
              hayDatos = true;
            }
          }
          r.estudiantes.push(canonico === e.uuid
            ? { uuid: e.uuid, version: e.version }
            : { uuid: e.uuid, version: e.version, canonico, datos: datosEstudiante(canonico) });
        }

        for (const i of cuerpo.intentos || []) {
          if (!intentoValido(i)) { r.intentos.push({ uuid: i?.uuid, version: i?.version, invalido: true }); continue; }
          const estudiante = resolverEstudiante(i.estudianteUuid);
          if (!estudiante) {
            r.intentos.push(fueEliminado(i.estudianteUuid) ? { uuid: i.uuid, version: i.version } : { uuid: i.uuid, reintentar: true });
            continue;
          }
          const existente = db.prepare('SELECT DispositivoID, Version, Estado FROM Intentos WHERE IntentoUUID = ?').get(i.uuid);
          if (existente && existente.DispositivoID !== dispositivoId) {
            r.intentos.push({ uuid: i.uuid, version: i.version, conflicto: 'otro-computador' });
            continue;
          }
          const sinCambios = existente && (i.version <= existente.Version
            || (existente.Estado === 'Completada' && i.estado !== 'Completada'));
          if (!sinCambios) {
            db.prepare(`INSERT INTO Intentos (IntentoUUID, EstudianteUUID, DispositivoID, Actividad, FechaInicio, FechaTermino,
                DuracionSegundos, Puntuacion, Aciertos, Errores, Estado, DetalleResultado, Avance, Version, FechaRecepcion)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(IntentoUUID) DO UPDATE SET EstudianteUUID = excluded.EstudianteUUID,
                FechaInicio = excluded.FechaInicio, FechaTermino = excluded.FechaTermino,
                DuracionSegundos = excluded.DuracionSegundos, Puntuacion = excluded.Puntuacion,
                Aciertos = excluded.Aciertos, Errores = excluded.Errores, Estado = excluded.Estado,
                DetalleResultado = excluded.DetalleResultado, Avance = excluded.Avance, Version = excluded.Version,
                FechaRecepcion = excluded.FechaRecepcion`)
              .run(i.uuid, estudiante, dispositivoId, i.actividad.trim(), i.fechaInicio, i.fechaTermino ?? null,
                i.duracionSegundos ?? null, i.puntuacion ?? null, i.aciertos ?? null, i.errores ?? null, i.estado,
                i.detalleResultado ?? null, i.avance ? JSON.stringify(i.avance) : null, i.version, recibido);
            registrarCambio('intento', i.uuid, dispositivoId);
            hayDatos = true;
          }
          r.intentos.push({ uuid: i.uuid, version: i.version });
        }

        for (const m of cuerpo.minijuegos || []) {
          if (!minijuegoValido(m)) { r.minijuegos.push({ uuid: m?.uuid, version: m?.version, invalido: true }); continue; }
          const estudiante = resolverEstudiante(m.estudianteUuid);
          if (!estudiante) {
            r.minijuegos.push(fueEliminado(m.estudianteUuid) ? { uuid: m.uuid, version: m.version } : { uuid: m.uuid, reintentar: true });
            continue;
          }
          const nuevo = db.prepare(`INSERT OR IGNORE INTO Minijuegos (MinijuegoUUID, EstudianteUUID, DispositivoID, Minijuego,
              Origen, DuracionSegundos, Estrellas, Fecha, FechaRecepcion) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
            .run(m.uuid, estudiante, dispositivoId, m.minijuego, m.origen, m.duracionSegundos, m.estrellas, m.fecha, recibido);
          if (nuevo.changes) { registrarCambio('minijuego', m.uuid, dispositivoId); hayDatos = true; }
          r.minijuegos.push({ uuid: m.uuid, version: m.version });
        }

        for (const x of cuerpo.eliminaciones || []) {
          if (x?.tipo !== 'estudiante' || !UUID.test(x.uuid || '')) continue;
          const canonico = resolverEstudiante(x.uuid);
          db.prepare("INSERT OR IGNORE INTO Eliminados (Tipo, UUID) VALUES ('estudiante', ?)").run(x.uuid);
          if (canonico) {
            db.prepare(`INSERT OR IGNORE INTO Eliminados (Tipo, UUID)
              SELECT 'estudiante', UUID FROM AliasEstudiantes WHERE CanonicoUUID = ?
              UNION SELECT 'estudiante', ?`).run(canonico, canonico);
            db.prepare(`DELETE FROM Cambios WHERE (Tipo = 'intento' AND UUID IN (SELECT IntentoUUID FROM Intentos WHERE EstudianteUUID = ?))
              OR (Tipo = 'minijuego' AND UUID IN (SELECT MinijuegoUUID FROM Minijuegos WHERE EstudianteUUID = ?))`).run(canonico, canonico);
            db.prepare('DELETE FROM Estudiantes WHERE EstudianteUUID = ?').run(canonico);
            registrarCambio('estudiante', canonico, dispositivoId);
            hayDatos = true;
          }
          r.eliminaciones.push({ tipo: 'estudiante', uuid: x.uuid });
        }

        if (hayDatos) db.prepare('UPDATE Dispositivos SET UltimoEnvio = ? WHERE DispositivoID = ?').run(recibido, dispositivoId);
        return r;
      });
      res.json(respuesta);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'El servidor central no pudo guardar el envío. Se reintentará.' });
    }
  });

  // ---------- Cambios hechos por otros computadores ----------
  app.get('/api/sync/cambios', requireDispositivo, (req, res) => {
    const desde = Number(req.query.desde || 0);
    if (!Number.isSafeInteger(desde) || desde < 0) return res.status(400).json({ error: 'Cursor no válido.' });
    const LIMITE = 300;
    try {
      // Si el computador va más adelante que el servidor (se restauró un respaldo), debe
      // volver a leer desde el principio para no saltarse cambios.
      const ultimo = Number(db.prepare("SELECT seq FROM sqlite_sequence WHERE name = 'Cambios'").get()?.seq || 0);
      if (desde > ultimo) return res.set('Cache-Control', 'no-store').json({ cambios: [], hasta: 0, hayMas: true, reiniciar: true });
      const filas = db.prepare('SELECT Seq, Tipo, UUID, DispositivoID FROM Cambios WHERE Seq > ? ORDER BY Seq LIMIT ?').all(desde, LIMITE);
      const cambios = [];
      for (const fila of filas) {
        if (fila.DispositivoID === req.dispositivo.DispositivoID) continue;
        const datos = fila.Tipo === 'estudiante' ? datosEstudiante(fila.UUID)
          : fila.Tipo === 'intento' ? datosIntento(fila.UUID) : datosMinijuego(fila.UUID);
        if (!datos && fila.Tipo !== 'estudiante') continue;
        cambios.push({ seq: fila.Seq, tipo: fila.Tipo, uuid: fila.UUID, datos });
      }
      res.set('Cache-Control', 'no-store').json({ cambios, hasta: filas.at(-1)?.Seq ?? desde, hayMas: filas.length === LIMITE });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'No se pudieron consultar los cambios.' });
    }
  });
};
