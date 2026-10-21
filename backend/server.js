const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const bcrypt = require('bcryptjs');
const db = require('./database');
const { encryptStudentName, decryptStudent, encryptBinary, decryptBinary} = require('./student-name-crypto');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const ACTIVIDADES_PROGRESIVAS = [
  'Reconozco las letras',
  'Formo sílabas',
  'Uno la palabra con su imagen',
  'Encuentro la letra',
  'Aprendo las sílabas',
  'Practico la pronunciación',
  'Completo el cuento'
];

if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 24) {
  console.error('Configura SESSION_SECRET con al menos 24 caracteres en .env');
  process.exit(1);
}

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '30kb' }));
app.use(session({
  name: 'softwareeducativo.sid',
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'strict', secure: false, maxAge: 2 * 60 * 60 * 1000 }
}));
app.use(express.static(path.join(__dirname, '..', 'frontend')));

function requireTeacher(req, res, next) {
  if (!req.session.teacherId) return res.status(401).json({ error: 'Debes iniciar sesión como profesor.' });
  next();
}

function cleanName(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

function ordenarEstudiantes(estudiantes) {
  return estudiantes
    .map(decryptStudent)
    .sort((a, b) => `${a.Nombre} ${a.Apellido}`.localeCompare(`${b.Nombre} ${b.Apellido}`, 'es'));
}

// Preferencias del estudiante: solo se aceptan los valores que ofrece la pantalla de elección.
const COLORES_PERMITIDOS = [0, 25, 48, 130, 175, 215, 270, 330];
const TEMAS_PERMITIDOS = ['Animales', 'Dinosaurios', 'Piratas', 'Fútbol', 'Princesas', 'Unicornios', 'Hadas'];
const COLUMNAS_ESTUDIANTE = 'EstudianteID, Nombre, Apellido, ColorFavorito, TemaInteres, ModoOscuro';

function respondDatabaseError(res, error, message) {
  console.error(error);
  res.status(500).json({ error: message });
}

function withTransaction(callback) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = callback();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

app.get('/api/health', (_req, res) => {
  try {
    res.json({ ok: db.prepare('SELECT 1 AS ok').get().ok === 1 });
  } catch (error) {
    respondDatabaseError(res, error, 'No se pudo consultar la base de datos local.');
  }
});

app.get('/api/estudiantes', (_req, res) => {
  try {
    const estudiantes = db.prepare(`SELECT EstudianteID, Nombre, Apellido FROM Estudiantes
      WHERE Activo = 1`).all();
    res.json({ estudiantes: ordenarEstudiantes(estudiantes) });
  } catch (error) {
    respondDatabaseError(res, error, 'No se pudieron cargar los estudiantes.');
  }
});

app.post('/api/estudiantes/:id/ingresar', (req, res) => {
  const studentId = Number(req.params.id);
  if (!Number.isInteger(studentId) || studentId < 1) {
    return res.status(400).json({ error: 'Estudiante no válido.' });
  }

  try {
    const estudiante = db.prepare(`SELECT ${COLUMNAS_ESTUDIANTE} FROM Estudiantes
      WHERE EstudianteID = ? AND Activo = 1`).get(studentId);
    if (!estudiante) return res.status(404).json({ error: 'No se encontró este estudiante.' });
    Object.assign(estudiante, decryptStudent(estudiante));
    req.session.studentId = estudiante.EstudianteID;
    res.json({ estudiante });
  } catch (error) {
    respondDatabaseError(res, error, 'No se pudo ingresar como estudiante.');
  }
});

app.post('/api/estudiantes/logout', (req, res) => {
  delete req.session.studentId;
  res.json({ ok: true });
});

app.post('/api/profesor/estudiantes', requireTeacher, (req, res) => {
  const nombre = cleanName(req.body?.nombre);
  const apellido = cleanName(req.body?.apellido);
  if (!nombre || !apellido || nombre.length > 80 || apellido.length > 80) {
    return res.status(400).json({ error: 'Ingresa nombre y apellido (máximo 80 caracteres cada uno).' });
  }

  try {
    const estudiante = withTransaction(() => {
      const existente = db.prepare('SELECT EstudianteID, Nombre, Apellido FROM Estudiantes')
        .all()
        .map(decryptStudent)
        .find(registro => registro.Nombre === nombre && registro.Apellido === apellido);
      if (existente) return existente;

      const insert = db.prepare('INSERT INTO Estudiantes (Nombre, Apellido) VALUES (?, ?)')
        .run(encryptStudentName(nombre, 'nombre'), encryptStudentName(apellido, 'apellido'));
      return decryptStudent(db.prepare(`SELECT EstudianteID, Nombre, Apellido FROM Estudiantes
        WHERE EstudianteID = ?`).get(insert.lastInsertRowid));
    });
    res.json({ estudiante });
  } catch (error) {
    respondDatabaseError(res, error, 'No se pudo guardar al estudiante.');
  }
});

app.delete('/api/profesor/estudiantes/:id', requireTeacher, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Estudiante no válido.' });
  try {
    const eliminados = withTransaction(() => {
      db.prepare('DELETE FROM AudiosPronunciacion WHERE EstudianteID = ?').run(id);
      db.prepare('DELETE FROM ResultadosActividades WHERE EstudianteID = ?').run(id);
      db.prepare('DELETE FROM ProgresoEstudiante WHERE EstudianteID = ?').run(id);
      return db.prepare('DELETE FROM Estudiantes WHERE EstudianteID = ?').run(id).changes;
    });
    if (!eliminados) return res.status(404).json({ error: 'No se encontró al estudiante.' });
    res.json({ eliminado: true });
  } catch (error) {
    respondDatabaseError(res, error, 'No se pudo quitar al estudiante.');
  }
});

