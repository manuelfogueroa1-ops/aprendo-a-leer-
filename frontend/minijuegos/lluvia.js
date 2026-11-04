// Lluvia de letras: caen sílabas y el búho (que se mueve con el dedo o las flechas) atrapa solo la pedida.
MJ.registrar('lluvia', {
  async iniciar(ctx) {
    const W = 360, H = 520, OW = 62, PASO = 1000 / 60, META = 8;
    const { CONSONANTES, VOCALES } = ctx.banco;
    const consonante = ctx.elegir(CONSONANTES), vocal = ctx.elegir(VOCALES);
    const objetivo = consonante + vocal;
    const parecidas = [
      ...VOCALES.filter(v => v !== vocal).map(v => consonante + v),
      ...CONSONANTES.filter(k => k !== consonante).map(k => k + vocal)
    ];
    let atrapadas = 0, vivo = true, desdeMeta = 0, reloj = 0, proxima = 20, puntero = null, sacudida = 0;
    const teclas = { izq: false, der: false };
    const items = [];
    const fondo = Array.from({ length: 6 }, (_, i) => ({ x: (i * 67 + 30) % W, y: Math.random() * H, v: 0.4 + Math.random() * 0.5, e: ctx.tema.emojis[i % ctx.tema.emojis.length] }));

    ctx.escena.innerHTML = `
      <p class="mj-contador" id="llMeta"></p>
      <canvas id="llCanvas" aria-label="Juego de la lluvia de letras"></canvas>
      <div class="mj-controles">
        <button type="button" class="mj-boton" id="llIzq" aria-label="Mover a la izquierda">◀</button>
        <button type="button" class="mj-boton" id="llDer" aria-label="Mover a la derecha">▶</button>
      </div>`;
    const lienzo = ctx.escena.querySelector('#llCanvas');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    lienzo.width = W * dpr; lienzo.height = H * dpr;
    const c = lienzo.getContext('2d');
    c.scale(dpr, dpr);
    const marcador = ctx.escena.querySelector('#llMeta');
    const pintarMarcador = () => { marcador.textContent = `Atrapa la sílaba ${objetivo.toUpperCase()} · ${atrapadas} de ${META}`; };
    pintarMarcador();
    const alto = ctx.buho.naturalWidth ? OW * ctx.buho.naturalHeight / ctx.buho.naturalWidth : OW;
    const buho = { x: W / 2 };
    const partesVoz = [
      { texto: 'Atrapa la sílaba' },
      { clave: `silaba-${objetivo}`, texto: objetivo },
      { texto: `Mueve al búho con tu dedo o con las flechas. ¡Atrapa solo esa sílaba! Cuando atrapes ${META}, ganas.` }
    ];
    const decir = () => ctx.hablarPartes(partesVoz);
    ctx.instruccion(`Mueve al búho y atrapa solo la sílaba ${objetivo.toUpperCase()}`);

    const mapa = { ArrowLeft: 'izq', a: 'izq', A: 'izq', ArrowRight: 'der', d: 'der', D: 'der' };
    window.addEventListener('keydown', e => { const t = mapa[e.key]; if (t) { e.preventDefault(); teclas[t] = true; puntero = null; } });
    window.addEventListener('keyup', e => { const t = mapa[e.key]; if (t) teclas[t] = false; });
    [['#llIzq', 'izq'], ['#llDer', 'der']].forEach(([sel, dir]) => {
      const b = ctx.escena.querySelector(sel);
      b.addEventListener('pointerdown', e => { e.preventDefault(); teclas[dir] = true; puntero = null; });
      ['pointerup', 'pointerleave', 'pointercancel'].forEach(t => b.addEventListener(t, () => { teclas[dir] = false; }));
    });
    const seguir = e => { const r = lienzo.getBoundingClientRect(); puntero = (e.clientX - r.left) / r.width * W; };
    lienzo.addEventListener('pointerdown', e => { lienzo.setPointerCapture?.(e.pointerId); seguir(e); });
    lienzo.addEventListener('pointermove', e => { if (e.buttons || e.pointerType === 'touch') seguir(e); });

    function aparecer() {
      desdeMeta++;
      const esMeta = desdeMeta >= 3 || Math.random() < 0.45;
      if (esMeta) desdeMeta = 0;
      items.push({ x: 30 + Math.random() * (W - 60), y: -30, texto: esMeta ? objetivo : ctx.elegir(parecidas), esMeta, v: 1.5 + Math.min(1, atrapadas * 0.1) + Math.random() * 0.5 });
    }
    function paso() {
      reloj++;
      const dir = (teclas.der ? 1 : 0) - (teclas.izq ? 1 : 0);
      if (dir) buho.x += dir * 6;
      else if (puntero !== null) buho.x += Math.max(-8, Math.min(8, (puntero - buho.x) * 0.3));
      buho.x = Math.max(OW / 2, Math.min(W - OW / 2, buho.x));
      if (reloj >= proxima) { aparecer(); proxima = reloj + 50 + Math.random() * 25; }
      if (sacudida > 0) sacudida--;
      for (const f of fondo) { if (!ctx.quieto) f.y += f.v; if (f.y > H + 30) f.y = -30; }
      for (let i = items.length - 1; i >= 0; i--) {
        const it = items[i];
        it.y += it.v;
        const alcanza = it.y + 22 >= H - alto - 6 && it.y - 22 <= H && Math.abs(it.x - buho.x) < OW / 2 + 22;
        if (alcanza) {
          items.splice(i, 1);
          if (it.esMeta) {
            atrapadas++;
            pintarMarcador();
            ctx.hablar(it.texto);
            ctx.aviso('¡Muy bien! 🌟', 'bien');
            if (atrapadas >= META) { vivo = false; ctx.confeti(30); setTimeout(() => ctx.ganar(), 700); }
          } else {
            sacudida = 18;
            ctx.aviso(`Esa dice ${it.texto.toUpperCase()}. ¡Busca ${objetivo.toUpperCase()}!`, 'mal');
          }
        } else if (it.y > H + 40) items.splice(i, 1);
      }
    }
    function caja(x, y, w, h, r) {
      c.beginPath();
      c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
      c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
    }
    function dibujar() {
      const hue = ctx.tema.hue;
      const g = c.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, `hsl(${hue + 20} 75% 90%)`); g.addColorStop(1, `hsl(${hue} 70% 80%)`);
      c.fillStyle = g; c.fillRect(0, 0, W, H);
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.globalAlpha = 0.45; c.font = '32px serif';
      for (const f of fondo) c.fillText(f.e, f.x, f.y);
      c.globalAlpha = 1;
      c.fillStyle = `hsl(${hue} 45% 62%)`; c.fillRect(0, H - 8, W, 8);
      c.font = '700 26px Fredoka, sans-serif';
      for (const it of items) {
        c.fillStyle = '#fff'; caja(it.x - 30, it.y - 22, 60, 44, 14); c.fill();
        c.lineWidth = 3; c.strokeStyle = `hsl(${hue} 60% 55%)`; c.stroke();
        c.fillStyle = `hsl(${hue} 55% 26%)`; c.fillText(it.texto.toUpperCase(), it.x, it.y + 1);
      }
      const dx = sacudida ? Math.sin(sacudida * 1.5) * 4 : 0;
      c.drawImage(ctx.buho, buho.x - OW / 2 + dx, H - 8 - alto, OW, alto);
    }
    // El juego no empieza solo: primero se explica (con voz) y se espera el botón "Jugar".
    dibujar();
    await ctx.pantallaInicio({
      icono: '🌧️',
      titulo: 'Lluvia de letras',
      pasos: [
        { icono: '👆', texto: 'Mueve al búho con el dedo, el mouse o las flechas ◀ ▶' },
        { icono: '🎯', texto: `Atrapa solo la sílaba <b>${objetivo.toUpperCase()}</b>` },
        { icono: '⭐', texto: `Atrapa ${META} para ganar` }
      ],
      partes: partesVoz
    });
    ctx.alEscuchar(decir);
    let ultimo = performance.now(), acumulado = 0;
    function bucle(ahora) {
      if (!vivo) { dibujar(); return; }
      acumulado += Math.min(100, ahora - ultimo); ultimo = ahora;
      while (acumulado >= PASO) { paso(); acumulado -= PASO; }
      dibujar();
      requestAnimationFrame(bucle);
    }
    requestAnimationFrame(bucle);
  }
});