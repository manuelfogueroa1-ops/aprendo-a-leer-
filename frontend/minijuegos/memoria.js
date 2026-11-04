// Memoria de pares: letra mayúscula con su minúscula, o dibujo con su palabra.
MJ.registrar('memoria', {
  iniciar(ctx) {
    const modo = Math.random() < 0.5 ? 'letras' : 'palabras';
    let cartas;
    if (modo === 'letras') {
      const letras = ctx.mezclar(['a', 'e', 'i', 'o', 'u', 'm', 'p', 's', 'l', 't', 'n', 'd', 'b', 'r']).slice(0, 6);
      cartas = letras.flatMap((l, i) => [{ id: i, texto: l.toUpperCase(), habla: l }, { id: i, texto: l, habla: l }]);
    } else {
      const palabras = ctx.mezclar(ctx.banco.PALABRAS).slice(0, 6);
      cartas = palabras.flatMap((p, i) => [{ id: i, emoji: p.imagen, habla: p.palabra, silabas: p.silabas }, { id: i, texto: p.palabra, habla: p.palabra, silabas: p.silabas }]);
    }
    cartas = ctx.mezclar(cartas);
    const instruccion = modo === 'letras'
      ? 'Encuentra cada letra mayúscula con su letra minúscula.'
      : 'Encuentra cada dibujo con su palabra.';
    ctx.instruccion(instruccion);
    ctx.alEscuchar(() => ctx.hablar(instruccion));
    ctx.escena.innerHTML = `<div class="mj-tablero-memoria" id="meTablero">${cartas.map((carta, i) => `
      <button type="button" class="mj-carta" data-i="${i}" aria-label="Carta ${i + 1}, boca abajo">
        <span class="mj-carta-interior">
          <span class="mj-cara mj-dorso" aria-hidden="true">${ctx.tema.emojis[i % ctx.tema.emojis.length]}</span>
          <span class="mj-cara mj-frente" aria-hidden="true">${carta.emoji ? `<span class="emoji">${carta.emoji}</span>` : ''}${carta.emoji ? '' : `<span class="${modo === 'palabras' ? 'texto' : ''}">${carta.texto}</span>`}</span>
        </span>
      </button>`).join('')}</div>`;
    const botones = [...ctx.escena.querySelectorAll('.mj-carta')];
    let abiertas = [], bloqueado = false, aciertos = 0;
    const descripcion = (carta, i) => `Carta ${i + 1}: ${carta.emoji ? `dibujo de ${carta.habla}` : carta.texto}`;

    botones.forEach((boton, i) => boton.addEventListener('click', () => {
      if (bloqueado || boton.classList.contains('volteada') || boton.classList.contains('acertada')) return;
      boton.classList.add('volteada');
      boton.setAttribute('aria-label', descripcion(cartas[i], i));
      if (cartas[i].silabas) ctx.hablarSilabas(cartas[i].silabas, cartas[i].habla); else ctx.hablar(cartas[i].habla);
      abiertas.push(i);
      if (abiertas.length < 2) return;
      bloqueado = true;
      const [a, b] = abiertas;
      if (cartas[a].id === cartas[b].id) {
        [a, b].forEach(k => { botones[k].classList.remove('volteada'); botones[k].classList.add('acertada'); botones[k].disabled = true; });
        abiertas = []; bloqueado = false; aciertos++;
        ctx.confeti(8);
        ctx.aviso('¡Pareja encontrada! 🎉', 'bien');
        if (aciertos === cartas.length / 2) setTimeout(() => ctx.ganar(), 900);
      } else {
        ctx.aviso('¡Casi! Recuerda dónde están 🧠', 'mal');
        setTimeout(() => {
          [a, b].forEach(k => { botones[k].classList.remove('volteada'); botones[k].setAttribute('aria-label', `Carta ${k + 1}, boca abajo`); });
          abiertas = []; bloqueado = false;
        }, 1000);
      }
    }));
  }
});