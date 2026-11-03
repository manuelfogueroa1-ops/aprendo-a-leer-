// Aprendo a Leer · Aplicación Windows (Electron)
// El backend se ejecuta DENTRO del proceso principal: no requiere terminal ni Node.js externo.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { app, BrowserWindow, dialog, session, safeStorage } = require('electron');

app.setName('Aprendo a Leer');
app.setAppUserModelId('cl.educacion.aprendoaleer');

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  let mainWindow;
  let localServer;
  let database;
  let baseOrigin;
  let quitting = false;
  const appIcon = path.join(__dirname, 'icon-512.png');

  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  // Cada instalación tiene datos permanentes fuera del directorio de instalación.
  // En Windows safeStorage protege estas claves con el usuario de Windows (DPAPI).
  function ensureSettings() {
    const folder = app.getPath('userData');
    fs.mkdirSync(folder, { recursive: true });
    const file = path.join(folder, 'configuracion-local.json');
    const supported = safeStorage.isEncryptionAvailable();
    if (process.platform === 'win32' && !supported) {
      throw new Error('Windows no permitió proteger las claves de la base de datos. Vuelve a iniciar sesión en Windows.');
    }
    if (fs.existsSync(file)) {
      const stored = JSON.parse(fs.readFileSync(file, 'utf8'));
      let raw;
      if (stored.protection === 'safeStorage' && supported) {
        raw = safeStorage.decryptString(Buffer.from(stored.payload, 'base64'));
      } else if (stored.protection === 'plaintext-dev' && process.platform !== 'win32') {
        raw = stored.payload;
      } else {
        throw new Error('No se puede descifrar la configuración existente. No se modificaron tus datos.');
      }
      const config = JSON.parse(raw);
      if (!/^[0-9a-f]{64}$/i.test(config.studentDataKey || '') ||
          typeof config.sessionSecret !== 'string' || config.sessionSecret.length < 24) {
        throw new Error('La configuración local está incompleta. No se modificaron tus datos.');
      }
      return config;
    }
    const config = {
      studentDataKey: crypto.randomBytes(32).toString('hex'),
      sessionSecret: crypto.randomBytes(48).toString('hex')
    };
    const json = JSON.stringify(config);
    const protection = supported ? 'safeStorage' : 'plaintext-dev';
    const payload = supported ? safeStorage.encryptString(json).toString('base64') : json;
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ version: 1, protection, payload }), { mode: 0o600 });
    fs.renameSync(tmp, file);
    return config;
  }

  function openWindow() {
    mainWindow = new BrowserWindow({
      width: 1280, height: 850, minWidth: 790, minHeight: 590,
      show: false, autoHideMenuBar: true,
      title: 'Aprendo a Leer', backgroundColor: '#100e47', icon: appIcon,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    });
    mainWindow.once('ready-to-show', () => mainWindow?.show());
    mainWindow.on('closed', () => { mainWindow = null; });
    mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    mainWindow.webContents.on('will-navigate', (event, url) => {
      if (baseOrigin) {
        try { if (new URL(url).origin === baseOrigin) return; } catch {}
      }
      event.preventDefault();
    });
    // Oculta el botón para instalar la PWA dentro de la aplicación de escritorio.
    mainWindow.webContents.on('did-finish-load', () => {
      if (baseOrigin) {
        mainWindow?.webContents.insertCSS('.app-install-controls{display:none!important}').catch(() => {});
      }
    });
    return mainWindow;
  }

  async function showApp() {
    const { startServer } = require('../backend/server');
    localServer = await startServer(0, '127.0.0.1');
    baseOrigin = `http://127.0.0.1:${localServer.address().port}`;
    await mainWindow.loadURL(`${baseOrigin}/`);
  }


  app.whenReady().then(async () => {
    try {
      const config = ensureSettings();
      process.env.SESSION_SECRET = config.sessionSecret;
      process.env.STUDENT_DATA_KEY = config.studentDataKey;
      process.env.DB_FILE = path.join(app.getPath('userData'), 'datos', 'aprendo-a-leer.sqlite');
      process.env.DESBLOQUEAR_TODO = '0';
      // No se abre ningún puerto en la red: solo en este computador.
      session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
        let trusted = false;
        try { trusted = baseOrigin && new URL(details.requestingUrl).origin === baseOrigin; } catch {}
        callback(Boolean(permission === 'media' && trusted && webContents === mainWindow?.webContents &&
          details.mediaTypes?.includes('audio') && !details.mediaTypes?.includes('video')));
      });
      session.defaultSession.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => {
        return Boolean(permission === 'media' && details.mediaType === 'audio' &&
          requestingOrigin === baseOrigin && webContents === mainWindow?.webContents);
      });
      database = require('../backend/database');
      if (process.argv.includes('--reiniciar-cuenta-docente')) {
        const cantidad = database.prepare('SELECT COUNT(*) AS n FROM Profesores').get().n;
        if (cantidad === 0) {
          dialog.showMessageBoxSync({type:'info',title:'Cuentas docentes',message:'No hay cuentas docentes que reiniciar.'});
          app.quit(); return;
        }
        const eleccion = dialog.showMessageBoxSync({
          type: 'warning', buttons: ['Cancelar', 'Respaldar y reiniciar cuentas'], defaultId: 0, cancelId: 0, noLink: true,
          title: 'Reiniciar cuentas docentes',
          message: `¿Quieres eliminar las ${cantidad} cuenta${cantidad===1?'':'s'} docente${cantidad===1?'':'s'} de este computador?`,
          detail: 'Se creará primero un respaldo completo de la base de datos. Solo se eliminarán las cuentas docentes; estudiantes, resultados y grabaciones permanecerán. Al abrir Aprendo a Leer podrás registrar un nuevo profesor desde «Acceso docente». Esta acción cerrará el acceso de los profesores anteriores.'
        });
        if (eleccion !== 1) {app.quit();return;}
        try {
          const {resetTeacherAccounts} = require('./reset-docente');
          const carpeta = path.join(app.getPath('userData'),'respaldos');
          const {backup: respaldo, cantidad: eliminadas} = resetTeacherAccounts(database, process.env.DB_FILE, carpeta);
          dialog.showMessageBoxSync({type:'info', title:'Cuentas reiniciadas',
            message:`Se reiniciaron ${eliminadas} cuenta(s) docentes.`,detail:`Respaldo guardado en:\n${respaldo}\n\nAbre Aprendo a Leer, entra en «Acceso docente» y pulsa «Crear cuenta de profesor».`});
        } catch (error) {
          dialog.showErrorBox('No se pudo reiniciar', `${error.message}\nNo se eliminaron cuentas docentes.`);
        }
        app.quit();return;
      }
      openWindow();
      // No se muestra una ventana extra de registro: acceso y alta comparten la interfaz web original.
      await showApp();
    } catch (err) {
      dialog.showErrorBox('No se pudo iniciar Aprendo a Leer',
        `${err.message}\n\nTus archivos no se han borrado. Pide ayuda antes de reinstalar o eliminar datos.`);
      app.quit();
    }
  });

  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', () => {
    if (quitting) return;
    quitting = true;
    if (localServer) localServer.close();
    if (database) { try { database.close(); } catch {} }
  });
}
