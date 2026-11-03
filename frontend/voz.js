// Voz compartida por el búho, las instrucciones y todos los ejercicios.
(() => {
  const synth = window.speechSynthesis;
  const KEY = 'lectura-voz-preferida';
  let preferred = '';
  let piper = null;
  let otrasLocales = [];
  let refreshPanel = () => {};
  let activeAudio = null;
  let activeUtterance = null;
  let activeUrl = null;
  let requestController = null;
  let generation = 0;
  let piperFailed = false;
  try { preferred = localStorage.getItem(KEY) || ''; } catch {}
  const nativas = () => (synth?.getVoices() || []).filter(voice => /^es(?:[-_]|$)/i.test(voice.lang));
  const voces = () => [...(piper ? [piper, ...otrasLocales] : []), ...nativas()];
  const score = voice => {
    // Se usan voces que el navegador realmente ofrece. Laura es la opción
    // inicial entre las voces locales de Windows disponibles en este equipo.
    let value = /natural|neural/i.test(voice.name) ? 100 : 0;
    if (voice.piper) value += 1000;
    if (voice.voiceURI === 'kokoro:ef_dora') value += 20;
    if (/\blaura\b/i.test(voice.name)) value += 45;
    if (/\bhelena\b/i.test(voice.name)) value += 15;
    if (/\bpablo\b/i.test(voice.name)) value += 10;
    if (/^es-(CL|MX|AR|CO|PE|US)$/i.test(voice.lang)) value += 8;
    return value;
  };
  const id = voice => voice.voiceURI || voice.name;
  function seleccionada() {
    const available = voces();
    return available.find(voice => id(voice) === preferred)
      || available.sort((a, b) => score(b) - score(a))[0] || null;
  }
  function crear(texto, { tipo = 'lectura' } = {}) {
    const utterance = typeof SpeechSynthesisUtterance === 'function' ? new SpeechSynthesisUtterance(texto) : new EventTarget();
    utterance.text = texto;
    const voice = seleccionada();
    if (voice && !voice.piper) utterance.voice = voice;
    utterance.lecturaTipo = tipo;
    utterance.lecturaVoice = voice ? id(voice) : '';
    utterance.lang = voice?.lang || 'es-CL';
    // Conservar el timbre de la voz evita el efecto agudo del antiguo búho.
    utterance.pitch = 1;
    utterance.rate = tipo === 'letras' ? 0.88 : tipo === 'animo' ? 0.98 : 0.93;
    utterance.volume = 1;
    return utterance;
  }
  function cancelar() {
    generation++;
    requestController?.abort(); requestController = null;
    if (activeAudio) { activeAudio.pause(); activeAudio.removeAttribute('src'); activeAudio.load(); activeAudio = null; }
    if (activeUrl) { URL.revokeObjectURL(activeUrl); activeUrl = null; }
    synth?.cancel();
    const previous = activeUtterance;
    activeUtterance = null;
    previous?.dispatchEvent(new Event('cancel'));
  }
  const clip = key => window.GrabacionesLectura?.clips?.[key] || null;
  function crearGrabacion(key) {
    const recording = clip(key);
    if (!recording) return null;
    const utterance = new EventTarget();
    utterance.text = key;
    utterance.grabacion = recording.url;
    utterance.duracion = recording.duracion;
    return utterance;
  }
  async function secuencia(keys) {
    cancelar();
    let expected = generation;
    for (const [index, key] of keys.entries()) {
      if (generation !== expected) return false;
      const utterance = crearGrabacion(key);
      if (!utterance) continue;
      const completed = await new Promise(resolve => {
        utterance.addEventListener('end', () => resolve(true), { once: true });
        utterance.addEventListener('error', () => resolve(true), { once: true });
        utterance.addEventListener('cancel', () => resolve(false), { once: true });
        reproducir(utterance);
        expected = generation;
      });
      if (!completed || generation !== expected) return false;
      if (index < keys.length - 1) await new Promise(resolve => setTimeout(resolve, 130));
    }
    return generation === expected;
  }
  async function reproducirArchivo(utterance, current) {
    const audio = new Audio(utterance.grabacion);
    activeAudio = audio;
    audio.addEventListener('playing', () => {
      if (generation === current) utterance.dispatchEvent(new Event('start'));
    }, { once: true });
    const finish = event => {
      if (generation !== current) return;
      activeAudio = null;
      if (activeUtterance === utterance) activeUtterance = null;
      utterance.dispatchEvent(new Event(event));
    };
    audio.addEventListener('ended', () => finish('end'), { once: true });
    audio.addEventListener('error', () => finish('error'), { once: true });
    try { await audio.play(); } catch { finish('error'); }
  }
  async function reproducir(utterance) {
    if (!utterance) return;
    cancelar();
    const current = generation;
    activeUtterance = utterance;
    const clear = () => { if (activeUtterance === utterance) activeUtterance = null; };
    utterance.addEventListener('end', clear, { once: true });
    utterance.addEventListener('error', clear, { once: true });
    if (utterance.grabacion) { await reproducirArchivo(utterance, current); return; }
    // Permite que la primera lectura espere la detección de Piper.
    await configuration;
    if (current !== generation) return;
    const voice = preferred && utterance.lecturaVoice ? voces().find(item => id(item) === utterance.lecturaVoice) : seleccionada();
    if (!voice?.piper) { synth?.speak(utterance); return; }
    const controller = new AbortController();
    requestController = controller;
    const timeout = setTimeout(() => controller.abort(), 65000);
    try {
      const response = await fetch('/api/voz/local', {
        method: 'POST', credentials: 'same-origin', signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texto: utterance.text, tipo: utterance.lecturaTipo || 'lectura', voz: id(voice) })
      });
      if (!response.ok) throw new Error('Piper no disponible');
      const blob = await response.blob();
      if (current !== generation) return;
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      activeUrl = url; activeAudio = audio;
      audio.addEventListener('ended', () => {
        if (current !== generation) return;
        URL.revokeObjectURL(url); activeUrl = null; activeAudio = null;
        utterance.dispatchEvent(new Event('end'));
      }, { once: true });
      audio.addEventListener('playing', () => {
        if (current === generation) utterance.dispatchEvent(new Event('start'));
      }, { once: true });
      audio.addEventListener('error', () => {
        if (current !== generation) return;
        cancelar();
        utterance.dispatchEvent(new Event('error'));
      }, { once: true });
      await audio.play();
      piperFailed = false; refreshPanel();
    } catch (error) {
      if (current !== generation) return;
      if (activeAudio) { activeAudio.pause(); activeAudio = null; }
      if (activeUrl) { URL.revokeObjectURL(activeUrl); activeUrl = null; }
      if (error.name === 'NotAllowedError') {
        utterance.dispatchEvent(new Event('error'));
        return; // El navegador exige un clic para reproducir; no cambiar de voz.
      }
      piperFailed = true; refreshPanel();
      // Alternativa si Piper falla, sin bloquear el ejercicio.
      const fallback = nativas().sort((a, b) => score(b) - score(a))[0];
      if (synth) { if (fallback) utterance.voice = fallback; synth.speak(utterance); }
      else utterance.dispatchEvent(new Event('error'));
    } finally {
      clearTimeout(timeout);
      if (requestController === controller) requestController = null;
    }
  }
  function hablar(texto, options) {
    const utterance = crear(texto, options);
    reproducir(utterance);
    return utterance;
  }
  function elegir(value) {
    if (value && !voces().some(voice => id(voice) === value)) return;
    preferred = value;
    try { localStorage.setItem(KEY, value); } catch {}
  }
  const disponible = () => Boolean(synth || piper || window.GrabacionesLectura);
  window.VozInfantil = { crear, hablar, reproducir, cancelar, disponible, voces, seleccionada, elegir,
    crearGrabacion, secuencia, tieneGrabacion: key => Boolean(clip(key)) };
  const configuration = typeof fetch !== 'function' ? Promise.resolve() : fetch('/api/voz/config', {
    credentials: 'same-origin', signal: AbortSignal.timeout(3000)
  }).then(response => response.ok ? response.json() : null).then(config => {
    if (config?.disponible) {
      const local = (config.voces || [config]).map(item => ({ name: item.nombre, lang: item.idioma, voiceURI: item.id, piper: true }));
      [piper, ...otrasLocales] = local;
      // Activa esta nueva prueba una sola vez; luego respeta la elección docente.
      if (config.motor === 'kokoro') {
        let firstKokoro = true;
        try {
          firstKokoro = localStorage.getItem('lectura-kokoro-activado') !== '1';
          localStorage.setItem('lectura-kokoro-activado', '1');
        } catch {}
        if (firstKokoro || preferred.startsWith('piper:')) elegir('');
      }
    }
    refreshPanel();
  }).catch(() => {});

  function configurarPanel() {
    const select = document.querySelector('#readingVoice');
    const preview = document.querySelector('#previewReadingVoice');
    const status = document.querySelector('#readingVoiceStatus');
    const syllablePreview = document.querySelector('#previewSyllableVoice');
    const wordPreview = document.querySelector('#previewWordVoice');
    const recordedPreview = document.querySelector('#previewRecordedVoice');
    if (!select) return;
    const refresh = () => {
      const available = voces();
      const current = seleccionada();
      select.replaceChildren(new Option('Automática (recomendada)', ''));
      available.forEach(voice => select.add(new Option(`${voice.name} · ${voice.lang}`, id(voice))));
      select.value = available.some(voice => id(voice) === preferred) ? preferred : '';
      select.disabled = preview.disabled = !disponible() || !available.length;
      if (syllablePreview) syllablePreview.disabled = preview.disabled;
      if (wordPreview) wordPreview.disabled = preview.disabled;
      status.textContent = current
        ? current.piper
          ? piperFailed ? 'La voz local no pudo reproducirse. Se usó la voz del navegador; puedes volver a intentarlo.' : `Voz en uso: ${current.name}. Generación gratuita en el servidor local, sin conexión a una API externa.`
          : `Voz en uso: ${current.name}. La elección se conserva en este navegador y se aplica a todas las actividades.`
        : 'Todavía no hay voces en español disponibles. Se usará la voz que permita el navegador.';
    };
    refreshPanel = refresh;
    select.addEventListener('change', () => { elegir(select.value); cancelar(); refresh(); });
    preview.addEventListener('click', () => {
      hablar('¡Hola! Soy tu amigo búho. Vamos a aprender a leer juntos. Escucha con calma: la casa, la luna y el sol.', { tipo: 'animo' });
    });
    syllablePreview?.addEventListener('click', () => hablar('pa, pe, pi, po, pu. ma, me, mi, mo, mu.', { tipo: 'letras' }));
    wordPreview?.addEventListener('click', () => hablar('La casa. La luna. El gato. La pelota.'));
    if (recordedPreview) {
      recordedPreview.hidden = !clip('silabas-bienvenida');
      recordedPreview.addEventListener('click', () => secuencia(['silabas-bienvenida']));
    }
    synth?.addEventListener('voiceschanged', refresh);
    refresh();
  }
  // Algunos navegadores publican sus voces después de cargar la página.
  synth?.getVoices();
  window.addEventListener?.('pagehide', cancelar);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', configurarPanel, { once: true });
  else configurarPanel();
})();
