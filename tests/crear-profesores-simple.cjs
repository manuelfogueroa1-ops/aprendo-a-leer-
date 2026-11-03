const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),Module=require('node:module');
const {DatabaseSync}=require('node:sqlite');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'aprendo-crear-'));
process.env.DB_FILE=path.join(dir,'datos.sqlite');
process.env.STUDENT_DATA_KEY='f'.repeat(64);process.env.SESSION_SECRET='ClaveDePruebaParaSesionLocal123456789';
const routes=new Map();
const app={use(){},get(route,...handlers){routes.set('GET '+route,handlers)},post(route,...handlers){for(const r of Array.isArray(route)?route:[route])routes.set('POST '+r,handlers)},delete(route,...handlers){routes.set('DELETE '+route,handlers)},put(route,...handlers){routes.set('PUT '+route,handlers)}};
function express(){return app} express.json=()=>()=>{};express.static=()=>()=>{};express.raw=()=>()=>{};
const original=Module._load;
Module._load=function(id,parent,main){if(id==='dotenv')return{config(){}};if(id==='express')return express;if(id==='express-session')return()=>()=>{};if(id==='helmet')return()=>()=>{};if(id==='bcryptjs')return{compare:async(p,h)=>h===`hash:${p}`,hash:async(p)=>`hash:${p}`};if(id==='./piper'&&parent?.filename.endsWith('/backend/server.js'))return{info:()=>({id:'test',voces:[],disponible:false})};return original.apply(this,arguments)};
let db;
(async()=>{try{
  db=require('../backend/database');
  db.prepare('INSERT INTO Profesores(Nombre,Apellido,Usuario,Correo,PasswordHash) VALUES(?,?,?,?,?)').run('Ana','Docente','ana','ana@ejemplo.invalid','hash:clave-antigua-123');
  require('../backend/server');
  async function invoke(method,route,{body={},teacherId=1}={}){const req={session:{teacherId,teacherName:'Ana Docente'},body,ip:'127.0.0.1',params:{}};let result;const res={statusCode:200,status(c){this.statusCode=c;return this},json(x){result={code:this.statusCode,data:x};return this},set(){return this}};const hs=routes.get(method+' '+route);assert(hs,'Falta la ruta '+route);for(const fn of hs){let next=false;await fn(req,res,()=>next=true);if(!next)break}return result;}
  let r=await invoke('POST','/api/profesor/cuentas',{body:{nombre:'Luis',apellido:'Profesor',usuario:'luis',password:'nueva-clave-larga-123',passwordActual:'incorrecta'}});assert.equal(r.code,403);
  r=await invoke('POST','/api/profesor/cuentas',{body:{nombre:'Luis',apellido:'Profesor',usuario:'luis',password:'nueva-clave-larga-123',passwordActual:'clave-antigua-123'}});assert.equal(r.code,201);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM Profesores').get().n,2);
  assert(!routes.has('DELETE /api/profesor/cuentas/:id'),'No debe existir la ruta para eliminar cuentas');
  r=await invoke('POST','/api/profesor/cuentas',{teacherId:999,body:{nombre:'Fake',apellido:'Profesor',usuario:'fake',password:'nueva-clave-larga-123',passwordActual:'clave-antigua-123'}});assert.equal(r.code,401);
  console.log('OK: docente crea cuenta confirmando contraseña, sin permisos admin y sin API para eliminar docentes.');
}finally {Module._load=original;if(db)db.close();fs.rmSync(dir,{recursive:true,force:true})}})().catch(e=>{console.error(e);process.exitCode=1});
