// Crea un respaldo inmediato de la base central (además de los automáticos diarios).
// Uso: npm run respaldo
'use strict';
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { abrirBaseCentral } = require('./src/database');
const { crearRespaldo } = require('./src/respaldos');

const carpetaDatos = path.resolve(__dirname, process.env.DATA_DIR || 'datos');
const db = abrirBaseCentral(path.resolve(carpetaDatos, process.env.DB_FILE || 'central.sqlite'));
try {
  console.log(`Respaldo creado: ${crearRespaldo(db, path.resolve(carpetaDatos, process.env.BACKUP_DIR || 'respaldos'), Number(process.env.BACKUP_KEEP) || 14)}`);
} finally {
  db.close();
}
