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
      'Aprendo las sílabas': '/actividades/silabas.html',
      'Practico la pronunciación': '/actividades/pronunciar.html',
      'Encuentro la letra': '/actividades/letra.html'
    };
    const activityStyles = {
      'Aprendo las sílabas': { icon: '🧩', theme: 'theme-yellow' },
      'Practico la pronunciación': { icon: '🎤', theme: 'theme-blue' },
      'Encuentro la letra': { icon: '🔤', theme: 'theme-pink' }
    };
    // Solo mostramos actividades con juego de lectura implementado.
    const available = data.actividades.filter(activity => activityPages[activity.Nombre]);
    if (!available.length) {
      box.innerHTML = '<p>No hay actividades disponibles por el momento.</p>';
      return;
    }
    box.innerHTML = available.map(activity => {
      const style = activityStyles[activity.Nombre];
      const level = activity.NivelDificultad ? `Nivel ${esc(activity.NivelDificultad)}` : 'Actividad';
      return `<article class="activity ${style.theme}">
        <div class="activity-top">
          <span class="activity-icon" aria-hidden="true">${style.icon}</span>
          <span class="activity-level">${level}</span>
        </div>
        <h3>${esc(activity.Nombre)}</h3>
        <p>${esc(activity.Descripcion || '¡Descubre un nuevo desafío de lectura!')}</p>
        <a class="button-link" href="${activityPages[activity.Nombre]}">¡Comenzar! <span aria-hidden="true">→</span></a>
      </article>`;
    }).join('');
  } catch (error) {
    box.textContent = error.message;
  }
}

async function loadTeacherStudents() {
  const cards = $('#teacherStudentCards');
  try {
    const data = await api('/api/profesor/estudiantes');
    cards.innerHTML = data.estudiantes.length
      ? data.estudiantes.map(student => `<div class="student-card teacher-student-card"><span class="student-icon" aria-hidden="true">📚</span><span>${esc(student.Nombre)} ${esc(student.Apellido)}</span></div>`).join('')
      : '<p>Aún no hay estudiantes guardados.</p>';
  } catch (error) {
    cards.textContent = error.message;
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
  $('#teacherLogin').classList.add('hidden');
  $('#teacherStatus').textContent = `Sesión iniciada: ${nombre}`;
  $('#report').classList.remove('hidden');
  return Promise.all([loadResults(), loadTeacherStudents()]);
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

async function loadResults() {
  const form = new FormData($('#filterForm'));
  const query = new URLSearchParams({
    nombre: form.get('nombre') || '',
    apellido: form.get('apellido') || ''
  });
  try {
    const data = await api(`/api/profesor/resultados?${query.toString()}`);
    const rows = data.resultados;
    if (!rows.length) {
      $('#results').innerHTML = '<p>No hay resultados para mostrar.</p>';
      return;
    }
    $('#results').innerHTML = `<div class="result"><table><thead><tr>
      <th>Estudiante</th><th>Actividad</th><th>Inicio</th><th>Término</th><th>Duración (s)</th>
      <th>Puntaje</th><th>Aciertos</th><th>Errores</th><th>Estado</th>
      </tr></thead><tbody>${rows.map(row => `<tr>
        <td>${esc(row.Nombre)} ${esc(row.Apellido)}</td><td>${esc(row.Actividad)}</td>
        <td>${esc(row.FechaInicio || '')}</td><td>${esc(row.FechaTermino || '')}</td>
        <td>${esc(row.DuracionSegundos ?? '')}</td><td>${esc(row.Puntuacion ?? '')}</td>
        <td>${esc(row.Aciertos ?? '')}</td><td>${esc(row.Errores ?? '')}</td><td>${esc(row.Estado)}</td>
      </tr>`).join('')}</tbody></table></div>`;
  } catch (error) {
    $('#results').textContent = error.message;
  }
}

$('#filterForm').addEventListener('submit', event => {
  event.preventDefault();
  loadResults();
});

$('#logout').addEventListener('click', async () => {
  try {
    await api('/api/profesor/logout', { method: 'POST', body: JSON.stringify({}) });
    $('#report').classList.add('hidden');
    $('#teacherLogin').classList.remove('hidden');
    $('#teacherStatus').textContent = 'Sesión cerrada.';
    $('#results').innerHTML = '';
    $('#teacherStudentCards').innerHTML = '';
  } catch (error) {
    $('#teacherStatus').textContent = error.message;
  }
});