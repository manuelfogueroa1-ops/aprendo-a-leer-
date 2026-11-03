const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createHash } = require('node:crypto');
const { createInterface } = require('node:readline');
const root = path.resolve(__dirname, '..');
const python = process.env.PIPER_PYTHON || path.join(root, '.venv-piper', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
const kokoroModel = path.join(__dirname, 'voices/kokoro/kokoro-v1.0.onnx');
const kokoroVoices = path.join(__dirname, 'voices/kokoro/voices-v1.0.bin');
const engine = process.env.LOCAL_TTS_ENGINE || (fs.existsSync(kokoroModel) && fs.existsSync(kokoroVoices) ? 'kokoro' : 'piper');
const model = engine === 'kokoro' ? kokoroModel : process.env.PIPER_MODEL || path.join(__dirname, 'voices/es_MX-claude-high.onnx');
const voiceId = engine === 'kokoro' ? 'kokoro:ef_dora' : 'piper:es_MX-claude-high';
const cache = new Map();
const pending = new Map();
const generating = new Map();
let bytes = 0, nextId = 0, worker = null, ready = null;
function disponible() {
  return process.env.PIPER_DISABLED !== '1' && ['piper', 'kokoro'].includes(engine)
    && fs.existsSync(python) && fs.existsSync(model) && fs.existsSync(engine === 'kokoro' ? kokoroVoices : model + '.json');
}
function info() {
  const voices = engine === 'kokoro' ? [
    { id: 'kokoro:ef_dora', nombre: 'Kokoro · Dora (español)', idioma: 'es-ES' },
    { id: 'kokoro:em_alex', nombre: 'Kokoro · Alex (español)', idioma: 'es-ES' }
  ] : [{ id: voiceId, nombre: 'Piper · Claude (español de México)', idioma: 'es-MX' }];
  return { disponible: disponible(), motor: engine, ...voices[0], voces: voices };
}
function stop(error = new Error('Se detuvo la voz local.')) {
  const current = worker;
  worker = ready = null;
  if (current) current.kill();
  pending.forEach(item => { clearTimeout(item.timeout); item.reject(error); });
  pending.clear();
}
function start() {
  if (ready) return ready;
  if (!disponible()) return Promise.reject(new Error('Piper no está instalado.'));
  const child = spawn(python, ['-u', path.join(__dirname, 'piper-worker.py'), model, engine, kokoroVoices], {
    cwd: root, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
  });
  worker = child;
  ready = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { reject(new Error('Piper tardó demasiado en iniciar.')); stop(); }, 30000);
    const lines = createInterface({ input: child.stdout });
    lines.on('line', line => {
      let result;
      try { result = JSON.parse(line); } catch { return; }
      if (result.ready) { clearTimeout(timeout); resolve(); return; }
      const item = pending.get(result.id);
      if (!item) return;
      clearTimeout(item.timeout); pending.delete(result.id);
      if (result.error) item.reject(new Error(result.error));
      else item.resolve(Buffer.from(result.audio, 'base64'));
    });
    const failed = () => {
      clearTimeout(timeout);
      reject(new Error('No se pudo iniciar Piper.'));
      if (worker === child) stop();
    };
    child.on('error', failed);
    child.on('exit', failed);
    child.stdin.on('error', failed);
    // No incluir textos de los alumnos ni rutas privadas en los logs.
    child.stderr.resume();
  });
  return ready;
}
async function sintetizar(texto, tipo = 'lectura', voz = voiceId) {
  if (!info().voces.some(item => item.id === voz)) throw new Error('Voz local no válida.');
  const key = createHash('sha256').update(JSON.stringify([texto, tipo, voz])).digest('hex');
  if (cache.has(key)) {
    const value = cache.get(key); cache.delete(key); cache.set(key, value); return value;
  }
  if (generating.has(key)) return generating.get(key);
  const promise = generar(texto, tipo, key, voz);
  generating.set(key, promise);
  try { return await promise; } finally { generating.delete(key); }
}
async function generar(texto, tipo, key, voz) {
  if (pending.size >= 16) throw new Error('La voz está ocupada; inténtalo otra vez.');
  await start();
  if (pending.size >= 16) throw new Error('La voz está ocupada; inténtalo otra vez.');
  const audio = await new Promise((resolve, reject) => {
    const id = ++nextId;
    const timeout = setTimeout(() => stop(new Error('La voz local tardó demasiado.')), 60000);
    pending.set(id, { resolve, reject, timeout });
    worker.stdin.write(JSON.stringify({ id, texto, tipo, voz }) + '\n');
  });
  // Caché en memoria: los saludos que contienen nombres no crean archivos.
  cache.set(key, audio); bytes += audio.length;
  while (bytes > 32 * 1024 * 1024 || cache.size > 256) {
    const first = cache.keys().next().value;
    bytes -= cache.get(first).length; cache.delete(first);
  }
  return audio;
}
process.once('exit', () => worker?.kill());
module.exports = { info, sintetizar, stop };
