const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[character]));

async function api(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || 'Ocurrió un error.');
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

// El inicio es para los estudiantes; el acceso docente es un enlace discreto al pie.
function showPanel(id) {
  document.querySelectorAll('.panel').forEach(panel => panel.classList.toggle('hidden', panel.id !== id));
  $('#teacherLink').classList.toggle('hidden', id === 'profesor');
  window.scrollTo({ top: 0 });
  if (id === 'profesor') {
    restoreTeacherSession();
    if (!$('#teacherLogin').classList.contains('hidden')) $('#teacherForm').elements.usuario.focus();
  }
}
document.querySelectorAll('[data-panel]').forEach(button => button.addEventListener('click', () => showPanel(button.dataset.panel)));

// Voz del navegador: ayuda a quienes todavía no leen de corrido. Si no existe, no pasa nada.
function decir(texto) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const voz = new SpeechSynthesisUtterance(texto);
  voz.lang = 'es-CL';
  voz.rate = 0.85;
  window.speechSynthesis.speak(voz);
}
$('#listenIntro').addEventListener('click', () => decir('¿Cómo te llamas? Toca tu nombre.'));

// ---------- Pantallas del estudiante ----------
const PANTALLAS = { entry: '#studentEntry', setup: '#studentSetup', activities: '#studentActivities' };
function showScreen(name) {
  Object.entries(PANTALLAS).forEach(([key, selector]) => $(selector).classList.toggle('hidden', key !== name));
}

function updateModeButton() {
  const oscuro = window.Tema?.actual().ModoOscuro;
  $('#toggleMode').textContent = oscuro ? '☀️ Modo día' : '🌙 Modo noche';
}

// Estado de la pantalla de elección: paso actual ('color' | 'tema') y si el estudiante la abrió desde "Mis colores".
let setupStep = 'color';
let setupEditing = false;

function showSetup(step, { editing = setupEditing } = {}) {
  setupStep = step;
  setupEditing = editing;
  const actual = window.Tema.actual();
  const box = $('#setupOptions');
  $('#setupStatus').textContent = '';
  if (step === 'color') {
    $('#setupKicker').textContent = '🎨 PASO 1';
    $('#setupTitle').textContent = '¿Cuál es tu color favorito?';
    $('#setupHint').textContent = 'Toca el color que más te guste.';
    box.innerHTML = Tema.COLORES.map(([nombre, matiz]) => `
      <button type="button" class="setup-tile" data-color="${matiz}" aria-pressed="${actual.ColorFavorito === matiz}">
        <span class="setup-swatch" style="--tono:${matiz}" aria-hidden="true"></span>
        <span>${esc(nombre)}</span>
      </button>`).join('');
  } else {
    $('#setupKicker').textContent = '⭐ PASO 2';
    $('#setupTitle').textContent = '¿Qué te gusta más?';
    $('#setupHint').textContent = 'Elige un tema para decorar tus juegos.';
    box.innerHTML = Object.entries(Tema.TEMAS).map(([nombre, emojis]) => `
      <button type="button" class="setup-tile" data-tema="${esc(nombre)}" aria-pressed="${actual.TemaInteres === nombre}">
        <span class="setup-emoji" aria-hidden="true">${emojis[0]}</span>
        <span>${esc(nombre)}</span>
      </button>`).join('');
  }
  // "Volver" aparece al editar, o en el paso 2 para regresar al color.
  $('#setupActions').classList.toggle('hidden', !(editing || step === 'tema'));
  showScreen('setup');
}

function showActivities() {
  updateModeButton();
  showScreen('activities');
  loadActivities();
}

function showStudentActivities(student) {
  $('#studentWelcome').textContent = `Bienvenido/a, ${student.Nombre} ${student.Apellido}.`;
  Tema.aplicar(student);
  if (Tema.actual().ColorFavorito === null) showSetup('color', { editing: false });
  else if (Tema.actual().TemaInteres === null) showSetup('tema', { editing: false });
  else showActivities();
}

