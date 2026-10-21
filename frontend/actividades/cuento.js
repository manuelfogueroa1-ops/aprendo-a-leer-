// Las letras que faltan van entre corchetes: "ga[t]o" => falta la T.
const stories = [
  {
    title: 'El gato Michi',
    text: 'Michi es un ga[t]o muy ch[i]quito. Vive en una c[a]sa con una ni[ñ]a. Todas las ma[ñ]anas toma le[c]he. Luego ju[e]ga con una pel[o]ta. ¡Qué feliz es Mi[c]hi!'
  },
  {
    title: 'Un día en el parque',
    text: 'Hoy fui al par[q]ue con mi ma[m]á. Vi un pe[r]ro que corría. Sobre un á[r]bol cantaba un pá[j]aro. Comimos un he[l]ado de fre[s]a. ¡Fue un día her[m]oso!'
  },
  {
    title: 'La luna y el sol',
    text: 'De día brilla el s[o]l en el cielo az[u]l. De noche sale la l[u]na con sus es[t]rellas. Las nu[b]es pasan despacio. Un [p]ez duerme en el [r]ío. ¡Buenas no[c]hes!'
  }
];
const VOCALES = ['a', 'e', 'i', 'o', 'u'];
const CONSONANTES = 'bcdfghjklmnñpqrstvyz'.split('');
const PARECIDAS = { b: 'd', d: 'b', p: 'q', q: 'p', m: 'n', n: 'm', v: 'b', c: 's', s: 'c', z: 's', g: 'j', j: 'g', r: 'l', l: 'r', t: 'd', f: 'p', ñ: 'n', h: 'n', k: 'c' };
const $ = selector => document.querySelector(selector);
const game = $('#game');
const responses = [];
let resultadoId;
let story;
let blanks = [];
let active = 0;
let correct = 0;
let locked = false;

function mezclar(items) {
  const resultado = [...items];
  for (let i = resultado.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [resultado[i], resultado[j]] = [resultado[j], resultado[i]];
  }
  return resultado;
}

// Convierte el texto con [x] en trozos de texto y huecos.
function parseStory(text) {
  const parts = [];
  let last = 0;
  for (const match of text.matchAll(/\[(\p{L})\]/gu)) {
    if (match.index > last) parts.push({ type: 'text', value: text.slice(last, match.index) });
    parts.push({ type: 'blank', letter: match[1].toLocaleLowerCase('es-CL') });
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push({ type: 'text', value: text.slice(last) });
  return parts;
}

// Palabra completa a la que pertenece un hueco (para el registro de la profesora).
function wordAround(parts, index) {
  let before = '';
  let after = '';
  for (let i = index - 1; i >= 0 && parts[i].type !== 'blank'; i--) {
    const m = /[\p{L}]*$/u.exec(parts[i].value);
    before = m[0] + before;
    if (m[0].length !== parts[i].value.length) break;
  }
  for (let i = index + 1; i < parts.length && parts[i].type !== 'blank'; i++) {
    const m = /^[\p{L}]*/u.exec(parts[i].value);
    after += m[0];
    if (m[0].length !== parts[i].value.length) break;
  }
  return `${before}${parts[index].letter}${after}`.toLocaleLowerCase('es-CL');
}

function optionsFor(letter) {
  const pool = VOCALES.includes(letter) ? VOCALES : CONSONANTES;
  const distractors = [];
  const similar = PARECIDAS[letter];
  if (similar && pool.includes(similar)) distractors.push(similar);
  for (const item of mezclar(pool)) {
    if (distractors.length >= 2) break;
    if (item !== letter && !distractors.includes(item)) distractors.push(item);
  }
  return mezclar([letter, ...distractors]);
}

function renderStory() {
  $('#story').replaceChildren(...story.parts.map(part => {
    if (part.type === 'text') return document.createTextNode(part.value);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'story-blank';
    part.element = button;
    button.addEventListener('click', () => {
      if (locked || part.filled) return;
      active = blanks.indexOf(part);
      renderBlanks();
      renderChoices();
    });
    return button;
  }));
  renderBlanks();
}

function renderBlanks() {
  blanks.forEach((blank, index) => {
    const el = blank.element;
    el.textContent = blank.filled ? blank.letter : '_';
    el.disabled = Boolean(blank.filled);
    el.classList.toggle('filled', Boolean(blank.filled));
    el.classList.toggle('active', index === active && !blank.filled);
    el.setAttribute('aria-label', blank.filled ? `Letra ${blank.letter}` : 'Letra que falta');
  });
  const filled = blanks.filter(blank => blank.filled).length;
  $('#progress').textContent = `Letras completadas: ${filled} de ${blanks.length}`;
  $('#progressBar').style.width = `${(filled / blanks.length) * 100}%`;
}

function renderChoices() {
  const blank = blanks[active];
  $('#choices').replaceChildren(...blank.options.map(letter => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'choice-button';
    button.textContent = letter.toLocaleUpperCase('es-CL');
    button.setAttribute('aria-label', `Elegir la letra ${letter.toLocaleUpperCase('es-CL')}`);
    button.addEventListener('click', () => choose(letter));
    return button;
  }));
}

