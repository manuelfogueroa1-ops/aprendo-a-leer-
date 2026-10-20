const families = ['p', 'm', 'l', 's', 't', 'n'];
const vowels = ['a', 'e', 'i', 'o', 'u'];
const questions = families.flatMap(consonant => vowels.map(vowel => ({
  consonant,
  vowel,
  syllable: consonant + vowel
})));
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
  $('#familyPrompt').textContent = `Familia de la letra ${question.consonant.toLocaleUpperCase('es-CL')}`;
  $('#consonant').textContent = question.consonant.toLocaleUpperCase('es-CL');
  $('#vowel').textContent = question.vowel.toLocaleUpperCase('es-CL');
  $('#feedback').textContent = '';
  $('#feedback').className = 'feedback';
  $('#listen').hidden = !('speechSynthesis' in window);
  const sameFamily = families
    .filter(consonant => consonant === question.consonant)
    .flatMap(consonant => vowels.map(vowel => ({ consonant, vowel, syllable: consonant + vowel })))
    .filter(item => item.syllable !== question.syllable);
  const distractors = mezclar(sameFamily).slice(0, 2);
  $('#choices').replaceChildren(...mezclar([question, ...distractors]).map(item => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'syllable-button';
    button.textContent = item.syllable.toLocaleUpperCase('es-CL');
    button.addEventListener('click', () => choose(item.syllable));
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

(async () => {
  try {
    resultadoId = await window.actividadLectura.iniciar('Formo sílabas');
    renderQuestion();
    game.classList.remove('hidden');
  } catch (error) {
    window.actividadLectura.mostrarError(error);
  }
})();
