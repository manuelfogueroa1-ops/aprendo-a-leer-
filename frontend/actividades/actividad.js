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

// Umbrales orientativos para probar con las profesoras; no evalúan estados emocionales.
const APOYO_LECTURA = { inactividadMs: 50000, ventanaClicsMs: 8000, clicsSinEfecto: 11, descansoMs: 60000 };

function instalarAcompanamiento(game, pausar) {
  let lastInteraction = Date.now();
  let cooldownUntil = 0;
  let clicks = [];
  const active = () => !document.hidden && !game.classList.contains('hidden') && !window.actividadLectura.estaPausada();
  const reset = () => { lastInteraction = Date.now(); clicks = []; };
  ['pointerdown', 'pointermove', 'keydown', 'input', 'wheel'].forEach(type => {
    document.addEventListener(type, () => { if (active()) lastInteraction = Date.now(); }, { passive: true });
  });
  document.addEventListener('click', event => {
    if (!active() || !event.isTrusted || event.detail === 0) return;
    lastInteraction = Date.now();
    // Una opción equivocada también es interacción educativa. No se penaliza.
    const control = event.target.closest('button, a, input, select, textarea, label, audio, video, [role="button"], [contenteditable="true"]');
    if (control && !control.matches(':disabled, [aria-disabled="true"]')) { clicks = []; return; }
    if (Date.now() < cooldownUntil) return;
    clicks = clicks.filter(time => Date.now() - time < APOYO_LECTURA.ventanaClicsMs);
    clicks.push(Date.now());
    if (clicks.length >= APOYO_LECTURA.clicsSinEfecto) pausar('clics');
  }, true);
  const checkIdle = () => {
    if (active() && Date.now() - lastInteraction >= APOYO_LECTURA.inactividadMs) pausar('inactividad');
  };
  let interval = setInterval(checkIdle, 1000);
  new MutationObserver(reset).observe(game, { attributes: true, attributeFilter: ['class'] });
  document.addEventListener('visibilitychange', reset);
  window.addEventListener('actividad-pausada', reset);
  window.addEventListener('actividad-reanudada', () => { reset(); cooldownUntil = Date.now() + APOYO_LECTURA.descansoMs; });
  window.addEventListener('pagehide', () => { clearInterval(interval); interval = null; });
  window.addEventListener('pageshow', () => { reset(); if (interval === null) interval = setInterval(checkIdle, 1000); });
}

// Conserva el tiempo pendiente de las transiciones mientras el diálogo está abierto.
const activityTimers = new Set();
function programarActividad(callback, delay = 0) {
  const timer = { callback, remaining: delay, native: null, started: 0 };
  activityTimers.add(timer);
  const run = () => {
    timer.started = performance.now();
    timer.native = window.setTimeout(() => { activityTimers.delete(timer); callback(); }, timer.remaining);
  };
  timer.run = run;
  if (!window.__actividadPause?.estaPausada()) run();
  return timer;
}
function cancelarEsperaActividad(timer) {
  if (!timer) return;
  window.clearTimeout(timer.native);
  activityTimers.delete(timer);
}
window.addEventListener('actividad-pausada', () => {
  activityTimers.forEach(timer => {
    if (timer.native !== null) {
      window.clearTimeout(timer.native);
      timer.remaining = Math.max(0, timer.remaining - (performance.now() - timer.started));
      timer.native = null;
    }
  });
});
window.addEventListener('actividad-reanudada', () => activityTimers.forEach(timer => timer.run()));

