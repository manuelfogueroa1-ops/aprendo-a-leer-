const questions = [
  { word: 'gato', image: '🐱', missing: 0, choices: ['g', 'p', 'm'] },
  { word: 'luna', image: '🌙', missing: 2, choices: ['n', 'r', 't'] },
  { word: 'sapo', image: '🐸', missing: 0, choices: ['c', 's', 'l'] },
  { word: 'mesa', image: '🪑', missing: 2, choices: ['d', 's', 'm'] },
  { word: 'pato', image: '🦆', missing: 3, choices: ['o', 'a', 'e'] },
  { word: 'mano', image: '✋', missing: 0, choices: ['m', 'n', 't'] },
  { word: 'casa', image: '🏠', missing: 2, choices: ['l', 's', 'c'] },
  { word: 'dado', image: '🎲', missing: 0, choices: ['b', 'd', 'g'] },
  { word: 'oso', image: '🐻', missing: 0, choices: ['o', 'u', 'a'] },
  { word: 'sol', image: '☀️', missing: 1, choices: ['o', 'a', 'e'] },
  { word: 'pan', image: '🍞', missing: 0, choices: ['p', 'b', 'd'] },
  { word: 'pez', image: '🐟', missing: 2, choices: ['z', 'n', 'l'] },
  { word: 'flor', image: '🌸', missing: 1, choices: ['l', 'r', 'n'] },
  { word: 'tren', image: '🚂', missing: 0, choices: ['t', 'd', 'p'] },
  { word: 'queso', image: '🧀', missing: 0, choices: ['q', 'g', 'p'] },
  { word: 'barco', image: '🚢', missing: 0, choices: ['b', 'd', 'p'] },
  { word: 'leche', image: '🥛', missing: 0, choices: ['l', 'm', 'n'] },
  { word: 'libro', image: '📖', missing: 0, choices: ['l', 'r', 'd'] },
  { word: 'conejo', image: '🐰', missing: 0, choices: ['c', 'm', 't'] },
  { word: 'perro', image: '🐶', missing: 0, choices: ['p', 't', 'b'] }
];
const $ = selector => document.querySelector(selector);
const game = $('#game');
let resultadoId;
const PROGRESS_NAME = 'Encuentro la letra';
let progressKey = null;
function saveProgress() {
  if (!progressKey || game.classList.contains('hidden')) return;
  try { localStorage.setItem(progressKey, JSON.stringify({round, correct, responses, locked})); } catch {}
}

let round = 0;
let correct = 0;
let locked = false;
let saving = false;
let saved = false;
let bienvenidaPendiente = true;
let ultimaCorrecta = false;
let advanceTimer;
const narracion = crearNarracionActividad();
const responses = [];
const pista = crearPistaActividad(() => {
  if (locked) return null;
  const letter = questions[round].word[questions[round].missing].toLocaleUpperCase('es-CL');
  return {
    elemento: [...$('#choices').children].find(button => button.textContent === letter),
    mensaje: `Mira la letra ${letter}. Es la que falta en ${questions[round].word}.`
  };
}, () => narracion.reproducir(['encuentra-pista']));

async function escucharInstruccion() {
  pista.cancelar();
  const actual = round;
  const claves = bienvenidaPendiente ? ['encuentra-bienvenida', 'encuentra-instruccion'] : ['encuentra-instruccion'];
  if (await narracion.reproducir(claves)) {
    bienvenidaPendiente = false;
    if (round === actual && !locked) pista.reiniciar();
  }
}

async function escucharRespuesta() {
  cancelarEsperaActividad(advanceTimer);
  const actual = round;
  $('#next').disabled = true;
  const elegida = responses.at(-1)?.letraElegida;
  const claves = [`letras-nombre-${elegida}`, ultimaCorrecta ? 'encuentra-acierto' : 'encuentra-apoyo'];
  if (round < questions.length - 1) claves.push('encuentra-siguiente');
  if (!await narracion.reproducir(claves) || actual !== round || !locked) return;
  if (round === questions.length - 1) advanceTimer = programarActividad(finish, 350);
  else $('#next').disabled = false;
}

