const questions = [
  { word: 'casa', image: '🏠', syllables: ['ca', 'sa'] },
  { word: 'pelota', image: '⚽', syllables: ['pe', 'lo', 'ta'] },
  { word: 'mariposa', image: '🦋', syllables: ['ma', 'ri', 'po', 'sa'] },
  { word: 'tomate', image: '🍅', syllables: ['to', 'ma', 'te'] },
  { word: 'caballo', image: '🐴', syllables: ['ca', 'ba', 'llo'] }
];
const $ = selector => document.querySelector(selector);
const game = $('#game');
const answer = [];
const responses = [];
let resultadoId;
let round = 0;
let correct = 0;
let locked = false;
let syllables = [];
let intentos = 0;

function renderQuestion() {
  const question = questions[round];
  answer.length = 0;
  syllables = [...question.syllables].sort(() => Math.random() - 0.5);
  $('#progress').textContent = `Palabra ${round + 1} de ${questions.length}`;
  $('#progressBar').style.width = `${(round / questions.length) * 100}%`;
  $('#picture').textContent = question.image;
  $('#picture').setAttribute('aria-label', `Imagen de ${question.word}`);
  $('#word').textContent = question.word.split('').map(() => '_').join(' ');
  $('#feedback').textContent = '';
  $('#feedback').className = 'feedback';
  renderChoices();
  renderAnswer();
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
      answer.push(syllable);
      renderChoices();
      renderAnswer();
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
      answer.splice(index, 1);
      renderChoices();
      renderAnswer();
    });
    return button;
  }));
}

async function finish() {
  $('#progressBar').style.width = '100%';
  game.classList.add('hidden');
  $('#finished').classList.remove('hidden');
  try {
    const saved = await window.actividadLectura.guardar(resultadoId, correct, questions.length, {
      actividad: 'silabas',
      respuestas: responses
    });
    $('#result').textContent = `Formaste ${correct} de ${questions.length} palabras al primer intento. Duración: ${saved.duracionSegundos} segundos.`;
  } catch (error) {
    $('#result').textContent = `No se pudo guardar el resultado: ${error.message}`;
    $('#retrySave').classList.remove('hidden');
  }
}

$('#check').addEventListener('click', () => {
  if (locked) return;
  const question = questions[round];
  const feedback = $('#feedback');
  if (answer.length !== question.syllables.length) {
    feedback.textContent = 'Elige todas las sílabas antes de revisar.';
    return;
  }
  const isCorrect = answer.join('') === question.word;
  intentos++;
  responses.push({ palabra: question.word, respuesta: answer.join(''), correcta: isCorrect, intento: intentos });
  feedback.className = 'feedback';
  void feedback.offsetWidth; // reinicia la animación aunque se repita el mismo mensaje
  if (!isCorrect) {
    feedback.textContent = 'Casi. ¡Inténtalo otra vez! 💪';
    feedback.classList.add('incorrect');
    answer.length = 0;
    renderChoices();
    renderAnswer();
    return;
  }
  locked = true;
  if (intentos === 1) correct++;
  feedback.textContent = '¡Muy bien! Las sílabas están en orden.';
  feedback.classList.add('correct');
  renderAnswer();
  $('#check').disabled = true;
  if (round === questions.length - 1) {
    $('#check').textContent = 'Volviendo a tus actividades…';
    window.setTimeout(finish, 1200);
    return;
  }
  window.setTimeout(() => {
    round++;
    intentos = 0;
    locked = false;
    $('#check').disabled = false;
    renderQuestion();
  }, 1300);
});

$('#retrySave').addEventListener('click', finish);

(async () => {
  try {
    resultadoId = await window.actividadLectura.iniciar('Aprendo las sílabas');
    renderQuestion();
    game.classList.remove('hidden');
  } catch (error) {
    window.actividadLectura.mostrarError(error);
  }
})();