$('#setupOptions').addEventListener('click', async event => {
  const tile = event.target.closest('.setup-tile');
  if (!tile) return;
  const cambios = tile.dataset.color !== undefined
    ? { colorFavorito: Number(tile.dataset.color) }
    : { temaInteres: tile.dataset.tema };
  $('#setupOptions').querySelectorAll('button').forEach(button => { button.disabled = true; });
  try {
    await Tema.guardar(cambios);
    if (setupStep === 'color') showSetup('tema');
    else showActivities();
  } catch (error) {
    if (error.status === 401) {
      // La sesión del estudiante venció: volvemos a la lista de nombres.
      showScreen('entry');
      await loadStudentCards();
      return;
    }
    $('#setupStatus').textContent = error.message;
    $('#setupOptions').querySelectorAll('button').forEach(button => { button.disabled = false; });
  }
});

$('#setupBack').addEventListener('click', () => {
  if (setupStep === 'tema') showSetup('color');
  else showActivities();
});

$('#editColors').addEventListener('click', () => showSetup('color', { editing: true }));

$('#toggleMode').addEventListener('click', async () => {
  const boton = $('#toggleMode');
  boton.disabled = true;
  try {
    await Tema.guardar({ modoOscuro: !Tema.actual().ModoOscuro });
  } catch (error) {
    $('#studentWelcome').textContent = error.message;
  } finally {
    boton.disabled = false;
    updateModeButton();
  }
});

async function loadStudentCards() {
  const cards = $('#studentCards');
  const status = $('#studentStatus');
  cards.innerHTML = '';
  status.textContent = 'Cargando estudiantes…';
  try {
    const data = await api('/api/estudiantes');
    if (!data.estudiantes.length) {
      status.textContent = 'Todavía no hay estudiantes guardados. Pídele a la profesora que agregue tu nombre.';
      return;
    }
    status.textContent = '';
    const avatars = ['🦊', '🐼', '🦄', '🐻', '🐸', '🐱'];
    cards.innerHTML = data.estudiantes.map((student, index) => `
      <button class="student-card" type="button" data-student="${student.EstudianteID}">
        <span class="student-icon" aria-hidden="true">${avatars[index % avatars.length]}</span>
        <span class="student-card-name">${esc(student.Nombre)} ${esc(student.Apellido)}</span>
        <span class="student-enter" aria-hidden="true">→</span>
      </button>`).join('');
    cards.querySelectorAll('[data-student]').forEach(button => {
      button.addEventListener('click', async () => {
        button.disabled = true;
        try {
          const result = await api(`/api/estudiantes/${button.dataset.student}/ingresar`, {
            method: 'POST',
            body: JSON.stringify({})
          });
          decir(`Hola, ${result.estudiante.Nombre}`);
          showStudentActivities(result.estudiante);
        } catch (error) {
          status.textContent = error.message;
          button.disabled = false;
        }
      });
    });
  } catch (error) {
    status.textContent = error.message;
  }
}

$('#changeStudent').addEventListener('click', async () => {
  try {
    await api('/api/estudiantes/logout', { method: 'POST', body: JSON.stringify({}) });
    Tema.reiniciar();
    showScreen('entry');
    $('#studentWelcome').textContent = '';
    $('#activities').innerHTML = '';
    await loadStudentCards();
  } catch (error) {
    $('#studentWelcome').textContent = error.message;
  }
});

loadStudentCards();
api('/api/estudiantes/me')
  .then(data => showStudentActivities(data.estudiante))
  .catch(error => {
    if (error.status !== 401) $('#studentStatus').textContent = error.message;
  });