app.get('/api/profesor/estudiantes', requireTeacher, (_req, res) => {
  try {
    const estudiantes = db.prepare(`SELECT EstudianteID, Nombre, Apellido FROM Estudiantes
      WHERE Activo = 1`).all();
    res.json({ estudiantes: ordenarEstudiantes(estudiantes) });
  } catch (error) {
    respondDatabaseError(res, error, 'No se pudieron cargar los estudiantes.');
  }
});

app.get('/api/estudiantes/me', (req, res) => {
  const studentId = req.session.studentId;
  if (!studentId) return res.status(401).json({ error: 'No hay un estudiante ingresado.' });

  try {
    const estudiante = db.prepare(`SELECT ${COLUMNAS_ESTUDIANTE} FROM Estudiantes
      WHERE EstudianteID = ?`).get(studentId);
    if (!estudiante) return res.status(404).json({ error: 'No se encontró al estudiante de esta sesión.' });
    Object.assign(estudiante, decryptStudent(estudiante));
    res.json({ estudiante });
  } catch (error) {
    respondDatabaseError(res, error, 'No se pudo recuperar la sesión del estudiante.');
  }
});

app.put('/api/estudiantes/me/preferencias', (req, res) => {
  const studentId = req.session.studentId;
  if (!studentId) return res.status(401).json({ error: 'No hay un estudiante ingresado.' });

  const { colorFavorito, temaInteres, modoOscuro } = req.body || {};
  if (colorFavorito !== undefined && !COLORES_PERMITIDOS.includes(colorFavorito)) {
    return res.status(400).json({ error: 'Color no válido.' });
  }
  if (temaInteres !== undefined && !TEMAS_PERMITIDOS.includes(temaInteres)) {
    return res.status(400).json({ error: 'Tema no válido.' });
  }
  if (modoOscuro !== undefined && typeof modoOscuro !== 'boolean') {
    return res.status(400).json({ error: 'Modo no válido.' });
  }

  try {
    // Solo se actualizan los campos enviados; los demás conservan su valor.
    db.prepare(`UPDATE Estudiantes SET
        ColorFavorito = COALESCE(?, ColorFavorito),
        TemaInteres = COALESCE(?, TemaInteres),
        ModoOscuro = COALESCE(?, ModoOscuro)
      WHERE EstudianteID = ? AND Activo = 1`)
      .run(
        colorFavorito ?? null,
        temaInteres ?? null,
        modoOscuro === undefined ? null : (modoOscuro ? 1 : 0),
        studentId
      );
    const estudiante = db.prepare(`SELECT ${COLUMNAS_ESTUDIANTE} FROM Estudiantes
      WHERE EstudianteID = ?`).get(studentId);
    if (!estudiante) return res.status(404).json({ error: 'No se encontró al estudiante de esta sesión.' });
    Object.assign(estudiante, decryptStudent(estudiante));
    res.json({ estudiante });
  } catch (error) {
    respondDatabaseError(res, error, 'No se pudieron guardar tus preferencias.');
  }
});

