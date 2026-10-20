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
const canRecordAudio = Boolean(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);
let resultadoId;
let round = 0;
let correct = 0;
let recognition;
let mediaRecorder;
let mediaStream;
let dataAvailableHandler;
let recordingStopHandler;
let recordingUrl;
let waiting = false;
let useAudioRecording = canRecordAudio; // siempre se graba: la profesora escucha después
let recordedBlob = null;
const responses = [];
let attempts = [];

function clearRecording() {
  recordedBlob = null;
  if (mediaRecorder) {
    if (dataAvailableHandler) mediaRecorder.removeEventListener('dataavailable', dataAvailableHandler);
    if (recordingStopHandler) mediaRecorder.removeEventListener('stop', recordingStopHandler);
    if (mediaRecorder.state !== 'inactive') mediaRecorder.stop();
  }
  mediaRecorder = null;
  dataAvailableHandler = null;
  recordingStopHandler = null;
  mediaStream?.getTracks().forEach(track => track.stop());
  mediaStream = null;
  if (recordingUrl) URL.revokeObjectURL(recordingUrl);
  recordingUrl = null;
  $('#recordedAudio').pause();
  $('#recordedAudio').removeAttribute('src');
  $('#recordedAudio').classList.add('hidden');
  $('#recordingNote').classList.add('hidden');
}

