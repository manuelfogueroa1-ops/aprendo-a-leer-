const V5 = ['a', 'e', 'i', 'o', 'u'];
// Cada familia forma sus sílabas con una consonante y las cinco vocales.
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
    { base: 'ñ', vowels: V5 }, { base: 'y', vowels: V5 }
  ] },
  { name: 'Grupo 4', families: [
    { base: 'k', vowels: V5 }
  ] }
];

groups.forEach(group => {
  group.label = group.families.map(family => family.base.toLocaleUpperCase('es-CL')).join(' · ');
  group.questions = group.families.flatMap(family => family.vowels.map(vowel => ({
    consonant: family.base,
    vowel,
    syllable: family.base + vowel,
    pool: family.vowels.filter(other => other !== vowel).map(other => family.base + other)
  })));
});
let questions = [];

const $ = selector => document.querySelector(selector);
const game = $('#game');
const PROGRESS_NAME = 'Formo sílabas';
let resultadoId;
let round = 0;
let correct = 0;
let locked = false;
let audioTurn = 0;
let audioTimer;
let advanceTimer;
let progressReady = false;
let bienvenidaPendiente = true;
const responses = [];
const pista = crearPistaActividad(() => {
  if (locked || !questions[round]) return null;
  const syllable = questions[round].syllable.toLocaleUpperCase('es-CL');
  return {
    elemento: [...$('#choices').children].find(button => button.textContent === syllable),
    mensaje: `${questions[round].consonant.toLocaleUpperCase('es-CL')} con ${questions[round].vowel.toLocaleUpperCase('es-CL')} forma ${syllable}. Toca la sílaba que se mueve.`
  };
}, () => {
  if (!locked && !window.actividadLectura.estaPausada() && VozInfantil.tieneGrabacion('silabas-pista')) {
    VozInfantil.secuencia(['silabas-pista', `silaba-${questions[round].syllable}`]);
  }
});

function mezclar(items) {
  const resultado = [...items];
  for (let index = resultado.length - 1; index > 0; index--) {
    const otro = Math.floor(Math.random() * (index + 1));
    [resultado[index], resultado[otro]] = [resultado[otro], resultado[index]];
  }
  return resultado;
}

function estadoActual() {
  return {
    round,
    correct,
    responses,
    total: questions.length
  };
}

function guardarProgreso() {
  if (!progressReady || !questions.length || round >= questions.length) return;
  window.actividadLectura.guardarProgresoLocal(PROGRESS_NAME, estadoActual());
}

function renderQuestion() {
  if (window.actividadLectura.estaPausada()) return;
  cancelarEsperaActividad(audioTimer);
  cancelarEsperaActividad(advanceTimer);
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
  $('#listen').hidden = !VozInfantil.disponible();
  const distractors = mezclar(question.pool).slice(0, 2);
  $('#choices').replaceChildren(...mezclar([question.syllable, ...distractors]).map(syllable => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'syllable-button';
    button.textContent = syllable.toLocaleUpperCase('es-CL');
    button.addEventListener('click', () => choose(syllable));
    return button;
  }));
  guardarProgreso();
  const turnoActual = round;
  const audioActual = audioTurn;
  audioTimer = programarActividad(() => {
    if (round === turnoActual && audioTurn === audioActual) pronunciar(question.syllable, audioActual);
  }, 300);
  if (!VozInfantil.tieneGrabacion(`silaba-${question.syllable}`)) pista.reiniciar();
}

