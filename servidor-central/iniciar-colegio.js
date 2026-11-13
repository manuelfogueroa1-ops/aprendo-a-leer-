// Servidor central para un computador Windows dentro de la red del colegio.
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomBytes, X509Certificate, createHash, createPrivateKey } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { createInterface } = require('node:readline/promises');

function ipPrivada(ip) {
  return /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(ip);
}

function certificados(carpeta, ip) {
  const autoridad = path.join(carpeta, 'certificado-colegio.crt');
  const certificadoPublico = path.join(carpeta, 'certificado-colegio.cer');
  const claveAutoridad = path.join(carpeta, 'clave-autoridad.pem');
  const cert = path.join(carpeta, `servidor-${ip}.crt`);
  const key = path.join(carpeta, `servidor-${ip}.key`);
  const solicitud = path.join(carpeta, 'servidor.csr');
  const extensiones = path.join(carpeta, 'servidor.ext');
  const gitOpenSsl = path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Git', 'usr', 'bin', 'openssl.exe');
  const openssl = (...args) => {
    try {
      execFileSync(fs.existsSync(gitOpenSsl) ? gitOpenSsl : 'openssl', args, { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    } catch (error) {
      if (error.code === 'ENOENT') throw new Error('Instala Git para Windows para preparar el certificado del colegio.');
      throw new Error(`No se pudo preparar el certificado: ${error.stderr?.toString().trim() || error.message}`);
    }
  };
  if (fs.existsSync(autoridad) !== fs.existsSync(claveAutoridad)) {
    throw new Error('Falta un archivo de la autoridad del colegio. Restaura la carpeta del servidor desde su respaldo.');
  }
  if (!fs.existsSync(autoridad)) {
    openssl('req', '-x509', '-newkey', 'rsa:3072', '-nodes', '-sha256', '-days', '3650',
      '-subj', '/CN=Aprendo a Leer - Red del colegio', '-addext', 'basicConstraints=critical,CA:TRUE,pathlen:0',
      '-addext', 'keyUsage=critical,keyCertSign,cRLSign', '-addext', 'extendedKeyUsage=serverAuth',
      '-keyout', claveAutoridad, '-out', autoridad);
  }
  fs.writeFileSync(certificadoPublico, new X509Certificate(fs.readFileSync(autoridad)).raw);
  const vigente = fs.existsSync(cert) && fs.existsSync(key) && new X509Certificate(fs.readFileSync(cert));
  const renovar = !vigente || !vigente.checkPrivateKey(createPrivateKey(fs.readFileSync(key))) ||
    Date.parse(vigente.validTo) < Date.now() + 30 * 86400000;
  if (renovar) {
    fs.writeFileSync(extensiones, `basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=IP:${ip}\n`);
    try {
      openssl('req', '-new', '-newkey', 'rsa:2048', '-nodes', '-subj', `/CN=${ip}`, '-keyout', key, '-out', solicitud);
      openssl('x509', '-req', '-in', solicitud, '-CA', autoridad, '-CAkey', claveAutoridad,
        '-set_serial', `0x${randomBytes(16).toString('hex')}`, '-days', '365', '-sha256', '-extfile', extensiones, '-out', cert);
    } finally {
      fs.rmSync(solicitud, { force: true });
      fs.rmSync(extensiones, { force: true });
    }
  }
  return { cert, key, certificadoPublico };
}

async function iniciarColegio() {
  const ips = [...new Set(Object.values(os.networkInterfaces()).flat()
    .filter(interfaz => !interfaz.internal && interfaz.family === 'IPv4' && ipPrivada(interfaz.address))
    .map(interfaz => interfaz.address))];
  if (!ips.length) throw new Error('Conecta este computador a la red local del colegio.');
  let ip = process.argv[2];
  if (!ip && ips.length > 1) {
    const terminal = createInterface({ input: process.stdin, output: process.stdout });
    try { ip = (await terminal.question(`IP de este equipo en la red del colegio (${ips.join(', ')}): `)).trim(); }
    finally { terminal.close(); }
  }
  ip ||= ips[0];
  if (!ips.includes(ip)) throw new Error('La IP debe pertenecer a este computador en la red local.');
  const puerto = Number(process.env.PUERTO_COLEGIO || 8443);
  if (!Number.isInteger(puerto) || puerto < 1024 || puerto > 65535) throw new Error('El puerto del colegio debe estar entre 1024 y 65535.');

  const carpeta = path.join(process.env.LOCALAPPDATA || os.homedir(), 'AprendoALeerCentral');
  fs.mkdirSync(carpeta, { recursive: true, mode: 0o700 });
  const archivoClaves = path.join(carpeta, 'claves.json');
  const archivoDb = path.join(carpeta, 'central.sqlite');
  if (!fs.existsSync(archivoClaves)) {
    if (fs.existsSync(archivoDb)) throw new Error('Falta claves.json. Restaura la configuración antes de iniciar.');
    fs.writeFileSync(archivoClaves, JSON.stringify({ datos: randomBytes(32).toString('hex'), sesion: randomBytes(32).toString('hex') }), { flag: 'wx', mode: 0o600 });
  }
  const claves = JSON.parse(fs.readFileSync(archivoClaves, 'utf8'));
  if (![claves.datos, claves.sesion].every(clave => typeof clave === 'string' && /^[a-f0-9]{64}$/.test(clave))) {
    throw new Error('El archivo claves.json está incompleto. Restaura la configuración antes de iniciar.');
  }
  const { cert, key, certificadoPublico } = certificados(carpeta, ip);
  const { abrirBaseCentral } = require('./src/database');
  const db = abrirBaseCentral(archivoDb);
  let claveInicial;
  try {
    if (db.prepare('SELECT COUNT(*) AS total FROM Usuarios').get().total === 0) {
      claveInicial = randomBytes(18).toString('base64url');
      await require('./src/app').crearAdministrador(db, { usuario: 'admin', password: claveInicial });
    }
  } finally { db.close(); }

  Object.assign(process.env, {
    HOST: ip, PORT: String(puerto), DATA_DIR: carpeta, DB_FILE: 'central.sqlite', BACKUP_DIR: 'respaldos',
    CENTRAL_DATA_KEY: claves.datos, SESSION_SECRET: claves.sesion, TLS_CERT: cert, TLS_KEY: key,
    COOKIE_SECURE: '1', TRUST_PROXY: '', BACKUP_DISABLED: '0', ADMIN_USUARIO: '', ADMIN_CLAVE: '',
    NOMBRE_SERVIDOR: 'Aprendo a Leer · Red del colegio', FRONTEND_DIR: path.join(__dirname, '..', 'frontend')
  });
  console.log(`Panel del colegio: https://${ip}:${puerto}`);
  console.log(`Certificado público para los equipos del colegio: ${certificadoPublico}`);
  console.log(`Huella SHA-256: ${createHash('sha256').update(fs.readFileSync(certificadoPublico)).digest('hex')}`);
  if (claveInicial) console.log(`Usuario inicial: admin\nContraseña inicial: ${claveInicial}\nGuárdala y cámbiala desde Mi cuenta.`);
  console.log('Mantén esta ventana abierta mientras el colegio use el panel.');
  require('./server');
}

iniciarColegio().catch(error => {
  console.error(`No se pudo iniciar el servidor del colegio: ${error.message}`);
  process.exitCode = 1;
});
