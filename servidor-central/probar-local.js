// Servidor central de PRUEBA para este mismo computador. No necesita configuración:
// crea sus claves, la cuenta de administrador y un código de conexión listo para pegar.
// Uso: npm run central:prueba   (desde la raíz del proyecto)
// Los datos quedan en servidor-central/datos-prueba/ y se pueden borrar cuando quieras.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');

const carpeta = path.join(__dirname, 'datos-prueba');
fs.mkdirSync(carpeta, { recursive: true });

// Las claves se guardan para poder leer los nombres al volver a iniciar la prueba.
const archivoClaves = path.join(carpeta, 'claves.json');
let claves;
try {
  claves = JSON.parse(fs.readFileSync(archivoClaves, 'utf8'));
} catch {
  claves = { centralDataKey: randomBytes(32).toString('hex'), sessionSecret: randomBytes(32).toString('hex') };
  fs.writeFileSync(archivoClaves, JSON.stringify(claves), { mode: 0o600 });
}

const puerto = process.env.PORT || '8080';
const CLAVE_ADMIN = 'ClaveDePrueba12345';
Object.assign(process.env, {
  DATA_DIR: carpeta,
  HOST: '127.0.0.1',
  PORT: puerto,
  CENTRAL_DATA_KEY: claves.centralDataKey,
  SESSION_SECRET: claves.sessionSecret,
  COOKIE_SECURE: '0',
  ADMIN_USUARIO: 'admin',
  ADMIN_CLAVE: CLAVE_ADMIN,
  NOMBRE_SERVIDOR: 'Servidor de prueba'
});

// Genera un código de conexión nuevo (vale 24 horas) antes de iniciar el servidor.
const { abrirBaseCentral } = require('./src/database');
const { hashToken } = require('./src/cifrado');
const { nuevoCodigo } = require('./src/app');
const db = abrirBaseCentral(path.join(carpeta, 'central.sqlite'));
const codigo = nuevoCodigo();
db.prepare('INSERT INTO CodigosVinculacion (CodigoHash, Descripcion, Expira) VALUES (?, ?, ?)')
  .run(hashToken(codigo.replace(/-/g, '')), 'Prueba local', new Date(Date.now() + 24 * 3600 * 1000).toISOString());
db.close();

console.log(`
============================================================
  SERVIDOR CENTRAL DE PRUEBA
============================================================
  Panel (en el navegador):  http://localhost:${puerto}
  Usuario:                  admin
  Contraseña:               ${CLAVE_ADMIN}

  CÓDIGO DE CONEXIÓN (vale 24 horas, sirve para varios equipos):

      http://localhost:${puerto}/${codigo}

  Pégalo en la aplicación: Acceso docente → Servidor central.
  Para detener el servidor: Ctrl + C
============================================================
`);

require('./server');
