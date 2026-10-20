const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
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
if (versionEsquema > 1) {
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

module.exports = db;