function nextBlank() {
  const index = blanks.findIndex((blank, i) => i > active && !blank.filled);
  return index !== -1 ? index : blanks.findIndex(blank => !blank.filled);
}

function choose(letter) {
  if (locked) return;
  const blank = blanks[active];
  const isCorrect = letter === blank.letter;
  const feedback = $('#feedback');
  feedback.className = 'feedback';
  void feedback.offsetWidth;
  if (!isCorrect) {
    blank.errors = (blank.errors || 0) + 1;
    responses.push({ palabra: blank.word, letraElegida: letter, letraCorrecta: blank.letter, correcta: false });
    feedback.textContent = 'Casi. Lee la frase en voz alta y prueba con otra letra.';
    feedback.classList.add('incorrect');
    return;
  }
  blank.filled = true;
  if (!blank.errors) correct++;
  responses.push({ palabra: blank.word, letraElegida: letter, letraCorrecta: blank.letter, correcta: true });
  feedback.textContent = `¡Muy bien! Ahí va la ${letter.toLocaleUpperCase('es-CL')}.`;
  feedback.classList.add('correct');
  const next = nextBlank();
  if (next === -1) {
    locked = true;
    renderBlanks();
    $('#choices').replaceChildren();
    window.setTimeout(finish, 1200);
    return;
  }
  active = next;
  renderBlanks();
  renderChoices();
}

function listen() {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const full = story.parts.map(part => part.type === 'text' ? part.value : part.letter).join('');
  const voz = new SpeechSynthesisUtterance(`${story.title}. ${full}`);
  voz.lang = 'es-CL';
  voz.rate = 0.8;
  window.speechSynthesis.speak(voz);
}

async function finish() {
  window.speechSynthesis?.cancel();
  $('#progressBar').style.width = '100%';
  game.classList.add('hidden');
  $('#finished').classList.remove('hidden');
  try {
    const saved = await window.actividadLectura.guardar(resultadoId, correct, blanks.length, {
      actividad: 'cuento',
      cuento: story.title,
      respuestas: responses
    });
    $('#result').textContent = `Completaste “${story.title}”: ${correct} de ${blanks.length} letras al primer intento. Duración: ${saved.duracionSegundos} segundos.`;
  } catch (error) {
    $('#result').textContent = `No se pudo guardar el resultado: ${error.message}`;
    $('#retrySave').classList.remove('hidden');
  }
}

function startStory() {
  const chosen = stories[Math.floor(Math.random() * stories.length)];
  story = { title: chosen.title, parts: parseStory(chosen.text) };
  story.parts.forEach((part, index) => {
    if (part.type !== 'blank') return;
    part.word = wordAround(story.parts, index);
    part.options = optionsFor(part.letter);
  });
  blanks = story.parts.filter(part => part.type === 'blank');
  $('#storyTitle').textContent = story.title;
  renderStory();
  renderChoices();
}

$('#listen').addEventListener('click', listen);
$('#retrySave').addEventListener('click', finish);

(async () => {
  try {
    resultadoId = await window.actividadLectura.iniciar('Completo el cuento');
    startStory();
    game.classList.remove('hidden');
  } catch (error) {
    window.actividadLectura.mostrarError(error);
  }
})();