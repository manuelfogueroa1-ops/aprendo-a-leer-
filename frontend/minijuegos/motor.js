// Motor compartido de los minijuegos: carga el tema, el búho del niño, la voz,
// el confeti y el cierre (guardar estrellas y volver al tablero o a la actividad).
(() => {
  const JUEGOS = {
    saltarin: { titulo: 'Búho saltarín', icono: '🦉' },
    mitades: { titulo: 'Une las mitades', icono: '🧩' },
    lluvia: { titulo: 'Lluvia de letras', icono: '🌧️' },
    memoria: { titulo: 'Memoria de pares', icono: '🃏' }
  };
  const TONO_A_COLOR = { 0: 'rojo', 25: 'naranja', 48: 'amarillo', 130: 'verde', 175: 'turquesa', 215: 'azul', 270: 'morado', 330: 'rosado' };
  const $ = selector => document.querySelector(selector);
  const params = new URLSearchParams(location.search);
  const juegoId = params.get('juego');
  const origen = params.get('origen') === 'premio' ? 'premio' : 'tablero';
  const enMarco = window.parent !== window;
  const quieto = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const registro = {};
  let alEscuchar = null;
  let inicio = 0;
  let terminado = false;
  let estrellasGanadas = 0;

  const aviso = (texto, tipo = '') => {
    const caja = $('#mjAviso');
    caja.textContent = texto || '';
    caja.className = `mj-aviso ${tipo}`;
  };

  // Cada vez que se habla se invalida lo anterior, para que dos voces nunca se pisen.
  let turnoVoz = 0;

  // Usa la voz de la app: grabaciones humanas para letras y sílabas (si existen) y,
  // si no, la voz elegida por la profesora (Piper o la del sistema).
  function hablar(texto, tipo) {
    const texto2 = String(texto || '').trim();
    if (!texto2) return;
    turnoVoz++;
    const voz = window.VozInfantil;
    if (voz?.disponible?.()) {
      const minuscula = texto2.toLowerCase();
      const clave = /^[a-zñ]$/.test(minuscula) ? `letras-nombre-${minuscula}` : /^[a-zñ]{2}$/.test(minuscula) ? `silaba-${minuscula}` : null;
      if (clave && voz.tieneGrabacion(clave)) {
        voz.cancelar();
        voz.reproducir(voz.crearGrabacion(clave));
        return;
      }
      const clase = tipo || (minuscula.length <= 2 ? 'letras' : /\s/.test(minuscula) ? 'animo' : 'lectura');
      voz.cancelar();
      voz.hablar(texto2, { tipo: clase });
      return;
    }
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const sintetizada = new SpeechSynthesisUtterance(texto2);
    sintetizada.lang = 'es-CL';
    sintetizada.rate = 0.85;
    window.speechSynthesis.speak(sintetizada);
  }

  // Dice varias partes una tras otra. Cada parte es un texto o { clave: 'silaba-pa' } (grabación humana).
  // Si no hay grabación para la clave, se usa la voz normal con { texto }.
  async function hablarPartes(partes) {
    const voz = window.VozInfantil;
    if (!voz?.disponible?.()) { hablar(partes.map(p => p.texto ?? p).filter(Boolean).join(' ')); return; }
    voz.cancelar();
    const mio = ++turnoVoz;
    for (const parte of partes) {
      if (mio !== turnoVoz) return;
      const datos = typeof parte === 'string' ? { texto: parte } : parte;
      const habla = datos.clave && voz.tieneGrabacion(datos.clave)
        ? voz.crearGrabacion(datos.clave)
        : datos.texto ? voz.crear(datos.texto, { tipo: 'animo' }) : null;
      if (!habla) continue;
      const seguir = await new Promise(resolver => {
        const aviso = setTimeout(() => resolver(true), 9000); // por si el navegador no avisa el final
        const fin = valor => () => { clearTimeout(aviso); resolver(valor); };
        habla.addEventListener('end', fin(true), { once: true });
        habla.addEventListener('error', fin(true), { once: true });
        habla.addEventListener('cancel', fin(false), { once: true });
        voz.reproducir(habla);
      });
      if (!seguir || mio !== turnoVoz) return;
    }
  }

  // Dice una palabra uniendo las grabaciones de sus sílabas (misma voz humana en todo el juego).
  // Si falta alguna grabación, usa la voz normal para la palabra completa.
  function hablarSilabas(silabas, palabra) {
    const claves = silabas.map(silaba => `silaba-${String(silaba).toLowerCase()}`);
    const voz = window.VozInfantil;
    if (voz?.secuencia && claves.every(clave => voz.tieneGrabacion(clave))) {
      turnoVoz++;
      voz.secuencia(claves);
      return;
    }
    hablar(palabra);
  }

  function confeti(cantidad = 24) {
    if (quieto) return;
    const piezas = ['⭐', '🎉', '✨', '💜', '🌈', '🎈'];
    for (let i = 0; i < cantidad; i++) {
      const pieza = document.createElement('span');
      pieza.className = 'mj-confeti';
      pieza.setAttribute('aria-hidden', 'true');
      pieza.textContent = piezas[Math.floor(Math.random() * piezas.length)];
      pieza.style.left = `${Math.random() * 100}vw`;
      pieza.style.fontSize = `${1.2 + Math.random() * 1.6}rem`;
      pieza.style.animationDuration = `${1.6 + Math.random() * 1.6}s`;
      pieza.style.animationDelay = `${Math.random() * 0.4}s`;
      document.body.appendChild(pieza);
      setTimeout(() => pieza.remove(), 4000);
    }
  }

  async function cargarBuho() {
    let color = 'rojo';
    try {
      const respuesta = await fetch('/api/estudiantes/me', { credentials: 'same-origin' });
      if (respuesta.ok) {
        const { estudiante } = await respuesta.json();
        color = estudiante.BuhoColor || TONO_A_COLOR[estudiante.ColorFavorito] || 'rojo';
      }
    } catch { /* se usa el búho rojo */ }
    const imagen = new Image();
    await new Promise(resolver => {
      imagen.onload = resolver;
      imagen.onerror = () => { imagen.onerror = null; imagen.src = '/assets/buho-rojo.png'; };
      imagen.src = `/assets/buho-${color}.png`;
      setTimeout(resolver, 4000);
    });
    return imagen;
  }

  function leerTema() {
    const actual = window.Tema?.actual?.() || {};
    const emojis = window.Tema?.TEMAS?.[actual.TemaInteres] || ['⭐', '🌈', '✨'];
    const hue = actual.ColorFavorito ?? 262;
    return { hue, emojis, nombre: actual.TemaInteres || null };
  }

  function cerrar(ganadas = 0) {
    if (enMarco) window.parent.postMessage({ tipo: 'minijuego-cerrar', ganadas }, location.origin);
    else location.assign('/');
  }

  async function guardar(duracionSegundos) {
    const respuesta = await fetch('/api/tablero/minijuego', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ minijuego: juegoId, origen, duracionSegundos })
    });
    const datos = await respuesta.json().catch(() => ({}));
    if (!respuesta.ok) throw new Error(datos.error || 'No se pudo guardar.');
    return datos;
  }

  async function terminar(buho) {
    if (terminado) return;
    terminado = true;
    window.VozInfantil?.cancelar?.();
    window.speechSynthesis?.cancel();
    const duracion = Math.round((performance.now() - inicio) / 1000);
    confeti(70);
    $('#mjFinBuho').src = buho.src;
    $('#mjFinEstrellas').textContent = '';
    $('#mjFinEstado').textContent = 'Guardando tus estrellas…';
    const continuar = $('#mjContinuar');
    continuar.disabled = true;
    $('#mjFin').classList.remove('hidden');
    continuar.focus();
    const intentar = async () => {
      continuar.disabled = true;
      $('#mjFinEstado').textContent = 'Guardando tus estrellas…';
      try {
        const datos = await guardar(duracion);
        estrellasGanadas = datos.ganadas;
        $('#mjFinEstrellas').textContent = '⭐'.repeat(datos.ganadas);
        $('#mjFinEstado').textContent = `¡Ganaste ${datos.ganadas} ${datos.ganadas === 1 ? 'estrella' : 'estrellas'}! Ya tienes ${datos.estrellas}.`;
        continuar.textContent = origen === 'premio' ? 'Seguir con mi actividad →' : 'Volver al camino →';
        continuar.onclick = () => cerrar(estrellasGanadas);
      } catch (error) {
        $('#mjFinEstado').textContent = `${error.message} Toca el botón para intentar otra vez.`;
        continuar.textContent = 'Intentar guardar de nuevo';
        continuar.onclick = intentar;
      } finally {
        continuar.disabled = false;
        continuar.focus();
      }
    };
    intentar();
  }

  // Pantalla previa a los juegos con tiempo: explica con dibujos y voz, y espera el botón "Jugar".
  function pantallaInicio({ icono = '🎮', titulo, pasos = [], partes = [], boton = '▶ ¡Jugar!' }) {
    return new Promise(resolver => {
      const tarjeta = document.createElement('div');
      tarjeta.className = 'mj-inicio';
      tarjeta.setAttribute('role', 'dialog');
      tarjeta.setAttribute('aria-modal', 'true');
      tarjeta.setAttribute('aria-label', titulo);
      tarjeta.innerHTML = `<div class="mj-inicio-tarjeta">
        <div class="mj-inicio-icono" aria-hidden="true">${icono}</div>
        <h2>${titulo}</h2>
        <ol class="mj-inicio-pasos">${pasos.map(paso => `<li><span class="mj-paso-icono" aria-hidden="true">${paso.icono}</span><span>${paso.texto}</span></li>`).join('')}</ol>
        <button type="button" class="mj-boton mj-boton-grande" id="mjJugar">${boton}</button>
        <button type="button" class="mj-boton-suave" id="mjOirDeNuevo">🔊 Escuchar de nuevo</button>
      </div>`;
      $('#mjEscena').appendChild(tarjeta);
      const decir = () => hablarPartes(partes);
      alEscuchar = decir;
      tarjeta.querySelector('#mjOirDeNuevo').addEventListener('click', decir);
      tarjeta.querySelector('#mjJugar').addEventListener('click', () => {
        turnoVoz++;
        window.VozInfantil?.cancelar?.();
        window.speechSynthesis?.cancel();
        tarjeta.remove();
        inicio = performance.now(); // el tiempo empieza a contar al tocar "Jugar"
        resolver();
      }, { once: true });
      tarjeta.querySelector('#mjJugar').focus({ preventScroll: true });
      setTimeout(decir, 350);
    });
  }

  const MJ = {
    registrar(id, definicion) { registro[id] = definicion; },
    mezclar: items => window.Banco.mezclar(items),
    elegir: items => window.Banco.elegir(items)
  };
  window.MJ = MJ;

  async function arrancar() {
    const definicion = JUEGOS[juegoId];
    $('#mjSalir').addEventListener('click', () => cerrar(0));
    $('#mjRepetir').addEventListener('click', () => location.reload());
    $('#mjEscuchar').addEventListener('click', () => alEscuchar && alEscuchar());
    if (!definicion) {
      $('#mjInstruccion').textContent = 'Ese minijuego no existe. Vuelve y elige otro.';
      return;
    }
    $('#mjTitulo').textContent = definicion.titulo;
    $('#mjIcono').textContent = definicion.icono;
    document.title = `${definicion.titulo} | Aprendo a Leer`;
    $('#mjInstruccion').textContent = 'Preparando el juego…';

    const cargaScript = new Promise((resolver, rechazar) => {
      const script = document.createElement('script');
      script.src = `/minijuegos/${juegoId}.js`;
      script.onload = resolver;
      script.onerror = () => rechazar(new Error('No se pudo cargar el juego.'));
      document.body.appendChild(script);
    });
    try {
      await cargaScript;
      if (window.Tema?.cargar) await window.Tema.cargar();
      const buho = await cargarBuho();
      const tema = leerTema();
      document.documentElement.style.setProperty('--mj-h', tema.hue);
      document.body.dataset.tema = tema.nombre || '';
      const ctx = {
        escena: $('#mjEscena'), tema, buho, quieto, origen, aviso, hablar, hablarPartes, hablarSilabas, pantallaInicio, confeti,
        banco: window.Banco,
        mezclar: MJ.mezclar,
        elegir: MJ.elegir,
        instruccion(texto) { $('#mjInstruccion').textContent = texto; },
        alEscuchar(funcion) { alEscuchar = funcion; },
        ganar() { terminar(buho); }
      };
      inicio = performance.now();
      await registro[juegoId].iniciar(ctx);
    } catch (error) {
      $('#mjInstruccion').textContent = error.message;
    }
  }

  arrancar();
})();