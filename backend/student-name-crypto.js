const { createCipheriv, createDecipheriv, randomBytes } = require('node:crypto');

const configuredKey = process.env.STUDENT_DATA_KEY;
if (!/^[\da-f]{64}$/i.test(configuredKey || '')) {
  throw new Error('Configura STUDENT_DATA_KEY en .env con una clave aleatoria de 64 caracteres hexadecimales.');
}

const key = Buffer.from(configuredKey, 'hex');

function encryptStudentName(value, field) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(`student:${field}:v1`));
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString('base64url')}.${tag.toString('base64url')}.${ciphertext.toString('base64url')}`;
}

function decryptStudentName(value, field) {
  const [version, encodedIv, encodedTag, encodedCiphertext] = value.split('.');
  if (version !== 'v1' || !encodedIv || !encodedTag || encodedCiphertext === undefined) {
    throw new Error(`El campo cifrado del estudiante (${field}) no tiene un formato válido.`);
  }

  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(encodedIv, 'base64url'));
  decipher.setAAD(Buffer.from(`student:${field}:v1`));
  decipher.setAuthTag(Buffer.from(encodedTag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(encodedCiphertext, 'base64url')),
    decipher.final()
  ]).toString('utf8');
}

// Audios: iv (12) + etiqueta (16) + datos cifrados, con la misma clave que los nombres.
function encryptBinary(buffer) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from('student:audio:v1'));
  const ciphertext = Buffer.concat([cipher.update(buffer), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
}

function decryptBinary(buffer) {
  const decipher = createDecipheriv('aes-256-gcm', key, buffer.subarray(0, 12));
  decipher.setAAD(Buffer.from('student:audio:v1'));
  decipher.setAuthTag(buffer.subarray(12, 28));
  return Buffer.concat([decipher.update(buffer.subarray(28)), decipher.final()]);
}

function decryptStudent(student) {
  return {
    ...student,
    Nombre: decryptStudentName(student.Nombre, 'nombre'),
    Apellido: decryptStudentName(student.Apellido, 'apellido')
  };
}

module.exports = { encryptStudentName, decryptStudentName, decryptStudent, encryptBinary, decryptBinary };
