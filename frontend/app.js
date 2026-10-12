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
    throw error;
  }
  return data;
}

document.querySelectorAll('.tab').forEach(button => button.addEventListener('click', () => {
  document.querySelectorAll('.tab').forEach(tab => tab.classList.toggle('active', tab === button));
  document.querySelectorAll('.panel').forEach(panel => panel.classList.toggle('hidden', panel.id !== button.dataset.panel));
}));

function showStudentActivities(student) {
  $('#studentWelcome').textContent = `Bienvenido/a, ${student.Nombre} ${student.Apellido}.`;
  $('#studentEntry').classList.add('hidden');
  $('#studentActivities').classList.remove('hidden');
  loadActivities();
}

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
    cards.innerHTML = data.estudiantes.map(student => `
      <button class="student-card" type="button" data-student="${student.EstudianteID}">
        <span class="student-icon" aria-hidden="true">📚</span>
        <span>${esc(student.Nombre)} ${esc(student.Apellido)}</span>
      </button>`).join('');
    cards.querySelectorAll('[data-student]').forEach(button => {
      button.addEventListener('click', async () => {
        button.disabled = true;
        try {
          const result = await api(`/api/estudiantes/${button.dataset.student}/ingresar`, {
            method: 'POST',
            body: JSON.stringify({})
          });
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
    $('#studentActivities').classList.add('hidden');
    $('#studentEntry').classList.remove('hidden');
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
    if (!data.actividades.length) {
      box.innerHTML = '<p>No hay actividades activas en la base local.</p>';
      return;
    }
    const activityPages = {
      'Aprendo las sílabas': '/actividades/silabas.html',
      'Practico la pronunciación': '/actividades/pronunciar.html',
      'Encuentro la letra': '/actividades/letra.html',
      'Actividad de ejemplo': '/actividades/ejemplo.html'
    };
    box.innerHTML = data.actividades.map(activity => `
      <article class="activity">
        <h3>${esc(activity.Nombre)}</h3>
        <p>${esc(activity.Descripcion || '')}${activity.NivelDificultad ? ` · Nivel: ${esc(activity.NivelDificultad)}` : ''}</p>
        ${activityPages[activity.Nombre]
          ? `<a class="button-link" href="${activityPages[activity.Nombre]}">Iniciar actividad</a>`
          : `<button data-start="${activity.ActividadID}">Iniciar actividad</button>`}
      </article>`).join('');
    box.querySelectorAll('[data-start]').forEach(button => {
      button.addEventListener('click', () => startActivity(Number(button.dataset.start), button));
    });
  } catch (error) {
    box.textContent = error.message;
  }
}

async function startActivity(id, button) {
  button.disabled = true;
  try {
    const data = await api(`/api/actividades/${id}/iniciar`, {
      method: 'POST',
      body: JSON.stringify({})
    });
    const area = document.createElement('div');
    area.className = 'activity';
    area.innerHTML = `<h3>Registrar resultado de la actividad</h3>
      <p>Al guardar, el servidor calculará la duración desde el inicio de este intento.</p>
      <form>
        <label>Puntuación (0–100)<input name="puntuacion" type="number" min="0" max="100" step="0.01" required></label>
        <label>Aciertos<input name="aciertos" type="number" min="0" required></label>
        <label>Errores<input name="errores" type="number" min="0" required></label>
        <label>Detalle opcional<textarea name="detalleResultado" maxlength="4000" rows="2"></textarea></label>
        <button>Finalizar y guardar</button>
      </form><p class="status"></p>`;
    button.closest('.activity').after(area);
    area.querySelector('form').addEventListener('submit', async event => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const status = area.querySelector('.status');
      const payload = {
        puntuacion: Number(form.get('puntuacion')),
        aciertos: Number(form.get('aciertos')),
        errores: Number(form.get('errores')),
        detalleResultado: form.get('detalleResultado')
      };
      try {
        await api(`/api/resultados/${data.intento.ResultadoID}/terminar`, {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        status.textContent = 'Resultado guardado correctamente.';
        event.currentTarget.remove();
      } catch (error) {
        status.textContent = error.message;
      }
    });
  } catch (error) {
    alert(error.message);
    button.disabled = false;
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

$('#teacherForm').addEventListener('submit', async event => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  try {
    const data = await api('/api/profesor/login', {
      method: 'POST',
      body: JSON.stringify({ usuario: form.get('usuario'), password: form.get('password') })
    });
    $('#teacherStatus').textContent = `Sesión iniciada: ${data.profesor.nombre}`;
    $('#report').classList.remove('hidden');
    await Promise.all([loadResults(), loadTeacherStudents()]);
  } catch (error) {
    $('#teacherStatus').textContent = error.message;
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
    $('#teacherStatus').textContent = 'Sesión cerrada.';
    $('#results').innerHTML = '';
    $('#teacherStudentCards').innerHTML = '';
  } catch (error) {
    $('#teacherStatus').textContent = error.message;
  }
});
