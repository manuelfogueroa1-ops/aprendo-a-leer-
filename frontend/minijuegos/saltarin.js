// Búho saltarín: el búho rebota solo por las plataformas y el niño lo guía para atrapar,
// en orden, las letras de una palabra. Si cae, una nube lo rescata (no se pierde nada).
MJ.registrar('saltarin', {
  async iniciar(ctx) {
    const W = 360, H = 560, OW = 46, G = 0.42, SALTO = -11.5, PASO = 1000 / 60;
    const objetivo = ctx.elegir(ctx.banco.PALABRAS.filter(p => p.palabra.length <= 5));
    const letras = objetivo.palabra.split('');
    let siguiente = 0, vivo = true, camY = 0, topY = H - 30, filasSinNecesaria = 0, tiempo = 0;
    const plataformas = [], items = [];
    const teclas = { izq: false, der: false };
    let puntero = null;
    ctx.escena.innerHTML = `
      <div class="mj-meta">
        <span class="mj-pista-emoji" aria-hidden="true">${objetivo.imagen}</span>
        <div class="mj-meta" id="slRanuras" aria-label="Letras de la palabra"></div>
      </div>
      <canvas id="slCanvas" aria-label="Juego del búho saltarín"></canvas>
      <div class="mj-controles">
        <button type="button" class="mj-boton" id="slIzq" aria-label="Mover a la izquierda">◀</button>
        <button type="button" class="mj-boton" id="slDer" aria-label="Mover a la derecha">▶</button>
      </div>`;
    const lienzo = ctx.escena.querySelector('#slCanvas');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    lienzo.width = W * dpr; lienzo.height = H * dpr;
    const c = lienzo.getContext('2d');
    c.scale(dpr, dpr);
    const ranuras = ctx.escena.querySelector('#slRanuras');
    ranuras.innerHTML = letras.map(() => '<span class="mj-ranura"></span>').join('');
    const pintarRanuras = () => [...ranuras.children].forEach((el, i) => {
      el.textContent = letras[i];
      el.classList.toggle('llena', i < siguiente);
    });
    pintarRanuras();

    const alto = ctx.buho.naturalWidth ? OW * ctx.buho.naturalHeight / ctx.buho.naturalWidth : OW;
    const buho = { x: W / 2, y: H - 30, vy: SALTO, vx: 0, h: alto };

    const azar = (a, b) => a + Math.random() * (b - a);
    const partesVoz = [{ texto: `Guía al búho con tu dedo o con las flechas. Atrapa las letras de la palabra ${objetivo.palabra}, en orden.` }];
    const decir = () => ctx.hablarPartes(partesVoz);
    ctx.instruccion(`Guía al búho para atrapar las letras en orden: ${objetivo.palabra.toUpperCase()}`);

    function letraDistinta() {
      const necesaria = letras[siguiente];
      const fuente = Math.random() < 0.5 ? letras : ctx.banco.ALFABETO;
      let letra;
      do { letra = ctx.elegir(fuente); } while (letra === necesaria);
      return letra;
    }
    function generarItem(p) {
      const necesaria = letras[siguiente];
      const hay = items.some(i => i.activa && i.letra === necesaria);
      filasSinNecesaria++;
      let letra = null;
      if (!hay && (filasSinNecesaria >= 2 || Math.random() < 0.5)) { letra = necesaria; filasSinNecesaria = 0; }
      else if (Math.random() < 0.45) letra = letraDistinta();
      if (letra) items.push({ x: Math.min(W - 22, Math.max(22, p.x + p.w / 2 + azar(-14, 14))), y: p.y - 34, letra, activa: true });
    }
    function generarHasta(limite) {
      while (topY > limite) {
        topY -= azar(72, 102);
        const w = azar(66, 90);
        const p = { x: azar(8, W - w - 8), y: topY, w, deco: Math.random() < 0.3 ? ctx.elegir(ctx.tema.emojis) : null };
        plataformas.push(p);
        generarItem(p);
      }
    }
    plataformas.push({ x: 0, y: H - 30, w: W, suelo: true });
    generarHasta(-160);

    const mover = (dir, activo) => { teclas[dir] = activo; if (activo) puntero = null; };
    const mapaTeclas = { ArrowLeft: 'izq', a: 'izq', A: 'izq', ArrowRight: 'der', d: 'der', D: 'der' };
    const alBajar = e => { const t = mapaTeclas[e.key]; if (t) { e.preventDefault(); mover(t, true); } };
    const alSubir = e => { const t = mapaTeclas[e.key]; if (t) mover(t, false); };
    window.addEventListener('keydown', alBajar);
    window.addEventListener('keyup', alSubir);
    [['#slIzq', 'izq'], ['#slDer', 'der']].forEach(([sel, dir]) => {
      const b = ctx.escena.querySelector(sel);
      b.addEventListener('pointerdown', e => { e.preventDefault(); mover(dir, true); });
      ['pointerup', 'pointerleave', 'pointercancel'].forEach(t => b.addEventListener(t, () => mover(dir, false)));
    });
    const seguirPuntero = e => {
      const r = lienzo.getBoundingClientRect();
      puntero = (e.clientX - r.left) / r.width * W;
    };
    lienzo.addEventListener('pointerdown', e => { lienzo.setPointerCapture?.(e.pointerId); seguirPuntero(e); });
    lienzo.addEventListener('pointermove', e => { if (e.buttons || e.pointerType === 'touch') seguirPuntero(e); });

    function paso() {
      tiempo++;
      const dir = (teclas.der ? 1 : 0) - (teclas.izq ? 1 : 0);
      if (dir) buho.vx = dir * 5;
      else if (puntero !== null) buho.vx = Math.max(-7, Math.min(7, (puntero - buho.x) * 0.25));
      else buho.vx = 0;
      buho.x = Math.max(OW / 2, Math.min(W - OW / 2, buho.x + buho.vx));
      const antes = buho.y;
      buho.vy += G;
      buho.y += buho.vy;
      if (buho.vy > 0) {
        for (const p of plataformas) {
          if (antes <= p.y + 2 && buho.y >= p.y && buho.x + OW / 2 - 8 > p.x && buho.x - OW / 2 + 8 < p.x + p.w) {
            buho.y = p.y; buho.vy = SALTO; break;
          }
        }
      }
      if (buho.y - buho.h * 0.5 < camY + H * 0.4) camY = buho.y - buho.h * 0.5 - H * 0.4;
      generarHasta(camY - 120);
      // Rescate: si cae, una nube lo recibe y sigue sin perder las letras ya atrapadas.
      if (buho.y - buho.h > camY + H + 20) {
        plataformas.push({ x: buho.x - 45, y: camY + H - 24, w: 90, nube: true });
        buho.y = camY + H - 25; buho.vy = SALTO;
        ctx.aviso('¡Una nube te rescató! Sigue saltando ☁️', 'bien');
      }
      for (const it of items) {
        if (!it.activa) continue;
        if (Math.hypot(it.x - buho.x, it.y - (buho.y - buho.h / 2)) < 30) {
          it.activa = false;
          if (it.letra === letras[siguiente]) {
            siguiente++;
            pintarRanuras();
            ctx.hablar(it.letra);
            ctx.confeti(8);
            ctx.aviso(`¡Muy bien! Atrapaste la ${it.letra.toUpperCase()}`, 'bien');
            if (siguiente === letras.length) {
              vivo = false;
              setTimeout(() => ctx.ganar(), 700);
            }
          } else {
            ctx.aviso(`Esa es la ${it.letra.toUpperCase()}. ¡Busca la ${letras[siguiente].toUpperCase()}!`, 'mal');
          }
        }
      }
      for (let i = plataformas.length - 1; i >= 0; i--) if (plataformas[i].y > camY + H + 100) plataformas.splice(i, 1);
      for (let i = items.length - 1; i >= 0; i--) if (items[i].y > camY + H + 100) items.splice(i, 1);
    }

    function caja(x, y, w, h, r) {
      c.beginPath();
      c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
      c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
    }
    function dibujar() {
      const hue = ctx.tema.hue;
      const fondo = c.createLinearGradient(0, 0, 0, H);
      fondo.addColorStop(0, `hsl(${hue} 80% 93%)`);
      fondo.addColorStop(1, `hsl(${hue + 25} 65% 80%)`);
      c.fillStyle = fondo; c.fillRect(0, 0, W, H);
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.globalAlpha = 0.5; c.font = '34px serif';
      for (let k = 0; k < 6; k++) {
        const desplazamiento = ctx.quieto ? 0 : camY * 0.25;
        const y = (((k * 197 - desplazamiento) % (H + 80)) + (H + 80)) % (H + 80) - 40;
        c.fillText(ctx.tema.emojis[k % ctx.tema.emojis.length], (k * 97 + 40) % W, y);
      }
      c.globalAlpha = 1;
      for (const p of plataformas) {
        const y = p.y - camY;
        if (p.nube) { c.fillStyle = 'rgba(255,255,255,.92)'; caja(p.x, y - 4, p.w, 22, 11); c.fill(); continue; }
        c.fillStyle = `hsl(${hue} 55% 48%)`; caja(p.x, y, p.w, 14, 7); c.fill();
        c.fillStyle = `hsl(${hue} 65% 66%)`; caja(p.x + 3, y, p.w - 6, 5, 3); c.fill();
        if (p.deco) { c.font = '22px serif'; c.fillText(p.deco, p.x + 14, y - 12); }
      }
      c.font = '700 22px Fredoka, sans-serif';
      for (const it of items) {
        if (!it.activa) continue;
        const y = it.y - camY + Math.sin(tiempo / 18 + it.x) * 3;
        c.beginPath(); c.arc(it.x, y, 19, 0, Math.PI * 2);
        c.fillStyle = '#fff'; c.fill();
        c.lineWidth = 3; c.strokeStyle = `hsl(${hue} 60% 55%)`; c.stroke();
        c.fillStyle = `hsl(${hue} 55% 26%)`; c.fillText(it.letra.toUpperCase(), it.x, y + 1);
      }
      const estira = 1 + Math.min(0.12, Math.abs(buho.vy) * 0.01);
      const ancho = OW / estira, altura = buho.h * estira;
      c.drawImage(ctx.buho, buho.x - ancho / 2, buho.y - camY - altura, ancho, altura);
    }

        // El juego no empieza solo: primero se explica (con voz) y se espera el botón "Jugar".
    dibujar();
    await ctx.pantallaInicio({
      icono: '🦉',
      titulo: 'Búho saltarín',
      pasos: [
        { icono: '👆', texto: 'Guía al búho con el dedo, el mouse o las flechas ◀ ▶' },
        { icono: '🔤', texto: `Atrapa las letras de <b>${objetivo.palabra.toUpperCase()}</b>, en orden` },
        { icono: '⭐', texto: 'Si caes, una nube te rescata. ¡No pasa nada!' }
      ],
      partes: partesVoz
    });
    ctx.alEscuchar(decir);
    let ultimo = performance.now(), acumulado = 0;
    function bucle(ahora) {
      if (!vivo) { dibujar(); return; }
      acumulado += Math.min(100, ahora - ultimo);
      ultimo = ahora;
      while (acumulado >= PASO) { paso(); acumulado -= PASO; }
      dibujar();
      requestAnimationFrame(bucle);
    }
    requestAnimationFrame(bucle);
  }
});