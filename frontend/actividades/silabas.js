const questions = [
  { word: 'casa', image: '🏠', syllables: ['ca', 'sa'] },
  { word: 'pelota', image: '⚽', syllables: ['pe', 'lo', 'ta'] },
  { word: 'mariposa', image: '🦋', syllables: ['ma', 'ri', 'po', 'sa'] },
  { word: 'tomate', image: '🍅', syllables: ['to', 'ma', 'te'] },
  { word: 'caballo', image: '🐴', syllables: ['ca', 'ba', 'llo'] },
  { word: 'gato', image: '🐱', syllables: ['ga', 'to'] },
  { word: 'luna', image: '🌙', syllables: ['lu', 'na'] },
  { word: 'sapo', image: '🐸', syllables: ['sa', 'po'] },
  { word: 'pato', image: '🦆', syllables: ['pa', 'to'] },
  { word: 'mono', image: '🐒', syllables: ['mo', 'no'] },
  { word: 'conejo', image: '🐰', syllables: ['co', 'ne', 'jo'] },
  { word: 'jirafa', image: '🦒', syllables: ['ji', 'ra', 'fa'] },
  { word: 'zapato', image: '👞', syllables: ['za', 'pa', 'to'] },
  { word: 'manzana', image: '🍎', syllables: ['man', 'za', 'na'] },
  { word: 'helado', image: '🍦', syllables: ['he', 'la', 'do'] },
  { word: 'regalo', image: '🎁', syllables: ['re', 'ga', 'lo'] },
  { word: 'escoba', image: '🧹', syllables: ['es', 'co', 'ba'] },
  { word: 'estrella', image: '⭐', syllables: ['es', 'tre', 'lla'] },
  { word: 'caracol', image: '🐌', syllables: ['ca', 'ra', 'col'] },
  { word: 'elefante', image: '🐘', syllables: ['e', 'le', 'fan', 'te'] }
];
const $ = selector => document.querySelector(selector);
const game = $('#game');
const answer = [];
const responses = [];
let resultadoId;
const PROGRESS_NAME = 'Aprendo las sílabas';
let progressKey = null;
function saveProgress() {
  if (!progressKey || game.classList.contains('hidden')) return;
  try { localStorage.setItem(progressKey, JSON.stringify({round, correct, responses, intentos, answer, opciones: syllables})); } catch {}
}

let round = 0;
let correct = 0;
let locked = false;
let syllables = [];
let restoredChoices = [];
let intentos = 0;
let saving = false;
let saved = false;
let bienvenidaPendiente = true;
const narracion = crearNarracionActividad();
const SILABAS_EXTRA = ['pa', 'pe', 'pi', 'po', 'pu', 'ma', 'me', 'mi', 'mo', 'mu', 'la', 'le', 'li', 'lo', 'lu', 'sa', 'se', 'si', 'so', 'su', 'ta', 'te', 'ti', 'to', 'tu', 'na', 'ne', 'ni', 'no', 'nu'];
function mezclar(items) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
function crearOpcionesSilabas(question, previous = []) {
  const candidates = SILABAS_EXTRA.filter(syllable => !question.syllables.includes(syllable));
  // Conserva los distractores al retomar, incluso si el alumno ya eligió uno.
  const saved = [...new Set(previous)].filter(syllable => candidates.includes(syllable)).slice(0, 2);
  const extras = [...saved, ...mezclar(candidates.filter(syllable => !saved.includes(syllable)))].slice(0, 2);
  return mezclar([...question.syllables, ...extras]);
}
const pista = crearPistaActividad(() => {
  if (locked) return null;
  const expected = questions[round].syllables;
  const wrong = answer.findIndex((syllable, index) => syllable !== expected[index]);
  if (wrong !== -1) return {
    elemento: $('#answer').children[wrong],
    mensaje: 'Esta sílaba va en otro lugar. Tócala para quitarla y probemos de nuevo.'
  };
  if (answer.length === expected.length) return {
    elemento: $('#check'), mensaje: '¡Ya formaste la palabra! Toca Revisar palabra.'
  };
  const next = expected[answer.length];
  return {
    elemento: [...$('#choices').children].find(button => !button.disabled && button.textContent === next),
    mensaje: `${answer.length ? 'Ahora sigue' : 'Empieza con'} la sílaba ${next.toLocaleUpperCase('es-CL')}.`
  };
}, () => {
  const expected = questions[round].syllables;
  const wrong = answer.some((syllable, index) => syllable !== expected[index]);
  narracion.reproducir([wrong ? 'ordeno-pista-quitar' : answer.length === expected.length ? 'ordeno-revisar' : 'ordeno-pista']);
});

