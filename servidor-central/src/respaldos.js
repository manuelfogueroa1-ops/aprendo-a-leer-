// Copias de respaldo automáticas de la base central.
// Usa VACUUM INTO: genera una copia consistente sin detener el servidor.
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const PATRON = /^respaldo-\d{8}-\d{6}\.sqlite$/;

function listarRespaldos(carpeta) {
  if (!fs.existsSync(carpeta)) return [];
  return fs.readdirSync(carpeta).filter(nombre => PATRON.test(nombre)).sort()
    .map(nombre => ({ nombre, ruta: path.join(carpeta, nombre), fecha: fs.statSync(path.join(carpeta, nombre)).mtime }));
}

function crearRespaldo(db, carpeta, mantener = 14) {
  fs.mkdirSync(carpeta, { recursive: true });
  const marca = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  const destino = path.join(carpeta, `respaldo-${marca}.sqlite`);
  if (fs.existsSync(destino)) return destino;
  const temporal = `${destino}.tmp`;
  fs.rmSync(temporal, { force: true });
  db.exec(`VACUUM INTO '${temporal.replace(/'/g, "''")}'`);
  fs.renameSync(temporal, destino);
  const existentes = listarRespaldos(carpeta);
  for (const viejo of existentes.slice(0, Math.max(0, existentes.length - mantener))) fs.rmSync(viejo.ruta, { force: true });
  return destino;
}

// Revisa cada hora; crea un respaldo cuando el último tiene más de `cadaHoras`.
function programarRespaldos(db, { carpeta, cadaHoras = 24, mantener = 14, registrar = console } = {}) {
  const revisar = () => {
    try {
      const ultimo = listarRespaldos(carpeta).at(-1);
      if (!ultimo || Date.now() - ultimo.fecha.getTime() >= cadaHoras * 3600 * 1000) {
        registrar.log(`Respaldo creado: ${crearRespaldo(db, carpeta, mantener)}`);
      }
    } catch (error) {
      registrar.error('No se pudo crear el respaldo automático:', error.message);
    }
  };
  revisar();
  const temporizador = setInterval(revisar, 60 * 60 * 1000);
  temporizador.unref();
  return () => clearInterval(temporizador);
}

module.exports = { crearRespaldo, listarRespaldos, programarRespaldos };
