const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { randomUUID } = require('node:crypto');
const { encryptStudentName } = require('./student-name-crypto');

const projectRoot = path.join(__dirname, '..');
const databasePath = path.resolve(
  projectRoot,
  process.env.DB_FILE || path.join('backend', 'data', 'software-educativo.sqlite')
);
fs.mkdirSync(path.dirname(databasePath), { recursive: true });

const db = new DatabaseSync(databasePath);
db.exec('PRAGMA foreign_keys = ON;');
db.exec(fs.readFileSync(path.join(__dirname, 'sqlite', 'schema.sql'), 'utf8'));

// Compatibilidad con la versión 1.2.1, que añadía EsAdministrador.
// La columna se conserva por compatibilidad pero ya no da permisos especiales.
const columnasProfesores = db.prepare('PRAGMA table_info(Profesores)').all().map(columna => columna.name);
if (!columnasProfesores.includes('EsAdministrador')) {
  db.exec('ALTER TABLE Profesores ADD COLUMN EsAdministrador INTEGER NOT NULL DEFAULT 0 CHECK (EsAdministrador IN (0, 1))');
}
// Migración: las bases creadas antes de las preferencias del estudiante
// (color favorito, tema de interés y modo oscuro) reciben las columnas nuevas
// sin perder ningún dato.
const columnasEstudiantes = db.prepare('PRAGMA table_info(Estudiantes)').all().map(columna => columna.name);
const columnasNuevas = [
  ['ColorFavorito', 'INTEGER CHECK (ColorFavorito IS NULL OR ColorFavorito BETWEEN 0 AND 359)'],
  ['TemaInteres', 'TEXT CHECK (TemaInteres IS NULL OR length(TemaInteres) <= 30)'],
  ['ModoOscuro', 'INTEGER NOT NULL DEFAULT 0 CHECK (ModoOscuro IN (0, 1))']
];
for (const [nombre, definicion] of columnasNuevas) {
  if (!columnasEstudiantes.includes(nombre)) {
    db.exec(`ALTER TABLE Estudiantes ADD COLUMN ${nombre} ${definicion}`);
  }
}

