const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../frontend/voz.js'), 'utf8');
function setup(available, preferred = '') {
  const storage = new Map([['lectura-voz-preferida', preferred]]);
  let spoken = null;
  const context = vm.createContext({
    window: { speechSynthesis: { getVoices: () => available, cancel() {}, speak(value) { spoken = value; } } },
    document: { readyState: 'loading', addEventListener() {} },
    localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    Event, EventTarget,
    SpeechSynthesisUtterance: class extends EventTarget { constructor(text) { super(); this.text = text; } }
  });
  vm.runInContext(source, context);
  return { api: context.window.VozInfantil, storage, spoken: () => spoken };
}
(async () => {
const voice = (name, lang = 'es-ES') => ({ name, lang, voiceURI: name });
const laura = voice('Microsoft Laura - Spanish (Spain)');
const helena = voice('Microsoft Helena - Spanish (Spain)');
const pablo = voice('Microsoft Pablo - Spanish (Spain)');
const english = voice('English default', 'en-US');
const natural = voice('Español Natural', 'es-CL');
const test = setup([english, helena, pablo, laura]);
assert.equal(test.api.seleccionada(), laura);
assert.equal(test.api.crear('Hola').pitch, 1);
assert.equal(test.api.crear('Hola').voice, laura);
assert.ok(test.api.crear('pa', { tipo: 'letras' }).rate < test.api.crear('¡Hola!', { tipo: 'animo' }).rate);
test.api.elegir(pablo.voiceURI);
assert.equal(test.api.seleccionada(), pablo);
assert.equal(test.storage.get('lectura-voz-preferida'), pablo.voiceURI);
test.api.hablar('Hola, vamos a leer');
await Promise.resolve();
assert.equal(test.spoken().voice, pablo);
assert.equal(test.spoken().text, 'Hola, vamos a leer');
test.api.elegir('una voz que no existe');
assert.equal(test.api.seleccionada(), pablo);
test.api.elegir('');
assert.equal(test.api.seleccionada(), laura);
assert.equal(setup([laura, natural]).api.seleccionada(), natural);
assert.equal(setup([laura], 'voz de otro equipo').api.seleccionada(), laura);
const delayed = [];
const asynchronous = setup(delayed);
assert.equal(asynchronous.api.seleccionada(), null);
delayed.push(laura);
assert.equal(asynchronous.api.crear('pa').voice, laura);
const fallback = setup([english]);
assert.equal(fallback.api.seleccionada(), null);
assert.equal(fallback.api.crear('Hola').lang, 'es-CL');
assert.equal(fallback.api.crear('Hola').voice, undefined);
console.log('OK: selección de voz, preferencia guardada, timbre, velocidad, voces tardías y alternativas disponibles.');
})().catch(error => { console.error(error); process.exitCode = 1; });