app.get('/api/actividades', (req, res) => {
  try {
    const actividades = db.prepare(`SELECT ActividadID, Nombre, Descripcion, NivelDificultad
      FROM Actividades WHERE Activa = 1`).all();
    const completadas = new Set(req.session.studentId
      ? db.prepare(`SELECT A.Nombre FROM ResultadosActividades R
          JOIN Actividades A ON A.ActividadID = R.ActividadID
          WHERE R.EstudianteID = ? AND R.Estado = 'Completada'`)
        .all(req.session.studentId).map(resultado => resultado.Nombre)
      : []);
    res.json({
      actividades: actividades
        .map(actividad => {
          const indice = ACTIVIDADES_PROGRESIVAS.indexOf(actividad.Nombre);
          const actividadPrevia = indice > 0 ? ACTIVIDADES_PROGRESIVAS[indice - 1] : null;
          return {
            ...actividad,
            ActividadPrevia: actividadPrevia,
            Bloqueada: Boolean(actividadPrevia && !completadas.has(actividadPrevia))
          };
        })
        .sort((a, b) => {
          const indiceA = ACTIVIDADES_PROGRESIVAS.indexOf(a.Nombre);
          const indiceB = ACTIVIDADES_PROGRESIVAS.indexOf(b.Nombre);
          return (indiceA === -1 ? ACTIVIDADES_PROGRESIVAS.length : indiceA)
            - (indiceB === -1 ? ACTIVIDADES_PROGRESIVAS.length : indiceB);
        })
    });
  } catch (error) {
    respondDatabaseError(res, error, 'No se pudieron cargar las actividades.');
  }
});

app.post('/api/actividades/:id/iniciar', (req, res) => {
  const studentId = req.session.studentId;
  const actividadId = Number(req.params.id);
  if (!studentId) return res.status(401).json({ error: 'Primero ingresa nombre y apellido.' });
  if (!Number.isInteger(actividadId) || actividadId < 1) {
    return res.status(400).json({ error: 'Actividad no válida.' });
  }

  try {
    const intento = withTransaction(() => {
      const actividad = db.prepare(`SELECT ActividadID, Nombre FROM Actividades
        WHERE ActividadID = ? AND Activa = 1`).get(actividadId);
      if (!actividad) return null;
      const indiceActividad = ACTIVIDADES_PROGRESIVAS.indexOf(actividad.Nombre);
      const actividadPrevia = indiceActividad > 0 ? ACTIVIDADES_PROGRESIVAS[indiceActividad - 1] : null;
      if (actividadPrevia) {
        const actividadPreviaCompletada = db.prepare(`SELECT 1 AS completado FROM ResultadosActividades R
          JOIN Actividades A ON A.ActividadID = R.ActividadID
          WHERE R.EstudianteID = ? AND A.Nombre = ? AND R.Estado = 'Completada' LIMIT 1`)
          .get(studentId, actividadPrevia);
        if (!actividadPreviaCompletada) return { bloqueada: true, actividadPrevia };
      }

      const result = db.prepare(`INSERT INTO ResultadosActividades
        (EstudianteID, ActividadID, FechaInicio, Estado)
        VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'En progreso')`)
        .run(studentId, actividadId);
      const intentoCreado = db.prepare(`SELECT ResultadoID, FechaInicio FROM ResultadosActividades
        WHERE ResultadoID = ?`).get(Number(result.lastInsertRowid));
      db.prepare(`INSERT INTO ProgresoEstudiante
        (EstudianteID, ActividadesIniciadas, UltimaActividad, FechaActualizacion)
        VALUES (?, 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        ON CONFLICT(EstudianteID) DO UPDATE SET
          ActividadesIniciadas = ActividadesIniciadas + 1,
          UltimaActividad = excluded.UltimaActividad,
          FechaActualizacion = excluded.FechaActualizacion`).run(studentId);
      return intentoCreado;
    });

    if (!intento) return res.status(404).json({ error: 'Actividad no encontrada.' });
    if (intento.bloqueada) {
      return res.status(403).json({
        error: `Primero completa "${intento.actividadPrevia}" para desbloquear esta actividad.`
      });
    }
    res.json({ intento });
  } catch (error) {
    respondDatabaseError(res, error, 'No se pudo iniciar la actividad.');
  }
});

