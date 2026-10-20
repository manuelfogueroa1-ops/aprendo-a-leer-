PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS Estudiantes (
  EstudianteID INTEGER PRIMARY KEY,
  Nombre TEXT NOT NULL,
  Apellido TEXT NOT NULL,
  FechaRegistro TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  Activo INTEGER NOT NULL DEFAULT 1 CHECK (Activo IN (0, 1)),
  ColorFavorito INTEGER CHECK (ColorFavorito IS NULL OR ColorFavorito BETWEEN 0 AND 359),
  TemaInteres TEXT CHECK (TemaInteres IS NULL OR length(TemaInteres) <= 30),
  ModoOscuro INTEGER NOT NULL DEFAULT 0 CHECK (ModoOscuro IN (0, 1))
);

CREATE TABLE IF NOT EXISTS Profesores (
  ProfesorID INTEGER PRIMARY KEY,
  Nombre TEXT NOT NULL CHECK (length(trim(Nombre)) BETWEEN 1 AND 80),
  Apellido TEXT NOT NULL CHECK (length(trim(Apellido)) BETWEEN 1 AND 80),
  Correo TEXT NOT NULL UNIQUE CHECK (length(trim(Correo)) <= 150),
  Usuario TEXT NOT NULL UNIQUE CHECK (length(trim(Usuario)) BETWEEN 1 AND 50),
  PasswordHash TEXT NOT NULL,
  Activo INTEGER NOT NULL DEFAULT 1 CHECK (Activo IN (0, 1)),
  FechaRegistro TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS Actividades (
  ActividadID INTEGER PRIMARY KEY,
  Nombre TEXT NOT NULL UNIQUE CHECK (length(trim(Nombre)) BETWEEN 1 AND 150),
  Descripcion TEXT CHECK (Descripcion IS NULL OR length(Descripcion) <= 500),
  NivelDificultad TEXT CHECK (NivelDificultad IS NULL OR length(NivelDificultad) <= 30),
  Activa INTEGER NOT NULL DEFAULT 1 CHECK (Activa IN (0, 1)),
  FechaCreacion TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS ResultadosActividades (
  ResultadoID INTEGER PRIMARY KEY,
  EstudianteID INTEGER NOT NULL REFERENCES Estudiantes(EstudianteID),
  ActividadID INTEGER NOT NULL REFERENCES Actividades(ActividadID),
  FechaInicio TEXT NOT NULL,
  FechaTermino TEXT,
  DuracionSegundos INTEGER CHECK (DuracionSegundos IS NULL OR DuracionSegundos >= 0),
  Puntuacion REAL CHECK (Puntuacion IS NULL OR Puntuacion BETWEEN 0 AND 100),
  Aciertos INTEGER CHECK (Aciertos IS NULL OR Aciertos >= 0),
  Errores INTEGER CHECK (Errores IS NULL OR Errores >= 0),
  Estado TEXT NOT NULL DEFAULT 'En progreso'
    CHECK (Estado IN ('En progreso', 'Completada', 'Abandonada')),
  DetalleResultado TEXT,
  FechaEnvio TEXT,
  CHECK (FechaTermino IS NULL OR FechaTermino >= FechaInicio)
);

CREATE TABLE IF NOT EXISTS ProgresoEstudiante (
  ProgresoID INTEGER PRIMARY KEY,
  EstudianteID INTEGER NOT NULL UNIQUE REFERENCES Estudiantes(EstudianteID),
  ActividadesIniciadas INTEGER NOT NULL DEFAULT 0 CHECK (ActividadesIniciadas >= 0),
  ActividadesCompletadas INTEGER NOT NULL DEFAULT 0
    CHECK (ActividadesCompletadas >= 0 AND ActividadesCompletadas <= ActividadesIniciadas),
  PorcentajeProgreso REAL NOT NULL DEFAULT 0 CHECK (PorcentajeProgreso BETWEEN 0 AND 100),
  UltimaActividad TEXT,
  FechaActualizacion TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS IX_Resultados_Estudiante_Fecha
  ON ResultadosActividades(EstudianteID, FechaInicio DESC);
CREATE INDEX IF NOT EXISTS IX_Resultados_Actividad
  ON ResultadosActividades(ActividadID);

INSERT OR IGNORE INTO Actividades (Nombre, Descripcion, NivelDificultad) VALUES
  ('Reconozco las letras', 'Aprende a reconocer una por una las letras del alfabeto y relaciónalas con palabras e imágenes.', '1'),
  ('Formo sílabas', 'Combina consonantes y vocales para leer sílabas como PA, PE, PI, PO y PU.', '2'),
  ('Uno la palabra con su imagen', 'Une cada palabra con la imagen que la representa.', '3'),
  ('Aprendo las sílabas', 'Ordena las sílabas y forma la palabra representada en la imagen.', 'Inicial'),
  ('Practico la pronunciación', 'Escucha y practica en voz alta palabras acompañadas de imágenes.', 'Inicial'),
  ('Encuentro la letra', 'Mira la imagen y elige la letra que falta para completar la palabra.', 'Inicial');

UPDATE Actividades SET NivelDificultad = CASE Nombre
  WHEN 'Reconozco las letras' THEN '1'
  WHEN 'Formo sílabas' THEN '2'
  WHEN 'Uno la palabra con su imagen' THEN '3'
  WHEN 'Encuentro la letra' THEN '4'
  WHEN 'Aprendo las sílabas' THEN '5'
  WHEN 'Practico la pronunciación' THEN '6'
  ELSE NivelDificultad
END
WHERE Nombre IN (
  'Reconozco las letras', 'Formo sílabas', 'Uno la palabra con su imagen',
  'Encuentro la letra', 'Aprendo las sílabas', 'Practico la pronunciación'
);

-- Desactiva la antigua demostración en bases ya creadas; conserva el historial de resultados.
UPDATE Actividades SET Activa = 0 WHERE Nombre = 'Actividad de ejemplo';
CREATE TABLE IF NOT EXISTS AudiosPronunciacion (
  AudioID INTEGER PRIMARY KEY,
  ResultadoID INTEGER NOT NULL REFERENCES ResultadosActividades(ResultadoID) ON DELETE CASCADE,
  EstudianteID INTEGER NOT NULL REFERENCES Estudiantes(EstudianteID) ON DELETE CASCADE,
  Palabra TEXT NOT NULL CHECK (length(Palabra) BETWEEN 1 AND 40),
  TipoMime TEXT NOT NULL,
  Datos BLOB NOT NULL,
  FechaRegistro TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS IX_Audios_Estudiante ON AudiosPronunciacion(EstudianteID, FechaRegistro DESC);