function crearDecoracionesDeActividad() {
  if (!document.body.classList.contains('game-page')) return;

  const style = document.createElement('style');
  style.textContent = `
    .activity-toolbar { display:flex; justify-content:flex-end; margin: 12px 0 0; }
    .activity-pause-button {
      border: 0; border-radius: 999px; padding: 10px 16px; cursor: pointer;
      background: linear-gradient(135deg, #7b68ee, #5e41bb); color: #fff;
      font: 800 0.98rem/1 system-ui, sans-serif; box-shadow: 0 8px 20px rgba(94,65,187,.28);
    }
    .activity-pause-button:hover { transform: translateY(-1px); }
    .activity-pause-overlay {
      position: fixed; inset: 0; z-index: 120; display: none; align-items: center; justify-content: center;
      background: rgba(31, 22, 66, .48); backdrop-filter: blur(2px); padding: 24px;
    }
    .activity-pause-overlay.visible { display: flex; }
    .activity-pause-card {
      width: min(560px, 100%); background: linear-gradient(180deg, #fff, #f7f3ff); color: #36285f;
      border-radius: 30px; padding: 28px 22px 24px; text-align: center;
      box-shadow: 0 24px 48px rgba(31, 22, 66, .28);
    }
    .activity-pause-owl { display:flex; justify-content:center; margin-bottom: 14px; }
    .activity-pause-owl .pause-owl-frame {
      width: min(220px, 52vw); max-width: 220px; position: relative; display:block;
      animation: pause-owl-float 2.8s ease-in-out infinite;
    }
    /* El búho y su accesorio comparten exactamente el mismo recuadro.
       Sin estas reglas la copia pierde las posiciones definidas para #mascota. */
    .pause-owl-frame > .cuerpo { display:block; position:relative; width:100%; }
    .pause-owl-frame > .cuerpo > img { display:block; width:100%; height:auto; }
    .pause-owl-frame > .cuerpo > .acc {
      display:block; position:absolute; inset:0; width:100%; height:100%; pointer-events:none;
    }
    .pause-owl-frame > .cuerpo > .acc svg {
      position:absolute; inset:0; display:block; width:100%; height:100%; overflow:visible;
    }
    .pause-owl-frame > .cuerpo > .acc img {
      position:absolute; inset:0; display:block; width:100%; height:100%;
    }
    .activity-pause-owl .pause-owl-frame,
    .activity-finished-mascot .pause-owl-frame { flex-shrink:0; }
    .activity-finished-owl { display:flex; justify-content:center; }
    .activity-pause-card h2 { margin: 0 0 10px; font-size: clamp(1.8rem, 4vw, 2.4rem); }
    .activity-pause-card p { margin: 0 0 18px; font-size: 1.08rem; line-height: 1.5; }
    .activity-resume-button {
      border: 0; border-radius: 999px; padding: 13px 18px; cursor: pointer;
      background: linear-gradient(135deg, #ff9ecf, #ff7aa2); color: #4d1441;
      font: 900 1rem/1 system-ui, sans-serif; box-shadow: 0 10px 24px rgba(255, 122, 162, .25);
    }
    @keyframes pause-owl-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }

    #finished::before, #finished h2::before { content: none !important; }
    .activity-finished-mascot { margin: 0 auto 18px; max-width: 420px; }
    .activity-finished-mascot .pause-owl-frame {
      width: min(190px, 48vw); margin: 0 auto 10px; position: relative; display:block;
      animation: pause-owl-float 2.8s ease-in-out infinite;
    }
    .activity-finished-bubble {
      margin: 0 auto 14px; max-width: 360px; background: #fff; color: #41256f;
      border-radius: 22px; padding: 14px 16px; box-shadow: 0 8px 22px rgba(68, 49, 127, .18);
      font-weight: 800; font-size: clamp(1.1rem, 3vw, 1.4rem); line-height: 1.4;
    }
  `;
  document.head.appendChild(style);

  const panel = document.querySelector('.learning-panel');
  const game = document.querySelector('#game');
  if (panel && game) {
    const toolbar = document.createElement('div');
    toolbar.className = 'activity-toolbar';
    const pauseButton = document.createElement('button');
    pauseButton.type = 'button';
    pauseButton.className = 'activity-pause-button';
    pauseButton.textContent = '⏸️ Pausa';
    pauseButton.setAttribute('aria-label', 'Pausar actividad');
    toolbar.appendChild(pauseButton);
    panel.insertBefore(toolbar, game);

    const overlay = document.createElement('div');
    overlay.className = 'activity-pause-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = `
      <div class="activity-pause-card" role="dialog" aria-modal="true" aria-labelledby="pauseTitle" aria-describedby="pauseText">
        <div class="activity-pause-owl"></div>
        <h2 id="pauseTitle">Actividad en pausa</h2>
        <p id="pauseText">Tu búho te espera aquí. Cuando la profesora termine de explicar, puedes continuar con calma.</p>
        <div class="breathing-guide" hidden>
          <div class="breathing-circle" aria-hidden="true">🦉</div>
          <p class="breathing-instruction" role="status" aria-live="polite"></p>
          <button type="button" class="breathing-start">Respirar con mi búho</button>
        </div>
        <button type="button" class="activity-resume-button">▶️ Continuar actividad</button>
      </div>`;
    document.body.appendChild(overlay);

    const resumeButton = overlay.querySelector('.activity-resume-button');
    const owlSlot = overlay.querySelector('.activity-pause-owl');
    let paused = false;
    let previousFocus;
    let inertElements = [];
    let breathingTimer;
    const guide = overlay.querySelector('.breathing-guide');
    const instruction = overlay.querySelector('.breathing-instruction');
    const circle = overlay.querySelector('.breathing-circle');
    const breathingButton = overlay.querySelector('.breathing-start');
    function stopBreathing() {
      clearTimeout(breathingTimer);
      circle.classList.remove('expand');
    }
    const startBreathing = () => {
      stopBreathing();
      breathingButton.hidden = true;
      let step = 0;
      const next = () => {
        if (!paused) return;
        if (step === 6) {
          instruction.textContent = 'Muy bien. Puedes seguir descansando o continuar cuando quieras.';
          circle.classList.remove('expand');
          breathingButton.textContent = 'Respirar otra vez';
          breathingButton.hidden = false;
          return;
        }
        const inhale = step++ % 2 === 0;
        instruction.textContent = inhale ? 'Toma aire suavemente…' : 'Suelta el aire despacito…';
        circle.classList.toggle('expand', inhale);
        breathingTimer = setTimeout(next, inhale ? 4000 : 6000);
      };
      next();
    };
    breathingButton.addEventListener('click', startBreathing);

    const clonarBuho = (destino) => {
      const origen = document.querySelector('#mascota .cuerpo');
      destino.replaceChildren();
      if (!origen) {
        const texto = document.createElement('div');
        texto.textContent = '🦉';
        texto.style.fontSize = '6rem';
        destino.appendChild(texto);
        return;
      }
      const marco = document.createElement('div');
      marco.className = 'pause-owl-frame';
      marco.appendChild(origen.cloneNode(true));
      destino.appendChild(marco);
    };

    const pausar = (motivo = 'manual') => {
      if (paused || game.classList.contains('hidden')) return;
      paused = true;
      previousFocus = document.activeElement;
      const inactivo = motivo === 'inactividad';
      overlay.querySelector('#pauseTitle').textContent = inactivo ? '¿Seguimos aprendiendo?' : 'Hagamos una pausa';
      overlay.querySelector('#pauseText').textContent = inactivo
        ? '¡Aquí estoy contigo! Puedes seguir intentándolo o descansar un momento. Vamos a tu ritmo.'
        : 'Tu búho te acompaña. Si quieres, respiremos juntos con suavidad. Puedes continuar cuando estés listo o pedir ayuda a tu profesora.';
      guide.hidden = inactivo;
      instruction.textContent = 'Sigue el círculo a tu ritmo, sin aguantar el aire.';
      breathingButton.textContent = 'Respirar con mi búho';
      breathingButton.hidden = false;
      overlay.classList.add('visible');
      overlay.setAttribute('aria-hidden', 'false');
      pauseButton.textContent = '⏸️ En pausa';
      clonarBuho(owlSlot);
      circle.replaceChildren(owlSlot.firstElementChild.cloneNode(true));
      inertElements = [...document.body.children].filter(el => el !== overlay && !el.inert && !['SCRIPT', 'STYLE', 'LINK'].includes(el.tagName));
      inertElements.forEach(el => { el.inert = true; });
      resumeButton.focus();
      window.speechSynthesis?.cancel();
      document.querySelectorAll('audio, video').forEach(media => media.pause());
      window.dispatchEvent(new CustomEvent('actividad-pausada'));
      if (motivo === 'clics') startBreathing();
    };

    const reanudar = () => {
      if (!paused) return;
      paused = false;
      stopBreathing();
      overlay.classList.remove('visible');
      overlay.setAttribute('aria-hidden', 'true');
      pauseButton.textContent = '⏸️ Pausa';
      inertElements.forEach(el => { el.inert = false; });
      if (previousFocus?.isConnected) previousFocus.focus();
      window.dispatchEvent(new CustomEvent('actividad-reanudada'));
      window.mascota?.decir('¡Muy bien! Sigamos aprendiendo.', { voz: false, duracion: 2800 });
    };

    overlay.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); reanudar(); }
      if (event.key === 'Tab') {
        const buttons = [...overlay.querySelectorAll('button')].filter(button => !button.closest('[hidden]'));
        const first = buttons[0], last = buttons.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    });
    pauseButton.addEventListener('click', () => pausar());
    resumeButton.addEventListener('click', reanudar);

    window.__actividadPause = {
      estaPausada: () => paused,
      pausar,
      reanudar,
      clonarBuho
    };
    instalarAcompanamiento(game, pausar);
  }

  const finished = document.querySelector('#finished');
  if (finished) {
    const asegurarPantallaFinal = () => {
      if (finished.classList.contains('hidden') || finished.querySelector('.activity-finished-mascot')) return;
      const bloque = document.createElement('div');
      bloque.className = 'activity-finished-mascot';
      const owlSlot = document.createElement('div');
      owlSlot.className = 'activity-finished-owl';
      const bubble = document.createElement('div');
      bubble.className = 'activity-finished-bubble';
      bubble.textContent = '¡Lo lograste! Estoy muy orgulloso de ti.';
      bloque.append(owlSlot, bubble);
      finished.prepend(bloque);
      window.__actividadPause?.clonarBuho?.(owlSlot);
      window.mascota?.decir('¡Lo lograste! Estoy muy orgulloso de ti.', { voz: false, duracion: 4200 });
    };
    new MutationObserver(asegurarPantallaFinal).observe(finished, { attributes: true, attributeFilter: ['class'] });
    asegurarPantallaFinal();
  }
}

let cachedStudentPromise = null;
async function obtenerEstudianteActual() {
  if (!cachedStudentPromise) {
    cachedStudentPromise = fetch('/api/estudiantes/me', { credentials: 'same-origin' })
      .then(async respuesta => {
        const datos = await respuesta.json().catch(() => ({}));
        if (!respuesta.ok) {
          const error = new Error(datos.error || 'No hay un estudiante ingresado.');
          error.status = respuesta.status;
          throw error;
        }
        return datos.estudiante;
      });
  }
  return cachedStudentPromise;
}

function leerGuardadoLocal(clave) {
  try {
    const texto = localStorage.getItem(clave);
    return texto ? JSON.parse(texto) : null;
  } catch {
    return null;
  }
}

function escribirGuardadoLocal(clave, datos) {
  try {
    localStorage.setItem(clave, JSON.stringify(datos));
    return true;
  } catch {
    return false;
  }
}

function borrarGuardadoLocal(clave) {
  try {
    localStorage.removeItem(clave);
    return true;
  } catch {
    return false;
  }
}

// Una pista por turno; utiliza el mismo reloj que se detiene durante las pausas.
function crearPistaActividad(obtenerPista) {
  let timer;
  let target;
  const message = document.createElement('p');
  message.className = 'activity-hint';
  message.setAttribute('role', 'status');
  message.hidden = true;
  document.querySelector('#choices').after(message);
  const cancelar = () => {
    cancelarEsperaActividad(timer);
    target?.classList.remove('hint-target');
    target = null;
    message.hidden = true;
  };
  const reiniciar = () => {
    cancelar();
    timer = programarActividad(() => {
      if (document.querySelector('#game').classList.contains('hidden')) return;
      const pista = obtenerPista();
      if (!pista?.elemento || pista.elemento.disabled) return;
      target = pista.elemento;
      target.classList.add('hint-target');
      message.textContent = `🦉 ${pista.mensaje}`;
      message.hidden = false;
      window.mascota?.decir(pista.mensaje, { voz: false, duracion: 5000 });
    }, 10000);
  };
  return { reiniciar, cancelar };
}

let intentoEnCurso = null;
let leerAvance = null;
let revisionAvance = 0;
let ultimoAvanceConfirmado = '';
let avisoAvance;
async function sincronizarAvance(forzar = false) {
  if (!intentoEnCurso || !leerAvance || document.querySelector('#game')?.classList.contains('hidden')) return;
  const avance = leerAvance();
  if (!avance || !avance.totalPreguntas) return;
  const body = { ...avance, pausada: Boolean(window.__actividadPause?.estaPausada()) };
  const signature = JSON.stringify(body);
  if (!forzar && signature === ultimoAvanceConfirmado) return;
  const revision = ++revisionAvance;
  const resultadoId = intentoEnCurso;
  try {
    const result = await activityApi(`/api/resultados/${resultadoId}/avance`, {
      method: 'POST', keepalive: true, body: JSON.stringify({ ...body, revision })
    });
    if (!result.guardado) throw new Error('Avance pendiente');
    // Una respuesta lenta de una petición anterior no reemplaza el estado más reciente.
    if (revision === revisionAvance) {
      ultimoAvanceConfirmado = signature;
      if (avisoAvance) avisoAvance.hidden = true;
    }
  } catch {
    if (revision !== revisionAvance || resultadoId !== intentoEnCurso) return;
    if (!avisoAvance) {
      avisoAvance = document.createElement('p');
      avisoAvance.className = 'note';
      avisoAvance.setAttribute('role', 'status');
      document.querySelector('.learning-panel')?.appendChild(avisoAvance);
    }
    avisoAvance.textContent = 'Avance pendiente de enviar a la profesora. Reintentaremos al recuperar la conexión.';
    avisoAvance.hidden = false;
  }
}

document.addEventListener('DOMContentLoaded', crearDecoracionesDeActividad, { once: true });

window.actividadLectura = {
  seguirAvance(lector) {
    leerAvance = lector;
    let debounce;
    const programar = () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => sincronizarAvance(), 250);
    };
    const game = document.querySelector('#game');
    if (game) new MutationObserver(programar).observe(game, {
      subtree: true, childList: true, characterData: true, attributes: true,
      attributeFilter: ['class', 'disabled', 'aria-pressed']
    });
    let interval = setInterval(() => sincronizarAvance(true), 15000);
    window.addEventListener('actividad-pausada', () => sincronizarAvance(true));
    window.addEventListener('actividad-reanudada', () => sincronizarAvance(true));
    window.addEventListener('pagehide', () => { clearInterval(interval); interval = null; sincronizarAvance(true); });
    window.addEventListener('pageshow', () => {
      if (interval === null) interval = setInterval(() => sincronizarAvance(true), 15000);
    });
    document.addEventListener('visibilitychange', () => sincronizarAvance(true));
    window.addEventListener('online', () => sincronizarAvance(true));
  },
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
    intentoEnCurso = result.intento.ResultadoID;
    return result.intento.ResultadoID;
  },
  async guardar(resultadoId, aciertos, total, detalleResultado, errores = total - aciertos) {
    intentoEnCurso = null;
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
          try { sessionStorage.setItem('lectura-felicitacion-pendiente', '1'); } catch { /* sin almacenamiento */ }
          window.setTimeout(() => window.location.assign('/'), 2200);
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
  },
  estaPausada() {
    return Boolean(window.__actividadPause?.estaPausada?.());
  },
  async claveProgreso(nombreActividad = location.pathname) {
    const estudiante = await obtenerEstudianteActual().catch(() => ({ EstudianteID: 'anonimo' }));
    return `lectura-progreso:${estudiante.EstudianteID}:${nombreActividad}`;
  },
  async guardarProgresoLocal(nombreActividad, datos) {
    const clave = await this.claveProgreso(nombreActividad);
    return escribirGuardadoLocal(clave, { ...datos, actualizadoEn: new Date().toISOString() });
  },
  async cargarProgresoLocal(nombreActividad) {
    const clave = await this.claveProgreso(nombreActividad);
    return leerGuardadoLocal(clave);
  },
  async borrarProgresoLocal(nombreActividad) {
    const clave = await this.claveProgreso(nombreActividad);
    return borrarGuardadoLocal(clave);
  }
};
