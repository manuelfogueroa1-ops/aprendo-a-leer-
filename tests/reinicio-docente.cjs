const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const {resetTeacherAccounts}=require('../electron/reset-docente');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'aprendo-reset-'));
const file=path.join(dir,'datos.sqlite');
const db=new DatabaseSync(file);
try {
  db.exec(`CREATE TABLE Profesores(ProfesorID INTEGER PRIMARY KEY,Activo INTEGER DEFAULT 1);
    CREATE TABLE Estudiantes(EstudianteID INTEGER PRIMARY KEY);
    CREATE TABLE ResultadosActividades(ResultadoID INTEGER PRIMARY KEY);
    CREATE TABLE AudiosPronunciacion(AudioID INTEGER PRIMARY KEY);
    INSERT INTO Profesores VALUES (1,1);INSERT INTO Profesores VALUES (2,1);INSERT INTO Profesores VALUES (3,0);
    INSERT INTO Estudiantes VALUES (1);INSERT INTO ResultadosActividades VALUES (1);
    INSERT INTO AudiosPronunciacion VALUES (1);`);
  const result=resetTeacherAccounts(db,file,path.join(dir,'respaldos'));
  assert.equal(result.cantidad,3);
  assert(fs.existsSync(result.backup));
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM Profesores').get().n,0);
  for(const t of ['Estudiantes','ResultadosActividades','AudiosPronunciacion'])
    assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n,1);
  const restored=new DatabaseSync(result.backup);
  assert.equal(restored.prepare('SELECT COUNT(*) AS n FROM Profesores').get().n,3);
  restored.close();
  assert.throws(()=>resetTeacherAccounts(db,file,path.join(dir,'respaldos')),/No hay cuentas/);
  db.exec('INSERT INTO Profesores VALUES (10,1);');
  assert.equal(resetTeacherAccounts(db,file,path.join(dir,'respaldos')).cantidad,1);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM Profesores').get().n,0);
  console.log('OK: respaldos y reinicio con varias cuentas, una cuenta y ninguna; datos educativos intactos.');
} finally {db.close();fs.rmSync(dir,{recursive:true,force:true});}
