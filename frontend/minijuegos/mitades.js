// Une las mitades: cada pieza de la izquierda (con dibujo) tiene su otra mitad a la derecha.
MJ.registrar('mitades', {
  iniciar(ctx) {
    const candidatas = ctx.mezclar(ctx.banco.PALABRAS.filter(p => p.silabas.length === 2));
    const elegidas = [], primeras = new Set(), segundas = new Set();
    for (const p of candidatas) {
      if (primeras.has(p.silabas[0]) || segundas.has(p.silabas[1])) continue;
      elegidas.push(p); primeras.add(p.silabas[0]); segundas.add(p.silabas[1]);
      if (elegidas.length === 5) break;
    }
    let seleccionada = null, unidas = 0;
    const derecha = ctx.mezclar(elegidas);
    ctx.escena.innerHTML = `
      <div class="mj-mitades">
        <div class="mj-columna" id="miIzq">${elegidas.map(p => `
          <button type="button" class="mj-pieza izq" data-palabra="${p.palabra}" aria-pressed="false" aria-label="Primera mitad: ${p.silabas[0]}">
            <span class="emoji" aria-hidden="true">${p.imagen}</span><span>${p.silabas[0]}</span></button>`).join('')}</div>
        <div class="mj-columna" id="miDer">${derecha.map(p => `
          <button type="button" class="mj-pieza der" data-palabra="${p.palabra}" aria-label="Segunda mitad: ${p.silabas[1]}">
            <span>${p.silabas[1]}</span></button>`).join('')}</div>
      </div>
      <ul class="mj-formadas" id="miFormadas" aria-label="Palabras formadas"></ul>`;
    const izq = [...ctx.escena.querySelectorAll('.izq')];
    const der = [...ctx.escena.querySelectorAll('.der')];
    const instruccion = 'Toca una pieza con dibujo y luego su otra mitad para formar la palabra.';
    ctx.instruccion(instruccion);
    ctx.alEscuchar(() => ctx.hablar(instruccion));

    const limpiar = () => { izq.forEach(b => { b.classList.remove('elegida'); b.setAttribute('aria-pressed', 'false'); }); seleccionada = null; };
    izq.forEach(boton => boton.addEventListener('click', () => {
      if (boton.classList.contains('unida')) return;
      const estaba = seleccionada === boton;
      limpiar();
      if (estaba) return;
      seleccionada = boton;
      boton.classList.add('elegida');
      boton.setAttribute('aria-pressed', 'true');
      ctx.hablar(boton.querySelector('span:last-child').textContent);
      ctx.aviso('');
    }));
    der.forEach(boton => boton.addEventListener('click', () => {
      if (boton.classList.contains('unida')) return;
      const silaba = boton.textContent.trim();
      if (!seleccionada) { ctx.aviso('Primero toca una pieza con dibujo 👈'); ctx.hablar(silaba); return; }
      const izquierda = seleccionada;
      if (izquierda.dataset.palabra === boton.dataset.palabra) {
        const p = elegidas.find(x => x.palabra === boton.dataset.palabra);
        [izquierda, boton].forEach(b => { b.classList.remove('elegida'); b.classList.add('unida'); b.disabled = true; });
        seleccionada = null;
        const item = document.createElement('li');
        item.textContent = `${p.imagen} ${p.palabra}`;
        ctx.escena.querySelector('#miFormadas').appendChild(item);
        ctx.hablar(p.palabra);
        ctx.confeti(10);
        ctx.aviso(`¡Formaste ${p.palabra.toUpperCase()}!`, 'bien');
        unidas++;
        if (unidas === elegidas.length) setTimeout(() => ctx.ganar(), 1100);
      } else {
        [izquierda, boton].forEach(b => { b.classList.add('error'); setTimeout(() => b.classList.remove('error'), 450); });
        limpiar();
        ctx.aviso('¡Casi! Prueba con otra pieza 💪', 'mal');
      }
    }));
  }
});