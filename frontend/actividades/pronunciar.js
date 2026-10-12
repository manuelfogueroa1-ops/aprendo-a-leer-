const words = [
  { word: 'gato', image: '🐱' },
  { word: 'mariposa', image: '🦋' },
  { word: 'pelota', image: '⚽' },
  { word: 'manzana', image: '🍎' },
  { word: 'caballo', image: '🐴' }
];
const $ = selector => document.querySelector(selector);
const game = $('#game');
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let resultadoId;
let round = 0;
let correct = 0;
let recognition;
let waiting = false;
const responses = [];
let attempts = [];

function showWord() {
  $('#progress').textContent = `Palabra ${round + 1} de ${words.length}`;
  $('#progressBar').style.width = `${(round / words.length) * 100}%`;
  $('#picture').textContent = words[round].image;
  $('#picture').setAttribute('aria-label', `Imagen de ${words[round].word}`);
  $('#word').textContent = words[round].word;
  attempts = [];
  $('#practice').classList.toggle('hidden', Boolean(SpeechRecognition));
  $('#manualNote').classList.toggle('hidden', Boolean(SpeechRecognition));
  $('#feedback').textContent = 'Escucha la palabra y repítela en voz alta.';
  $('#feedback').className = 'feedback';
}

function speakWord() {
  if (!window.speechSynthesis) {
    $('#feedback').textContent = 'La lectura en voz alta no está disponible en este navegador.';
    return;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(words[round].word);
  utterance.lang = 'es-CL';
  utterance.rate = 0.8;
  window.speechSynthesis.speak(utterance);
}

function nextWord(wasCorrect, manual = false) {
  if (waiting) return;
  waiting = true;
  if (wasCorrect) correct++;
  responses.push({ palabra: words[round].word, intentos: attempts, confirmadaComoPracticada: manual });
  round++;
  if (round === words.length) {
    finish();
    return;
  }
  showWord();
  waiting = false;
}

async function finish() {
  $('#progressBar').style.width = '100%';
  game.classList.add('hidden');
  $('#finished').classList.remove('hidden');
  try {
    const saved = await window.actividadLectura.guardar(resultadoId, correct, words.length, {
      actividad: 'pronunciacion',
      respuestas
    });
    $('#result').textContent = `Practicaste ${words.length} palabras. Duración: ${saved.duracionSegundos} segundos.`;
  } catch (error) {
    $('#result').textContent = `No se pudo guardar el resultado: ${error.message}`;
    $('#retrySave').classList.remove('hidden');
  }
}

$('#listen').addEventListener('click', speakWord);
$('#speak').addEventListener('click', () => {
  if (!recognition) return;
  if (waiting) return;
  try {
    recognition.start();
    $('#feedback').textContent = 'Escuchando… pronuncia la palabra.';
    $('#speak').disabled = true;
  } catch (error) {
    $('#feedback').textContent = `No se pudo activar el micrófono: ${error.message}`;
    $('#manualNote').classList.remove('hidden');
    $('#practice').classList.remove('hidden');
  }
});
$('#practice').addEventListener('click', () => nextWord(true, true));
$('#retrySave').addEventListener('click', finish);

if (SpeechRecognition) {
  recognition = new SpeechRecognition();
  recognition.lang = 'es-CL';
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  recognition.addEventListener('result', event => {
    const transcript = event.results[0][0].transcript;
    const said = transcript.toLocaleLowerCase('es-CL')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\p{L}]/gu, '');
    const expected = words[round].word.normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '').replace(/[^\p{L}]/gu, '');
    const matches = said === expected;
    attempts.push({ correcta: matches });
    if (matches) $('#practice').classList.add('hidden');
    $('#feedback').textContent = matches ? '¡Muy bien! Pronunciaste la palabra.' : `Escuché “${event.results[0][0].transcript}”. Vuelve a escuchar e inténtalo otra vez.`;
    $('#feedback').classList.add(matches ? 'correct' : 'incorrect');
    if (matches) window.setTimeout(() => nextWord(true), 900);
  });
  recognition.addEventListener('error', event => {
    $('#feedback').textContent = event.error === 'not-allowed'
      ? 'No hay permiso para usar el micrófono. Puedes repetir la palabra y marcarla como practicada.'
      : 'No alcancé a escuchar. Vuelve a intentarlo o marca la palabra como practicada.';
    $('#manualNote').classList.remove('hidden');
    $('#practice').classList.remove('hidden');
  });
  recognition.addEventListener('end', () => { $('#speak').disabled = false; });
} else {
  $('#speak').classList.add('hidden');
  $('#manualNote').classList.remove('hidden');
  $('#practice').classList.remove('hidden');
  $('#feedback').textContent = 'Este navegador no reconoce la voz. Escucha la palabra, repítela y marca cuando la hayas practicado.';
}

(async () => {
  try {
    resultadoId = await window.actividadLectura.iniciar('Practico la pronunciación');
    showWord();
    game.classList.remove('hidden');
  } catch (error) {
    window.actividadLectura.mostrarError(error);
  }
})();
