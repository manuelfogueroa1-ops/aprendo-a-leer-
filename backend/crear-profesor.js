const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const bcrypt = require('bcryptjs');
const db = require('./database');

async function main() {
  const [usuario, password, nombre, apellido, correo] = process.argv.slice(2);
  if (!usuario || !password || !nombre || !apellido || !correo) {
    console.error('Uso: npm run crear-profesor -- <usuario> <contraseña> <nombre> <apellido> <correo>');
    process.exitCode = 1;
    return;
  }
  if (password.length < 12) {
    console.error('Usa una contraseña de al menos 12 caracteres.');
    process.exitCode = 1;
    return;
  }

  try {
    const hash = await bcrypt.hash(password, 12);
    db.prepare(`INSERT INTO Profesores (Nombre, Apellido, Correo, Usuario, PasswordHash)
      VALUES (?, ?, ?, ?, ?)`).run(nombre, apellido, correo, usuario, hash);
    console.log('Profesor creado correctamente.');
  } catch (error) {
    console.error('No se pudo crear el profesor:', error.message);
    process.exitCode = 1;
  } finally {
    db.close();
  }
}

main();