const audioParser = express.raw({ type: 'audio/*', limit: '2mb' });
app.post('/api/resultados/:id/audio', audioParser, (req, res) => {
  const studentId = req.session.studentId;
  const resultadoId = Number(req.params.id);
  const palabra = typeof req.query.palabra === 'string' ? req.query.palabra.trim().toLocaleLowerCase('es-CL') : '';
  const tipo = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  if (!studentId) return res.status(401).json({ error: 'Primero ingresa nombre y apellido.' });
  if (!Number.isSafeInteger(resultadoId) || resultadoId < 1 || !/^[\p{L} ]{1,40}$/u.test(palabra)) {
    return res.status(400).json({ error: 'Datos del audio no válidos.' });
  }
  if (!/^audio\/(webm|ogg|mp4|mpeg|wav|x-wav|aac)$/.test(tipo)) return res.status(415).json({ error: 'Formato de audio no permitido.' });
  if (!Buffer.isBuffer(req.body) || req.body.length < 500) return res.status(400).json({ error: 'El audio está vacío.' });
  try {
    const guardado = withTransaction(() => {
      const intento = db.prepare(`SELECT R.ResultadoID FROM ResultadosActividades R
        JOIN Actividades A ON A.ActividadID = R.ActividadID
        WHERE R.ResultadoID = ? AND R.EstudianteID = ? AND R.Estado = 'En progreso'
          AND A.Nombre = 'Practico la pronunciación'`).get(resultadoId, studentId);
      if (!intento) return false;
      db.prepare('DELETE FROM AudiosPronunciacion WHERE ResultadoID = ? AND Palabra = ?').run(resultadoId, palabra);
      db.prepare(`INSERT INTO AudiosPronunciacion (ResultadoID, EstudianteID, Palabra, TipoMime, Datos)
        VALUES (?, ?, ?, ?, ?)`).run(resultadoId, studentId, palabra, tipo, encryptBinary(req.body));
      return true;
    });
    if (!guardado) return res.status(404).json({ error: 'No se encontró la actividad en progreso.' });
    res.status(201).json({ guardado: true });
  } catch (error) {
    respondDatabaseError(res, error, 'No se pudo guardar el audio.');
  }
});

app.get('/api/profesor/audios/:id', requireTeacher, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: 'Audio no válido.' });
  try {
    const fila = db.prepare('SELECT TipoMime, Datos FROM AudiosPronunciacion WHERE AudioID = ?').get(id);
    if (!fila) return res.status(404).json({ error: 'No se encontró el audio.' });
    const datos = decryptBinary(Buffer.from(fila.Datos));
    const total = datos.length;
    const cabeceras = { 'Content-Type': fila.TipoMime, 'Cache-Control': 'private, no-store', 'Accept-Ranges': 'bytes' };
    const rango = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    if (rango && (rango[1] || rango[2])) {
      const inicio = rango[1] ? Number(rango[1]) : Math.max(0, total - Number(rango[2]));
      const fin = rango[1] && rango[2] ? Math.min(Number(rango[2]), total - 1) : total - 1;
      if (inicio > fin || inicio >= total) return res.status(416).set('Content-Range', `bytes */${total}`).end();
      return res.status(206).set({ ...cabeceras, 'Content-Range': `bytes ${inicio}-${fin}/${total}`, 'Content-Length': fin - inicio + 1 })
        .end(datos.subarray(inicio, fin + 1));
    }
    res.set(cabeceras).send(datos);
  } catch (error) {
    respondDatabaseError(res, error, 'No se pudo cargar el audio.');
  }
});