function showWord() {
  clearRecording();
  $('#progress').textContent = `Palabra ${round + 1} de ${words.length}`;
  $('#progressBar').style.width = `${(round / words.length) * 100}%`;
  $('#picture').textContent = words[round].image;
  $('#picture').setAttribute('aria-label', `Imagen de ${words[round].word}`);
  $('#word').textContent = words[round].word;
  attempts = [];
  $('#practice').classList.toggle('hidden', canRecordAudio || Boolean(SpeechRecognition));
  $('#manualNote').classList.toggle('hidden', Boolean(SpeechRecognition) && !useAudioRecording);
  $('#speak').textContent = useAudioRecording ? '🎙️ Grabar audio' : '🎙️ Pronunciar';
  $('#speak').classList.toggle('hidden', !SpeechRecognition && !canRecordAudio);
  $('#feedback').textContent = useAudioRecording
    ? 'Escucha la palabra, graba cómo la pronuncias y luego puedes reproducir el audio.'
    : !SpeechRecognition && !canRecordAudio
      ? 'El micrófono requiere una conexión segura. Abre la aplicación en este equipo con http://localhost:3000 o usa una dirección HTTPS.'
      : 'Escucha la palabra y repítela en voz alta.';
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

async function subirAudio(palabra, blob) {
  try {
    const respuesta = await fetch(`/api/resultados/${resultadoId}/audio?palabra=${encodeURIComponent(palabra)}`, {
      method: 'POST',
      headers: { 'Content-Type': (blob.type || 'audio/webm').split(';')[0] },
      body: blob,
      credentials: 'same-origin'
    });
    return respuesta.ok;
  } catch {
    return false;
  }
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
  clearRecording();
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
async function recordAudio() {
  if (!canRecordAudio) {
    $('#feedback').textContent = 'El micrófono requiere una conexión segura. Abre la aplicación en este equipo con http://localhost:3000 o usa una dirección HTTPS.';
    $('#manualNote').classList.remove('hidden');
    $('#practice').classList.remove('hidden');
    return;
  }
  const recordingRound = round;
  recordedBlob = null;
  if (recordingUrl) URL.revokeObjectURL(recordingUrl);
  recordingUrl = null;
  $('#recordedAudio').pause();
  $('#recordedAudio').removeAttribute('src');
  $('#recordedAudio').classList.add('hidden');
  $('#recordingNote').classList.remove('hidden');
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    if (waiting || recordingRound !== round) {
      stream.getTracks().forEach(track => track.stop());
      return;
    }
    mediaStream = stream;
    const chunks = [];
    const recorder = new MediaRecorder(stream);
    mediaRecorder = recorder;
    dataAvailableHandler = event => {
      if (event.data.size) chunks.push(event.data);
    };
    recordingStopHandler = () => {
      stream.getTracks().forEach(track => track.stop());
      if (mediaStream === stream) mediaStream = null;
      if (mediaRecorder === recorder) mediaRecorder = null;
      dataAvailableHandler = null;
      recordingStopHandler = null;
      if (waiting || recordingRound !== round) return;
      if (!chunks.length) {
        $('#feedback').textContent = 'No se recibió audio. Revisa el micrófono e inténtalo otra vez.';
        $('#speak').textContent = '🎙️ Grabar de nuevo';
        $('#speak').disabled = false;
        return;
      }
      const audio = $('#recordedAudio');
      if (recordingUrl) URL.revokeObjectURL(recordingUrl);
      recordedBlob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
      recordingUrl = URL.createObjectURL(recordedBlob);
      audio.src = recordingUrl;
      audio.classList.remove('hidden');
      $('#feedback').textContent = 'Grabación lista. Reprodúcela para escucharla o graba otra vez.';
      $('#feedback').className = 'feedback correct';
      $('#speak').textContent = '🎙️ Grabar de nuevo';
      $('#speak').disabled = false;
      $('#recordingNote').classList.remove('hidden');
      $('#practice').classList.remove('hidden');
    };
    recorder.addEventListener('dataavailable', dataAvailableHandler);
    recorder.addEventListener('stop', recordingStopHandler, { once: true });
    recorder.addEventListener('error', event => {
      if (dataAvailableHandler) recorder.removeEventListener('dataavailable', dataAvailableHandler);
      if (recordingStopHandler) recorder.removeEventListener('stop', recordingStopHandler);
      dataAvailableHandler = null;
      recordingStopHandler = null;
      stream.getTracks().forEach(track => track.stop());
      if (mediaStream === stream) mediaStream = null;
      if (mediaRecorder === recorder) mediaRecorder = null;
      $('#feedback').textContent = `Falló la grabación de audio: ${event.error?.message || 'el navegador detuvo la grabación'}.`;
      $('#feedback').className = 'feedback incorrect';
      $('#speak').textContent = '🎙️ Grabar de nuevo';
      $('#speak').disabled = false;
      $('#manualNote').classList.remove('hidden');
      $('#recordingNote').classList.remove('hidden');
      $('#practice').classList.remove('hidden');
    }, { once: true });
    recorder.start();
    window.setTimeout(() => { if (recorder.state === 'recording') recorder.stop(); }, 15000);
    $('#speak').textContent = '⏹️ Detener grabación';
    $('#speak').disabled = false;
    $('#manualNote').classList.remove('hidden');
    $('#practice').classList.remove('hidden');
    $('#feedback').textContent = 'Grabando… di la palabra y presiona “Detener grabación” cuando termines.';
    $('#feedback').className = 'feedback';
  } catch (error) {
    if (mediaRecorder) {
      if (dataAvailableHandler) mediaRecorder.removeEventListener('dataavailable', dataAvailableHandler);
      if (recordingStopHandler) mediaRecorder.removeEventListener('stop', recordingStopHandler);
      mediaRecorder = null;
      dataAvailableHandler = null;
      recordingStopHandler = null;
    }
    mediaStream?.getTracks().forEach(track => track.stop());
    mediaStream = null;
    $('#feedback').textContent = error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError'
      ? 'No se concedió permiso para usar el micrófono. Autorízalo en el navegador e inténtalo otra vez.'
      : `No se pudo acceder al micrófono: ${error.message}`;
    $('#speak').textContent = '🎙️ Grabar de nuevo';
    $('#manualNote').classList.remove('hidden');
    $('#practice').classList.remove('hidden');
  }
}

$('#speak').addEventListener('click', async () => {
  if (waiting) return;
  if (mediaRecorder?.state === 'recording') {
    mediaRecorder.stop();
    $('#speak').disabled = true;
    $('#speak').textContent = 'Procesando audio…';
    return;
  }
  if (useAudioRecording) {
    await recordAudio();
    return;
  }
  if (!recognition) return;
  try {
    recognition.start();
    $('#feedback').textContent = 'Escuchando… pronuncia la palabra.';
    $('#speak').disabled = true;
  } catch (error) {
    $('#feedback').textContent = `No se pudo activar el micrófono: ${error.message}`;
    $('#manualNote').classList.remove('hidden');
    $('#practice').classList.remove('hidden');
    if (canRecordAudio) {
      useAudioRecording = true;
      $('#speak').textContent = '🎙️ Grabar audio';
      $('#feedback').textContent += ' Puedes grabar el audio en este equipo.';
    }
  }
});
$('#practice').addEventListener('click', async () => {
  if (waiting) return;
  const blob = recordedBlob;
  if (blob) {
    $('#practice').disabled = true;
    $('#feedback').textContent = 'Guardando tu grabación…';
    const guardado = await subirAudio(words[round].word, blob);
    attempts.push({ audio: true, audioGuardado: guardado });
    $('#practice').disabled = false;
  }
  nextWord(true, true);
});
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
    attempts.push({ correcta: matches, escuchado: String(transcript).slice(0, 60) });
    if (matches) $('#practice').classList.add('hidden');
    $('#feedback').textContent = matches ? '¡Muy bien! Pronunciaste la palabra.' : `Escuché “${event.results[0][0].transcript}”. Vuelve a escuchar e inténtalo otra vez.`;
    $('#feedback').classList.add(matches ? 'correct' : 'incorrect');
    if (matches) window.setTimeout(() => nextWord(true), 900);
  });
  recognition.addEventListener('error', event => {
    $('#feedback').textContent = event.error === 'not-allowed'
      ? canRecordAudio
        ? 'No hay permiso para usar el micrófono. Puedes repetir la palabra y marcarla como practicada.'
        : 'El navegador no pudo acceder al micrófono. Abre la aplicación con http://localhost:3000 en este equipo o usa una dirección HTTPS, y revisa los permisos.'
      : 'No alcancé a escuchar. Vuelve a intentarlo o marca la palabra como practicada.';
    $('#manualNote').classList.remove('hidden');
    $('#practice').classList.remove('hidden');
    if (canRecordAudio) {
      useAudioRecording = true;
      $('#speak').textContent = '🎙️ Grabar audio';
      $('#feedback').textContent += ' También puedes grabarte y reproducir el audio.';
    }
  });
  recognition.addEventListener('end', () => { $('#speak').disabled = false; });
} else {
  $('#manualNote').classList.remove('hidden');
  $('#practice').classList.remove('hidden');
  $('#speak').textContent = '🎙️ Grabar audio';
  $('#speak').classList.toggle('hidden', !canRecordAudio);
  if (canRecordAudio) {
    $('#feedback').textContent = 'Este navegador no reconoce la voz. Puedes grabarte y reproducir el audio en este equipo.';
  }
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