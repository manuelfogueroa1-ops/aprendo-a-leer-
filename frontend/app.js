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
    if (!$('#teacherLogin').classList.contains('hidden') && $('#teacherRegister').classList.contains('hidden')) $('#teacherForm').elements.usuario.focus();
  }
}
document.querySelectorAll('[data-panel]').forEach(button => button.addEventListener('click', () => showPanel(button.dataset.panel)));

// Voz del navegador: ayuda a quienes todavía no leen de corrido. Si no existe, no pasa nada.
function decir(texto) {
  if (!VozInfantil.disponible()) return;
  VozInfantil.cancelar();
  const voz = VozInfantil.crear(texto, { tipo: 'animo' });
  VozInfantil.reproducir(voz);
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
  box.innerHTML = 'Cargando tu camino…';
  try {
    const data = await api('/api/actividades');
    if (!data.actividades.length) {
      box.innerHTML = '<p>No hay actividades disponibles por el momento.</p>';
      return;
    }
    await Tablero.mostrar(box, data.actividades);
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

const { fechaCorta } = window.InformeDocente;
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
      currentStudentId ? openStudentDetail(currentStudentId, { actualizar: true }) : Promise.resolve(true)
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

function bloqueAudios(audios) {
  if (!audios?.length) return '';
  return `<h5>🎙️ Grabaciones de este intento</h5><ul class="audio-list">${audios.map(a =>
    `<li><span><b>${esc(a.Palabra)}</b> <small>${esc(fechaCorta(a.FechaRegistro))}</small></span><audio controls preload="none" src="/api/profesor/audios/${esc(a.AudioID)}"></audio></li>`).join('')}</ul>`;
}

async function openStudentDetail(id, { actualizar = false } = {}) {
  activeStudentId = id;
  $('#studentList').classList.add('hidden');
  $('#studentDetail').classList.remove('hidden');
  $('#profesor').classList.add('viewing-student');
  const box = $('#detailContent');
  const abiertos = new Set([...box.querySelectorAll('details[open]')].map(el => el.dataset.intento));
  const scroll = window.scrollY;
  if (!actualizar) box.textContent = 'Cargando…';
  try {
    const { estudiante, resultados, audios } = await api(`/api/profesor/estudiantes/${id}/resultados`);
    if (activeStudentId !== id) return false;
    box.innerHTML = InformeDocente.detalleHtml({ estudiante, resultados }, {
      abiertos: actualizar ? abiertos : new Set(),
      audiosDe: r => bloqueAudios(audios.filter(a => a.ResultadoID === r.ResultadoID)),
      equipoDe: r => r.Equipo ? `<p class="note">💻 Realizado en otro computador: <b>${esc(r.Equipo)}</b> (recibido por sincronización).</p>` : ''
    });
    if (actualizar) window.scrollTo({ top: scroll });
    else window.scrollTo({ top: 0 });
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

// ---------- Servidor central: vinculación y estado de la sincronización ----------
let syncTimer = null;
function textoPendientes(p) {
  const total = p.estudiantes + p.intentos + p.minijuegos + p.eliminaciones;
  if (!total) return '<span class="sync-ok">✓ Todo lo de este computador ya está en el servidor central.</span>';
  const partes = [
    p.intentos && `${p.intentos} ${p.intentos === 1 ? 'intento' : 'intentos'}`,
    p.minijuegos && `${p.minijuegos} ${p.minijuegos === 1 ? 'minijuego' : 'minijuegos'}`,
    p.estudiantes && `${p.estudiantes} ${p.estudiantes === 1 ? 'estudiante' : 'estudiantes'}`,
    p.eliminaciones && `${p.eliminaciones} ${p.eliminaciones === 1 ? 'estudiante quitado' : 'estudiantes quitados'}`
  ].filter(Boolean);
  return `Pendientes de envío: <b>${esc(partes.join(', '))}</b>. Están guardados en este computador.`;
}

function pintarSync(estado) {
  const vinculado = estado.vinculado;
  $('#syncLinkForm').classList.toggle('hidden', vinculado);
  $('#syncActions').classList.toggle('hidden', !vinculado);
  if (!vinculado) {
    $('#syncSummary').innerHTML = '<p class="note">Este computador no está vinculado: los avances se guardan solo aquí.</p>';
    const campo = $('#syncLinkForm').elements.nombreEquipo;
    if (!campo.value && estado.nombreEquipo) campo.value = estado.nombreEquipo;
    return;
  }
  const lineas = [
    `Vinculado a <b>${esc(estado.nombreServidor || estado.servidor)}</b> como «${esc(estado.nombreEquipo)}».`,
    `Último envío correcto: <b>${esc(fechaCorta(estado.ultimoExito)) || 'todavía ninguno'}</b>`,
    textoPendientes(estado.pendientes)
  ];
  if (estado.sincronizando) lineas.push('Sincronizando…');
  else if (estado.sinConexion) {
    lineas.push(`<span class="sync-warn">⚠ ${esc(estado.ultimoError)}</span> Se reintentará automáticamente${estado.proximoIntento ? ` (${esc(new Date(estado.proximoIntento).toLocaleTimeString('es-CL', { timeStyle: 'short' }))})` : ''}.`);
  } else if (estado.ultimoError) lineas.push(`<span class="sync-warn">⚠ ${esc(estado.ultimoError)}</span>`);
  $('#syncSummary').innerHTML = `<ul class="sync-state">${lineas.map(l => `<li>${l}</li>`).join('')}</ul>`;
}

async function loadSyncState() {
  clearTimeout(syncTimer);
  if ($('#report').classList.contains('hidden')) return;
  try {
    pintarSync(await api('/api/profesor/sincronizacion'));
  } catch (error) {
    if (error.status === 401) return;
    $('#syncSummary').innerHTML = `<p class="note">${esc(error.message)}</p>`;
  }
  syncTimer = setTimeout(loadSyncState, 15000);
}

$('#syncLinkForm').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const datos = Object.fromEntries(new FormData(form));
  const boton = $('#syncLinkSubmit');
  boton.disabled = true;
  $('#syncStatus').textContent = 'Conectando con el servidor central…';
  try {
    pintarSync(await api('/api/profesor/sincronizacion/vincular', { method: 'POST', body: JSON.stringify(datos) }));
    form.elements.codigo.value = '';
    $('#syncStatus').textContent = 'Computador vinculado. Los registros existentes se están enviando en segundo plano.';
    setTimeout(loadSyncState, 3000);
  } catch (error) {
    $('#syncStatus').textContent = error.message;
  } finally {
    boton.disabled = false;
  }
});

$('#syncNow').addEventListener('click', async () => {
  const boton = $('#syncNow');
  boton.disabled = true;
  $('#syncStatus').textContent = 'Sincronizando…';
  try {
    const estado = await api('/api/profesor/sincronizacion/ahora', { method: 'POST', body: '{}' });
    pintarSync(estado);
    $('#syncStatus').textContent = estado.sinConexion ? '' : 'Sincronización terminada.';
    await loadTeacherStudents();
  } catch (error) {
    $('#syncStatus').textContent = error.message;
  } finally {
    boton.disabled = false;
  }
});

$('#syncUnlink').addEventListener('click', async () => {
  if (!confirm('¿Desvincular este computador del servidor central?\n\nLos datos de este computador no se borran, pero dejarán de enviarse. Para volver a vincularlo necesitarás un código nuevo.')) return;
  try {
    pintarSync(await api('/api/profesor/sincronizacion/desvincular', { method: 'POST', body: '{}' }));
    $('#syncStatus').textContent = 'Computador desvinculado.';
  } catch (error) {
    $('#syncStatus').textContent = error.message;
  }
});

// ---------- Registro docente junto al formulario de inicio de sesión ----------
function switchTeacherRegistration(open) {
  $('#teacherRegister').classList.toggle('hidden', !open);
  $('#teacherForm').classList.toggle('hidden', open);
  $('#teacherCreateEntry').classList.toggle('hidden', open);
  $('#teacherLogin .teacher-intro').classList.toggle('hidden', open);
  if (!open) {
    $('#teacherRegisterForm').reset();
    $('#teacherRegisterStatus').textContent = '';
    $('#teacherForm').elements.usuario.focus();
  }
}
$('#showTeacherRegister').addEventListener('click', () => {
  $('#teacherRegisterInfo').textContent = 'Completa los datos para crear una cuenta docente en este computador.';
  switchTeacherRegistration(true);
  $('#teacherRegisterForm').elements.nombre.focus();
});
$('#backTeacherLogin').addEventListener('click', () => switchTeacherRegistration(false));
$('#teacherRegisterForm').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const datos = Object.fromEntries(new FormData(form).entries());
  const status = $('#teacherRegisterStatus');
  const submit = $('#teacherRegisterSubmit');
  status.textContent = '';
  if (datos.password !== datos.confirmacion) {
    status.textContent = 'Las contraseñas no coinciden.';
    return;
  }
  submit.disabled = true;
  submit.textContent = 'Creando cuenta…';
  try {
    const { profesor } = await api('/api/profesor/registro', { method:'POST', body: JSON.stringify(datos) });
    switchTeacherRegistration(false);
    $('#teacherForm').elements.usuario.value = profesor.Usuario;
    $('#teacherStatus').textContent = `Cuenta ${profesor.Usuario} creada correctamente. Ya puedes iniciar sesión.`;
    showTeacherAlert('');
  } catch(error) {
    status.textContent = error.message || 'No fue posible crear la cuenta docente.';
  } finally {
    submit.disabled = false;
    submit.textContent = 'Crear cuenta';
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
  loadSyncState();
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
    clearTimeout(syncTimer);
    $('#report').classList.add('hidden');
    switchTeacherRegistration(false);
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
