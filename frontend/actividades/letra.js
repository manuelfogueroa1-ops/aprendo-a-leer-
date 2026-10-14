const questions = [
  { word: 'gato', image: '🐱', missing: 0, choices: ['g', 'p', 'm'] },
  { word: 'luna', image: '🌙', missing: 2, choices: ['n', 'r', 't'] },
  { word: 'sapo', image: '🐸', missing: 0, choices: ['c', 's', 'l'] },
  { word: 'mesa', image: '🪑', missing: 2, choices: ['d', 's', 'm'] },
  { word: 'pato', image: '🦆', missing: 3, choices: ['o', 'a', 'e'] },
  { word: 'mano', image: '✋', missing: 0, choices: ['m', 'n', 't'] },
  { word: 'casa', image: '🏠', missing: 2, choices: ['l', 's', 'c'] },
  { word: 'dado', image: '🎲', missing: 0, choices: ['b', 'd', 'g'] }
];
const $ = selector => document.querySelector(selector);
const game = $('#game');
let resultadoId;
let round = 0;
let correct = 0;
let locked = false;
const responses = [];

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
  $('#choices').replaceChildren(...question.choices.map(letter => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'choice-button';
    button.textContent = letter.toLocaleUpperCase('es-CL');
    button.addEventListener('click', () => choose(letter));
    return button;
  }));
}

function choose(letter) {
  if (locked) return;
  locked = true;
  const question = questions[round];
  const isCorrect = letter === question.word[question.missing];
  responses.push({ palabra: question.word, letraElegida: letter, letraCorrecta: question.word[question.missing], correcta: isCorrect });
  if (isCorrect) correct++;
  $('#word').textContent = [...question.word].map((character, index) =>
    index === question.missing ? letter.toLocaleUpperCase('es-CL') : character
  ).join(' ');
  $('#feedback').textContent = isCorrect
    ? '¡Correcto! Elegiste la letra que faltaba.'
    : `La letra correcta es ${question.word[question.missing].toLocaleUpperCase('es-CL')}.`;
  $('#feedback').classList.add(isCorrect ? 'correct' : 'incorrect');
  $('#choices').querySelectorAll('button').forEach(button => { button.disabled = true; });
  $('#next').textContent = round === questions.length - 1 ? 'Ver mi resultado' : 'Siguiente palabra';
  $('#next').classList.remove('hidden');
}

async function finish() {
  $('#progressBar').style.width = '100%';
  game.classList.add('hidden');
  $('#finished').classList.remove('hidden');
  try {
    const saved = await window.actividadLectura.guardar(resultadoId, correct, questions.length, {
      actividad: 'letras',
      respuestas
    });
    $('#result').textContent = `Elegiste ${correct} de ${questions.length} letras correctamente. Duración: ${saved.duracionSegundos} segundos.`;
  } catch (error) {
    $('#result').textContent = `No se pudo guardar el resultado: ${error.message}`;
    $('#retrySave').classList.remove('hidden');
  }
}

$('#next').addEventListener('click', async () => {
  if (!locked) return;
  round++;
  if (round === questions.length) {
    await finish();
    return;
  }
  renderQuestion();
});

$('#retrySave').addEventListener('click', finish);

(async () => {
  try {
    resultadoId = await window.actividadLectura.iniciar('Encuentro la letra');
    renderQuestion();
    game.classList.remove('hidden');
  } catch (error) {
    window.actividadLectura.mostrarError(error);
  }
})();