// Comprueba que los nombres de los estudiantes estén cifrados en la base de datos.
// Uso: npm run verificar-cifrado
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { DatabaseSync } = require('node:sqlite');
const { decryptStudentName } = require('./student-name-crypto');

const ruta = path.resolve(path.join(__dirname, '..'), process.env.DB_FILE || path.join('backend', 'data', 'software-educativo.sqlite'));
if (!fs.existsSync(ruta)) { console.log('No se encontró la base de datos en:', ruta); process.exit(1); }

const db = new DatabaseSync(ruta);
const filas = db.prepare('SELECT EstudianteID, Nombre, Apellido FROM Estudiantes').all();
const formato = /^v1\.[\w-]+\.[\w-]+\.[\w-]*$/;
let cifrados = 0, sinCifrar = 0, ilegibles = 0;
const nombres = [];
for (const f of filas) {
  if (!formato.test(f.Nombre) || !formato.test(f.Apellido)) { sinCifrar++; console.log(`✗ Estudiante ${f.EstudianteID}: guardado SIN cifrar`); continue; }
  try {
    nombres.push(decryptStudentName(f.Nombre, 'nombre'), decryptStudentName(f.Apellido, 'apellido'));
    cifrados++;
  } catch { ilegibles++; console.log(`✗ Estudiante ${f.EstudianteID}: no se pudo descifrar (¿cambió STUDENT_DATA_KEY?)`); }
}

// Busca los nombres reales dentro de los bytes del archivo (y su registro WAL).
const expuestos = new Set();
for (const archivo of [ruta, ruta + '-wal', ruta + '-journal'].filter(fs.existsSync)) {
  const bytes = fs.readFileSync(archivo);
  for (const n of nombres) if (n.length >= 3 && bytes.includes(Buffer.from(n, 'utf8'))) expuestos.add(n);
}

console.log(`\nBase de datos: ${ruta}`);
console.log(`Estudiantes: ${filas.length} | cifrados y legibles: ${cifrados} | sin cifrar: ${sinCifrar} | ilegibles: ${ilegibles}`);
if (filas[0]) console.log(`Ejemplo de lo guardado: ${filas[0].Nombre.slice(0, 48)}…`);
console.log(expuestos.size
  ? `✗ Se encontraron ${expuestos.size} nombre(s) en texto plano dentro del archivo.`
  : '✓ Ningún nombre aparece en texto plano dentro del archivo de la base de datos.');
let totalAudios = 0, audiosSinCifrar = 0;
try {
  const firmas = [Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.from('OggS'), Buffer.from('RIFF'), Buffer.from('ID3')];
  for (const a of db.prepare('SELECT Datos FROM AudiosPronunciacion').all()) {
    totalAudios++;
    const b = Buffer.from(a.Datos);
    if (firmas.some(f => b.subarray(0, f.length).equals(f)) || b.subarray(0, 64).includes('ftyp')) audiosSinCifrar++;
  }
} catch { /* la tabla de audios aún no existe */ }
console.log(`Audios guardados: ${totalAudios} | sin cifrar: ${audiosSinCifrar}`);
process.exit(sinCifrar || ilegibles || expuestos.size || audiosSinCifrar ? 1 : 0);