function choose(syllable) {
  if (locked || window.actividadLectura.estaPausada()) return;
  pista.cancelar();
  cancelarEsperaActividad(audioTimer);
  cancelarAudio();
  bienvenidaPendiente = false;
  const question = questions[round];
  const isCorrect = syllable === question.syllable;
  responses.push({
    palabra: question.syllable.toLocaleUpperCase('es-CL'),
    respuesta: syllable.toLocaleUpperCase('es-CL'),
    correcta: isCorrect
  });
  guardarProgreso();
  if (!isCorrect) {
    $('#feedback').textContent = '¡Casi! Escucha la sílaba y vuelve a intentarlo.';
    $('#feedback').className = 'feedback incorrect';
    pronunciar(question.syllable, audioTurn, { reintento: true });
    if (!VozInfantil.tieneGrabacion(`silaba-${question.syllable}`)) pista.reiniciar();
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
  if (locked || window.actividadLectura.estaPausada() || !VozInfantil.disponible()) return;
  cancelarEsperaActividad(audioTimer);
  cancelarAudio();
  pronunciar(questions[round].syllable, audioTurn, { repetir: true });
}

function cancelarAudio() {
  audioTurn++;
  VozInfantil.cancelar();
}

function pronunciar(syllable, turnoAudio, { repetir = false, reintento = false } = {}) {
  if (locked || turnoAudio !== audioTurn || !VozInfantil.disponible()) return;
  if (VozInfantil.tieneGrabacion(`silaba-${syllable}`)) {
    const introduccion = bienvenidaPendiente;
    const keys = [
      ...(introduccion ? ['silabas-bienvenida', 'silabas-pregunta'] : []),
      ...(repetir && !introduccion ? ['silabas-repetir'] : []),
      ...(reintento ? ['silabas-reintento'] : []), `silaba-${syllable}`
    ];
    VozInfantil.secuencia(keys).then(completed => {
      if (turnoAudio !== audioTurn || locked || window.actividadLectura.estaPausada()) return;
      if (completed) bienvenidaPendiente = false;
      pista.reiniciar();
    });
    return;
  }
  const voz = VozInfantil.crear(syllable, { tipo: 'letras' });
  VozInfantil.reproducir(voz);
}

function avanzarDespuesDelAcierto(question, turnoActual) {
  const turnoAudio = audioTurn;
  let yaAvanzo = false;
  const avanzar = () => {
    if (yaAvanzo || !locked || round !== turnoActual || audioTurn !== turnoAudio || window.actividadLectura.estaPausada()) return;
    yaAvanzo = true;
    cancelarEsperaActividad(advanceTimer);
    cancelarAudio();
    round++;
    if (round === questions.length) {
      finish();
      return;
    }
    renderQuestion();
  };

  if (VozInfantil.tieneGrabacion('silabas-acierto')) {
    VozInfantil.secuencia(['silabas-acierto']).then(() => {
      if (round === turnoActual && audioTurn === turnoAudio && !window.actividadLectura.estaPausada()) {
        advanceTimer = programarActividad(avanzar, 350);
      }
    });
    return;
  }

  if (!VozInfantil.disponible()) {
    advanceTimer = programarActividad(avanzar, 1800);
    return;
  }
  const felicitacion = VozInfantil.crear(`¡Muy bien! ${question.syllable.toLocaleUpperCase('es-CL')}.`, { tipo: 'animo' });
  felicitacion.addEventListener('end', () => {
    if (!yaAvanzo && round === turnoActual && audioTurn === turnoAudio) {
      cancelarEsperaActividad(advanceTimer);
      advanceTimer = programarActividad(avanzar, 450);
    }
  }, { once: true });
  felicitacion.addEventListener('start', () => {
    if (!yaAvanzo && round === turnoActual && audioTurn === turnoAudio && !window.actividadLectura.estaPausada()) {
      cancelarEsperaActividad(advanceTimer);
      advanceTimer = programarActividad(avanzar, 6000);
    }
  }, { once: true });
  felicitacion.addEventListener('error', () => {
    if (!yaAvanzo && round === turnoActual && audioTurn === turnoAudio) {
      cancelarEsperaActividad(advanceTimer);
      advanceTimer = programarActividad(avanzar, 1800);
    }
  }, { once: true });
  advanceTimer = programarActividad(avanzar, VozInfantil.seleccionada()?.piper ? 65000 : 4000);
  VozInfantil.reproducir(felicitacion);
}

async function finish() {
  cancelarEsperaActividad(audioTimer);
  cancelarEsperaActividad(advanceTimer);
  cancelarAudio();
  $('#progressBar').style.width = '100%';
  game.classList.add('hidden');
  $('#finished').classList.remove('hidden');
  try {
    const saved = await window.actividadLectura.guardar(resultadoId, correct, questions.length, {
      actividad: 'silabas_iniciales',
      grupo: 'todos',
      respuestas: responses
    }, questions.length - correct, {
      antesDeVolver: VozInfantil.tieneGrabacion('silabas-final') ? () => VozInfantil.secuencia(['silabas-final']) : undefined
    });
    await window.actividadLectura.borrarProgresoLocal(PROGRESS_NAME);
    $('#result').textContent = `Formaste correctamente ${correct} de ${questions.length} sílabas. Duración: ${saved.duracionSegundos} segundos.`;
  } catch (error) {
    guardarProgreso();
    $('#result').textContent = `No se pudo guardar el resultado: ${error.message}`;
    $('#retrySave').classList.remove('hidden');
  }
}

$('#listen').addEventListener('click', escuchar);
$('#retrySave').addEventListener('click', finish);

async function startAllGroups() {
  // Secuencia completa: el alumno no elige grupos y avanza hasta completar todo.
  questions = groups.flatMap(group => group.questions);
  round = 0;
  correct = 0;
  responses.length = 0;

  let guardado = await window.actividadLectura.cargarProgresoLocal(PROGRESS_NAME);
  // El catálogo anterior tenía 116 turnos: las familias retiradas ocupaban
  // los puestos 85–104 y 110–115; K estaba en los puestos 105–109.
  // Conservamos el avance de las sílabas que siguen en el nuevo recorrido.
  if (guardado?.total === 116 && Number.isInteger(guardado.round) && guardado.round >= 0 && guardado.round < 116) {
    const nextRound = guardado.round < 85 ? guardado.round : guardado.round < 105 ? 85 : Math.min(90, guardado.round - 20);
    const anteriores = new Set(questions.slice(0, nextRound).map(question => question.syllable));
    const respuestas = (Array.isArray(guardado.responses) ? guardado.responses : []).filter(response =>
      anteriores.has(String(response.palabra).toLocaleLowerCase('es-CL')));
    guardado = {
      ...guardado, round: nextRound, total: questions.length, responses: respuestas,
      correct: new Set(respuestas.filter(response => response.correcta).map(response => response.palabra)).size
    };
    if (nextRound === questions.length) {
      round = nextRound;
      correct = guardado.correct;
      responses.push(...respuestas);
      progressReady = true;
      await finish();
      return;
    }
  }
  if (guardado && Number.isInteger(guardado.round) && guardado.round >= 0 && guardado.round < questions.length) {
    round = guardado.round;
    correct = Number.isInteger(guardado.correct) ? guardado.correct : 0;
    responses.push(...(Array.isArray(guardado.responses) ? guardado.responses : []));
    const status = $('#status');
    if (status) status.textContent = `Retomaste tu avance en la sílaba ${round + 1} de ${questions.length}.`;
  }

  progressReady = true;
  game.classList.remove('hidden');
  renderQuestion();
}

window.addEventListener('beforeunload', guardarProgreso);
window.addEventListener('pagehide', guardarProgreso);
window.addEventListener('actividad-pausada', () => {
  cancelarEsperaActividad(audioTimer);
  cancelarEsperaActividad(advanceTimer);
  cancelarAudio();
});
window.addEventListener('actividad-reanudada', () => {
  if (!game.classList.contains('hidden') && round < questions.length) {
    if (locked) avanzarDespuesDelAcierto(questions[round], round);
    else programarActividad(escuchar, 150);
  }
});

(async () => {
  try {
    resultadoId = await window.actividadLectura.iniciar('Formo sílabas');
    await startAllGroups();
  } catch (error) {
    window.actividadLectura.mostrarError(error);
  }
})();
window.actividadLectura.seguirAvance(() => questions.length ? ({
  preguntaActual: Math.min(round + 1, questions.length), totalPreguntas: questions.length,
  completadas: Math.min(round + Number(locked), questions.length),
  consigna: `Formar ${(questions[round] || questions.at(-1)).syllable.toLocaleUpperCase('es-CL')}`,
  respuestaActual: $('#feedback').textContent.slice(0, 300)
}) : null);