app.post('/api/resultados/:id/terminar', (req, res) => {
  const studentId = req.session.studentId;
  const resultadoId = Number(req.params.id);
  const { puntuacion, aciertos, errores, detalleResultado } = req.body || {};
  if (!studentId) return res.status(401).json({ error: 'Primero ingresa nombre y apellido.' });
  if (!Number.isSafeInteger(resultadoId) || resultadoId < 1) {
    return res.status(400).json({ error: 'Intento no válido.' });
  }
  if (!Number.isFinite(puntuacion) || puntuacion < 0 || puntuacion > 100
      || !Number.isInteger(aciertos) || aciertos < 0
      || !Number.isInteger(errores) || errores < 0) {
    return res.status(400).json({ error: 'Puntuación (0–100), aciertos y errores deben ser válidos.' });
  }
  const detalle = typeof detalleResultado === 'string' ? detalleResultado.slice(0, 4000) : null;

  try {
    const resultado = withTransaction(() => {
      const update = db.prepare(`UPDATE ResultadosActividades
        SET FechaTermino = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
            DuracionSegundos = MAX(0, CAST(strftime('%s', 'now') AS INTEGER) - CAST(strftime('%s', FechaInicio) AS INTEGER)),
            Puntuacion = ?, Aciertos = ?, Errores = ?, Estado = 'Completada',
            DetalleResultado = ?, FechaEnvio = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE ResultadoID = ? AND EstudianteID = ? AND Estado = 'En progreso'`)
        .run(puntuacion, aciertos, errores, detalle, resultadoId, studentId);
      if (update.changes === 0) {
        const existente = db.prepare(`SELECT EstudianteID, FechaTermino, DuracionSegundos,
            Estado, Puntuacion, Aciertos, Errores, DetalleResultado
          FROM ResultadosActividades WHERE ResultadoID = ?`).get(resultadoId);
        if (existente?.EstudianteID === studentId && existente.Estado === 'Completada'
            && existente.Puntuacion === puntuacion && existente.Aciertos === aciertos
            && existente.Errores === errores && existente.DetalleResultado === detalle) {
          return { ...existente, yaGuardado: true };
        }
        return null;
      }

      const guardado = db.prepare(`SELECT EstudianteID, FechaTermino, DuracionSegundos
        FROM ResultadosActividades WHERE ResultadoID = ?`).get(resultadoId);
      const progreso = db.prepare(`SELECT COUNT(*) AS Iniciadas,
        SUM(CASE WHEN Estado = 'Completada' THEN 1 ELSE 0 END) AS Completadas
        FROM ResultadosActividades WHERE EstudianteID = ?`).get(studentId);
      const completadas = Number(progreso.Completadas || 0);
      const porcentaje = progreso.Iniciadas
        ? Math.round((completadas / progreso.Iniciadas) * 10000) / 100
        : 0;
      db.prepare(`INSERT INTO ProgresoEstudiante
        (EstudianteID, ActividadesIniciadas, ActividadesCompletadas, PorcentajeProgreso,
         UltimaActividad, FechaActualizacion)
        VALUES (?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        ON CONFLICT(EstudianteID) DO UPDATE SET
          ActividadesIniciadas = excluded.ActividadesIniciadas,
          ActividadesCompletadas = excluded.ActividadesCompletadas,
          PorcentajeProgreso = excluded.PorcentajeProgreso,
          UltimaActividad = excluded.UltimaActividad,
          FechaActualizacion = excluded.FechaActualizacion`)
        .run(studentId, progreso.Iniciadas, completadas, porcentaje);
      return { ...guardado, yaGuardado: false };
    });

    if (!resultado) {
      return res.status(404).json({ error: 'No se encontró un intento pendiente de este estudiante.' });
    }
    res.json({
      guardado: true,
      yaGuardado: resultado.yaGuardado,
      duracionSegundos: resultado.DuracionSegundos,
      fechaTermino: resultado.FechaTermino,
      mensaje: 'Resultado guardado correctamente.'
    });
  } catch (error) {
    respondDatabaseError(res, error, 'No se pudo guardar el resultado.');
  }
});

