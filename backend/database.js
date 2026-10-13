const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

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

module.exports = db;