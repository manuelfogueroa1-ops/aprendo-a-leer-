// Personalización por estudiante: color favorito, tema de interés y modo oscuro.
// Se carga en todas las páginas (inicio y actividades) y expone window.Tema.
(() => {
  const COLORES = [
    ['Rojo', 0], ['Naranja', 25], ['Amarillo', 48], ['Verde', 130],
    ['Turquesa', 175], ['Azul', 215], ['Morado', 270], ['Rosa', 330]
  ];
  const TEMAS = {
    Animales: ['🦁', '🐘', '🐢'],
    Dinosaurios: ['🦕', '🦖', '🥚'],
    Piratas: ['🏴‍☠️', '⚓', '🦜'],
    Fútbol: ['⚽', '🥅', '🏆'],
    Princesas: ['👸', '🏰', '👑'],
    Unicornios: ['🦄', '🌈', '⭐'],
    Hadas: ['🧚', '🦋', '🌸']
  };
  // Matiz del morado original de los círculos del fondo (sirve para calcular cuánto girarlo).
  const MATIZ_BASE = 272;
  const CLAVE_CACHE = 'tema-estudiante';
  const raiz = document.documentElement;
  let actual = { ColorFavorito: null, TemaInteres: null, ModoOscuro: 0 };

  function leerCache() {
    try { return JSON.parse(localStorage.getItem(CLAVE_CACHE)); } catch { return null; }
  }
  function escribirCache(preferencias) {
    try {
      if (preferencias) localStorage.setItem(CLAVE_CACHE, JSON.stringify(preferencias));
      else localStorage.removeItem(CLAVE_CACHE);
    } catch { /* el almacenamiento puede estar bloqueado: no es grave */ }
  }

  // Acepta un estudiante completo del servidor (o null) y devuelve solo sus preferencias válidas.
  function normalizar(estudiante) {
    const color = estudiante?.ColorFavorito;
    const tema = estudiante?.TemaInteres;
    return {
      ColorFavorito: COLORES.some(([, matiz]) => matiz === color) ? color : null,
      TemaInteres: Object.hasOwn(TEMAS, tema) ? tema : null,
      ModoOscuro: estudiante?.ModoOscuro ? 1 : 0
    };
  }

  // Dibuja los emojis flotantes del tema y los cambia en la portada.
  function pintarDecoracion() {
    if (!document.body) return;
    const emojis = TEMAS[actual.TemaInteres];
    let capa = document.querySelector('.tema-deco');
    if (!emojis) {
      capa?.remove();
    } else {
      if (!capa) {
        capa = document.createElement('div');
        capa.className = 'tema-deco';
        capa.setAttribute('aria-hidden', 'true');
        document.body.prepend(capa);
      }
      const orden = [0, 1, 2, 1, 2, 0];
      capa.replaceChildren(...orden.map(indice => {
        const emoji = document.createElement('span');
        emoji.textContent = emojis[indice];
        return emoji;
      }));
    }
    const chispas = document.querySelectorAll('.art-spark');
    chispas.forEach((chispa, indice) => {
      if (!chispa.dataset.original) chispa.dataset.original = chispa.textContent;
      chispa.textContent = emojis ? emojis[indice % emojis.length] : chispa.dataset.original;
    });
  }

  function aplicar(estudiante, { guardarEnCache = true } = {}) {
    actual = normalizar(estudiante);
    if (actual.ColorFavorito === null) {
      raiz.style.removeProperty('--h');
      raiz.style.removeProperty('--giro');
      delete raiz.dataset.color;
    } else {
      raiz.style.setProperty('--h', actual.ColorFavorito);
      raiz.style.setProperty('--giro', `${actual.ColorFavorito - MATIZ_BASE}deg`);
      raiz.dataset.color = actual.ColorFavorito;
    }
    if (actual.ModoOscuro) raiz.dataset.modo = 'oscuro'; else delete raiz.dataset.modo;
    if (actual.TemaInteres) raiz.dataset.tema = actual.TemaInteres; else delete raiz.dataset.tema;
    pintarDecoracion();
    if (guardarEnCache) escribirCache(estudiante ? actual : null);
  }

  async function pedir(url, opciones = {}) {
    const respuesta = await fetch(url, {
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      ...opciones
    });
    const datos = await respuesta.json().catch(() => ({}));
    if (!respuesta.ok) {
      const error = new Error(datos.error || 'No se pudo completar la solicitud.');
      error.status = respuesta.status;
      throw error;
    }
    return datos;
  }

  // Guarda preferencias nuevas ({ colorFavorito, temaInteres, modoOscuro }).
  // Se ven al instante y, si el servidor falla, se vuelve a lo anterior.
  async function guardar(cambios) {
    const anterior = { ...actual };
    aplicar({
      ColorFavorito: cambios.colorFavorito ?? actual.ColorFavorito,
      TemaInteres: cambios.temaInteres ?? actual.TemaInteres,
      ModoOscuro: cambios.modoOscuro === undefined ? actual.ModoOscuro : Number(cambios.modoOscuro)
    });
    try {
      const datos = await pedir('/api/estudiantes/me/preferencias', {
        method: 'PUT',
        body: JSON.stringify(cambios)
      });
      aplicar(datos.estudiante);
      return datos.estudiante;
    } catch (error) {
      aplicar(anterior);
      throw error;
    }
  }

  async function cargar() {
    try {
      const datos = await pedir('/api/estudiantes/me');
      aplicar(datos.estudiante);
    } catch (error) {
      if (error.status === 401) aplicar(null); // no hay estudiante: aspecto original
    }
  }

  const reiniciar = () => aplicar(null);

  window.Tema = { COLORES, TEMAS, aplicar, guardar, cargar, reiniciar, actual: () => ({ ...actual }) };

  // Primero lo que se recuerda en este navegador (evita parpadeos); luego lo que dice el servidor.
  const guardado = leerCache();
  if (guardado) aplicar(guardado, { guardarEnCache: false });
  document.addEventListener('DOMContentLoaded', () => {
    pintarDecoracion();
    cargar();
  });
})();