async function loadActivities() {
  const box = $('#activities');
  box.innerHTML = 'Cargando actividades…';
  try {
    const data = await api('/api/actividades');
    const activityPages = {
      'Reconozco las letras': '/actividades/letras-iniciales.html',
      'Formo sílabas': '/actividades/silabas-iniciales.html',
      'Uno la palabra con su imagen': '/actividades/unir-palabra-imagen.html',
      'Aprendo las sílabas': '/actividades/silabas.html',
      'Practico la pronunciación': '/actividades/pronunciar.html',
      'Encuentro la letra': '/actividades/letra.html'
    };
    const activityStyles = {
      'Reconozco las letras': { icon: '🔠', theme: 'theme-purple' },
      'Formo sílabas': { icon: '🔡', theme: 'theme-yellow' },
      'Uno la palabra con su imagen': { icon: '🖼️', theme: 'theme-blue' },
      'Aprendo las sílabas': { icon: '🧩', theme: 'theme-yellow' },
      'Practico la pronunciación': { icon: '🎤', theme: 'theme-blue' },
      'Encuentro la letra': { icon: '🔤', theme: 'theme-pink' }
    };
    // Solo mostramos actividades con juego de lectura implementado.
    const available = data.actividades
      .filter(activity => activityPages[activity.Nombre])
      .sort((a, b) => Number(a.NivelDificultad) - Number(b.NivelDificultad));
    if (!available.length) {
      box.innerHTML = '<p>No hay actividades disponibles por el momento.</p>';
      return;
    }
    box.innerHTML = available.map(activity => {
      const style = activityStyles[activity.Nombre];
      const level = activity.NivelDificultad ? `Nivel ${esc(activity.NivelDificultad)}` : 'Actividad';
      const locked = activity.Bloqueada;
      return `<article class="activity ${style.theme}${locked ? ' activity-locked' : ''}">
        <div class="activity-top">
          <span class="activity-icon" aria-hidden="true">${style.icon}</span>
          <span class="activity-level">${level}</span>
        </div>
        <h3>${esc(activity.Nombre)}</h3>
        <p>${esc(activity.Descripcion || '¡Descubre un nuevo desafío de lectura!')}</p>
        ${locked
          ? `<button type="button" disabled>🔒 Completa "${esc(activity.ActividadPrevia)}" primero</button>`
          : `<a class="button-link" href="${activityPages[activity.Nombre]}">¡Comenzar! <span aria-hidden="true">→</span></a>`}
      </article>`;
    }).join('');
  } catch (error) {
    box.textContent = error.message;
  }
}

window.addEventListener('pageshow', event => {
  if (event.persisted && !$('#studentActivities').classList.contains('hidden')) {
    loadActivities();
  }
});

// ---------- Estudiantes y detalle por estudiante (panel docente) ----------
let teacherStudents = [];
let activeStudentId = null;

function fechaCorta(iso) {
  const fecha = iso ? new Date(iso) : null;
  return fecha && !Number.isNaN(fecha.getTime()) ? fecha.toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short' }) : '';
}
function resumenTarjeta(s) {
  const n = Number(s.Completadas || 0);
  if (!n) return 'Aún sin actividades';
  return `${n} ${n === 1 ? 'actividad' : 'actividades'} · promedio ${Math.round(s.Promedio)} %`;
}

function pintarEstudiantes() {
  const cards = $('#teacherStudentCards');
  const texto = $('#studentSearch').value.trim().toLocaleLowerCase('es-CL');
  const lista = teacherStudents.filter(s => `${s.Nombre} ${s.Apellido}`.toLocaleLowerCase('es-CL').includes(texto));
  if (!teacherStudents.length) { cards.innerHTML = '<p>Aún no hay estudiantes guardados. Usa “+ Agregar estudiante”.</p>'; return; }
  if (!lista.length) { cards.innerHTML = '<p>Ningún nombre coincide con la búsqueda.</p>'; return; }
  cards.innerHTML = lista.map(s => `<button type="button" class="student-card teacher-student-card" data-id="${s.EstudianteID}">
      <span class="student-icon" aria-hidden="true">📚</span>
      <span class="tcard-text">${esc(s.Nombre)} ${esc(s.Apellido)}<small>${esc(resumenTarjeta(s))}</small></span>
      <span class="student-enter" aria-hidden="true">→</span>
    </button>`).join('');
}

async function loadTeacherStudents() {
  const cards = $('#teacherStudentCards');
  try {
    teacherStudents = (await api('/api/profesor/resumen')).estudiantes;
    pintarEstudiantes();
    return true;
  } catch (error) {
    cards.textContent = error.message;
    return false;
  }
}

