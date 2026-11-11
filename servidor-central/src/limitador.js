// Límite de intentos fallidos (inicio de sesión y códigos de vinculación). Vive en memoria.
'use strict';

function crearLimitador({ maximo = 5, bloqueoMs = 60 * 1000, ventanaMs = 15 * 60 * 1000 } = {}) {
  const registros = new Map();
  const limpiar = setInterval(() => {
    const ahora = Date.now();
    for (const [clave, r] of registros) if (ahora - r.desde > ventanaMs && !(r.bloqueadoHasta > ahora)) registros.delete(clave);
  }, 5 * 60 * 1000);
  limpiar.unref();

  return {
    // Segundos que faltan para poder intentar de nuevo (0 = puede intentar).
    espera(clave) {
      const r = registros.get(clave);
      if (!r?.bloqueadoHasta) return 0;
      const resto = r.bloqueadoHasta - Date.now();
      if (resto <= 0) { registros.delete(clave); return 0; }
      return Math.ceil(resto / 1000);
    },
    // Devuelve cuántos intentos quedan (0 = recién bloqueado).
    fallo(clave) {
      const ahora = Date.now();
      const previo = registros.get(clave);
      const r = previo && ahora - previo.desde < ventanaMs ? previo : { conteo: 0, desde: ahora };
      r.conteo += 1;
      if (r.conteo >= maximo) r.bloqueadoHasta = ahora + bloqueoMs;
      registros.set(clave, r);
      return Math.max(0, maximo - r.conteo);
    },
    exito(clave) { registros.delete(clave); },
    segundosBloqueo: Math.ceil(bloqueoMs / 1000)
  };
}

module.exports = { crearLimitador };
