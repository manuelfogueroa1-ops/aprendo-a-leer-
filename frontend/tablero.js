// Tablero del búho: un camino con casillas. El búho avanza solo cuando se termina
// una actividad o un minijuego, hacia la siguiente casilla importante (sin dado).
(() => {
  const RELLENO = 2; // casillas pequeñas entre dos casillas importantes
  const TONO_A_COLOR = { 0: 'rojo', 25: 'naranja', 48: 'amarillo', 130: 'verde', 175: 'turquesa', 215: 'azul', 270: 'morado', 330: 'rosado' };
  const ESTACIONES = [
    { tipo: 'actividad', nombre: 'Reconozco las letras', corto: 'Reconozco las letras', icono: '🔠', pagina: '/actividades/letras-iniciales.html' },
    { tipo: 'actividad', nombre: 'Formo sílabas', corto: 'Formo sílabas', icono: '🔡', pagina: '/actividades/silabas-iniciales.html' },
    { tipo: 'minijuego', id: 'saltarin', nombre: 'Búho saltarín', corto: 'Búho saltarín', icono: '🦉' },
    { tipo: 'actividad', nombre: 'Uno la palabra con su imagen', corto: 'Palabra e imagen', icono: '🖼️', pagina: '/actividades/unir-palabra-imagen.html' },
    { tipo: 'actividad', nombre: 'Encuentro la letra', corto: 'Encuentro la letra', icono: '🔤', pagina: '/actividades/letra.html' },
    { tipo: 'minijuego', id: 'mitades', nombre: 'Une las mitades', corto: 'Une las mitades', icono: '🧩' },
    { tipo: 'actividad', nombre: 'Aprendo las sílabas', corto: 'Aprendo las sílabas', icono: '🧩', pagina: '/actividades/silabas.html' },
    { tipo: 'actividad', nombre: 'Practico la pronunciación', corto: 'Pronunciación', icono: '🎤', pagina: '/actividades/pronunciar.html' },
    { tipo: 'minijuego', id: 'lluvia', nombre: 'Lluvia de letras', corto: 'Lluvia de letras', icono: '🌧️' },
    { tipo: 'actividad', nombre: 'Completo el cuento', corto: 'Completo el cuento', icono: '📖', pagina: '/actividades/cuento.html' },
    { tipo: 'minijuego', id: 'memoria', nombre: 'Memoria de pares', corto: '¡Tesoro final!', icono: '🏆', final: true }
  ];
  const COLORES_RELLENO = ['#ffcf5c', '#ff8fb8', '#6cc4ff', '#b49bff'];
  const quieto = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const esc = valor => String(valor ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pausa = ms => new Promise(resolver => setTimeout(resolver, ms));
  const pedir = async url => {
    const respuesta = await fetch(url, { credentials: 'same-origin' });
    const datos = await respuesta.json().catch(() => ({}));
    if (!respuesta.ok) { const error = new Error(datos.error || 'No se pudo cargar.'); error.status = respuesta.status; throw error; }
    return datos;
  };

  let estado = null;       // datos más recientes del servidor
  let versionPintado = 0;  // evita que una carga lenta pise a una más nueva
  let animando = false;

  function calcularEstado(actividades, tablero) {
    const hechasAct = new Set(actividades.filter(a => a.Completada).map(a => a.Nombre));
    const hechasMini = new Set(tablero.minijuegos);
    let ultimaActividad = -1;
    ESTACIONES.forEach((e, i) => { if (e.tipo === 'actividad' && hechasAct.has(e.nombre)) ultimaActividad = i; });
    const hecha = ESTACIONES.map((e, i) => {
      if (e.tipo === 'actividad') return hechasAct.has(e.nombre);
      return hechasMini.has(e.id) || i < ultimaActividad; // minijuegos anteriores a una actividad ya hecha cuentan como pasados
    });
    let actual = hecha.findIndex(h => !h);
    if (actual === -1) actual = ESTACIONES.length - 1;
    const terminado = hecha.every(Boolean);
    return { hecha, actual, terminado, estrellas: tablero.estrellas, modoPrueba: tablero.modoPrueba };
  }

  function disposicion(total, ancho) {
    const movil = ancho < 640;
    const cols = movil ? 4 : 8, dx = movil ? 100 : 118, dy = movil ? 150 : 170, margen = 96;
    const filas = Math.ceil(total / cols);
    const puntos = Array.from({ length: total }, (_, i) => {
      const fila = Math.floor(i / cols);
      let col = i % cols;
      if (fila % 2) col = cols - 1 - col;
      return { x: margen + col * dx, y: margen + fila * dy };
    });
    return { puntos, ancho: (cols - 1) * dx + 2 * margen, alto: (filas - 1) * dy + margen + 120, cols, dy, dx, margen, filas };
  }

  const cuadroDe = indiceEstacion => indiceEstacion * (RELLENO + 1);

  async function mostrar(caja, actividades) {
    const version = ++versionPintado;
    let tablero = { estrellas: 0, minijuegos: [], modoPrueba: false };
    let estudiante = null;
    try { tablero = await pedir('/api/tablero'); } catch (error) { if (error.status === 401) { caja.textContent = 'Vuelve a ingresar tu nombre para ver tu camino.'; return; } }
    try { estudiante = (await pedir('/api/estudiantes/me')).estudiante; } catch { /* sin datos del búho */ }
    if (version !== versionPintado) return;
    estado = calcularEstado(actividades, tablero);
    const color = estudiante?.BuhoColor || TONO_A_COLOR[estudiante?.ColorFavorito] || 'rojo';
    dibujar(caja, { color, estudianteId: estudiante?.EstudianteID ?? 'anonimo' });
  }

  function dibujar(caja, { color, estudianteId }) {
    const total = (ESTACIONES.length - 1) * (RELLENO + 1) + 1;
    const ancho = caja.clientWidth || window.innerWidth;
    const lay = disposicion(total, ancho);
    const emojis = window.Tema?.TEMAS?.[window.Tema?.actual?.().TemaInteres] || ['⭐', '🌈', '✨'];
    const pct = p => ({ x: p.x / lay.ancho * 100, y: p.y / lay.alto * 100 });
    const longitudes = [0];
    lay.puntos.forEach((p, i) => { if (i) longitudes.push(longitudes[i - 1] + Math.hypot(p.x - lay.puntos[i - 1].x, p.y - lay.puntos[i - 1].y)); });
    const largoTotal = longitudes.at(-1);
    const trazo = lay.puntos.map(p => `${p.x},${p.y}`).join(' ');

    // Decoración del tema en los espacios entre filas.
    let deco = '';
    for (let fila = 0; fila < lay.filas - 1; fila++) {
      for (let k = 0; k < lay.cols; k += 2) {
        const x = lay.margen + k * lay.dx + (fila % 2 ? lay.dx / 2 : 0);
        deco += `<text x="${x}" y="${lay.margen + fila * lay.dy + lay.dy / 2 + 22}" font-size="34" text-anchor="middle" opacity=".85">${emojis[(fila + k / 2) % emojis.length]}</text>`;
      }
    }
    const rellenos = lay.puntos.map((p, i) => (i % (RELLENO + 1) === 0) ? '' :
      `<circle cx="${p.x}" cy="${p.y}" r="12" fill="${COLORES_RELLENO[i % COLORES_RELLENO.length]}" stroke="#fff" stroke-width="3"/>`).join('');

    const nodos = ESTACIONES.map((e, i) => {
      const punto = pct(lay.puntos[cuadroDe(i)]);
      const hecha = estado.hecha[i];
      const jugable = estado.modoPrueba || i <= estado.actual || hecha;
      const clase = `tb-est tb-${e.tipo}${e.final ? ' tb-final' : ''} ${hecha ? 'tb-hecha' : i === estado.actual ? 'tb-actual' : 'tb-bloqueada'}`;
      const etiqueta = `${e.tipo === 'actividad' ? 'Actividad' : 'Minijuego'} ${i + 1}: ${e.nombre}. ${hecha ? 'Completada.' : jugable ? 'Disponible.' : 'Bloqueada.'}`;
      const cuerpo = `<span class="tb-ico" aria-hidden="true">${jugable || hecha ? e.icono : '🔒'}</span>${hecha ? '<span class="tb-check" aria-hidden="true">✓</span>' : ''}`;
      return `<button type="button" class="${clase}" data-i="${i}" style="left:${punto.x}%;top:${punto.y}%" aria-label="${esc(etiqueta)}" ${jugable ? '' : 'disabled'}>${cuerpo}</button>
        <span class="tb-etq" style="left:${punto.x}%;top:${punto.y}%" aria-hidden="true">${esc(e.corto)}</span>`;
    }).join('');

    const siguiente = ESTACIONES[estado.actual];
    caja.innerHTML = `
      <div class="tb-cabecera">
        <span class="tb-chip" id="tbEstrellas">⭐ ${estado.estrellas} ${estado.estrellas === 1 ? 'estrella' : 'estrellas'}</span>
        <span class="tb-chip">📍 Casilla ${Math.min(estado.actual + 1, ESTACIONES.length)} de ${ESTACIONES.length}</span>
        <span class="tb-chip tb-siguiente" id="tbSiguiente">${estado.terminado ? '🎉 ¡Completaste el camino!' : `${siguiente.tipo === 'actividad' ? '👉 Sigue' : '🎮 Toca jugar'}: ${esc(siguiente.nombre)}`}</span>
      </div>
      <div class="tb-escena" style="aspect-ratio:${lay.ancho} / ${lay.alto}">
        <svg viewBox="0 0 ${lay.ancho} ${lay.alto}" preserveAspectRatio="none" aria-hidden="true" focusable="false">
          ${deco}
          <polyline points="${trazo}" class="tb-camino-borde"/>
          <polyline points="${trazo}" class="tb-camino"/>
          <polyline points="${trazo}" class="tb-camino-linea"/>
          <polyline id="tbRecorrido" points="${trazo}" class="tb-recorrido" pathLength="${largoTotal}" stroke-dasharray="0 ${largoTotal}"/>
          ${rellenos}
        </svg>
        ${nodos}
        <div class="tb-buho" id="tbBuho" aria-hidden="true"><img src="/assets/buho-${color}.png" alt="" onerror="this.onerror=null;this.src='/assets/buho-rojo.png'"></div>
      </div>
      <p class="tb-leyenda"><span>🔠 Actividad</span><span>🎮 Minijuego</span><span>⭐ Premio</span></p>`;

    caja.dataset.estudiante = estudianteId;
    const buho = caja.querySelector('#tbBuho');
    const recorrido = caja.querySelector('#tbRecorrido');
    const ponerBuho = indiceCuadro => {
      const p = pct(lay.puntos[indiceCuadro]);
      buho.style.left = `${p.x}%`; buho.style.top = `${p.y}%`;
      recorrido.setAttribute('stroke-dasharray', `${longitudes[indiceCuadro]} ${largoTotal}`);
    };
    const destino = cuadroDe(estado.actual);
    const clave = `tablero-pos:${estudianteId}`;
    let guardada = null;
    try {
      const texto = localStorage.getItem(clave);
      if (texto !== null && Number.isFinite(Number(texto))) guardada = Number(texto);
    } catch { /* sin almacenamiento */ }
    const guardarPos = () => { try { localStorage.setItem(clave, String(destino)); } catch { /* ok */ } };

    buho.style.transition = 'none';
    ponerBuho(guardada !== null && guardada < destino ? guardada : destino);
    caja.querySelector(`[data-i="${estado.actual}"]`)?.scrollIntoView?.({ block: 'nearest', behavior: quieto() ? 'auto' : 'smooth' });

    caja.querySelectorAll('.tb-est').forEach(boton => boton.addEventListener('click', () => {
      if (animando) return;
      abrir(ESTACIONES[Number(boton.dataset.i)]);
    }));

    if (guardada !== null && guardada < destino) {
      animarAvance(caja, buho, ponerBuho, guardada, destino).then(guardarPos);
    } else {
      guardarPos();
    }
  }

  async function animarAvance(caja, buho, ponerBuho, desde, hasta) {
    animando = true;
    caja.classList.add('tb-animando');
    const imagen = buho.querySelector('img');
    await pausa(450);
    for (let i = desde + 1; i <= hasta; i++) {
      buho.style.transition = quieto() ? 'none' : 'left .28s ease-in-out, top .28s ease-in-out';
      ponerBuho(i);
      if (!quieto()) {
        imagen.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-26px) rotate(-6deg)' }, { transform: 'translateY(0)' }], { duration: 280, easing: 'ease-out' });
      }
      await pausa(quieto() ? 40 : 300);
    }
    animando = false;
    caja.classList.remove('tb-animando');
    window.mascota?.celebrar?.();
    const destinoEst = ESTACIONES[estado.actual];
    window.mascota?.decir?.(estado.terminado
      ? '¡Llegaste al tesoro! ¡Completaste todo el camino!'
      : destinoEst.tipo === 'minijuego' ? '¡Llegamos a un minijuego! ¡A jugar!' : '¡Avancé a la siguiente casilla!', { voz: false, duracion: 4500 });
  }

  function abrir(estacion) {
    if (estacion.tipo === 'actividad') { location.assign(estacion.pagina); return; }
    location.assign(`/minijuegos/jugar.html?juego=${estacion.id}&origen=tablero`);
  }

  // Si cambia el tamaño de pantalla (giro del celular), se vuelve a dibujar sin animar.
  let anchoPrevio = window.innerWidth;
  window.addEventListener('resize', () => {
    const cambio = (anchoPrevio < 640) !== (window.innerWidth < 640);
    anchoPrevio = window.innerWidth;
    const caja = document.querySelector('#activities');
    if (cambio && estado && caja && !animando && !caja.closest('.hidden')) {
      const imagen = caja.querySelector('#tbBuho img');
      const color = imagen?.getAttribute('src')?.match(/buho-(\w+)\.png/)?.[1] || 'rojo';
      const estudianteId = caja.dataset.estudiante || 'anonimo';
      dibujar(caja, { color, estudianteId });
    }
  });

  window.Tablero = { mostrar, ESTACIONES };
})();