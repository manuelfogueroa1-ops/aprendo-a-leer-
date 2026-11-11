// Base de datos del servidor central (SQLite en modo WAL).
// Guarda lo que envían los computadores de la escuela y las cuentas del panel docente.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const ESQUEMA = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS Usuarios (
  UsuarioID INTEGER PRIMARY KEY,
  Nombre TEXT NOT NULL CHECK (length(trim(Nombre)) BETWEEN 1 AND 80),
  Apellido TEXT NOT NULL CHECK (length(trim(Apellido)) BETWEEN 1 AND 80),
  Usuario TEXT NOT NULL UNIQUE COLLATE NOCASE CHECK (length(Usuario) BETWEEN 3 AND 50),
  PasswordHash TEXT NOT NULL,
  Rol TEXT NOT NULL CHECK (Rol IN ('admin', 'profesor')),
  Activo INTEGER NOT NULL DEFAULT 1 CHECK (Activo IN (0, 1)),
  FechaRegistro TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UltimoAcceso TEXT
);

-- Códigos que el administrador entrega para vincular un computador. Solo se guarda su hash.
CREATE TABLE IF NOT EXISTS CodigosVinculacion (
  CodigoID INTEGER PRIMARY KEY,
  CodigoHash TEXT NOT NULL UNIQUE,
  Descripcion TEXT CHECK (Descripcion IS NULL OR length(Descripcion) <= 120),
  CreadoPor INTEGER REFERENCES Usuarios(UsuarioID),
  FechaCreacion TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  Expira TEXT NOT NULL,
  Usos INTEGER NOT NULL DEFAULT 0,
  Activo INTEGER NOT NULL DEFAULT 1 CHECK (Activo IN (0, 1))
);

-- Cada computador vinculado. El token de acceso se guarda solo como hash SHA-256.
CREATE TABLE IF NOT EXISTS Dispositivos (
  DispositivoID TEXT PRIMARY KEY,
  Nombre TEXT NOT NULL CHECK (length(Nombre) BETWEEN 1 AND 80),
  TokenHash TEXT NOT NULL UNIQUE,
  CodigoID INTEGER REFERENCES CodigosVinculacion(CodigoID),
  FechaVinculo TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UltimoContacto TEXT,
  UltimoEnvio TEXT,
  VersionApp TEXT,
  Activo INTEGER NOT NULL DEFAULT 1 CHECK (Activo IN (0, 1))
);

-- Nombre y Apellido van cifrados (AES-256-GCM). ClaveNombre es un HMAC del nombre
-- normalizado: permite reconocer al mismo alumno creado en dos computadores sin descifrar.
CREATE TABLE IF NOT EXISTS Estudiantes (
  EstudianteUUID TEXT PRIMARY KEY,
  Nombre TEXT NOT NULL,
  Apellido TEXT NOT NULL,
  ClaveNombre TEXT NOT NULL,
  Activo INTEGER NOT NULL DEFAULT 1 CHECK (Activo IN (0, 1)),
  ColorFavorito INTEGER,
  TemaInteres TEXT,
  ModoOscuro INTEGER NOT NULL DEFAULT 0,
  BuhoColor TEXT,
  BuhoAccesorio TEXT,
  ActualizadoEn TEXT NOT NULL,
  DispositivoID TEXT REFERENCES Dispositivos(DispositivoID),
  FechaRecepcion TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS IX_Estudiantes_ClaveNombre ON Estudiantes(ClaveNombre);

-- UUID con que otro computador creó a un alumno que ya existía: apunta al definitivo.
CREATE TABLE IF NOT EXISTS AliasEstudiantes (
  UUID TEXT PRIMARY KEY,
  CanonicoUUID TEXT NOT NULL REFERENCES Estudiantes(EstudianteUUID) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS Intentos (
  IntentoUUID TEXT PRIMARY KEY,
  EstudianteUUID TEXT NOT NULL REFERENCES Estudiantes(EstudianteUUID) ON DELETE CASCADE,
  DispositivoID TEXT NOT NULL REFERENCES Dispositivos(DispositivoID),
  Actividad TEXT NOT NULL,
  FechaInicio TEXT NOT NULL,
  FechaTermino TEXT,
  DuracionSegundos INTEGER,
  Puntuacion REAL,
  Aciertos INTEGER,
  Errores INTEGER,
  Estado TEXT NOT NULL CHECK (Estado IN ('En progreso', 'Completada', 'Abandonada')),
  DetalleResultado TEXT,
  Avance TEXT,
  Version INTEGER NOT NULL,
  FechaRecepcion TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS IX_Intentos_Estudiante ON Intentos(EstudianteUUID, FechaInicio DESC);

CREATE TABLE IF NOT EXISTS Minijuegos (
  MinijuegoUUID TEXT PRIMARY KEY,
  EstudianteUUID TEXT NOT NULL REFERENCES Estudiantes(EstudianteUUID) ON DELETE CASCADE,
  DispositivoID TEXT NOT NULL REFERENCES Dispositivos(DispositivoID),
  Minijuego TEXT NOT NULL,
  Origen TEXT NOT NULL,
  DuracionSegundos INTEGER NOT NULL DEFAULT 0,
  Estrellas INTEGER NOT NULL,
  Fecha TEXT NOT NULL,
  FechaRecepcion TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS IX_Minijuegos_Estudiante ON Minijuegos(EstudianteUUID);

-- Estudiantes quitados: si un computador desconectado los reenvía, no se vuelven a crear.
CREATE TABLE IF NOT EXISTS Eliminados (
  Tipo TEXT NOT NULL,
  UUID TEXT NOT NULL,
  Fecha TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (Tipo, UUID)
);

-- Registro de cambios para que cada computador descargue solo lo nuevo (Seq creciente).
-- Cada registro aparece una sola vez: al cambiar, se reemplaza con un Seq nuevo.
CREATE TABLE IF NOT EXISTS Cambios (
  Seq INTEGER PRIMARY KEY AUTOINCREMENT,
  Tipo TEXT NOT NULL CHECK (Tipo IN ('estudiante', 'intento', 'minijuego')),
  UUID TEXT NOT NULL,
  DispositivoID TEXT,
  UNIQUE (Tipo, UUID)
);

CREATE TABLE IF NOT EXISTS Sesiones (
  SID TEXT PRIMARY KEY,
  Datos TEXT NOT NULL,
  Expira INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS IX_Sesiones_Expira ON Sesiones(Expira);
`;

function abrirBaseCentral(archivo) {
  fs.mkdirSync(path.dirname(archivo), { recursive: true });
  const db = new DatabaseSync(archivo);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA synchronous = NORMAL;');
  db.exec(ESQUEMA);
  const version = db.prepare('PRAGMA user_version').get().user_version;
  if (version > 1) throw new Error(`La base central (versión ${version}) es más reciente que este servidor.`);
  db.exec('PRAGMA user_version = 1;');
  return db;
}

module.exports = { abrirBaseCentral };