// Límite de intentos del acceso docente: tras 5 fallos seguidos (mismo usuario y mismo equipo)
// se bloquea ese acceso por 60 segundos. Vive en memoria: se reinicia al reiniciar el servidor.
const INTENTOS_MAX = 5;
const BLOQUEO_MS = 60 * 1000;
const VENTANA_MS = 15 * 60 * 1000;
const intentosFallidos = new Map();

function segundosDeBloqueo(clave) {
  const registro = intentosFallidos.get(clave);
  if (!registro?.bloqueadoHasta) return 0;
  const resto = registro.bloqueadoHasta - Date.now();
  if (resto <= 0) { intentosFallidos.delete(clave); return 0; }
  return Math.ceil(resto / 1000);
}

// Devuelve cuántos intentos quedan (0 = recién bloqueado).
function registrarFallo(clave) {
  const ahora = Date.now();
  const previo = intentosFallidos.get(clave);
  const registro = previo && ahora - previo.desde < VENTANA_MS ? previo : { conteo: 0, desde: ahora };
  registro.conteo += 1;
  if (registro.conteo >= INTENTOS_MAX) {
    registro.bloqueadoHasta = ahora + BLOQUEO_MS;
    intentosFallidos.set(clave, registro);
    return 0;
  }
  intentosFallidos.set(clave, registro);
  return INTENTOS_MAX - registro.conteo;
}

setInterval(() => {
  const ahora = Date.now();
  for (const [clave, registro] of intentosFallidos) {
    if (ahora - registro.desde > VENTANA_MS && !(registro.bloqueadoHasta > ahora)) intentosFallidos.delete(clave);
  }
}, 5 * 60 * 1000).unref();

app.post('/api/profesor/login', async (req, res) => {
  const usuario = typeof req.body?.usuario === 'string' ? req.body.usuario.trim() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!usuario || !password) return res.status(400).json({ error: 'Ingresa usuario y contraseña.' });

  const claveIntento = `${req.ip}|${usuario.toLowerCase()}`;
  const espera = segundosDeBloqueo(claveIntento);
  if (espera) {
    res.set('Retry-After', String(espera));
    return res.status(429).json({ error: `Demasiados intentos. Espera ${espera} segundos.`, retryAfter: espera });
  }

  try {
    const profesor = db.prepare(`SELECT ProfesorID, Nombre, Apellido, PasswordHash
      FROM Profesores WHERE Usuario = ? AND Activo = 1`).get(usuario);
    if (!profesor || !(await bcrypt.compare(password, profesor.PasswordHash))) {
      const intentosRestantes = registrarFallo(claveIntento);
      if (intentosRestantes === 0) {
        const retryAfter = Math.ceil(BLOQUEO_MS / 1000);
        res.set('Retry-After', String(retryAfter));
        return res.status(429).json({ error: `Demasiados intentos. Espera ${retryAfter} segundos.`, retryAfter });
      }
      return res.status(401).json({ error: 'Credenciales incorrectas.', intentosRestantes });
    }
    intentosFallidos.delete(claveIntento);
    req.session.regenerate(error => {
      if (error) {
        console.error(error);
        return res.status(500).json({ error: 'No se pudo iniciar sesión.' });
      }
      req.session.teacherId = profesor.ProfesorID;
      req.session.teacherName = `${profesor.Nombre} ${profesor.Apellido}`;
      res.json({ profesor: { nombre: req.session.teacherName } });
    });
  } catch (error) {
    respondDatabaseError(res, error, 'No se pudo iniciar sesión.');
  }
});

app.post('/api/profesor/logout', (req, res) => {
  req.session.destroy(error => {
    if (error) {
      console.error(error);
      return res.status(500).json({ error: 'No se pudo cerrar la sesión.' });
    }
    res.json({ ok: true });
  });
});

app.get('/api/profesor/me', requireTeacher, (req, res) => {
  res.json({ nombre: req.session.teacherName });
});

