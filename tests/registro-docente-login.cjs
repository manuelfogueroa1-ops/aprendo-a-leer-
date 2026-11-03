// Pruebas del registro docente desde la pantalla «Acceso docente».
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const Module = require('node:module');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aprendo-registro-'));
process.env.DB_FILE = path.join(dir,'datos.sqlite');
process.env.STUDENT_DATA_KEY = 'f'.repeat(64);
process.env.SESSION_SECRET = 'ClaveLocalDePruebaMuyLarga123456789';
const routes = new Map();
const app = {use(){}, get(route,...hs){routes.set('GET '+route,hs)}, post(route,...hs){for(const r of Array.isArray(route)?route:[route])routes.set('POST '+r,hs)}, delete(route,...hs){routes.set('DELETE '+route,hs)}, put(route,...hs){routes.set('PUT '+route,hs)}};
function express(){return app;}
express.json=()=>()=>{}; express.static=()=>()=>{}; express.raw=()=>()=>{};
const original = Module._load;
Module._load = function(id,parent,main) {
  if(id==='dotenv')return {config(){}};
  if(id==='express')return express;
  if(id==='express-session')return ()=>()=>{};
  if(id==='helmet')return ()=>()=>{};
  if(id==='bcryptjs')return {compare:async(p,h)=>h===`hash:${p}`,hash:async(p)=>`hash:${p}`};
  if(id==='./piper'&&parent?.filename.endsWith('/backend/server.js'))return {info:()=>({id:'test',voces:[],disponible:false})};
  return original.apply(this,arguments);
};
let db;
(async()=>{try{
  db=require('../backend/database');
  require('../backend/server');
  async function invoke(method,route,{body={},ip='127.0.0.1'}={}) {
    const req={session:{},body,ip,socket:{remoteAddress:ip},params:{}};
    let result;
    const res={statusCode:200,status(c){this.statusCode=c;return this},json(data){result={code:this.statusCode,data};return this},set(){return this}};
    const hs=routes.get(method+' '+route);assert(hs,'Falta ruta '+method+' '+route);
    for(const fn of hs){let next=false;await fn(req,res,()=>next=true);if(!next)break;}
    return result;
  }
  const data={nombre:'Paola',apellido:'Mendoza',usuario:'paola',password:'ClaveTemporal1234',confirmacion:'ClaveTemporal1234'};
  let r=await invoke('GET','/api/profesor/registro/estado'); assert.equal(r.data.primerProfesor,true);
  r=await invoke('POST','/api/profesor/registro',{body:data,ip:'10.0.0.10'});assert.equal(r.code,403);
  r=await invoke('POST','/api/profesor/registro',{body:{...data,confirmacion:'mal'}});assert.equal(r.code,400);
  r=await invoke('POST','/api/profesor/registro',{body:data});assert.equal(r.code,201);
  assert.equal(r.data.profesor.Usuario,'paola');
  r=await invoke('GET','/api/profesor/registro/estado');assert.equal(r.data.primerProfesor,false);
  // Una segunda cuenta local no necesita la contraseña de otra profesora.
  const second={nombre:'Luis',apellido:'Profesor',usuario:'luis',password:'NuevaClaveTemporal123',confirmacion:'NuevaClaveTemporal123'};
  r=await invoke('POST','/api/profesor/registro',{body:second,ip:'10.0.0.10'}); assert.equal(r.code,403);
  r=await invoke('POST','/api/profesor/registro',{body:second}); assert.equal(r.code,201);
  r=await invoke('POST','/api/profesor/registro',{body:second}); assert.equal(r.code,409);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM Profesores WHERE Activo=1').get().n,2);
  assert.equal(routes.has('DELETE /api/profesor/cuentas/:id'),false);
  // Contraseña hash y ninguna alteración del contenido educativo.
  assert.equal(db.prepare('SELECT PasswordHash FROM Profesores WHERE Usuario=?').get('paola').PasswordHash,'hash:ClaveTemporal1234');
  console.log('OK: registro de varias cuentas locales sin autorizador; se bloquea registro remoto.');
}finally{Module._load=original;if(db)db.close();fs.rmSync(dir,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1});
