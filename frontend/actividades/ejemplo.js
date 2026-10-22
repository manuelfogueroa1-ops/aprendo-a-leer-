const statusBox = document.querySelector('#status');
const resultBox = document.querySelector('#result');
const quiz = document.querySelector('#quiz');
let intentoId = null;
let startedAtClient = null;

async function api(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'No se pudo completar la solicitud.');
  return data;
}

async function prepareActivity() {
  try {
    // El estudiante debe haberse identificado en la página de inicio.
    const activitiesData = await api('/api/actividades');
    const activity = activitiesData.actividades.find(a => a.Nombre === 'Actividad de ejemplo');
    if (!activity) throw new Error('No existe “Actividad de ejemplo” en el catálogo local de actividades.');
    const started = await api(`/api/actividades/${activity.ActividadID}/iniciar`, {
      method: 'POST', body: JSON.stringify({})
    });
    intentoId = started.intento.ResultadoID;
    startedAtClient = performance.now();
    quiz.classList.remove('hidden');
    statusBox.textContent = 'Actividad iniciada. Responde las preguntas y termina para guardar el resultado.';
  } catch (error) {
    statusBox.textContent = error.message + ' Si aún no has ingresado, vuelve al inicio e ingresa nombre y apellido.';
  }
}

quiz.addEventListener('submit', async event => {
  event.preventDefault();
  if (!intentoId) return;
  const form = new FormData(quiz);
  const correctAnswers = { q1: 'b', q2: 'a', q3: 'a' };
  let aciertos = 0;
  for (const key of Object.keys(correctAnswers)) if (form.get(key) === correctAnswers[key]) aciertos++;
  const total = Object.keys(correctAnswers).length;
  const errores = total - aciertos;
  const puntuacion = Math.round((aciertos / total) * 10000) / 100;
  const duracionLocalSegundos = Math.round((performance.now() - startedAtClient) / 1000);
  try {
    const saved = await api(`/api/resultados/${intentoId}/terminar`, {
      method: 'POST',
      body: JSON.stringify({
        puntuacion, aciertos, errores,
        detalleResultado: JSON.stringify({ totalPreguntas: total, duracionLocalSegundos })
      })
    });
    quiz.classList.add('hidden');
    statusBox.textContent = 'Actividad completada. Volviendo al menú…';
    try { sessionStorage.setItem('lectura-felicitacion-pendiente', '1'); } catch {}
    window.setTimeout(() => window.location.assign('/'), 2200);
    resultBox.textContent = `Resultado: ${aciertos}/${total} aciertos (${puntuacion}%). Duración registrada por el servidor: ${saved.duracionSegundos} segundos.`;
  } catch (error) {
    resultBox.textContent = error.message;
  }
});

prepareActivity();
