const activityApi = async (url, options = {}) => {
  const response = await fetch(url, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || 'No se pudo completar la solicitud.');
    error.status = response.status;
    throw error;
  }
  return data;
};

function mostrarEnlacesDeActividades(mostrar) {
  document.querySelectorAll('[data-back-to-activities]').forEach(link => {
    link.classList.toggle('hidden', !mostrar);
  });
}

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
  async guardar(resultadoId, aciertos, total, detalleResultado, errores = total - aciertos) {
    const puntuacion = total ? Math.round((aciertos / total) * 10000) / 100 : 0;
    mostrarEnlacesDeActividades(false);
    const options = {
      method: 'POST',
      body: JSON.stringify({
        puntuacion,
        aciertos,
        errores,
        detalleResultado: JSON.stringify(detalleResultado)
      })
    };
    try {
      for (let intento = 0; intento < 3; intento++) {
        try {
          const resultado = await activityApi(`/api/resultados/${resultadoId}/terminar`, options);
          if (!resultado.guardado) throw new Error('El servidor no confirmó que el resultado se haya guardado.');
          const status = document.querySelector('#status');
          if (status) status.textContent = '¡Resultado guardado! Regresando automáticamente a tus actividades…';
          window.setTimeout(() => window.location.assign('/'), 2500);
          return resultado;
        } catch (error) {
          if (intento === 2 || (error.status && error.status < 500)) throw error;
          await new Promise(resolve => window.setTimeout(resolve, 300 * (intento + 1)));
        }
      }
    } catch (error) {
      mostrarEnlacesDeActividades(true);
      throw error;
    }
  },
  mostrarError(error) {
    const status = document.querySelector('#status');
    status.textContent = `${error.message} Si aún no ingresaste, vuelve al inicio e ingresa tu nombre y apellido.`;
  }
};
