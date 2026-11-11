// Cifrado de los nombres de estudiantes en el servidor central (AES-256-GCM).
// La clave CENTRAL_DATA_KEY vive fuera de la base de datos y debe respaldarse aparte.
'use strict';
const { createCipheriv, createDecipheriv, createHmac, createHash, randomBytes } = require('node:crypto');

function crearCifrado(claveHex) {
  if (!/^[\da-f]{64}$/i.test(claveHex || '')) {
    throw new Error('Configura CENTRAL_DATA_KEY con 64 caracteres hexadecimales (32 bytes aleatorios).');
  }
  const clave = Buffer.from(claveHex, 'hex');
  const claveIndice = createHmac('sha256', clave).update('aprendo-a-leer:indice-nombres:v1').digest();

  function cifrar(texto, campo) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', clave, iv);
    cipher.setAAD(Buffer.from(`central:${campo}:v1`));
    const datos = Buffer.concat([cipher.update(String(texto), 'utf8'), cipher.final()]);
    return `v1.${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${datos.toString('base64url')}`;
  }

  function descifrar(valor, campo) {
    const [version, iv, etiqueta, datos] = String(valor).split('.');
    if (version !== 'v1' || !iv || !etiqueta || datos === undefined) throw new Error('Dato cifrado no válido.');
    const decipher = createDecipheriv('aes-256-gcm', clave, Buffer.from(iv, 'base64url'));
    decipher.setAAD(Buffer.from(`central:${campo}:v1`));
    decipher.setAuthTag(Buffer.from(etiqueta, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(datos, 'base64url')), decipher.final()]).toString('utf8');
  }

  // Mismo alumno = mismo nombre y apellido, sin distinguir mayúsculas ni espacios repetidos.
  function claveNombre(nombre, apellido) {
    const normal = `${nombre} ${apellido}`.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('es-CL');
    return createHmac('sha256', claveIndice).update(normal).digest('hex');
  }

  return { cifrar, descifrar, claveNombre };
}

const hashToken = token => createHash('sha256').update(String(token)).digest('hex');

module.exports = { crearCifrado, hashToken };
