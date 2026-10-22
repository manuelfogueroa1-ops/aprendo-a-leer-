const V5 = ['a', 'e', 'i', 'o', 'u'];
// Cada familia forma sus sílabas con: base + vocal (ej.: "qu" + "e" = "que").
// "extras" son sílabas distintas para completar las opciones cuando la familia tiene pocas vocales.
const groups = [
  { name: 'Grupo 1', families: [
    { base: 'p', vowels: V5 }, { base: 'm', vowels: V5 }, { base: 'l', vowels: V5 },
    { base: 's', vowels: V5 }, { base: 't', vowels: V5 }, { base: 'n', vowels: V5 }
  ] },
  { name: 'Grupo 2', families: [
    { base: 'd', vowels: V5 }, { base: 'b', vowels: V5 }, { base: 'f', vowels: V5 },
    { base: 'r', vowels: V5 }, { base: 'v', vowels: V5 }, { base: 'j', vowels: V5 }
  ] },
  { name: 'Grupo 3', families: [
    { base: 'c', vowels: V5 }, { base: 'g', vowels: V5 }, { base: 'z', vowels: V5 },
    { base: 'ñ', vowels: V5 }, { base: 'y', vowels: V5 }, { base: 'll', vowels: V5 }, { base: 'ch', vowels: V5 }
  ] },
  { name: 'Grupo 4', families: [
    { base: 'rr', vowels: V5 }, { base: 'h', vowels: V5 }, { base: 'k', vowels: V5 },
    { base: 'qu', vowels: ['e', 'i'], extras: ['gue', 'gui'] },
    { base: 'gu', vowels: ['e', 'i'], extras: ['que', 'qui'] },
    { base: 'gü', vowels: ['e', 'i'], extras: ['gue', 'gui'] }
  ] }
];
groups.forEach(group => {
  group.label = group.families.map(family => family.base.toLocaleUpperCase('es-CL')).join(' · ');
  group.questions = group.families.flatMap(family => family.vowels.map(vowel => ({
    consonant: family.base,
    vowel,
    syllable: family.base + vowel,
    // Opciones equivocadas: primero las de su misma familia y, si faltan, las "extras".
    pool: [...family.vowels.filter(other => other !== vowel).map(other => family.base + other), ...(family.extras || [])]
  })));
});
let questions = [];

const $ = selector => document.querySelector(selector);
const game = $('#game');
let resultadoId;
let round = 0;
let correct = 0;
let locked = false;
let audioTurn = 0;
let audioTimer;
let advanceTimer;
const responses = [];

function mezclar(items) {
  const resultado = [...items];
  for (let index = resultado.length - 1; index > 0; index--) {
    const otro = Math.floor(Math.random() * (index + 1));
    [resultado[index], resultado[otro]] = [resultado[otro], resultado[index]];
  }
  return resultado;
}

function renderQuestion() {
  clearTimeout(audioTimer);
  clearTimeout(advanceTimer);
  cancelarAudio();
  const question = questions[round];
  locked = false;
  $('#progress').textContent = `Sílaba ${round + 1} de ${questions.length}`;
  $('#progressBar').style.width = `${(round / questions.length) * 100}%`;
  $('#familyPrompt').textContent = `Familia de ${question.consonant.length > 1 ? 'las letras' : 'la letra'} ${question.consonant.toLocaleUpperCase('es-CL')}`;
  $('#consonant').textContent = question.consonant.toLocaleUpperCase('es-CL');
  $('#vowel').textContent = question.vowel.toLocaleUpperCase('es-CL');
  $('#feedback').textContent = '';
  $('#feedback').className = 'feedback';
  $('#listen').hidden = !('speechSynthesis' in window);
  const distractors = mezclar(question.pool).slice(0, 2);
  $('#choices').replaceChildren(...mezclar([question.syllable, ...distractors]).map(syllable => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'syllable-button';
    button.textContent = syllable.toLocaleUpperCase('es-CL');
    button.addEventListener('click', () => choose(syllable));
    return button;
  }));
  const turnoActual = round;
  const audioActual = audioTurn;
  audioTimer = window.setTimeout(() => {
    if (round === turnoActual && audioTurn === audioActual) pronunciar(question.syllable, audioActual);
  }, 300);
}