async function refreshTeacherRecords() {
  const buttons = [$('#refreshRecords'), $('#refreshStudentRecords')];
  const status = $('#recordsRefreshStatus');
  buttons.forEach(button => { button.disabled = true; });
  status.textContent = 'Actualizando registros…';
  try {
    const currentStudentId = activeStudentId;
    const [studentsLoaded, detailLoaded] = await Promise.all([
      loadTeacherStudents(),
      currentStudentId ? openStudentDetail(currentStudentId) : Promise.resolve(true)
    ]);
    if (!studentsLoaded || !detailLoaded) {
      status.textContent = 'No se pudieron actualizar todos los registros. Revisa los mensajes de error e inténtalo de nuevo.';
      return;
    }
    status.textContent = 'Registros actualizados.';
  } finally {
    buttons.forEach(button => { button.disabled = false; });
  }
}

$('#studentSearch').addEventListener('input', pintarEstudiantes);
$('#refreshRecords').addEventListener('click', refreshTeacherRecords);
$('#refreshStudentRecords').addEventListener('click', refreshTeacherRecords);
$('#toggleAddStudent').addEventListener('click', () => {
  const caja = $('#addStudentBox');
  caja.classList.toggle('hidden');
  if (!caja.classList.contains('hidden')) $('#studentForm').elements.nombre.focus();
});
$('#teacherStudentCards').addEventListener('click', event => {
  const tarjeta = event.target.closest('[data-id]');
  if (tarjeta) openStudentDetail(Number(tarjeta.dataset.id));
});
$('#backToList').addEventListener('click', () => {
  activeStudentId = null;
  $('#profesor').classList.remove('viewing-student');
  $('#studentDetail').classList.add('hidden');
  $('#studentList').classList.remove('hidden');
  loadTeacherStudents();
});

// Letras que los niños suelen confundir al empezar a leer (parecidas al verlas).
const PARES_CONFUSOS = [['b', 'd'], ['p', 'q'], ['b', 'p'], ['m', 'n']];
const esParConfuso = (a, b) => PARES_CONFUSOS.some(([x, y]) => (a === x && b === y) || (a === y && b === x));

// Reúne los errores de todos los intentos para saber qué palabras cuestan más.
function analizarErrores(resultados) {
  const palabras = new Map();
  const confusiones = new Set();
  const anotar = (actividad, palabra, nota) => {
    const clave = `${actividad}|${palabra}`;
    const item = palabras.get(clave) || { actividad, palabra, veces: 0, notas: [] };
    item.veces += 1;
    if (nota && item.notas.length < 3 && !item.notas.includes(nota)) item.notas.push(nota);
    palabras.set(clave, item);
  };
  for (const r of resultados) {
    const tipo = r.detalle?.actividad;
    for (const x of Array.isArray(r.detalle?.respuestas) ? r.detalle.respuestas : []) {
      if (tipo === 'silabas' && x.correcta === false) anotar(tipo, x.palabra, `formó “${x.respuesta}”`);
      if (tipo === 'silabas_iniciales' && x.correcta === false) anotar(tipo, x.palabra, `eligió “${x.respuesta}”`);
      if ((tipo === 'letras' || tipo === 'letras_iniciales') && x.correcta === false) {
        anotar(tipo, x.palabra, `eligió “${x.letraElegida}”${x.letraCorrecta ? `, era “${x.letraCorrecta}”` : ''}`);
        if (x.letraCorrecta && esParConfuso(x.letraElegida, x.letraCorrecta)) confusiones.add([x.letraElegida, x.letraCorrecta].sort().join('/'));
      }
      if (tipo === 'unir-palabra-imagen' && x.correctaPrimerIntento === false) {
        anotar(tipo, x.palabra, `la unió después de ${x.intentos} intentos`);
      }
      if (tipo === 'pronunciacion') {
        const fallos = (x.intentos || []).filter(i => i.correcta === false);
        if (x.confirmadaComoPracticada) anotar(tipo, x.palabra, 'la marcó como practicada');
        else if (fallos.length) anotar(tipo, x.palabra, fallos[0].escuchado ? `escuchó “${fallos[0].escuchado}”` : '');
      }
    }
  }
  return { palabras: [...palabras.values()].sort((a, b) => b.veces - a.veces), confusiones: [...confusiones] };
}

