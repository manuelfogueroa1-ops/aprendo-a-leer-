(() => {
  const CARPETA = '/assets'; // carpeta donde están buho-rojo.png, buho-azul.png, etc.
  const POR_DEFECTO = 'rojo';
  // Ajuste fino de los accesorios: x/y mueven (en % del ancho del búho), s los agranda o achica.
    // Ajuste por accesorio: x/y en % del tamaño del búho (x+ derecha, y+ abajo), s = escala (1 = tal cual)
  const AJUSTES = {
    lentes:   { x: 0, y: 0, s: 1 },
    gorro:    { x: 0, y: 0, s: 1.5 },
    corona:   { x: 0, y: 0, s: 1.5 },
    sombrero: { x: 0, y: 0, s: 1.5 },
    gorra:    { x: 0, y: 5, s: 1.5 },
    mono:     { x: -5, y: 5, s: 1 },
    estrella: { x: 0, y: 0, s: 1 }
  };

  const COLORES = [
    ['rojo', 'Rojo', '#e53935'], ['naranja', 'Naranja', '#fb8c00'], ['amarillo', 'Amarillo', '#fdd835'],
    ['verde', 'Verde', '#43a047'], ['turquesa', 'Turquesa', '#00bcd4'], ['azul', 'Azul', '#1e88e5'],
    ['morado', 'Morado', '#8e24aa'], ['rosado', 'Rosado', '#ec407a']
  ];
  const TONO_A_COLOR = { 0: 'rojo', 25: 'naranja', 48: 'amarillo', 130: 'verde', 175: 'turquesa', 215: 'azul', 270: 'morado', 330: 'rosado' };
  const ACCESORIOS = [
    ['ninguno', '🚫', 'Ninguno'], ['gorro', '🎓', 'Gorro'], ['lentes', '👓', 'Lentes'], ['corona', '👑', 'Corona'],
    ['mono', '🎀', 'Moño'], ['sombrero', '🎩', 'Sombrero'], ['gorra', '🧢', 'Gorra']
  ];

  const FRASES_COLOR = {
    rojo: '¡Ahora soy un búho rojo como una frutilla!',
    naranja: '¡Soy un búho naranja, brillante como una naranja!',
    amarillo: '¡Mira, soy amarillo como el sol!',
    verde: '¡Soy un búho verde, como las hojas del bosque!',
    turquesa: '¡Soy turquesa, como el agua del mar!',
    azul: '¡Ahora soy azul como el cielo!',
    morado: '¡Qué lindo, soy un búho morado!',
    rosado: '¡Soy rosado, como un algodón de azúcar!'
  };

    const FRASES_ACCESORIO = {
    ninguno: '¡Así también me veo bien!',
    gorro: '¡Con mi gorro de graduación me siento muy sabio!',
    lentes: '¡Con mis lentes puedo leer todavía mejor!',
    corona: '¡Soy el rey de las letras con mi corona!',
    mono: '¡Qué lindo moño, me encanta!',
    sombrero: '¡Mira mi sombrero, parezco un mago!',
    gorra: '¡Con mi gorra estoy listo para jugar!'
  };

  // Dibujos de los accesorios. Coordenadas en "% del ancho del búho":
  // cabeza centrada en x=48, tope de la cabeza y≈3, ojos en y≈33 (x=31 y x=69).
  const estrella = (cx, cy, r) => {
    const p = [];
    for (let i = 0; i < 10; i++) {
      const ang = -Math.PI / 2 + i * Math.PI / 5;
      const rad = i % 2 ? r * 0.45 : r;
      p.push(`${(cx + Math.cos(ang) * rad).toFixed(1)},${(cy + Math.sin(ang) * rad).toFixed(1)}`);
    }
    return `<polygon points="${p.join(' ')}" fill="#ffd54f" stroke="#c99700" stroke-width="1.2" stroke-linejoin="round"/>`;
  };
  const PIEZAS = {
    gorro: `<path d="M35 3 v8 q13 7 26 0 v-8 z" fill="#2b2b3a"/>
      <polygon points="24,3 48,-8 72,3 48,13" fill="#3a3a52" stroke="#1d1d2b" stroke-width="1.2" stroke-linejoin="round"/>
      <path d="M68 4 v14" stroke="#ffd54f" stroke-width="1.6" stroke-linecap="round"/><circle cx="68" cy="19" r="2.2" fill="#ffd54f"/>`,
    corona: `<path d="M33 5 L35 -9 L42 -1 L48 -11 L54 -1 L61 -9 L63 5 Z" fill="#ffd54f" stroke="#c99700" stroke-width="1.4" stroke-linejoin="round"/>
      <rect x="33" y="3" width="30" height="4" rx="1.5" fill="#f5b800" stroke="#c99700" stroke-width="1"/>
      <circle cx="35" cy="-9" r="1.8" fill="#e53935"/><circle cx="48" cy="-11" r="2" fill="#1e88e5"/><circle cx="61" cy="-9" r="1.8" fill="#e53935"/>`,
    sombrero: `<rect x="36" y="-17" width="24" height="21" rx="2" fill="#2b2b3a"/>
      <rect x="36" y="-4" width="24" height="4.5" fill="#e53935"/>
      <ellipse cx="48" cy="4.5" rx="21" ry="3.6" fill="#1d1d2b"/>`,
    gorra: `<path d="M31 6 Q31 -9 48 -9 Q65 -9 65 6 Z" fill="#1e88e5" stroke="#0d5aa7" stroke-width="1.2" stroke-linejoin="round"/>
      <path d="M60 4 Q80 2 84 8 Q70 10 60 9 Z" fill="#0d5aa7"/>
      <circle cx="48" cy="-9" r="1.8" fill="#fff"/>`,
    mono: `<g transform="translate(72 6) rotate(15)">
      <path d="M0 0 L-12 -8 L-12 8 Z" fill="#ec407a" stroke="#b0235a" stroke-width="1" stroke-linejoin="round"/>
      <path d="M0 0 L12 -8 L12 8 Z" fill="#ec407a" stroke="#b0235a" stroke-width="1" stroke-linejoin="round"/>
      <circle cx="0" cy="0" r="3.4" fill="#f48fb1" stroke="#b0235a" stroke-width="1"/></g>`,
    lentes: `<g fill="rgba(255,255,255,.18)" stroke="#3b2a1a" stroke-width="2.2">
      <circle cx="31" cy="33" r="13"/><circle cx="69" cy="33" r="13"/></g>
      <path d="M44 33 Q50 29 56 33" fill="none" stroke="#3b2a1a" stroke-width="2.2" stroke-linecap="round"/>
      <path d="M18 31 L11 28 M82 31 L89 28" stroke="#3b2a1a" stroke-width="2.2" stroke-linecap="round"/>`
  };

  const forzado = new URLSearchParams(location.search).get('buho');

  let estudiante = null;
  let color = POR_DEFECTO;
  let accesorio = 'ninguno';

  const estilo = document.createElement('style');
  estilo.textContent = `
    #mascota { --w: 180px; position: fixed; left: -10px; top: 40px; z-index: 50; width: var(--w);
      cursor: pointer; background: none; border: 0; padding: 0; animation: mascota-flota 3s ease-in-out infinite; }
    #mascota img { width: 100%; height: auto; display: block; }
    #mascota:active { transform: scale(.96); }
    #mascota .acc { position: absolute; inset: 0; pointer-events: none; }
    #mascota .acc svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
    #mascota-burbuja { position: fixed; left: 260px; top: 50px; z-index: 50; max-width: 240px; background: #fff; color: #333;
      border-radius: 18px; padding: 10px 14px; font: 600 1rem/1.3 system-ui, sans-serif; box-shadow: 0 4px 14px rgba(0,0,0,.2);
      opacity: 0; pointer-events: none; transition: opacity .25s; }
    #mascota-burbuja.visible { opacity: 1; }
    #mascota-editar { position: fixed; left: 16px; top: 292px; z-index: 51; border: 0; border-radius: 999px; padding: 8px 14px;
      background: #7161d8; color: #fff; font: 700 .9rem system-ui, sans-serif; cursor: pointer; box-shadow: 0 3px 10px rgba(0,0,0,.25); }
    #mascota-panel { position: fixed; left: 16px; top: 338px; z-index: 55; width: min(330px, calc(100vw - 32px)); max-height: calc(100vh - 358px);
      overflow: auto; background: #fff; color: #2d2250; border-radius: 22px; padding: 16px; box-shadow: 0 10px 30px rgba(0,0,0,.35);
      font-family: system-ui, sans-serif; display: none; }
    #mascota-panel.abierto { display: block; }
    #mascota-panel h3 { margin: 0 0 8px; font-size: 1.05rem; }
    #mascota-panel .cerrar { position: absolute; right: 10px; top: 8px; border: 0; background: none; font-size: 1.3rem; cursor: pointer; }
    #mascota-panel .rejilla { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 14px; }
    #mascota-panel .opcion { border: 3px solid transparent; border-radius: 14px; background: #f1edff; padding: 6px 2px; cursor: pointer;
      display: flex; flex-direction: column; align-items: center; gap: 2px; font: 600 .7rem system-ui, sans-serif; color: #2d2250; }
    #mascota-panel .opcion[aria-pressed="true"] { border-color: #7161d8; background: #e3dcff; }
    #mascota-panel .muestra { width: 34px; height: 34px; border-radius: 50%; border: 2px solid rgba(0,0,0,.2); }
    #mascota-panel .emoji { font-size: 1.7rem; line-height: 1.2; }
    #mascota-panel .aviso { margin: 0; font-weight: 600; }
    #teacherLink { position: fixed !important; left: auto !important; top: auto !important; right: 16px !important; bottom: 16px !important; z-index: 60; }
    @keyframes mascota-flota { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
    @media (max-width: 600px) {
      #mascota { --w: 130px; left: 8px; top: 8px; }
      #mascota-burbuja { left: 150px; top: 24px; max-width: 170px; }
      #mascota-editar { left: 8px; top: 160px; padding: 6px 10px; font-size: .8rem; }
      #mascota-panel { left: 8px; top: 202px; max-height: calc(100vh - 214px); }
      #teacherLink { right: 8px !important; bottom: 8px !important; }
    }
    @media (prefers-reduced-motion: reduce) { #mascota { animation: none; } }

    #mascota .cuerpo { display: block; position: relative; transform-origin: 50% 100%; animation: mascota-respira 4s ease-in-out infinite; }
    #mascota .cuerpo.anim-entrada { animation: mascota-entrada .8s cubic-bezier(.3, 1.6, .5, 1); }
    #mascota .cuerpo.anim-salto { animation: mascota-salto .8s ease-out; }
    #mascota .cuerpo.anim-sacude { animation: mascota-sacude .6s ease-in-out; }
    #mascota .cuerpo.anim-saludo { animation: mascota-saludo 1s ease-in-out; }
    @keyframes mascota-respira { 0%, 100% { transform: scale(1, 1); } 50% { transform: scale(1.03, .97); } }
    @keyframes mascota-entrada { 0% { transform: scale(0) rotate(-20deg); opacity: 0; } 100% { transform: scale(1) rotate(0); opacity: 1; } }
    @keyframes mascota-salto {
      0% { transform: translateY(0) scale(1, 1); }
      15% { transform: translateY(0) scale(1.12, .88); }
      40% { transform: translateY(-34px) scale(.94, 1.08); }
      65% { transform: translateY(0) scale(1.1, .9); }
      80% { transform: translateY(-8px) scale(.98, 1.03); }
      100% { transform: translateY(0) scale(1, 1); }
    }
    @keyframes mascota-sacude { 0%, 100% { transform: rotate(0); } 20% { transform: rotate(-9deg); } 40% { transform: rotate(8deg); } 60% { transform: rotate(-6deg); } 80% { transform: rotate(4deg); } }
    @keyframes mascota-saludo { 0%, 100% { transform: rotate(0); } 25% { transform: rotate(-12deg) translateY(-4px); } 50% { transform: rotate(10deg) translateY(-4px); } 75% { transform: rotate(-6deg); } }
    @media (prefers-reduced-motion: reduce) { #mascota .cuerpo { animation: none !important; } }
  `;
  document.head.appendChild(estilo);

  const boton = document.createElement('button');
  boton.id = 'mascota';
  boton.type = 'button';
  boton.setAttribute('aria-label', 'Mascota búho');
  const img = document.createElement('img');
  img.alt = 'Búho, mascota de Aprendo a Leer';
  const acc = document.createElement('span');
  acc.className = 'acc';
  acc.setAttribute('aria-hidden', 'true');
  const cuerpo = document.createElement('span');
  cuerpo.className = 'cuerpo';
  cuerpo.append(img, acc);
  boton.append(cuerpo);

  const burbuja = document.createElement('div');
  burbuja.id = 'mascota-burbuja';
  burbuja.setAttribute('aria-live', 'polite');

  const editar = document.createElement('button');
  editar.id = 'mascota-editar';
  editar.type = 'button';
  editar.textContent = '🎨 Mi búho';

  const panel = document.createElement('div');
  panel.id = 'mascota-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Personalizar mi búho');

  document.body.append(burbuja, boton, editar, panel);

  // ---------- Animaciones ----------
  const reducido = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const CLASES_ANIM = ['anim-entrada', 'anim-salto', 'anim-sacude', 'anim-saludo'];

  function animar(clase) {
    if (reducido) return;
    cuerpo.classList.remove(...CLASES_ANIM);
    void cuerpo.offsetWidth;
    cuerpo.classList.add(clase);
  }
  cuerpo.addEventListener('animationend', () => cuerpo.classList.remove(...CLASES_ANIM));

  function confeti(cantidad = 14) {
    if (reducido) return;
    const r = boton.getBoundingClientRect();
    const emojis = ['⭐', '✨', '🎉', '💜', '🌈', '🎈'];
    for (let n = 0; n < cantidad; n++) {
      const s = document.createElement('span');
      s.textContent = emojis[Math.floor(Math.random() * emojis.length)];
      s.setAttribute('aria-hidden', 'true');
      s.style.cssText = `position:fixed;left:${r.left + r.width / 2}px;top:${r.top + r.height / 3}px;font-size:${18 + Math.random() * 14}px;pointer-events:none;z-index:60`;
      document.body.appendChild(s);
      const dx = (Math.random() - .5) * 280;
      const subida = 70 + Math.random() * 70;
      const caida = 90 + Math.random() * 160;
      s.animate([
        { transform: 'translate(0, 0) scale(.4) rotate(0)', opacity: 1 },
        { transform: `translate(${dx * .7}px, ${-subida}px) scale(1) rotate(120deg)`, opacity: 1, offset: .4 },
        { transform: `translate(${dx}px, ${caida}px) scale(.8) rotate(300deg)`, opacity: 0 }
      ], { duration: 1200 + Math.random() * 700, easing: 'ease-out' }).onfinish = () => s.remove();
    }
  }

  function celebrar() {
    animar('anim-salto');
    confeti();
  }

  // ---------- Voz y burbuja ----------
  let timer;
  function decir(texto, { voz = true, duracion = 3500 } = {}) {
    burbuja.textContent = texto;
    burbuja.classList.add('visible');
    clearTimeout(timer);
    timer = setTimeout(() => burbuja.classList.remove('visible'), duracion);
    if (voz && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const voz = new SpeechSynthesisUtterance(texto.replace(/[^\p{L}\p{N}¡!¿?., ]/gu, ''));
      voz.lang = 'es-CL';
      voz.rate = 0.85;
      voz.pitch = 1.2;
      window.speechSynthesis.speak(voz);
    }
  }

  window.mascota = { animar, confeti, celebrar, decir };

  // Se conserva el búho personalizable y sus accesorios dentro de los juegos.
  if (document.body.classList.contains('game-page')) {
    document.body.classList.add('mascota-en-juego');
    editar.hidden = true; // Se personaliza desde la pantalla de actividades.
  }

  // ---------- Búho y accesorios ----------
      const ACC_PNG = ['lentes']; // accesorios que son imagen PNG; agrega aquí los nuevos
  function dibujarAccesorio() {
    const a = AJUSTES[accesorio] || { x: 0, y: 0, s: 1 };
    if (ACC_PNG.includes(accesorio)) {
      acc.innerHTML = `<img src="${CARPETA}/acc-${accesorio}.png" alt="" style="position:absolute;inset:0;width:100%;height:100%;transform:translate(${a.x}%, ${a.y}%) scale(${a.s});transform-origin:50% 30%">`;
      return;
    }
    const pieza = PIEZAS[accesorio];
    if (!pieza) { acc.innerHTML = ''; return; }
    const ancho = img.naturalWidth || 100;
    const alto = img.naturalHeight || 109;
    const h = (100 * alto / ancho).toFixed(2);
    acc.innerHTML = `<svg viewBox="0 0 100 ${h}" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
      <g transform="translate(${a.x} ${a.y}) translate(48 0) scale(${a.s}) translate(-48 0)">${pieza}</g></svg>`;
  }

  function aplicar() {
    const mostrado = forzado || color;
    if (img.dataset.color !== mostrado) {
      img.dataset.color = mostrado;
      img.onerror = () => { img.onerror = null; img.src = `${CARPETA}/buho-${POR_DEFECTO}.png`; };
      img.src = `${CARPETA}/buho-${mostrado}.png`;
    }
    dibujarAccesorio();
  }

  function pintarPanel() {
    panel.replaceChildren();
    const cerrar = document.createElement('button');
    cerrar.className = 'cerrar';
    cerrar.type = 'button';
    cerrar.textContent = '✕';
    cerrar.setAttribute('aria-label', 'Cerrar');
    cerrar.addEventListener('click', () => panel.classList.remove('abierto'));
    panel.appendChild(cerrar);

    if (!estudiante) {
      const p = document.createElement('p');
      p.className = 'aviso';
      p.textContent = 'Toca tu nombre en la pantalla de inicio para personalizar tu búho.';
      panel.appendChild(p);
      return;
    }

    const crearRejilla = (titulo, items, actual, alElegir) => {
      const h = document.createElement('h3');
      h.textContent = titulo;
      const rejilla = document.createElement('div');
      rejilla.className = 'rejilla';
      items.forEach(([id, etiqueta, visual]) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'opcion';
        b.setAttribute('aria-pressed', String(actual === id));
        b.setAttribute('aria-label', etiqueta);
        const marca = document.createElement('span');
        if (visual.startsWith('#')) { marca.className = 'muestra'; marca.style.background = visual; }
        else { marca.className = 'emoji'; marca.textContent = visual; }
        const texto = document.createElement('span');
        texto.textContent = etiqueta;
        b.append(marca, texto);
        b.addEventListener('click', () => alElegir(id));
        rejilla.appendChild(b);
      });
      panel.append(h, rejilla);
    };

        crearRejilla('🎨 Color de mi búho', COLORES.map(([id, nombre, hex]) => [id, nombre, hex]), color, id => guardar({ buhoColor: id }, FRASES_COLOR[id]));
        crearRejilla('🎩 Accesorios', ACCESORIOS.map(([id, emoji, nombre]) => [id, nombre, emoji]), accesorio, id => guardar({ buhoAccesorio: id }, FRASES_ACCESORIO[id]));
  }

  async function guardar(cambios, frase) {
    if (!estudiante) return;
    if (cambios.buhoColor) color = cambios.buhoColor;
    if (cambios.buhoAccesorio) accesorio = cambios.buhoAccesorio;
    aplicar();
    pintarPanel();
    animar('anim-salto');
    if (frase) decir(frase);
    try {
      const respuesta = await fetch('/api/estudiantes/me/preferencias', {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cambios)
      });
      if (!respuesta.ok) throw new Error();
    } catch {
      decir('Ups, no pude guardar el cambio.');
    }
  }

  async function cargar() {
    try {
      const respuesta = await fetch('/api/estudiantes/me', { credentials: 'same-origin' });
      if (!respuesta.ok) throw new Error();
      estudiante = (await respuesta.json()).estudiante;
      color = estudiante.BuhoColor || TONO_A_COLOR[estudiante.ColorFavorito] || POR_DEFECTO;
      accesorio = estudiante.BuhoAccesorio || 'ninguno';
    } catch {
      estudiante = null;
      color = POR_DEFECTO;
      accesorio = 'ninguno';
      panel.classList.remove('abierto');
    }
    aplicar();
    pintarPanel();
  }

  // ---------- Interacción ----------
  const frases = [
    '¡Hola! Soy tu amigo búho 🦉',
    '¡Tú puedes! Vamos a leer juntos.',
    '¡Qué bien lo haces!',
    'Cada letra te hace más sabio/a.',
    '¡Vamos a aprender algo nuevo!'
  ];
  let ultima = -1;
  boton.addEventListener('click', () => {
    let i;
    do { i = Math.floor(Math.random() * frases.length); } while (i === ultima);
    ultima = i;
    animar('anim-salto');
    decir(frases[i]);
  });

  editar.addEventListener('click', async () => {
    if (!panel.classList.contains('abierto')) await cargar();
    panel.classList.toggle('abierto');
  });

  const observador = new MutationObserver(() => cargar());
  ['#studentActivities', '#studentEntry'].forEach(selector => {
    const el = document.querySelector(selector);
    if (el) observador.observe(el, { attributes: true, attributeFilter: ['class'] });
  });
  window.addEventListener('pageshow', cargar);

  if (!reducido) {
    (function saludoAleatorio() {
      setTimeout(() => {
        if (!document.hidden && !panel.classList.contains('abierto')) animar('anim-saludo');
        saludoAleatorio();
      }, 9000 + Math.random() * 8000);
    })();
  }

  const feedback = document.querySelector('#feedback');
  if (feedback) {
    new MutationObserver(() => {
      if (feedback.classList.contains('correct')) { animar('anim-salto'); confeti(6); }
      else if (feedback.classList.contains('incorrect')) animar('anim-sacude');
    }).observe(feedback, { attributes: true, attributeFilter: ['class'] });
  }
  const terminado = document.querySelector('#finished');
  if (terminado) {
    new MutationObserver(() => {
      if (!terminado.classList.contains('hidden')) { celebrar(); setTimeout(() => confeti(18), 500); }
    }).observe(terminado, { attributes: true, attributeFilter: ['class'] });
  }

  animar('anim-entrada');
  aplicar();
  cargar();

  // Felicitación pendiente: solo después de un guardado confirmado por el servidor.
  if (document.body.classList.contains('home-page')) {
    let mensaje = null;
    try {
      mensaje = sessionStorage.getItem('lectura-felicitacion-pendiente');
      sessionStorage.removeItem('lectura-felicitacion-pendiente');
    } catch { /* navegación privada */ }
    if (mensaje) {
      const actividades = document.querySelector('#studentActivities');
      const mostrarFelicitacion = () => {
        if (actividades?.classList.contains('hidden')) return;
        observer.disconnect();
        // Evitar interrumpir la carga del color/accesorio del estudiante.
        cargar().then(() => { celebrar(); decir('¡Excelente trabajo! Terminaste tu actividad. ¡Vamos por la siguiente!', { duracion: 6500 }); });
      };
      const observer = new MutationObserver(mostrarFelicitacion);
      if (actividades) observer.observe(actividades, { attributes: true, attributeFilter: ['class'] });
      mostrarFelicitacion();
    }
  }
})();