// Prueba aislada del flujo de instalación inicial de escritorio (sin descargar Electron).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const EventEmitter = require('node:events');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aprendo-electron-mock-'));
const ipcHandlers = new Map();
const profesores = [];
let displayedError;
let windowInstance;
let listeningHost, listeningPort;
const app = new EventEmitter();
app.setName = () => {};
app.setAppUserModelId = () => {};
app.requestSingleInstanceLock = () => true;
app.getPath = () => root;
app.whenReady = () => Promise.resolve();
app.quit = () => {};
const session = { defaultSession: { setPermissionRequestHandler() {}, setPermissionCheckHandler() {} } };
class BrowserWindow extends EventEmitter {
  constructor(options) {
    super();
    this.options = options;
    this.visible = false;
    this.webContents = new EventEmitter();
    this.webContents.setWindowOpenHandler = () => {};
    this.webContents.insertCSS = async () => {};
    windowInstance = this;
  }
  async loadFile(file) { this.lastFile = file; }
  async loadURL(url) { this.lastURL = url; }
  isMinimized() { return false; }
  focus() {}
  show() { this.visible = true; }
}
const electron = {
  app, BrowserWindow, session,
  dialog: { showErrorBox(_title,msg) { displayedError = msg; } },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: s => Buffer.from(s),
    decryptString: buf => buf.toString('utf8')
  },
  ipcMain: { handle: (channel, cb) => ipcHandlers.set(channel, cb) }
};
const db = {
  prepare(query) {
    if (/SELECT COUNT\(\*\)/.test(query)) return { get: () => ({ n: profesores.length }) };
    if (/INSERT INTO Profesores/.test(query)) return { run: (...args) => profesores.push(args) };
    throw new Error('Consulta inesperada: ' + query);
  }, close() {}
};
const original = Module._load;
Module._load = function(id, parent, main) {
  const desdeMain = parent?.filename.replace(/\\/g, '/').endsWith('electron/main.js');
  if (id === 'electron') return electron;
  if (id === '../backend/database' && desdeMain) return db;
  if (id === '../backend/server' && desdeMain) {
    return { startServer: async (port, host) => {
      listeningPort = port; listeningHost = host;
      return { address: () => ({port: 51234}), close() {} };
    } };
  }
  if (id === 'bcryptjs' && desdeMain) return { hash: async () => 'hashed-ok' };
  return original.apply(this, arguments);
};
require('../electron/main');
(async () => {
  await new Promise(r => setImmediate(r));
  assert.equal(displayedError, undefined);
  assert.equal(windowInstance.lastFile, undefined, 'No debe mostrar la pantalla extra de primer inicio.');
  assert.equal(windowInstance.options.webPreferences.nodeIntegration, false);
  assert.equal(windowInstance.options.webPreferences.contextIsolation, true);
  assert.equal(windowInstance.options.webPreferences.sandbox, true);
  assert.equal(fs.existsSync(path.join(root,'configuracion-local.json')),true);
  assert.equal(ipcHandlers.has('aprendo:registrar-docente'), false, 'El formulario ahora está dentro de Acceso docente.');
  assert.equal(listeningHost, '127.0.0.1');
  assert.equal(listeningPort, 0);
  assert.equal(windowInstance.lastURL,'http://127.0.0.1:51234/');
  console.log('OK: acceso original directo, claves persistentes, servidor local y protecciones de la ventana.');
})().finally(() => { Module._load = original; fs.rmSync(root,{recursive:true,force:true}); });