async function guiar(claves) {
  pista.cancelar();
  const actual = round;
  if (await narracion.reproducir(claves) && actual === round && !locked) pista.reiniciar();
}
function escucharSilaba(syllable, revisar = false) {
  // Las vocales solas ya están grabadas como nombres de letra. Nunca se
  // construyen sílabas uniendo nombres de consonantes, pues cambiaría su sonido.
  const clave = /^[aeiou]$/.test(syllable) ? `letras-nombre-${syllable}` : `silaba-${syllable}`;
  const claves = window.VozInfantil?.tieneGrabacion(clave) ? [clave] : [];
  if (revisar) claves.push('ordeno-revisar');
  return guiar(claves);
}
function escucharInstruccion() {
  if (locked) return;
  const claves = bienvenidaPendiente
    ? ['ordeno-bienvenida', 'ordeno-instruccion', 'ordeno-quitar']
    : ['ordeno-instruccion', 'ordeno-quitar'];
  bienvenidaPendiente = false;
  return guiar(claves);
}
$('#listenInstructions').addEventListener('click', escucharInstruccion);

function renderQuestion() {
  const question = questions[round];
  answer.length = 0;
  syllables = crearOpcionesSilabas(question, restoredChoices);
  restoredChoices = [];
  $('#progress').textContent = `Palabra ${round + 1} de ${questions.length}`;
  $('#progressBar').style.width = `${(round / questions.length) * 100}%`;
  $('#picture').textContent = question.image;
  $('#picture').setAttribute('aria-label', `Imagen de ${question.word}`);
  $('#word').textContent = question.word.split('').map(() => '_').join(' ');
  $('#feedback').textContent = '';
  $('#feedback').className = 'feedback';
  renderChoices();
  renderAnswer();
  if (window.__pendingSyllableAnswer) { answer.push(...window.__pendingSyllableAnswer); window.__pendingSyllableAnswer = null; renderChoices(); renderAnswer(); }
  escucharInstruccion();
}

function renderChoices() {
  const usedCounts = {};
  const answerCounts = answer.reduce((counts, syllable) => {
    counts[syllable] = (counts[syllable] || 0) + 1;
    return counts;
  }, {});
  $('#choices').replaceChildren(...syllables.map(syllable => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'syllable-button';
    button.textContent = syllable;
    usedCounts[syllable] = (usedCounts[syllable] || 0) + 1;
    button.disabled = usedCounts[syllable] <= (answerCounts[syllable] || 0);
    button.addEventListener('click', () => {
      if (locked || answer.length >= questions[round].syllables.length) return;
      narracion.cancelar();
      answer.push(syllable);
      saveProgress();
      renderChoices();
      renderAnswer();
      escucharSilaba(syllable, answer.length === questions[round].syllables.length);
    });
    return button;
  }));
}

function renderAnswer() {
  const count = questions[round].syllables.length;
  $('#answer').replaceChildren(...Array.from({ length: count }, (_, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `answer-slot${answer[index] ? ' filled' : ''}`;
    button.textContent = answer[index] || '·';
    button.setAttribute('aria-label', answer[index] ? `Quitar sílaba ${answer[index]}` : 'Espacio para una sílaba');
    button.disabled = !answer[index] || locked;
    button.addEventListener('click', () => {
      if (locked) return;
      narracion.cancelar();
      const syllable = answer[index];
      answer.splice(index, 1);
      saveProgress();
      renderChoices();
      renderAnswer();
      escucharSilaba(syllable);
    });
    return button;
  }));
  if (locked) pista.cancelar();
  else pista.reiniciar();
}

