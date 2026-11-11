// Inicio del servidor central. Configuración por variables de entorno (ver .env.example).
'use strict';
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { abrirBaseCentral } = require('./src/database');
const { crearCifrado } = require('./src/cifrado');
const { crearApp, crearAdministrador } = require('./src/app');
const { programarRespaldos } = require('./src/respaldos');

const env = process.env;
const carpetaDatos = path.resolve(__dirname, env.DATA_DIR || 'datos');
const archivoBase = path.resolve(carpetaDatos, env.DB_FILE || 'central.sqlite');
const carpetaRespaldos = path.resolve(carpetaDatos, env.BACKUP_DIR || 'respaldos');

async function iniciar() {
  const db = abrirBaseCentral(archivoBase);
  const cifrado = crearCifrado(env.CENTRAL_DATA_KEY);

  const sinUsuarios = db.prepare('SELECT COUNT(*) AS n FROM Usuarios').get().n === 0;
  if (sinUsuarios && env.ADMIN_USUARIO && env.ADMIN_CLAVE) {
    await crearAdministrador(db, { usuario: env.ADMIN_USUARIO, password: env.ADMIN_CLAVE, nombre: env.ADMIN_NOMBRE, apellido: env.ADMIN_APELLIDO });
    console.log(`Cuenta de administrador «${env.ADMIN_USUARIO}» creada. Quita ADMIN_CLAVE de la configuración.`);
  } else if (sinUsuarios) {
    console.warn('Todavía no hay cuentas. Crea el administrador con: npm run crear-admin -- usuario "contraseña larga"');
  }

  const app = crearApp({
    db,
    cifrado,
    secretoSesion: env.SESSION_SECRET,
    cookieSegura: env.COOKIE_SECURE !== '0',
    confiarProxy: env.TRUST_PROXY ? (/^\d+$/.test(env.TRUST_PROXY) ? Number(env.TRUST_PROXY) : env.TRUST_PROXY) : false,
    nombreServidor: env.NOMBRE_SERVIDOR || 'Aprendo a Leer · Servidor central',
    carpetaFrontend: path.resolve(__dirname, env.FRONTEND_DIR || path.join('..', 'frontend')),
    carpetaRespaldos
  });

  const detenerRespaldos = env.BACKUP_DISABLED === '1' ? () => {}
    : programarRespaldos(db, { carpeta: carpetaRespaldos, cadaHoras: Number(env.BACKUP_HOURS) || 24, mantener: Number(env.BACKUP_KEEP) || 14 });

  const puerto = Number(env.PORT || 8080);
  const host = env.HOST || '0.0.0.0';
  const servidor = app.listen(puerto, host, () => console.log(`Servidor central disponible en http://${host}:${servidor.address().port}`));

  const cerrar = () => {
    detenerRespaldos();
    servidor.close(() => {
      app.locals.cerrar?.();
      try { db.close(); } catch { /* ya cerrada */ }
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on('SIGTERM', cerrar);
  process.on('SIGINT', cerrar);
}

iniciar().catch(error => {
  console.error('No se pudo iniciar el servidor central:', error.message);
  process.exit(1);
});
