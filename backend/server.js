const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const bcrypt = require('bcryptjs');
const db = require('./database');

const app = express();
const PORT = Number(process.env.PORT || 3000);

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
      WHERE Activo = 1 ORDER BY Nombre, Apellido`).all();
    res.json({ estudiantes });
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
    const estudiante = db.prepare(`SELECT EstudianteID, Nombre, Apellido FROM Estudiantes
      WHERE EstudianteID = ? AND Activo = 1`).get(studentId);
    if (!estudiante) return res.status(404).json({ error: 'No se encontró este estudiante.' });
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
      db.prepare(`INSERT INTO Estudiantes (Nombre, Apellido)
        VALUES (?, ?) ON CONFLICT(Nombre, Apellido) DO NOTHING`).run(nombre, apellido);
      return db.prepare(`SELECT EstudianteID, Nombre, Apellido FROM Estudiantes
        WHERE Nombre = ? AND Apellido = ?`).get(nombre, apellido);
    });
    res.json({ estudiante });
  } catch (error) {
    respondDatabaseError(res, error, 'No se pudo guardar al estudiante.');
  }
});

app.get('/api/profesor/estudiantes', requireTeacher, (_req, res) => {
  try {
    const estudiantes = db.prepare(`SELECT EstudianteID, Nombre, Apellido FROM Estudiantes
      WHERE Activo = 1 ORDER BY Nombre, Apellido`).all();
    res.json({ estudiantes });
  } catch (error) {
    respondDatabaseError(res, error, 'No se pudieron cargar los estudiantes.');
  }
});

app.get('/api/estudiantes/me', (req, res) => {
  const studentId = req.session.studentId;
  if (!studentId) return res.status(401).json({ error: 'No hay un estudiante ingresado.' });

  try {
    const estudiante = db.prepare(`SELECT EstudianteID, Nombre, Apellido FROM Estudiantes
      WHERE EstudianteID = ?`).get(studentId);
    if (!estudiante) return res.status(404).json({ error: 'No se encontró al estudiante de esta sesión.' });
    res.json({ estudiante });
  } catch (error) {
    respondDatabaseError(res, error, 'No se pudo recuperar la sesión del estudiante.');
  }
});

app.get('/api/actividades', (_req, res) => {
  try {
    const actividades = db.prepare(`SELECT ActividadID, Nombre, Descripcion, NivelDificultad
      FROM Actividades WHERE Activa = 1 ORDER BY Nombre`).all();
    res.json({ actividades });
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
      const actividad = db.prepare(`SELECT ActividadID FROM Actividades
        WHERE ActividadID = ? AND Activa = 1`).get(actividadId);
      if (!actividad) return null;

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
    res.json({ intento });
  } catch (error) {
    respondDatabaseError(res, error, 'No se pudo iniciar la actividad.');
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
      if (update.changes === 0) return null;

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
      return guardado;
    });

    if (!resultado) {
      return res.status(404).json({ error: 'No se encontró un intento pendiente de este estudiante.' });
    }
    res.json({
      guardado: true,
      duracionSegundos: resultado.DuracionSegundos,
      fechaTermino: resultado.FechaTermino,
      mensaje: 'Resultado guardado correctamente.'
    });
  } catch (error) {
    respondDatabaseError(res, error, 'No se pudo guardar el resultado.');
  }
});

app.post('/api/profesor/login', async (req, res) => {
  const usuario = typeof req.body?.usuario === 'string' ? req.body.usuario.trim() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!usuario || !password) return res.status(400).json({ error: 'Ingresa usuario y contraseña.' });

  try {
    const profesor = db.prepare(`SELECT ProfesorID, Nombre, Apellido, PasswordHash
      FROM Profesores WHERE Usuario = ? AND Activo = 1`).get(usuario);
    if (!profesor || !(await bcrypt.compare(password, profesor.PasswordHash))) {
      return res.status(401).json({ error: 'Credenciales incorrectas.' });
    }
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

app.get('/api/profesor/resultados', requireTeacher, (req, res) => {
  const nombre = typeof req.query.nombre === 'string' ? req.query.nombre.trim().slice(0, 80) : '';
  const apellido = typeof req.query.apellido === 'string' ? req.query.apellido.trim().slice(0, 80) : '';
  try {
    const resultados = db.prepare(`SELECT E.Nombre, E.Apellido, A.Nombre AS Actividad,
        R.FechaInicio, R.FechaTermino, R.DuracionSegundos, R.Puntuacion, R.Aciertos,
        R.Errores, R.Estado, R.FechaEnvio
      FROM ResultadosActividades R
      JOIN Estudiantes E ON E.EstudianteID = R.EstudianteID
      JOIN Actividades A ON A.ActividadID = R.ActividadID
      WHERE (? = '' OR E.Nombre LIKE '%' || ? || '%')
        AND (? = '' OR E.Apellido LIKE '%' || ? || '%')
      ORDER BY R.FechaInicio DESC LIMIT 500`)
      .all(nombre, nombre, apellido, apellido);
    res.json({ resultados });
  } catch (error) {
    respondDatabaseError(res, error, 'No se pudieron consultar los resultados.');
  }
});

app.listen(PORT, '0.0.0.0', () => console.log(`SoftwareEducativo disponible en http://localhost:${PORT}`));
