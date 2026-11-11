// Crea una cuenta de administrador del panel central.
// Uso: npm run crear-admin -- usuario "ContraseñaDeAlMenos12" "Nombre" "Apellido"
'use strict';
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { abrirBaseCentral } = require('./src/database');
const { crearAdministrador } = require('./src/app');

const [usuario, password, nombre, apellido] = process.argv.slice(2);
const carpetaDatos = path.resolve(__dirname, process.env.DATA_DIR || 'datos');
const db = abrirBaseCentral(path.resolve(carpetaDatos, process.env.DB_FILE || 'central.sqlite'));
crearAdministrador(db, { usuario, password, nombre, apellido })
  .then(() => console.log(`Administrador «${usuario}» creado.`))
  .catch(error => { console.error(error.message); process.exitCode = 1; })
  .finally(() => db.close());
