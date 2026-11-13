// Sincronización con el servidor central.
//
// Todo se guarda primero en la base local (SQLite). Este módulo envía en segundo plano
// lo que está pendiente y trae lo que otros computadores enviaron. Si no hay internet,
// los registros quedan pendientes y se reintenta automáticamente; el alumno no hace nada.
//
// - Cada estudiante, intento y minijuego tiene un UUID. El servidor los guarda por ese
//   identificador, así que reenviar el mismo registro actualiza el mismo intento.
// - Un registro está pendiente cuando SyncVersion > SyncEnviada. Al confirmar el servidor,
//   SyncEnviada toma la versión enviada; si mientras tanto hubo otro cambio, sigue pendiente.
'use strict';
const os = require('node:os');
const tls = require('node:tls');
const { encryptStudentName, decryptStudentName } = require('./student-name-crypto');

// Para los servidores del colegio, usa también las autoridades que el encargado
// de informática haya instalado como confiables en Windows.
if (process.platform === 'win32' && tls.setDefaultCACertificates) {
  tls.setDefaultCACertificates([...tls.getCACertificates(), ...tls.getCACertificates('system')]);
}

const INTERVALO_NORMAL_MS = Number(process.env.SYNC_INTERVALO_MS) || 60 * 1000;
const REINTENTO_INICIAL_MS = Number(process.env.SYNC_REINTENTO_MS) || 5 * 1000;
const REINTENTO_MAXIMO_MS = Number(process.env.SYNC_REINTENTO_MAX_MS) || 60 * 1000;
const ESPERA_TRAS_CAMBIO_MS = Number(process.env.SYNC_ESPERA_CAMBIO_MS) || 2000;
const TIEMPO_LIMITE_MS = 20 * 1000;
const LOTE = { estudiantes: 100, intentos: 40, minijuegos: 200, eliminaciones: 100 };
const UUID_VALIDO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ahora = () => new Date().toISOString();

// Solo se acepta HTTPS. HTTP se permite únicamente hacia este mismo computador (pruebas).
function normalizarServidor(texto) {
  const valor = String(texto || '').trim();
  if (!valor) throw new Error('Escribe la dirección del servidor central.');
  const conEsquema = /^[a-z][a-z0-9+.-]*:\/\//i.test(valor);
  const esLocal = u => ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
  let url;
  try {
    url = new URL(conEsquema ? valor : `https://${valor}`);
    // Sin «https://» escrito, un servidor de este mismo computador se asume sin cifrado (solo pruebas).
    if (!conEsquema && esLocal(url)) url = new URL(`http://${valor}`);
  } catch {
    throw new Error('La dirección del servidor central no es válida.');
  }
  const local = esLocal(url);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) {
    throw new Error('El servidor central debe usar una conexión segura (https://).');
  }
  if (url.username || url.password || url.search || url.hash) throw new Error('Escribe solo la dirección del servidor central.');
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
}

// El administrador entrega un solo texto: «dirección/CÓDIGO» (por ejemplo
// aprendo.miescuela.cl/ABCD-EFGH-JKLM). También se acepta solo el código.
function separarConexion(texto) {
  const valor = String(texto || '').trim();
  const corte = valor.lastIndexOf('/');
  return {
    servidor: corte === -1 ? '' : valor.slice(0, corte).trim(),
    codigo: (corte === -1 ? valor : valor.slice(corte + 1)).trim()
  };
}