// Lista de estudiantes con un resumen corto (para las tarjetas del panel docente).
app.get('/api/profesor/resumen', requireTeacher, (_req, res) => {
  try {
    const estudiantes = db.prepare(`SELECT E.EstudianteID, E.Nombre, E.Apellido,
        SUM(CASE WHEN R.Estado = 'Completada' THEN 1 ELSE 0 END) AS Completadas,
        AVG(CASE WHEN R.Estado = 'Completada' THEN R.Puntuacion END) AS Promedio,
        MAX(R.FechaInicio) AS UltimaVez
      FROM Estudiantes E
      LEFT JOIN ResultadosActividades R ON R.EstudianteID = E.EstudianteID
      WHERE E.Activo = 1
      GROUP BY E.EstudianteID`).all();
    res.json({ estudiantes: ordenarEstudiantes(estudiantes) });
  } catch (error) {
    respondDatabaseError(res, error, 'No se pudo cargar el resumen de estudiantes.');
  }
});

// Actividades y respuestas de un solo estudiante, con el detalle de cada intento.
app.get('/api/profesor/estudiantes/:id/resultados', requireTeacher, (req, res) => {
  const studentId = Number(req.params.id);
  if (!Number.isInteger(studentId) || studentId < 1) return res.status(400).json({ error: 'Estudiante no válido.' });
  try {
    const estudiante = db.prepare(`SELECT EstudianteID, Nombre, Apellido FROM Estudiantes
      WHERE EstudianteID = ? AND Activo = 1`).get(studentId);
    if (!estudiante) return res.status(404).json({ error: 'No se encontró este estudiante.' });
    Object.assign(estudiante, decryptStudent(estudiante));
    const filas = db.prepare(`SELECT R.ResultadoID, A.Nombre AS Actividad, R.FechaInicio, R.FechaTermino,
        R.DuracionSegundos, R.Puntuacion, R.Aciertos, R.Errores, R.Estado, R.DetalleResultado
      FROM ResultadosActividades R JOIN Actividades A ON A.ActividadID = R.ActividadID
      WHERE R.EstudianteID = ? ORDER BY R.FechaInicio DESC LIMIT 200`).all(studentId);
    const resultados = filas.map(({ DetalleResultado, ...fila }) => {
      let detalle = null;
      try { detalle = DetalleResultado ? JSON.parse(DetalleResultado) : null; } catch { /* detalle ilegible */ }
      return { ...fila, detalle };
    });
    const audios = db.prepare(`SELECT AudioID, ResultadoID, Palabra, FechaRegistro FROM AudiosPronunciacion
      WHERE EstudianteID = ? ORDER BY FechaRegistro DESC LIMIT 200`).all(studentId);
    res.json({ estudiante, resultados, audios });
  } catch (error) {
    respondDatabaseError(res, error, 'No se pudieron consultar los resultados del estudiante.');
  }
});

app.get('/api/profesor/resultados', requireTeacher, (req, res) => {
  const nombre = typeof req.query.nombre === 'string' ? req.query.nombre.trim().slice(0, 80) : '';
  const apellido = typeof req.query.apellido === 'string' ? req.query.apellido.trim().slice(0, 80) : '';
  try {
    const filas = db.prepare(`SELECT E.Nombre, E.Apellido, A.Nombre AS Actividad,
        R.FechaInicio, R.FechaTermino, R.DuracionSegundos, R.Puntuacion, R.Aciertos,
        R.Errores, R.Estado, R.FechaEnvio
      FROM ResultadosActividades R
      JOIN Estudiantes E ON E.EstudianteID = R.EstudianteID
      JOIN Actividades A ON A.ActividadID = R.ActividadID
      ORDER BY R.FechaInicio DESC`).all();
    const consultaNombre = nombre.toLocaleLowerCase('es-CL');
    const consultaApellido = apellido.toLocaleLowerCase('es-CL');
    const resultados = filas
      .map(fila => decryptStudent(fila))
      .filter(fila => fila.Nombre.toLocaleLowerCase('es-CL').includes(consultaNombre)
        && fila.Apellido.toLocaleLowerCase('es-CL').includes(consultaApellido))
      .slice(0, 500);
    res.json({ resultados });
  } catch (error) {
    respondDatabaseError(res, error, 'No se pudieron consultar los resultados.');
  }
});

app.listen(PORT, '0.0.0.0', () => console.log(`SoftwareEducativo disponible en http://localhost:${PORT}`));