const NOMBRE_ACTIVIDAD = {
  silabas: 'Sílabas',
  silabas_iniciales: 'Sílabas iniciales',
  letras: 'Letras',
  pronunciacion: 'Pronunciación',
  'unir-palabra-imagen': 'Unir palabra e imagen'
};
function bloqueRefuerzo(resultados) {
  if (!resultados.length) return '';
  const { palabras, confusiones } = analizarErrores(resultados);
  if (!palabras.length) return '<section class="reinforce reinforce-ok"><h4>Para reforzar</h4><p>🎉 Sin errores registrados en sus actividades.</p></section>';
  const tipos = new Set(palabras.map(p => p.actividad));
  const ideas = [];
  if (tipos.has('silabas')) ideas.push('<b>Sílabas:</b> separa la palabra con palmadas (ca-sa) y deja que la arme con tarjetas antes de repetir la actividad.');
  if (tipos.has('silabas_iniciales')) ideas.push('<b>Sílabas iniciales:</b> practiquen una familia de consonante a la vez (pa-pe-pi-po-pu), leyendo cada combinación en voz alta.');
  if (tipos.has('unir-palabra-imagen')) ideas.push('<b>Unir palabra e imagen:</b> lean la palabra en voz alta, nombren el dibujo y después busquen juntos las letras que aparecen en ambos.');
  if (tipos.has('letras') || tipos.has('letras_iniciales')) ideas.push(confusiones.length
    ? `<b>Letras:</b> confunde ${confusiones.map(esc).join(' y ')}. Trabaja una letra a la vez, con su sonido y su trazo (letras de lija o escritas en arena), y evita enseñar juntas las que se parecen.`
    : '<b>Letras:</b> pídele que diga la palabra completa en voz alta antes de elegir la letra que falta.');
  if (tipos.has('pronunciacion')) ideas.push('<b>Pronunciación:</b> di la palabra despacio y repítanla juntos, por sílabas. Si el micrófono no la reconoce, escúchalo tú: puede ser el equipo y no el niño.');
  return `<section class="reinforce"><h4>Para reforzar</h4>
    <ul class="weak-words">${palabras.slice(0, 6).map(p => `<li><b>${esc(p.palabra)}</b> <span class="tag">${NOMBRE_ACTIVIDAD[p.actividad]}</span> — ${p.veces} ${p.veces === 1 ? 'vez' : 'veces'}${p.notas.length ? `<small>${p.notas.map(esc).join(' · ')}</small>` : ''}</li>`).join('')}</ul>
    <h5>Ideas para trabajar</h5><ul>${ideas.map(i => `<li>${i}</li>`).join('')}</ul>
    <p class="note">Sugerencias automáticas a partir de sus respuestas. No reemplazan tu criterio como profesora.</p></section>`;
}

