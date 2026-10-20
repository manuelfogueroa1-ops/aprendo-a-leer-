const letters = [
  { letter: 'a', word: 'avión', image: '✈️' },
  { letter: 'b', word: 'barco', image: '⛵' },
  { letter: 'c', word: 'casa', image: '🏠' },
  { letter: 'd', word: 'dado', image: '🎲' },
  { letter: 'e', word: 'estrella', image: '⭐' },
  { letter: 'f', word: 'flor', image: '🌷' },
  { letter: 'g', word: 'gato', image: '🐱' },
  { letter: 'h', word: 'helado', image: '🍦' },
  { letter: 'i', word: 'isla', image: '🏝️' },
  { letter: 'j', word: 'jirafa', image: '🦒' },
  { letter: 'k', word: 'koala', image: '🐨' },
  { letter: 'l', word: 'luna', image: '🌙' },
  { letter: 'm', word: 'mariposa', image: '🦋' },
  { letter: 'n', word: 'nube', image: '☁️' },
  { letter: 'ñ', word: 'ñandú', image: '🐦' },
  { letter: 'o', word: 'oso', image: '🐻' },
  { letter: 'p', word: 'pelota', image: '⚽' },
  { letter: 'q', word: 'queso', image: '🧀' },
  { letter: 'r', word: 'rana', image: '🐸' },
  { letter: 's', word: 'sol', image: '☀️' },
  { letter: 't', word: 'tortuga', image: '🐢' },
  { letter: 'u', word: 'uvas', image: '🍇' },
  { letter: 'v', word: 'vaca', image: '🐮' },
  { letter: 'w', word: 'wifi', image: '📶' },
  { letter: 'x', word: 'xilófono', image: '🎼' },
  { letter: 'y', word: 'yoyo', image: '🪀' },
  { letter: 'z', word: 'zapato', image: '👟' }
];
const $ = selector => document.querySelector(selector);
const game = $('#game');
let resultadoId;
let round = 0;
let correct = 0;
let locked = false;
let secuenciaVoz = 0;
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
  const question = letters[round];
  locked = false;
  $('#progress').textContent = `Letra ${round + 1} de ${letters.length}`;
  $('#progressBar').style.width = `${(round / letters.length) * 100}%`;
  $('#picture').textContent = question.image;
  $('#picture').setAttribute('aria-label', `Imagen de ${question.word}`);
  $('#capitalLetter').textContent = question.letter.toLocaleUpperCase('es-CL');
  $('#smallLetter').textContent = question.letter;
  const initial = document.createElement('span');
  initial.className = 'word-initial';
  initial.textContent = [...question.word][0];
  $('#word').replaceChildren(initial, document.createTextNode([...question.word].slice(1).join('')));
  $('#feedback').textContent = '';
  $('#feedback').className = 'feedback';
  const distractors = mezclar(letters.filter(item => item.letter !== question.letter)).slice(0, 2);
  const options = mezclar([question, ...distractors]);
  $('#choices').replaceChildren(...options.map((item, index) => {
    const option = document.createElement('div');
    option.className = 'letter-choice';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'choice-button';
    button.textContent = item.letter.toLocaleUpperCase('es-CL');
    button.setAttribute('aria-label', `Elegir la letra ${item.letter.toLocaleUpperCase('es-CL')}`);
    button.addEventListener('click', () => choose(item.letter));

    const listenButton = document.createElement('button');
    listenButton.type = 'button';
    listenButton.className = 'letter-speak-button';
    listenButton.textContent = '🔊';
    listenButton.setAttribute('aria-label', `Escuchar la letra ${item.letter.toLocaleUpperCase('es-CL')}`);
    listenButton.hidden = !('speechSynthesis' in window);
    listenButton.addEventListener('click', () => pronunciarLetra(item.letter));

    option.append(button, listenButton);
    return option;
  }));
  const turnoActual = round;
  window.setTimeout(() => {
    if (round === turnoActual) escuchar({ leerOpciones: true });
  }, 250);
}