function choose(syllable) {
  if (locked) return;
  clearTimeout(audioTimer);
  cancelarAudio();
  const question = questions[round];
  const isCorrect = syllable === question.syllable;
  responses.push({
    palabra: question.syllable.toLocaleUpperCase('es-CL'),
    respuesta: syllable.toLocaleUpperCase('es-CL'),
    correcta: isCorrect
  });
  if (!isCorrect) {
    $('#feedback').textContent = '¡Casi! Escucha la sílaba y vuelve a intentarlo.';
    $('#feedback').className = 'feedback incorrect';
    pronunciar(question.syllable, audioTurn);
    return;
  }

  locked = true;
  correct++;
  const turnoActual = round;
  $('#feedback').textContent = `¡Muy bien! ${question.consonant.toLocaleUpperCase('es-CL')} con ${question.vowel.toLocaleUpperCase('es-CL')} forma ${question.syllable.toLocaleUpperCase('es-CL')}.`;
  $('#feedback').className = 'feedback correct';
  $('#choices').querySelectorAll('button').forEach(button => { button.disabled = true; });
  avanzarDespuesDelAcierto(question, turnoActual);
}

function escuchar() {
  if (locked || !('speechSynthesis' in window)) return;
  clearTimeout(audioTimer);
  cancelarAudio();
  pronunciar(questions[round].syllable, audioTurn);
}

function cancelarAudio() {
  audioTurn++;
  window.speechSynthesis?.cancel();
}

function pronunciar(syllable, turnoAudio) {
  if (locked || turnoAudio !== audioTurn || !('speechSynthesis' in window)) return;
  const voz = new SpeechSynthesisUtterance(syllable);
  voz.lang = 'es-CL';
  voz.rate = 0.75;
  window.speechSynthesis.speak(voz);
}

function avanzarDespuesDelAcierto(question, turnoActual) {
  const turnoAudio = audioTurn;
  let yaAvanzo = false;
  const avanzar = () => {
    if (yaAvanzo || !locked || round !== turnoActual || audioTurn !== turnoAudio) return;
    yaAvanzo = true;
    clearTimeout(advanceTimer);
    cancelarAudio();
    round++;
    if (round === questions.length) {
      finish();
      return;
    }
    renderQuestion();
  };

  if (!('speechSynthesis' in window)) {
    advanceTimer = window.setTimeout(avanzar, 1800);
    return;
  }
  const felicitacion = new SpeechSynthesisUtterance(
    `¡Muy bien! ${question.syllable.toLocaleUpperCase('es-CL')}.`
  );
  felicitacion.lang = 'es-CL';
  felicitacion.rate = 0.78;
  felicitacion.addEventListener('end', () => {
    if (!yaAvanzo && round === turnoActual && audioTurn === turnoAudio) {
      clearTimeout(advanceTimer);
      advanceTimer = window.setTimeout(avanzar, 450);
    }
  }, { once: true });
  felicitacion.addEventListener('error', () => {
    if (!yaAvanzo && round === turnoActual && audioTurn === turnoAudio) {
      clearTimeout(advanceTimer);
      advanceTimer = window.setTimeout(avanzar, 1800);
    }
  }, { once: true });
  advanceTimer = window.setTimeout(avanzar, 4000);
  window.speechSynthesis.speak(felicitacion);
}

async function finish() {
  $('#progressBar').style.width = '100%';
  game.classList.add('hidden');
  $('#finished').classList.remove('hidden');
  try {
    const saved = await window.actividadLectura.guardar(resultadoId, correct, questions.length, {
      actividad: 'silabas_iniciales',
      grupo: 'todos',
      respuestas: responses
    });
    $('#result').textContent = `Formaste correctamente ${correct} de ${questions.length} sílabas. Duración: ${saved.duracionSegundos} segundos.`;
  } catch (error) {
    $('#result').textContent = `No se pudo guardar el resultado: ${error.message}`;
    $('#retrySave').classList.remove('hidden');
  }
}

$('#listen').addEventListener('click', escuchar);
$('#retrySave').addEventListener('click', finish);

function startAllGroups() {
  // Secuencia completa: el alumno no elige grupos y avanza hasta completar todo.
  questions = groups.flatMap(group => group.questions);
  round = 0;
  correct = 0;
  responses.length = 0;
  game.classList.remove('hidden');
  renderQuestion();
}

(async () => {
  try {
    resultadoId = await window.actividadLectura.iniciar('Formo sílabas');
    startAllGroups();
  } catch (error) {
    window.actividadLectura.mostrarError(error);
  }
})();