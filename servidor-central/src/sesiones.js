// Sesiones del panel docente guardadas en SQLite (sobreviven a reinicios del servidor).
'use strict';
const session = require('express-session');

class AlmacenSesiones extends session.Store {
  constructor(db) {
    super();
    this.db = db;
    this.limpiador = setInterval(() => {
      try { db.prepare('DELETE FROM Sesiones WHERE Expira < ?').run(Date.now()); } catch { /* base cerrada */ }
    }, 15 * 60 * 1000);
    this.limpiador.unref();
  }

  static expira(sesion) {
    const fecha = sesion?.cookie?.expires ? new Date(sesion.cookie.expires).getTime() : NaN;
    return Number.isFinite(fecha) ? fecha : Date.now() + 8 * 60 * 60 * 1000;
  }

  get(sid, cb) {
    try {
      const fila = this.db.prepare('SELECT Datos, Expira FROM Sesiones WHERE SID = ?').get(sid);
      if (!fila || fila.Expira < Date.now()) return cb(null, null);
      cb(null, JSON.parse(fila.Datos));
    } catch (error) { cb(error); }
  }

  set(sid, sesion, cb) {
    try {
      this.db.prepare(`INSERT INTO Sesiones (SID, Datos, Expira) VALUES (?, ?, ?)
        ON CONFLICT(SID) DO UPDATE SET Datos = excluded.Datos, Expira = excluded.Expira`)
        .run(sid, JSON.stringify(sesion), AlmacenSesiones.expira(sesion));
      cb?.(null);
    } catch (error) { cb?.(error); }
  }

  touch(sid, sesion, cb) {
    try {
      this.db.prepare('UPDATE Sesiones SET Expira = ? WHERE SID = ?').run(AlmacenSesiones.expira(sesion), sid);
      cb?.(null);
    } catch (error) { cb?.(error); }
  }

  destroy(sid, cb) {
    try {
      this.db.prepare('DELETE FROM Sesiones WHERE SID = ?').run(sid);
      cb?.(null);
    } catch (error) { cb?.(error); }
  }

  close() { clearInterval(this.limpiador); }
}

module.exports = { AlmacenSesiones };
