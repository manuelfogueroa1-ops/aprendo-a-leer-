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
  if (round === questions.length - 1) {
    $('#next').textContent = 'Volviendo a tus actividades…';
    $('#next').disabled = true;
    window.setTimeout(finish, 1200);
    $('#next').classList.remove('hidden');
    return;
  }
  $('#next').textContent = 'Siguiente palabra';
  $('#next').classList.remove('hidden');
}

async function finish() {
  $('#progressBar').style.width = '100%';
  game.classList.add('hidden');
  $('#finished').classList.remove('hidden');
  try {
    const saved = await window.actividadLectura.guardar(resultadoId, correct, questions.length, {
      actividad: 'letras',
      respuestas: responses
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