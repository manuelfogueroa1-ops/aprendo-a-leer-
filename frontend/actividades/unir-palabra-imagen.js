const pairs = [
  { word: 'dedo', image: '👆', description: 'Dibujo de un dedo' },
  { word: 'dado', image: '🎲', description: 'Dibujo de un dado' },
  { word: 'mano', image: '✋', description: 'Dibujo de una mano' },
  { word: 'mapa', image: '🗺️', description: 'Dibujo de un mapa' },
  { word: 'lupa', image: '🔎', description: 'Dibujo de una lupa' },
  { word: 'luna', image: '🌙', description: 'Dibujo de la luna' }
];
const $ = selector => document.querySelector(selector);
const game = $('#game');
const attempts = new Map(pairs.map(pair => [pair.word, 0]));
const responses = [];
let resultadoId;
let seleccionada = null;
let correctFirstTry = 0;
let matchedPairs = 0;
let errors = 0;
let saving = false;
let saved = false;

function mezclar(items) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

const wordOrder = mezclar(pairs);

function render() {
  $('#images').replaceChildren(...pairs.map((pair, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'match-image';
    button.textContent = pair.image;
    button.setAttribute('aria-label', pair.description);
    button.setAttribute('aria-pressed', String(seleccionada === pair.word));
    button.disabled = responses.some(response => response.palabra === pair.word);
    if (seleccionada === pair.word) button.classList.add('selected');
    if (button.disabled) {
      button.classList.add('matched');
      button.setAttribute('aria-label', `${pair.description}, pareja unida`);
      button.insertAdjacentText('beforeend', ' ✓');
    }
    button.addEventListener('click', () => {
      seleccionada = seleccionada === pair.word ? null : pair.word;
      $('#feedback').textContent = seleccionada ? 'Ahora elige la palabra correspondiente.' : '';
      $('#feedback').className = 'feedback';
      render();
    });
    return button;
  }));

  const usedWords = new Set(responses.map(response => response.palabra));
  $('#words').replaceChildren(...wordOrder.map(pair => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'match-word';
    button.textContent = pair.word.toLocaleUpperCase('es-CL');
    button.disabled = usedWords.has(pair.word);
    if (button.disabled) {
      button.classList.add('matched');
      button.textContent += ' ✓';
    }
    button.addEventListener('click', () => chooseWord(pair.word, button));
    return button;
  }));
}

async function chooseWord(word, button) {
  if (!seleccionada || button.disabled) {
    if (!seleccionada) {
      $('#feedback').textContent = 'Primero toca una imagen.';
      $('#feedback').className = 'feedback incorrect';
    }
    return;
  }

  const selectedPair = pairs.find(pair => pair.word === seleccionada);
  if (selectedPair.word !== word) {
    attempts.set(selectedPair.word, attempts.get(selectedPair.word) + 1);
    errors++;
    $('#feedback').textContent = 'Esa palabra no corresponde. ¡Prueba otra!';
    $('#feedback').className = 'feedback incorrect';
    seleccionada = null;
    render();
    return;
  }

  if (attempts.get(word) === 0) correctFirstTry++;
  responses.push({ palabra: word, intentos: attempts.get(word) + 1, correctaPrimerIntento: attempts.get(word) === 0 });
  matchedPairs++;
  seleccionada = null;
  $('#progress').textContent = `Parejas unidas: ${matchedPairs} de ${pairs.length}`;
  $('#progressBar').style.width = `${(matchedPairs / pairs.length) * 100}%`;
  $('#feedback').textContent = '¡Muy bien! Encontraste la pareja.';
  $('#feedback').className = 'feedback correct';
  render();

  if (matchedPairs === pairs.length) await finish();
}

async function finish() {
  if (saving || saved) return;
  saving = true;
  $('#game').classList.add('hidden');
  $('#finished').classList.remove('hidden');
  try {
    const result = await window.actividadLectura.guardar(resultadoId, correctFirstTry, pairs.length, {
      actividad: 'unir-palabra-imagen',
      respuestas: responses,
      intentosIncorrectos: errors
    }, errors);
    saved = true;
    $('#retrySave').classList.add('hidden');
    $('#result').textContent = `Uniste ${matchedPairs} de ${pairs.length} parejas. Aciertos al primer intento: ${correctFirstTry}. Errores: ${errors}. Duración: ${result.duracionSegundos} segundos.`;
  } catch (error) {
    $('#result').textContent = `No se pudo guardar el resultado: ${error.message}`;
    $('#retrySave').classList.remove('hidden');
  } finally {
    saving = false;
  }
}

$('#retrySave').addEventListener('click', finish);

(async () => {
  try {
    resultadoId = await window.actividadLectura.iniciar('Uno la palabra con su imagen');
    $('#progress').textContent = `Parejas unidas: 0 de ${pairs.length}`;
    render();
    game.classList.remove('hidden');
  } catch (error) {
    window.actividadLectura.mostrarError(error);
  }
})();