function lineasRespuesta(detalle) {
  const tipo = detalle?.actividad;
  const lista = Array.isArray(detalle?.respuestas) ? detalle.respuestas : [];
  if (!lista.length) return '<li class="ans-none">No hay detalle guardado de este intento.</li>';
  return lista.map(x => {
    const palabra = `<b>${esc(x.palabra)}</b>`;
    if (tipo === 'silabas') return x.correcta ? `<li class="ans-ok">✓ ${palabra}</li>` : `<li class="ans-bad">✗ ${palabra} — formó “${esc(x.respuesta)}”</li>`;
    if (tipo === 'silabas_iniciales') return x.correcta ? `<li class="ans-ok">✓ ${palabra}</li>` : `<li class="ans-bad">✗ ${palabra} — eligió “${esc(x.respuesta)}”</li>`;
    if (tipo === 'letras' || tipo === 'letras_iniciales') return x.correcta ? `<li class="ans-ok">✓ ${palabra}</li>`
      : `<li class="ans-bad">✗ ${palabra} — eligió “${esc(x.letraElegida)}”${x.letraCorrecta ? `, era “${esc(x.letraCorrecta)}”` : ''}</li>`;
    if (tipo === 'pronunciacion') {
      const fallos = (x.intentos || []).filter(i => i.correcta === false);
      const oidos = fallos.map(i => i.escuchado).filter(Boolean).map(o => `“${esc(o)}”`).join(', ');
      if (x.confirmadaComoPracticada) return `<li class="ans-warn">⚠ ${palabra} — la marcó como practicada, el micrófono no la confirmó${oidos ? ` (escuchó ${oidos})` : ''}</li>`;
      return `<li class="ans-ok">✓ ${palabra}${fallos.length ? ` — a la ${fallos.length + 1}.ª vez${oidos ? ` (antes escuchó ${oidos})` : ''}` : ''}</li>`;
    }
    if (tipo === 'unir-palabra-imagen') {
      return x.correctaPrimerIntento
        ? `<li class="ans-ok">✓ ${palabra} — unió la imagen correcta al primer intento</li>`
        : `<li class="ans-warn">✓ ${palabra} — la unió correctamente al intento ${esc(x.intentos)}</li>`;
    }
    return `<li>${palabra}</li>`;
  }).join('');
}

function bloqueAudios(audios) {
  if (!audios?.length) return '';
  return `<h4>🎙️ Grabaciones de pronunciación</h4><ul class="audio-list">${audios.map(a =>
    `<li><span><b>${esc(a.Palabra)}</b> <small>${esc(fechaCorta(a.FechaRegistro))}</small></span><audio controls preload="none" src="/api/profesor/audios/${esc(a.AudioID)}"></audio></li>`).join('')}</ul>`;
}

async function openStudentDetail(id) {
  activeStudentId = id;
  $('#studentList').classList.add('hidden');
  $('#studentDetail').classList.remove('hidden');
  $('#profesor').classList.add('viewing-student');
  const box = $('#detailContent');
  box.textContent = 'Cargando…';
  try {
    const { estudiante, resultados, audios } = await api(`/api/profesor/estudiantes/${id}/resultados`);
    const hechos = resultados.filter(r => r.Estado === 'Completada');
    const enCurso = resultados.filter(r => r.Estado === 'En progreso');
    const promedio = hechos.length ? Math.round(hechos.reduce((t, r) => t + (r.Puntuacion || 0), 0) / hechos.length) : null;
    box.innerHTML = `<h3 class="detail-name">${esc(estudiante.Nombre)} ${esc(estudiante.Apellido)}</h3>
      <div class="detail-chips">
        <span><b>${hechos.length}</b> ${hechos.length === 1 ? 'intento completado' : 'intentos completados'}</span>
        <span><b>${enCurso.length}</b> ${enCurso.length === 1 ? 'intento en progreso' : 'intentos en progreso'}</span>
        <span>Promedio <b>${promedio === null ? '—' : `${promedio} %`}</b></span>
        <span>Última vez <b>${esc(fechaCorta(resultados[0]?.FechaInicio)) || '—'}</b></span>
      </div>
      ${bloqueRefuerzo(hechos)}
      ${bloqueAudios(audios)}
      <h4>Registro de actividades</h4>
      ${resultados.length ? resultados.map(r => {
        const completado = r.Estado === 'Completada';
        const enProgreso = r.Estado === 'En progreso';
        const estado = completado ? 'Completada' : enProgreso ? 'En progreso' : r.Estado;
        const resultado = completado
          ? `${esc(Math.round(r.Puntuacion ?? 0))} % <small>(${esc(r.Aciertos)}/${esc(Number(r.Aciertos) + Number(r.Errores))})</small>`
          : `<span class="attempt-state">${esc(estado)}</span>`;
        const detalle = completado
          ? lineasRespuesta(r.detalle)
          : `<li class="ans-none">${enProgreso
            ? 'El estudiante comenzó esta actividad, pero aún no la ha terminado. El resultado se guardará al completarla.'
            : 'Esta actividad no se completó.'}</li>`;
        return `<details class="attempt">
        <summary><span class="attempt-name">${esc(r.Actividad)}</span><span>${esc(fechaCorta(r.FechaInicio))}</span>
          <span class="score">${resultado}</span></summary>
        <ul class="answers">${detalle}</ul>
        ${completado ? `<p class="note">Duración: ${esc(r.DuracionSegundos ?? '—')} s</p>` : ''}
      </details>`;
      }).join('') : '<p>Todavía no hay actividades registradas.</p>'}`;
    window.scrollTo({ top: 0 });
    return true;
  } catch (error) {
    box.textContent = error.message;
    return false;
  }
}

