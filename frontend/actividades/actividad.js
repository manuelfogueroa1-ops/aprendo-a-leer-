const activityApi = async (url, options = {}) => {
  const response = await fetch(url, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'No se pudo completar la solicitud.');
  return data;
};

document.querySelectorAll('[data-back-to-activities]').forEach(link => {
  link.addEventListener('click', event => {
    if (!document.referrer || new URL(document.referrer).origin !== window.location.origin) return;
    event.preventDefault();
    window.history.back();
  });
});

window.actividadLectura = {
  async iniciar(nombre) {
    const status = document.querySelector('#status');
    const data = await activityApi('/api/actividades');
    const activity = data.actividades.find(item => item.Nombre === nombre);
    if (!activity) throw new Error(`No se encontró "${nombre}" en el catálogo de actividades de SQLite.`);
    const result = await activityApi(`/api/actividades/${activity.ActividadID}/iniciar`, {
      method: 'POST',
      body: JSON.stringify({})
    });
    status.textContent = '¡Muy bien! Ya puedes empezar.';
    return result.intento.ResultadoID;
  },
  async guardar(resultadoId, aciertos, total, detalleResultado) {
    const puntuacion = total ? Math.round((aciertos / total) * 10000) / 100 : 0;
    return activityApi(`/api/resultados/${resultadoId}/terminar`, {
      method: 'POST',
      body: JSON.stringify({
        puntuacion,
        aciertos,
        errores: total - aciertos,
        detalleResultado: JSON.stringify(detalleResultado)
      })
    });
  },
  mostrarError(error) {
    const status = document.querySelector('#status');
    status.textContent = `${error.message} Si aún no ingresaste, vuelve al inicio e ingresa tu nombre y apellido.`;
  }
};