function choose(letter) {
  if (locked) return;
  cancelarVoz();
  const question = letters[round];
  const isCorrect = letter === question.letter;
  responses.push({
    palabra: question.word,
    letraElegida: letter,
    letraCorrecta: question.letter,
    correcta: isCorrect
  });
  if (!isCorrect) {
    $('#feedback').textContent = '¡Casi! Mira las letras grandes y vuelve a intentarlo.';
    $('#feedback').className = 'feedback incorrect';
    escuchar({ reintento: true, leerOpciones: true });
    return;
  }

  locked = true;
  correct++;
  $('#feedback').textContent = `¡Muy bien! ${question.letter.toLocaleUpperCase('es-CL')} es la primera letra de ${question.word}.`;
  $('#feedback').classList.add('correct');
  $('#choices').querySelectorAll('button').forEach(button => { button.disabled = true; });
  window.setTimeout(avanzar, 1000);
}

async function avanzar() {
  round++;
  if (round === letters.length) {
    await finish();
    return;
  }
  renderQuestion();
}

function hablarEnOrden(textos, secuencia) {
  if (secuencia !== secuenciaVoz) return;
  const [texto, ...resto] = textos;
  if (!texto) return;
  const voz = new SpeechSynthesisUtterance(texto);
  voz.lang = 'es-CL';
  voz.rate = 0.78;
  const continuar = () => {
    if (secuencia !== secuenciaVoz) return;
    window.setTimeout(() => hablarEnOrden(resto, secuencia), 300);
  };
  voz.addEventListener('end', continuar, { once: true });
  voz.addEventListener('error', continuar, { once: true });
  window.speechSynthesis.speak(voz);
}

function cancelarVoz() {
  secuenciaVoz++;
  window.speechSynthesis?.cancel();
}

function iniciarVoz(textos) {
  if (!('speechSynthesis' in window)) return;
  cancelarVoz();
  hablarEnOrden(textos, secuenciaVoz);
}

function pronunciarLetra(letter) {
  if (locked || !('speechSynthesis' in window)) return;
  iniciarVoz([letter.toLocaleUpperCase('es-CL')]);
}

function escuchar({ reintento = false, leerOpciones = false } = {}) {
  if (locked) return;
  if (!('speechSynthesis' in window)) {
    if (reintento) return;
    $('#feedback').textContent = 'La lectura en voz alta no está disponible en este navegador. Puedes usar la imagen y las letras grandes como pista.';
    return;
  }
  const question = letters[round];
  const prompt = reintento
    ? `Escucha otra vez: ${question.word}. ¿Qué sonido escuchas al comienzo?`
    : `Mira el dibujo. La palabra es ${question.word}. ¿Qué sonido escuchas al comienzo? Toca la letra que suena igual.`;
  const options = leerOpciones
    ? [...$('#choices').querySelectorAll('.choice-button')].map(button => button.textContent)
    : [];
  iniciarVoz([prompt, ...options]);
}

async function finish() {
  $('#backToActivities').classList.add('hidden');
  $('#finishedBack').classList.add('hidden');
  $('#retrySave').classList.add('hidden');
  $('#progressBar').style.width = '100%';
  game.classList.add('hidden');
  $('#finished').classList.remove('hidden');
  try {
    const saved = await window.actividadLectura.guardar(resultadoId, correct, letters.length, {
      actividad: 'letras_iniciales',
      respuestas: responses
    });
    $('#result').textContent = `Reconociste ${correct} de ${letters.length} letras. ¡El Nivel 2 ya está disponible! Duración: ${saved.duracionSegundos} segundos.`;
  } catch (error) {
    $('#result').textContent = `No se pudo guardar el resultado: ${error.message}`;
    $('#retrySave').classList.remove('hidden');
  }
}

$('#listen').addEventListener('click', () => escuchar({ leerOpciones: true }));
$('#retrySave').addEventListener('click', finish);

(async () => {
  try {
    resultadoId = await window.actividadLectura.iniciar('Reconozco las letras');
    renderQuestion();
    game.classList.remove('hidden');
  } catch (error) {
    window.actividadLectura.mostrarError(error);
  }
})();