module.exports = function crearSincronizacion(db, { versionApp = '' } = {}) {
  const leer = clave => db.prepare('SELECT Valor FROM SyncEstado WHERE Clave = ?').get(clave)?.Valor ?? null;
  const escribir = (clave, valor) => {
    if (valor === null || valor === undefined) db.prepare('DELETE FROM SyncEstado WHERE Clave = ?').run(clave);
    else db.prepare(`INSERT INTO SyncEstado (Clave, Valor) VALUES (?, ?)
      ON CONFLICT(Clave) DO UPDATE SET Valor = excluded.Valor`).run(clave, String(valor));
  };
  const enTransaccion = fn => {
    db.exec('BEGIN IMMEDIATE');
    try { const r = fn(); db.exec('COMMIT'); return r; } catch (error) { db.exec('ROLLBACK'); throw error; }
  };

  function configuracion() {
    const servidor = leer('servidor');
    const tokenCifrado = leer('token');
    if (!servidor || !tokenCifrado) return null;
    return {
      servidor,
      token: decryptStudentName(tokenCifrado, 'sync-token'),
      dispositivoId: leer('dispositivoId'),
      nombreEquipo: leer('nombreEquipo')
    };
  }

  // ---------- Estado en memoria (para el panel docente) ----------
  const estado = { sincronizando: false, ultimoIntento: null, ultimoError: null, fallosSeguidos: 0, proximoIntento: null };
  let activo = false;
  let temporizador = null;
  let enCurso = null;
  let cambioDuranteEnvio = false;

  function programar(ms) {
    clearTimeout(temporizador);
    temporizador = null;
    estado.proximoIntento = null;
    if (!activo || !configuracion()) return;
    estado.proximoIntento = Date.now() + ms;
    temporizador = setTimeout(() => { ejecutar().catch(() => {}); }, ms);
    temporizador.unref?.();
  }

  // Lo llama el servidor local después de cada guardado. Si estamos sin conexión,
  // se respeta la espera de reintento para no insistir con cada clic.
  function avisarCambio() {
    if (!activo) return;
    if (enCurso) { cambioDuranteEnvio = true; return; }
    if (estado.fallosSeguidos > 0) return;
    if (!estado.proximoIntento || estado.proximoIntento - Date.now() > ESPERA_TRAS_CAMBIO_MS) programar(ESPERA_TRAS_CAMBIO_MS);
  }

  async function pedir(cfg, ruta, { method = 'GET', body, token = cfg.token } = {}) {
    let respuesta;
    try {
      respuesta = await fetch(`${cfg.servidor}${ruta}`, {
        method,
        redirect: 'error',
        signal: AbortSignal.timeout(TIEMPO_LIMITE_MS),
        headers: {
          Accept: 'application/json',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: body ? JSON.stringify(body) : undefined
      });
    } catch (causa) {
      const error = new Error('Sin conexión con el servidor central. Los avances quedan guardados en este computador.');
      error.sinConexion = true;
      error.cause = causa;
      throw error;
    }
    const datos = await respuesta.json().catch(() => ({}));
    if (!respuesta.ok) {
      const error = new Error(datos.error || `El servidor central respondió con el código ${respuesta.status}.`);
      error.status = respuesta.status;
      throw error;
    }
    return datos;
  }

  // ---------- Lectura de pendientes ----------
  function estudiantesPendientes() {
    return db.prepare(`SELECT UUID, Nombre, Apellido, Activo, ColorFavorito, TemaInteres, ModoOscuro,
        BuhoColor, BuhoAccesorio, ActualizadoEn, SyncVersion
      FROM Estudiantes WHERE SyncVersion > SyncEnviada ORDER BY EstudianteID LIMIT ?`).all(LOTE.estudiantes)
      .map(fila => ({
        uuid: fila.UUID,
        nombre: decryptStudentName(fila.Nombre, 'nombre'),
        apellido: decryptStudentName(fila.Apellido, 'apellido'),
        activo: fila.Activo === 1,
        colorFavorito: fila.ColorFavorito,
        temaInteres: fila.TemaInteres,
        modoOscuro: fila.ModoOscuro === 1,
        buhoColor: fila.BuhoColor,
        buhoAccesorio: fila.BuhoAccesorio,
        actualizadoEn: fila.ActualizadoEn,
        version: fila.SyncVersion
      }));
  }

  function intentosPendientes() {
    return db.prepare(`SELECT R.UUID, E.UUID AS EstudianteUUID, A.Nombre AS Actividad, R.FechaInicio, R.FechaTermino,
        R.DuracionSegundos, R.Puntuacion, R.Aciertos, R.Errores, R.Estado, R.DetalleResultado, R.SyncVersion,
        AV.PreguntaActual, AV.TotalPreguntas, AV.Completadas, AV.Consigna, AV.RespuestaActual, AV.Pausada,
        AV.Revision, AV.FechaActualizacion
      FROM ResultadosActividades R
      JOIN Estudiantes E ON E.EstudianteID = R.EstudianteID
      JOIN Actividades A ON A.ActividadID = R.ActividadID
      LEFT JOIN AvanceActividad AV ON AV.ResultadoID = R.ResultadoID
      WHERE R.SyncVersion > R.SyncEnviada AND R.EquipoOrigen IS NULL
      ORDER BY R.ResultadoID LIMIT ?`).all(LOTE.intentos)
      .map(fila => ({
        uuid: fila.UUID,
        estudianteUuid: fila.EstudianteUUID,
        actividad: fila.Actividad,
        fechaInicio: fila.FechaInicio,
        fechaTermino: fila.FechaTermino,
        duracionSegundos: fila.DuracionSegundos,
        puntuacion: fila.Puntuacion,
        aciertos: fila.Aciertos,
        errores: fila.Errores,
        estado: fila.Estado,
        detalleResultado: fila.DetalleResultado,
        avance: fila.TotalPreguntas ? {
          preguntaActual: fila.PreguntaActual,
          totalPreguntas: fila.TotalPreguntas,
          completadas: fila.Completadas,
          consigna: fila.Consigna,
          respuestaActual: fila.RespuestaActual,
          pausada: fila.Pausada === 1,
          revision: fila.Revision,
          fechaActualizacion: fila.FechaActualizacion
        } : null,
        version: fila.SyncVersion
      }));
  }

  function minijuegosPendientes() {
    return db.prepare(`SELECT M.UUID, E.UUID AS EstudianteUUID, M.Minijuego, M.Origen, M.DuracionSegundos,
        M.Estrellas, M.Fecha, M.SyncVersion
      FROM MinijuegosEstudiante M JOIN Estudiantes E ON E.EstudianteID = M.EstudianteID
      WHERE M.SyncVersion > M.SyncEnviada AND M.EquipoOrigen IS NULL
      ORDER BY M.MinijuegoID LIMIT ?`).all(LOTE.minijuegos)
      .map(fila => ({
        uuid: fila.UUID,
        estudianteUuid: fila.EstudianteUUID,
        minijuego: fila.Minijuego,
        origen: fila.Origen,
        duracionSegundos: fila.DuracionSegundos,
        estrellas: fila.Estrellas,
        fecha: fila.Fecha,
        version: fila.SyncVersion
      }));
  }

  const eliminacionesPendientes = () => db.prepare(`SELECT Tipo AS tipo, UUID AS uuid FROM SyncEliminaciones
    ORDER BY Fecha LIMIT ?`).all(LOTE.eliminaciones).map(fila => ({ ...fila }));

  function contarPendientes() {
    const contar = sql => Number(db.prepare(sql).get().n);
    return {
      estudiantes: contar('SELECT COUNT(*) AS n FROM Estudiantes WHERE SyncVersion > SyncEnviada'),
      intentos: contar('SELECT COUNT(*) AS n FROM ResultadosActividades WHERE SyncVersion > SyncEnviada AND EquipoOrigen IS NULL'),
      minijuegos: contar('SELECT COUNT(*) AS n FROM MinijuegosEstudiante WHERE SyncVersion > SyncEnviada AND EquipoOrigen IS NULL'),
      eliminaciones: contar('SELECT COUNT(*) AS n FROM SyncEliminaciones')
    };
  }

  // ---------- Aplicar datos recibidos ----------
  function eliminarEstudianteLocal(estudianteId) {
    db.prepare('DELETE FROM AudiosPronunciacion WHERE EstudianteID = ?').run(estudianteId);
    db.prepare('DELETE FROM ResultadosActividades WHERE EstudianteID = ?').run(estudianteId);
    db.prepare('DELETE FROM MinijuegosEstudiante WHERE EstudianteID = ?').run(estudianteId);
    db.prepare('DELETE FROM ProgresoEstudiante WHERE EstudianteID = ?').run(estudianteId);
    db.prepare('DELETE FROM Estudiantes WHERE EstudianteID = ?').run(estudianteId);
  }

  // Inserta o actualiza un estudiante con los datos del servidor. Los cambios locales
  // aún no enviados tienen prioridad: se enviarán y el servidor decidirá.
  function aplicarEstudiante(datos, { soloSiFalta = false } = {}) {
    if (!datos || !UUID_VALIDO.test(datos.uuid || '')) return null;
    const local = db.prepare('SELECT EstudianteID, SyncVersion, SyncEnviada FROM Estudiantes WHERE UUID = ?').get(datos.uuid);
    if (local && (soloSiFalta || local.SyncVersion > local.SyncEnviada)) return local.EstudianteID;
    const valores = [
      encryptStudentName(String(datos.nombre), 'nombre'),
      encryptStudentName(String(datos.apellido), 'apellido'),
      datos.activo === false ? 0 : 1,
      Number.isInteger(datos.colorFavorito) ? datos.colorFavorito : null,
      typeof datos.temaInteres === 'string' ? datos.temaInteres : null,
      datos.modoOscuro ? 1 : 0,
      typeof datos.buhoColor === 'string' ? datos.buhoColor : null,
      typeof datos.buhoAccesorio === 'string' ? datos.buhoAccesorio : null,
      String(datos.actualizadoEn || ahora())
    ];
    if (local) {
      db.prepare(`UPDATE Estudiantes SET Nombre = ?, Apellido = ?, Activo = ?, ColorFavorito = ?, TemaInteres = ?,
          ModoOscuro = ?, BuhoColor = ?, BuhoAccesorio = ?, ActualizadoEn = ?
        WHERE EstudianteID = ?`).run(...valores, local.EstudianteID);
      return local.EstudianteID;
    }
    const nuevo = db.prepare(`INSERT INTO Estudiantes (Nombre, Apellido, Activo, ColorFavorito, TemaInteres, ModoOscuro,
        BuhoColor, BuhoAccesorio, ActualizadoEn, UUID, SyncVersion, SyncEnviada)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1)`).run(...valores, datos.uuid);
    return Number(nuevo.lastInsertRowid);
  }

  // El mismo alumno se creó en dos computadores sin conexión: el servidor indica cuál es
  // el registro definitivo y aquí se unen ambos, sin perder intentos ni minijuegos.
  function fusionarEstudiante(uuidLocal, uuidCanonico, datos) {
    const local = db.prepare('SELECT EstudianteID FROM Estudiantes WHERE UUID = ?').get(uuidLocal);
    if (!local) return;
    const canonico = db.prepare('SELECT EstudianteID FROM Estudiantes WHERE UUID = ?').get(uuidCanonico);
    if (!canonico) {
      db.prepare('UPDATE Estudiantes SET UUID = ?, SyncEnviada = SyncVersion WHERE EstudianteID = ?').run(uuidCanonico, local.EstudianteID);
      aplicarEstudiante(datos);
      return;
    }
    for (const tabla of ['ResultadosActividades', 'MinijuegosEstudiante', 'AudiosPronunciacion']) {
      db.prepare(`UPDATE ${tabla} SET EstudianteID = ? WHERE EstudianteID = ?`).run(canonico.EstudianteID, local.EstudianteID);
    }
    db.prepare('DELETE FROM ProgresoEstudiante WHERE EstudianteID = ?').run(local.EstudianteID);
    db.prepare('DELETE FROM Estudiantes WHERE EstudianteID = ?').run(local.EstudianteID);
    aplicarEstudiante(datos);
  }

  function aplicarIntento(datos) {
    if (!UUID_VALIDO.test(datos?.uuid || '')) return;
    const local = db.prepare('SELECT ResultadoID, EquipoOrigen FROM ResultadosActividades WHERE UUID = ?').get(datos.uuid);
    if (local && local.EquipoOrigen === null) return; // Lo hizo este computador: aquí está la versión más reciente.
    const estudianteId = aplicarEstudiante(datos.estudiante, { soloSiFalta: true });
    const actividad = db.prepare('SELECT ActividadID FROM Actividades WHERE Nombre = ?').get(datos.actividad);
    if (!estudianteId || !actividad) return;
    const valores = [estudianteId, actividad.ActividadID, datos.fechaInicio, datos.fechaTermino ?? null,
      datos.duracionSegundos ?? null, datos.puntuacion ?? null, datos.aciertos ?? null, datos.errores ?? null,
      datos.estado, datos.detalleResultado ?? null, datos.equipo || 'Otro computador', datos.version, datos.version];
    let resultadoId;
    if (local) {
      db.prepare(`UPDATE ResultadosActividades SET EstudianteID = ?, ActividadID = ?, FechaInicio = ?, FechaTermino = ?,
          DuracionSegundos = ?, Puntuacion = ?, Aciertos = ?, Errores = ?, Estado = ?, DetalleResultado = ?,
          EquipoOrigen = ?, SyncVersion = ?, SyncEnviada = ?
        WHERE ResultadoID = ?`).run(...valores, local.ResultadoID);
      resultadoId = local.ResultadoID;
    } else {
      resultadoId = Number(db.prepare(`INSERT INTO ResultadosActividades (EstudianteID, ActividadID, FechaInicio, FechaTermino,
          DuracionSegundos, Puntuacion, Aciertos, Errores, Estado, DetalleResultado, EquipoOrigen, SyncVersion, SyncEnviada, UUID)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(...valores, datos.uuid).lastInsertRowid);
    }
    const av = datos.avance;
    if (av) {
      db.prepare(`INSERT INTO AvanceActividad (ResultadoID, PreguntaActual, TotalPreguntas, Completadas, Consigna,
          RespuestaActual, Pausada, Revision, FechaActualizacion)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(ResultadoID) DO UPDATE SET PreguntaActual = excluded.PreguntaActual,
          TotalPreguntas = excluded.TotalPreguntas, Completadas = excluded.Completadas, Consigna = excluded.Consigna,
          RespuestaActual = excluded.RespuestaActual, Pausada = excluded.Pausada, Revision = excluded.Revision,
          FechaActualizacion = excluded.FechaActualizacion`)
        .run(resultadoId, av.preguntaActual, av.totalPreguntas, av.completadas, av.consigna, av.respuestaActual,
          av.pausada ? 1 : 0, av.revision, av.fechaActualizacion);
    }
  }

  function aplicarMinijuego(datos) {
    if (!UUID_VALIDO.test(datos?.uuid || '')) return;
    if (db.prepare('SELECT 1 FROM MinijuegosEstudiante WHERE UUID = ?').get(datos.uuid)) return;
    const estudianteId = aplicarEstudiante(datos.estudiante, { soloSiFalta: true });
    if (!estudianteId) return;
    db.prepare(`INSERT INTO MinijuegosEstudiante (EstudianteID, Minijuego, Origen, DuracionSegundos, Estrellas, Fecha,
        EquipoOrigen, UUID, SyncVersion, SyncEnviada)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 1)`)
      .run(estudianteId, datos.minijuego, datos.origen, datos.duracionSegundos, datos.estrellas, datos.fecha,
        datos.equipo || 'Otro computador', datos.uuid);
  }

  function aplicarCambio(cambio) {
    if (cambio.tipo === 'estudiante') {
      if (cambio.datos) { aplicarEstudiante(cambio.datos); return; }
      const local = db.prepare('SELECT EstudianteID FROM Estudiantes WHERE UUID = ?').get(cambio.uuid);
      if (local) eliminarEstudianteLocal(local.EstudianteID);
    } else if (cambio.tipo === 'intento' && cambio.datos) {
      aplicarIntento(cambio.datos);
    } else if (cambio.tipo === 'minijuego' && cambio.datos) {
      aplicarMinijuego(cambio.datos);
    }
  }

  // ---------- Ciclo de sincronización ----------
  async function subirPendientes(cfg) {
    for (let vuelta = 0; vuelta < 100; vuelta++) {
      const paquete = {
        estudiantes: estudiantesPendientes(),
        intentos: intentosPendientes(),
        minijuegos: minijuegosPendientes(),
        eliminaciones: eliminacionesPendientes()
      };
      const total = paquete.estudiantes.length + paquete.intentos.length + paquete.minijuegos.length + paquete.eliminaciones.length;
      if (!total) return;
      const respuesta = await pedir(cfg, '/api/sync/subir', { method: 'POST', body: paquete });
      let reintentar = 0;
      enTransaccion(() => {
        for (const r of respuesta.estudiantes || []) {
          if (!Number.isSafeInteger(r.version)) continue;
          if (r.invalido) console.error('El servidor central rechazó un estudiante con datos no válidos:', r.uuid);
          if (r.eliminado) {
            const local = db.prepare('SELECT EstudianteID FROM Estudiantes WHERE UUID = ?').get(r.uuid);
            if (local) eliminarEstudianteLocal(local.EstudianteID);
            continue;
          }
          db.prepare('UPDATE Estudiantes SET SyncEnviada = MAX(SyncEnviada, ?) WHERE UUID = ?').run(r.version, r.uuid);
          if (r.canonico && r.canonico !== r.uuid) fusionarEstudiante(r.uuid, r.canonico, r.datos);
        }
        for (const tabla of [['intentos', 'ResultadosActividades'], ['minijuegos', 'MinijuegosEstudiante']]) {
          for (const r of respuesta[tabla[0]] || []) {
            if (r.reintentar) { reintentar++; continue; }
            if (!Number.isSafeInteger(r.version)) continue;
            if (r.invalido || r.conflicto) console.error(`El servidor central no aceptó un registro (${tabla[0]}):`, r.uuid, r.conflicto || 'datos no válidos');
            db.prepare(`UPDATE ${tabla[1]} SET SyncEnviada = MAX(SyncEnviada, ?) WHERE UUID = ?`).run(r.version, r.uuid);
          }
        }
        for (const r of respuesta.eliminaciones || []) {
          db.prepare('DELETE FROM SyncEliminaciones WHERE Tipo = ? AND UUID = ?').run(r.tipo, r.uuid);
        }
      });
      // Si todo lo que queda espera a otro registro (por ejemplo, un alumno aún no creado), se
      // vuelve a intentar en el próximo ciclo en vez de repetir el mismo envío ahora.
      if (reintentar === total) return;
    }
  }

  async function bajarCambios(cfg) {
    for (let pagina = 0; pagina < 200; pagina++) {
      const desde = Number(leer('cursor') || 0);
      const respuesta = await pedir(cfg, `/api/sync/cambios?desde=${desde}`);
      if (respuesta.reiniciar) {
        // El servidor se restauró desde un respaldo: se vuelve a leer todo desde el principio.
        if (desde === 0) return;
        escribir('cursor', 0);
        continue;
      }
      enTransaccion(() => {
        for (const cambio of respuesta.cambios || []) {
          try { aplicarCambio(cambio); } catch (error) { console.error('No se pudo aplicar un cambio recibido:', error.message); }
        }
        escribir('cursor', Math.max(desde, Number(respuesta.hasta) || desde));
      });
      if (!respuesta.hayMas) return;
    }
  }

  function ejecutar() {
    if (enCurso) return enCurso;
    const cfg = configuracion();
    if (!cfg) return Promise.resolve(false);
    enCurso = (async () => {
      estado.sincronizando = true;
      estado.ultimoIntento = ahora();
      try {
        let vueltas = 0;
        do {
          cambioDuranteEnvio = false;
          await subirPendientes(cfg);
        } while (cambioDuranteEnvio && ++vueltas < 5);
        await bajarCambios(cfg);
        estado.ultimoError = null;
        estado.fallosSeguidos = 0;
        escribir('ultimoExito', ahora());
        return true;
      } catch (error) {
        estado.fallosSeguidos++;
        estado.ultimoError = error.message;
        if (!error.sinConexion) console.error('Sincronización:', error.message);
        return false;
      } finally {
        estado.sincronizando = false;
        enCurso = null;
        const espera = estado.fallosSeguidos
          ? Math.min(REINTENTO_MAXIMO_MS, REINTENTO_INICIAL_MS * 2 ** (estado.fallosSeguidos - 1)) * (0.8 + Math.random() * 0.4)
          : cambioDuranteEnvio ? ESPERA_TRAS_CAMBIO_MS : INTERVALO_NORMAL_MS;
        programar(Math.round(espera));
      }
    })();
    return enCurso;
  }

  // ---------- API pública ----------
  return {
    iniciar() {
      activo = true;
      programar(1000);
    },
    detener() {
      activo = false;
      clearTimeout(temporizador);
      temporizador = null;
    },
    avisarCambio,
    async sincronizarAhora() {
      if (!configuracion()) throw new Error('Este computador no está vinculado a un servidor central.');
      if (enCurso) await enCurso;
      estado.fallosSeguidos = 0;
      return ejecutar();
    },
    // Primera vinculación (requiere internet): canjea el código entregado por el administrador.
    async vincular({ servidor, codigo, nombreEquipo }) {
      // Con solo el código se usa el servidor al que este computador ya estuvo vinculado.
      const separado = separarConexion(codigo);
      const conocido = configuracion()?.servidor || leer('servidorAnterior') || '';
      const direccion = String(servidor || '').trim() || separado.servidor || conocido;
      if (!direccion) throw new Error('Pega el código de conexión completo que muestra el panel central (incluye la dirección del servidor).');
      const base = normalizarServidor(direccion);
      const nombre = String(nombreEquipo || os.hostname() || 'Computador').trim().replace(/\s+/g, ' ').slice(0, 80);
      const codigoLimpio = separado.codigo;
      if (!codigoLimpio) throw new Error('Escribe el código de conexión que te entregó el administrador.');
      // Si este computador ya estuvo vinculado al mismo servidor, se presenta su autorización
      // anterior para que el servidor le mantenga la autoría de los intentos ya enviados.
      const anterior = configuracion() || (leer('servidorAnterior') && leer('tokenAnterior')
        ? { servidor: leer('servidorAnterior'), token: decryptStudentName(leer('tokenAnterior'), 'sync-token') } : null);
      const tokenAnterior = anterior?.servidor === base ? anterior.token : undefined;
      const respuesta = await pedir({ servidor: base }, '/api/sync/vincular', {
        method: 'POST', token: null, body: { codigo: codigoLimpio, nombreEquipo: nombre, versionApp, tokenAnterior }
      });
      if (typeof respuesta.token !== 'string' || !respuesta.dispositivoId) throw new Error('El servidor central no entregó una autorización válida.');
      if (enCurso) await enCurso.catch(() => {});
      enTransaccion(() => {
        escribir('servidor', base);
        escribir('token', encryptStudentName(respuesta.token, 'sync-token'));
        escribir('dispositivoId', respuesta.dispositivoId);
        escribir('nombreEquipo', nombre);
        escribir('nombreServidor', respuesta.nombreServidor || null);
        escribir('cursor', 0);
        escribir('ultimoExito', null);
        escribir('servidorAnterior', null);
        escribir('tokenAnterior', null);
        // Registros existentes: se envían todos. El servidor los reconoce por su UUID,
        // así que volver a vincular el mismo computador no crea duplicados.
        db.exec(`UPDATE Estudiantes SET SyncEnviada = 0;
          UPDATE ResultadosActividades SET SyncEnviada = 0 WHERE EquipoOrigen IS NULL;
          UPDATE MinijuegosEstudiante SET SyncEnviada = 0 WHERE EquipoOrigen IS NULL;`);
      });
      estado.fallosSeguidos = 0;
      estado.ultimoError = null;
      if (activo) programar(0);
      return this.estado();
    },
    desvincular() {
      clearTimeout(temporizador);
      enTransaccion(() => {
        const servidor = leer('servidor');
        const token = leer('token');
        if (servidor && token) { escribir('servidorAnterior', servidor); escribir('tokenAnterior', token); }
        for (const clave of ['servidor', 'token', 'dispositivoId', 'nombreServidor', 'cursor', 'ultimoExito']) escribir(clave, null);
      });
      estado.ultimoError = null;
      estado.fallosSeguidos = 0;
      estado.proximoIntento = null;
    },
    estado() {
      const cfg = configuracion();
      return {
        vinculado: Boolean(cfg),
        servidor: cfg?.servidor || null,
        nombreServidor: leer('nombreServidor'),
        nombreEquipo: leer('nombreEquipo') || os.hostname(),
        ultimoExito: leer('ultimoExito'),
        ultimoIntento: estado.ultimoIntento,
        ultimoError: estado.ultimoError,
        sinConexion: estado.fallosSeguidos > 0,
        sincronizando: estado.sincronizando,
        proximoIntento: estado.proximoIntento ? new Date(estado.proximoIntento).toISOString() : null,
        pendientes: contarPendientes()
      };
    }
  };
};

module.exports.normalizarServidor = normalizarServidor;
module.exports.separarConexion = separarConexion;
