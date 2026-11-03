// Herramienta local excepcional de reinicio de cuentas docentes.
// Conserva intactos estudiantes, avances, resultados y grabaciones.
'use strict';
const path = require('node:path');
const fs = require('node:fs');

function resetTeacherAccounts(db, databasePath, backupDir) {
  const cantidad = db.prepare('SELECT COUNT(*) AS n FROM Profesores').get().n;
  if (cantidad < 1) throw new Error('No hay cuentas docentes que reiniciar. No se modificaron datos.');
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backup = path.join(backupDir, `respaldo-antes-reinicio-${stamp}.sqlite`);
  if (fs.existsSync(backup)) throw new Error('Ya existe un respaldo con ese nombre.');
  // SQLite crea un respaldo consistente aun cuando exista WAL.
  db.prepare('VACUUM INTO ?').run(backup);
  if (!fs.statSync(backup).size) throw new Error('El respaldo no se creó correctamente.');
  const respaldo = require('node:sqlite').DatabaseSync;
  const verificacion = new respaldo(backup);
  try {
    if (verificacion.prepare('SELECT COUNT(*) AS n FROM Profesores').get().n !== cantidad) {
      throw new Error('El respaldo de las cuentas no coincide. No se eliminaron datos.');
    }
  } finally { verificacion.close(); }

  db.exec('BEGIN IMMEDIATE;');
  try {
    if (db.prepare('SELECT COUNT(*) AS n FROM Profesores').get().n !== cantidad) {
      throw new Error('Cambió la cantidad de cuentas. No se modificaron datos.');
    }
    db.exec('DELETE FROM Profesores;');
    db.exec('COMMIT;');
  } catch (error) {
    if (db.isTransaction) db.exec('ROLLBACK;');
    throw error;
  }
  return { backup, cantidad };
}
module.exports = { resetTeacherAccounts };
