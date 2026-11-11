// Tablero del búho: estrellas y minijuegos completados de cada estudiante.
// Se instala desde server.js con: require('./tablero')(app, db, MODO_PRUEBA);
const MINIJUEGOS = ['saltarin', 'mitades', 'lluvia', 'memoria'];
const ORIGENES = ['tablero', 'premio'];

module.exports = function instalarTablero(app, db, modoPrueba = false, avisarCambio = () => {}) {
  db.exec(`CREATE TABLE IF NOT EXISTS MinijuegosEstudiante (
    MinijuegoID INTEGER PRIMARY KEY,
    EstudianteID INTEGER NOT NULL REFERENCES Estudiantes(EstudianteID) ON DELETE CASCADE,
    Minijuego TEXT NOT NULL CHECK (Minijuego IN ('saltarin', 'mitades', 'lluvia', 'memoria')),
    Origen TEXT NOT NULL CHECK (Origen IN ('tablero', 'premio')),
    DuracionSegundos INTEGER NOT NULL DEFAULT 0 CHECK (DuracionSegundos >= 0),
    Estrellas INTEGER NOT NULL CHECK (Estrellas BETWEEN 0 AND 3),
    Fecha TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );
  CREATE INDEX IF NOT EXISTS IX_Minijuegos_Estudiante ON MinijuegosEstudiante(EstudianteID, Minijuego);`);

  const totalEstrellas = estudianteId => Number(db.prepare(
    'SELECT COALESCE(SUM(Estrellas), 0) AS total FROM MinijuegosEstudiante WHERE EstudianteID = ?'
  ).get(estudianteId).total);

  // Estado del camino: minijuegos del tablero ya superados y estrellas acumuladas.
  app.get('/api/tablero', (req, res) => {
    const estudianteId = req.session.studentId;
    if (!estudianteId) return res.status(401).json({ error: 'No hay un estudiante ingresado.' });
    try {
      const minijuegos = db.prepare(`SELECT DISTINCT Minijuego FROM MinijuegosEstudiante
        WHERE EstudianteID = ? AND Origen = 'tablero'`).all(estudianteId).map(fila => fila.Minijuego);
      res.json({ estrellas: totalEstrellas(estudianteId), minijuegos, modoPrueba });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'No se pudo cargar tu camino.' });
    }
  });

  // Guarda un minijuego terminado. Premio y repeticiones dan menos estrellas
  // y no hacen avanzar al búho; la primera vez en el tablero da 3.
  app.post('/api/tablero/minijuego', (req, res) => {
    const estudianteId = req.session.studentId;
    if (!estudianteId) return res.status(401).json({ error: 'Vuelve a ingresar tu nombre para guardar tus estrellas.' });
    const { minijuego, origen = 'tablero', duracionSegundos } = req.body || {};
    if (!MINIJUEGOS.includes(minijuego)) return res.status(400).json({ error: 'Minijuego no válido.' });
    if (!ORIGENES.includes(origen)) return res.status(400).json({ error: 'Origen no válido.' });
    const duracion = Number.isFinite(duracionSegundos) ? Math.min(3600, Math.max(0, Math.round(duracionSegundos))) : 0;

    try {
      db.exec('BEGIN IMMEDIATE');
      try {
        const yaHecho = origen === 'tablero' && db.prepare(`SELECT 1 FROM MinijuegosEstudiante
          WHERE EstudianteID = ? AND Minijuego = ? AND Origen = 'tablero' LIMIT 1`).get(estudianteId, minijuego);
        const ganadas = origen === 'tablero' && !yaHecho ? 3 : origen === 'premio' ? 2 : 1;
        db.prepare(`INSERT INTO MinijuegosEstudiante (EstudianteID, Minijuego, Origen, DuracionSegundos, Estrellas)
          VALUES (?, ?, ?, ?, ?)`).run(estudianteId, minijuego, origen, duracion, ganadas);
        db.exec('COMMIT');
        avisarCambio();
        res.json({ ok: true, ganadas, estrellas: totalEstrellas(estudianteId) });
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'No se pudieron guardar tus estrellas.' });
    }
  });
};