$('#studentForm').addEventListener('submit', async event => {
  event.preventDefault();
  const studentForm = event.currentTarget;
  const form = new FormData(studentForm);
  const submit = studentForm.querySelector('button');
  const status = $('#studentManagementStatus');
  submit.disabled = true;
  status.textContent = 'Guardando estudiante…';
  try {
    const data = await api('/api/profesor/estudiantes', {
      method: 'POST',
      body: JSON.stringify({ nombre: form.get('nombre'), apellido: form.get('apellido') })
    });
    studentForm.reset();
    status.textContent = `Estudiante guardado: ${data.estudiante.Nombre} ${data.estudiante.Apellido}.`;
    await Promise.all([loadTeacherStudents(), loadStudentCards()]);
  } catch (error) {
    status.textContent = error.message;
  } finally {
    submit.disabled = false;
  }
});

// ---------- Acceso docente ----------
const teacherForm = $('#teacherForm');
const CLAVE_USUARIO = 'usuario-docente';
let bloqueoTimer = null;

try {
  const guardado = localStorage.getItem(CLAVE_USUARIO);
  if (guardado) { teacherForm.elements.usuario.value = guardado; $('#rememberUser').checked = true; }
} catch { /* almacenamiento bloqueado: no es grave */ }

function showTeacherAlert(texto) {
  const caja = $('#teacherAlert');
  caja.textContent = texto;
  caja.classList.toggle('hidden', !texto);
}
function markField(nombre, falla) {
  teacherForm.elements[nombre].setAttribute('aria-invalid', String(falla));
  teacherForm.querySelector(`[data-error="${nombre}"]`).classList.toggle('hidden', !falla);
}
function setTeacherBusy(ocupado) {
  const boton = $('#teacherSubmit');
  boton.disabled = ocupado;
  boton.textContent = ocupado ? 'Verificando…' : 'Iniciar sesión';
}

// Bloqueo temporal con cuenta regresiva (el servidor responde 429 con los segundos de espera).
function lockTeacherForm(segundos) {
  clearInterval(bloqueoTimer);
  let resto = segundos;
  const boton = $('#teacherSubmit');
  const pintar = () => {
    boton.disabled = true;
    boton.textContent = `Espera ${resto} s`;
    showTeacherAlert(`Demasiados intentos. Podrás volver a intentar en ${resto} segundos.`);
  };
  pintar();
  bloqueoTimer = setInterval(() => {
    resto -= 1;
    if (resto <= 0) {
      clearInterval(bloqueoTimer);
      boton.disabled = false;
      boton.textContent = 'Iniciar sesión';
      showTeacherAlert('');
    } else pintar();
  }, 1000);
}

$('#togglePassword').addEventListener('click', event => {
  const campo = teacherForm.elements.password;
  const oculto = campo.type === 'password';
  campo.type = oculto ? 'text' : 'password';
  event.currentTarget.textContent = oculto ? 'Ocultar' : 'Mostrar';
  event.currentTarget.setAttribute('aria-pressed', String(oculto));
  campo.focus();
});

['keydown', 'keyup'].forEach(tipo => teacherForm.elements.password.addEventListener(tipo, event => {
  $('#capsHint').classList.toggle('hidden', !event.getModifierState?.('CapsLock'));
}));
teacherForm.elements.password.addEventListener('blur', () => $('#capsHint').classList.add('hidden'));
['usuario', 'password'].forEach(nombre => teacherForm.elements[nombre].addEventListener('input', () => markField(nombre, false)));