const versionEsquema = db.prepare('PRAGMA user_version').get().user_version;
if (versionEsquema > 2) {
  throw new Error(`La versión del esquema de estudiantes (${versionEsquema}) es más reciente que la compatible.`);
}
if (versionEsquema < 1) {
  const estudiantes = db.prepare(`SELECT EstudianteID, Nombre, Apellido, FechaRegistro, Activo,
      ColorFavorito, TemaInteres, ModoOscuro
    FROM Estudiantes`).all();
  db.exec('PRAGMA foreign_keys = OFF;');
  try {
    db.exec('BEGIN IMMEDIATE;');
    db.exec(`CREATE TABLE Estudiantes_cifrada (
      EstudianteID INTEGER PRIMARY KEY,
      Nombre TEXT NOT NULL,
      Apellido TEXT NOT NULL,
      FechaRegistro TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      Activo INTEGER NOT NULL DEFAULT 1 CHECK (Activo IN (0, 1)),
      ColorFavorito INTEGER CHECK (ColorFavorito IS NULL OR ColorFavorito BETWEEN 0 AND 359),
      TemaInteres TEXT CHECK (TemaInteres IS NULL OR length(TemaInteres) <= 30),
      ModoOscuro INTEGER NOT NULL DEFAULT 0 CHECK (ModoOscuro IN (0, 1))
    );`);
    const insertarEstudiante = db.prepare(`INSERT INTO Estudiantes_cifrada
      (EstudianteID, Nombre, Apellido, FechaRegistro, Activo, ColorFavorito, TemaInteres, ModoOscuro)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const estudiante of estudiantes) {
      insertarEstudiante.run(
        estudiante.EstudianteID,
        encryptStudentName(estudiante.Nombre, 'nombre'),
        encryptStudentName(estudiante.Apellido, 'apellido'),
        estudiante.FechaRegistro,
        estudiante.Activo,
        estudiante.ColorFavorito,
        estudiante.TemaInteres,
        estudiante.ModoOscuro
      );
    }
    db.exec('DROP TABLE Estudiantes;');
    db.exec('ALTER TABLE Estudiantes_cifrada RENAME TO Estudiantes;');
    db.exec('PRAGMA user_version = 1;');
    db.exec('COMMIT;');
  } catch (error) {
    if (db.isTransaction) db.exec('ROLLBACK;');
    throw error;
  } finally {
    db.exec('PRAGMA foreign_keys = ON;');
  }
}

for (const nombre of ['BuhoColor', 'BuhoAccesorio']) {
  const columnas = db.prepare('PRAGMA table_info(Estudiantes)').all().map(columna => columna.name);
  if (!columnas.includes(nombre)) db.exec(`ALTER TABLE Estudiantes ADD COLUMN ${nombre} TEXT`);
}

// Versión 2: cada estudiante, intento y minijuego recibe un identificador único (UUID)
// para enviarlo al servidor central sin duplicados. SyncVersion aumenta con cada cambio
// local; SyncEnviada es la última versión que el servidor confirmó. Pendiente = distintas.
// EquipoOrigen es NULL en lo hecho en este computador y guarda el nombre del equipo
// en los registros recibidos desde otros computadores.
const TABLAS_SINCRONIZADAS = {
  Estudiantes: [['ActualizadoEn', 'TEXT']],
  ResultadosActividades: [['EquipoOrigen', 'TEXT']],
  MinijuegosEstudiante: [['EquipoOrigen', 'TEXT']]
};
const UUID_SQL = `lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2)
  || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))`;
try {
  db.exec('BEGIN IMMEDIATE;');
  for (const [tabla, extras] of Object.entries(TABLAS_SINCRONIZADAS)) {
    const existentes = db.prepare(`PRAGMA table_info(${tabla})`).all().map(columna => columna.name);
    const nuevas = [
      ['UUID', 'TEXT'],
      ['SyncVersion', 'INTEGER NOT NULL DEFAULT 1'],
      ['SyncEnviada', 'INTEGER NOT NULL DEFAULT 0'],
      ...extras
    ];
    for (const [nombre, definicion] of nuevas) {
      if (!existentes.includes(nombre)) db.exec(`ALTER TABLE ${tabla} ADD COLUMN ${nombre} ${definicion}`);
    }
    // Registros existentes: se les asigna su identificador y quedan pendientes de envío.
    const sinUuid = db.prepare(`SELECT rowid AS id FROM ${tabla} WHERE UUID IS NULL`).all();
    const asignar = db.prepare(`UPDATE ${tabla} SET UUID = ? WHERE rowid = ?`);
    for (const fila of sinUuid) asignar.run(randomUUID(), fila.id);
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS UX_${tabla}_UUID ON ${tabla}(UUID);
      CREATE INDEX IF NOT EXISTS IX_${tabla}_Pendientes ON ${tabla}(SyncVersion, SyncEnviada);
      CREATE TRIGGER IF NOT EXISTS TR_${tabla}_UUID AFTER INSERT ON ${tabla} WHEN NEW.UUID IS NULL
      BEGIN UPDATE ${tabla} SET UUID = ${UUID_SQL} WHERE rowid = NEW.rowid; END;`);
  }
  db.exec(`UPDATE Estudiantes SET ActualizadoEn = COALESCE(ActualizadoEn, FechaRegistro);
    CREATE TRIGGER IF NOT EXISTS TR_Estudiantes_ActualizadoEn AFTER INSERT ON Estudiantes WHEN NEW.ActualizadoEn IS NULL
    BEGIN UPDATE Estudiantes SET ActualizadoEn = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE rowid = NEW.rowid; END;
    PRAGMA user_version = 2;`);
  db.exec('COMMIT;');
} catch (error) {
  if (db.isTransaction) db.exec('ROLLBACK;');
  throw error;
}

module.exports = db;