async function finish() {
  if (saving || saved) return;
  saving = true;
  pista.cancelar();
  narracion.cancelar();
  $('#progressBar').style.width = '100%';
  game.classList.add('hidden');
  $('#finished').classList.remove('hidden');
  try {
    const resultado = await window.actividadLectura.guardar(resultadoId, correct, questions.length, {
      actividad: 'silabas',
      respuestas: responses
    }, undefined, {
      antesDeVolver: window.VozInfantil?.tieneGrabacion('ordeno-final')
        ? () => narracion.reproducir(['ordeno-final']) : undefined
    });
    saved = true;
    if (progressKey) localStorage.removeItem(progressKey);
    $('#result').textContent = `Formaste ${correct} de ${questions.length} palabras al primer intento. Duración: ${resultado.duracionSegundos} segundos.`;
  } catch (error) {
    $('#result').textContent = `No se pudo guardar el resultado: ${error.message}`;
    $('#retrySave').classList.remove('hidden');
  } finally {
    saving = false;
  }
}

$('#check').addEventListener('click', () => {
  if (locked) return;
  const question = questions[round];
  const feedback = $('#feedback');
  if (answer.length !== question.syllables.length) {
    feedback.textContent = 'Elige todas las sílabas antes de revisar.';
    guiar(['ordeno-faltan']);
    return;
  }
  const isCorrect = answer.join('') === question.word;
  intentos++;
  saveProgress();
  responses.push({ palabra: question.word, respuesta: answer.join(''), correcta: isCorrect, intento: intentos });
  feedback.className = 'feedback';
  void feedback.offsetWidth; // reinicia la animación aunque se repita el mismo mensaje
  if (!isCorrect) {
    feedback.textContent = 'Casi. ¡Inténtalo otra vez! 💪';
    feedback.classList.add('incorrect');
    answer.length = 0;
    renderChoices();
    renderAnswer();
    guiar(['ordeno-reintento']);
    return;
  }
  locked = true;
  pista.cancelar();
  if (intentos === 1) correct++;
  feedback.textContent = '¡Muy bien! Las sílabas están en orden.';
  feedback.classList.add('correct');
  renderAnswer();
  $('#check').disabled = true;
  $('#listenInstructions').disabled = true;
  if (round === questions.length - 1) {
    $('#check').textContent = 'Volviendo a tus actividades…';
  }
  const actual = round;
  narracion.reproducir(['ordeno-acierto']).then(completa => {
    if (!completa || actual !== round || !locked) return;
    programarActividad(() => {
      if (round === questions.length - 1) { finish(); return; }
      round++;
      saveProgress();
      intentos = 0;
      locked = false;
      $('#check').disabled = false;
      $('#listenInstructions').disabled = false;
      renderQuestion();
    }, 350);
  });
});

$('#retrySave').addEventListener('click', finish);

(async () => {
  try {
    progressKey = await window.actividadLectura.claveProgreso(PROGRESS_NAME);
    let restored = null;
    try { restored = JSON.parse(localStorage.getItem(progressKey) || 'null'); } catch {}
    resultadoId = await window.actividadLectura.iniciar('Aprendo las sílabas');
    if (restored && Number.isInteger(restored.round) && restored.round >= 0 && restored.round < questions.length) { round=restored.round; correct=restored.correct || 0; responses.push(...(restored.responses || [])); intentos=restored.intentos || 0; window.__pendingSyllableAnswer = Array.isArray(restored.answer) ? restored.answer : null; restoredChoices = Array.isArray(restored.opciones) ? restored.opciones : []; }
    renderQuestion();
    game.classList.remove('hidden');
    saveProgress();
  } catch (error) {
    window.actividadLectura.mostrarError(error);
  }
})();

window.addEventListener('pagehide', saveProgress);
window.actividadLectura.seguirAvance(() => ({
  preguntaActual: Math.min(round + 1, questions.length), totalPreguntas: questions.length,
  completadas: Math.min(round + Number(locked), questions.length),
  consigna: `Ordenar las sílabas de ${(questions[round] || questions.at(-1)).word}`,
  respuestaActual: answer.length ? `Sílabas colocadas: ${answer.join(' · ')}` : 'Aún no ha colocado sílabas.'
}));