function showTeacherPanel(nombre) {
  activeStudentId = null;
  $('#teacherLogin').classList.add('hidden');
  $('#teacherStatus').textContent = `Sesión iniciada: ${nombre}`;
  $('#report').classList.remove('hidden');
  $('#profesor').classList.remove('viewing-student');
  $('#studentList').classList.remove('hidden');
  $('#studentDetail').classList.add('hidden');
  return loadTeacherStudents();
}

// Si la profesora ya tenía sesión abierta (por ejemplo, tras recargar la página), no vuelve a escribir su clave.
async function restoreTeacherSession() {
  if (!$('#report').classList.contains('hidden')) return;
  try {
    const data = await api('/api/profesor/me');
    await showTeacherPanel(data.nombre);
  } catch { /* sin sesión: se queda el formulario */ }
}

teacherForm.addEventListener('submit', async event => {
  event.preventDefault();
  showTeacherAlert('');
  const form = new FormData(teacherForm);
  const usuario = String(form.get('usuario') || '').trim();
  const password = String(form.get('password') || '');
  markField('usuario', !usuario);
  markField('password', !password);
  if (!usuario) return teacherForm.elements.usuario.focus();
  if (!password) return teacherForm.elements.password.focus();

  setTeacherBusy(true);
  try {
    const data = await api('/api/profesor/login', {
      method: 'POST',
      body: JSON.stringify({ usuario, password })
    });
    try {
      if ($('#rememberUser').checked) localStorage.setItem(CLAVE_USUARIO, usuario);
      else localStorage.removeItem(CLAVE_USUARIO);
    } catch { /* ignorar */ }
    teacherForm.elements.password.value = '';
    setTeacherBusy(false);
    await showTeacherPanel(data.profesor.nombre);
  } catch (error) {
    setTeacherBusy(false);
    if (error.status === 429) return lockTeacherForm(Number(error.data?.retryAfter) || 60);
    teacherForm.elements.password.value = '';
    teacherForm.elements.password.focus();
    if (error.status === 401) {
      const quedan = error.data?.intentosRestantes;
      showTeacherAlert(`Usuario o contraseña incorrectos.${Number.isInteger(quedan) ? ` Te quedan ${quedan} ${quedan === 1 ? 'intento' : 'intentos'}.` : ''}`);
    } else {
      showTeacherAlert(error.message || 'No se pudo iniciar sesión. Intenta de nuevo.');
    }
  }
});

$('#logout').addEventListener('click', async () => {
  try {
    await api('/api/profesor/logout', { method: 'POST', body: JSON.stringify({}) });
    activeStudentId = null;
    $('#report').classList.add('hidden');
    $('#teacherLogin').classList.remove('hidden');
    $('#teacherStatus').textContent = 'Sesión cerrada.';
    $('#profesor').classList.remove('viewing-student');
    $('#studentDetail').classList.add('hidden');
    $('#detailContent').innerHTML = '';
    $('#teacherStudentCards').innerHTML = '';
  } catch (error) {
    $('#teacherStatus').textContent = error.message;
  }
});

$('#removeStudent').addEventListener('click', async () => {
  const id = activeStudentId;
  if (!id) return;
  const est = teacherStudents.find(s => s.EstudianteID === id);
  const nombre = est ? `${est.Nombre} ${est.Apellido}` : 'este estudiante';
  if (!confirm(`¿Quitar a ${nombre}?\n\nSe borrarán también todos sus resultados y su progreso. Esta acción no se puede deshacer.`)) return;
  const boton = $('#removeStudent');
  boton.disabled = true;
  try {
    await api(`/api/profesor/estudiantes/${id}`, { method: 'DELETE' });
    $('#backToList').click();
    $('#recordsRefreshStatus').textContent = `${nombre} fue quitado de la lista.`;
  } catch (error) {
    $('#recordsRefreshStatus').textContent = error.message;
  } finally {
    boton.disabled = false;
  }
});