$('#listenInstructions').addEventListener('click', () => locked ? escucharRespuesta() : escucharInstruccion());

function renderQuestion() {
  const question = questions[round];
  locked = false;
  $('#progress').textContent = `Palabra ${round + 1} de ${questions.length}`;
  $('#progressBar').style.width = `${(round / questions.length) * 100}%`;
  $('#picture').textContent = question.image;
  $('#picture').setAttribute('aria-label', `Imagen de ${question.word}`);
  $('#word').textContent = [...question.word].map((letter, index) =>
    index === question.missing ? '_' : letter
  ).join(' ');
  $('#feedback').textContent = '';
  $('#feedback').className = 'feedback';
  $('#next').classList.add('hidden');
  $('#next').disabled = false;
  $('#choices').replaceChildren(...question.choices.map(letter => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'choice-button';
    button.textContent = letter.toLocaleUpperCase('es-CL');
    button.addEventListener('click', () => choose(letter));
    return button;
  }));
  escucharInstruccion();
}

function choose(letter) {
  if (locked) return;
  pista.cancelar();
  locked = true;
  bienvenidaPendiente = false;
  const question = questions[round];
  const isCorrect = letter === question.word[question.missing];
  ultimaCorrecta = isCorrect;
  responses.push({ palabra: question.word, letraElegida: letter, letraCorrecta: question.word[question.missing], correcta: isCorrect });
  if (isCorrect) correct++;
  saveProgress();
  $('#word').textContent = [...question.word].map((character, index) =>
    index === question.missing ? letter.toLocaleUpperCase('es-CL') : character
  ).join(' ');
  $('#feedback').textContent = isCorrect
    ? '¡Correcto! Elegiste la letra que faltaba.'
    : `La letra correcta es ${question.word[question.missing].toLocaleUpperCase('es-CL')}.`;
  $('#feedback').classList.add(isCorrect ? 'correct' : 'incorrect');
  $('#choices').querySelectorAll('button').forEach(button => { button.disabled = true; });
  if (round === questions.length - 1) {
    $('#next').textContent = 'Volviendo a tus actividades…';
    $('#next').disabled = true;
    $('#next').classList.remove('hidden');
    escucharRespuesta();
    return;
  }
  $('#next').textContent = 'Siguiente palabra';
  $('#next').classList.remove('hidden');
  escucharRespuesta();
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
      actividad: 'letras',
      respuestas: responses
    }, undefined, {
      antesDeVolver: window.VozInfantil?.tieneGrabacion('encuentra-final')
        ? () => narracion.reproducir(['encuentra-final']) : undefined
    });
    saved = true;
    if (progressKey) localStorage.removeItem(progressKey);
    $('#result').textContent = `Elegiste ${correct} de ${questions.length} letras correctamente. Duración: ${resultado.duracionSegundos} segundos.`;
  } catch (error) {
    $('#result').textContent = `No se pudo guardar el resultado: ${error.message}`;
    $('#retrySave').classList.remove('hidden');
  } finally {
    saving = false;
  }
}

$('#next').addEventListener('click', async () => {
  if (!locked || $('#next').disabled) return;
  round++;
  saveProgress();
  if (round === questions.length) {
    await finish();
    return;
  }
  renderQuestion();
});

$('#retrySave').addEventListener('click', finish);

(async () => {
  try {
    progressKey = await window.actividadLectura.claveProgreso(PROGRESS_NAME);
    let restored = null;
    try { restored = JSON.parse(localStorage.getItem(progressKey) || 'null'); } catch {}
    resultadoId = await window.actividadLectura.iniciar('Encuentro la letra');
    if (restored && Number.isInteger(restored.round) && restored.round >= 0 && restored.round < questions.length) { round=restored.round; correct=restored.correct || 0; responses.push(...(restored.responses || [])); }
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
  consigna: `Completar la palabra ${(questions[round] || questions.at(-1)).word}`,
  respuestaActual: $('#feedback').textContent.slice(0, 300)
}));
