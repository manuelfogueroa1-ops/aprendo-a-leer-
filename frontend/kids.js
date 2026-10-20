/* Confeti y mascota Lulu: reaccionan cuando el niño acierta, se equivoca o termina. */
(() => {
  const quieto = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const piezas = ['⭐', '🎉', '✨', '💜', '🌈', '🎈'];
  const elegir = lista => lista[Math.floor(Math.random() * lista.length)];
  const bien = ['¡Muy bien!', '¡Genial!', '¡Lo lograste!', '¡Eres un campeón!', '¡Excelente! ⭐'];
  const mal = ['¡Casi! Inténtalo otra vez', '¡Tú puedes!', 'Escucha otra vez 👂', 'Mira con calma 🔍'];

  function confeti(cantidad) {
    if (quieto) return;
    for (let i = 0; i < cantidad; i++) {
      const p = document.createElement('span');
      p.className = 'kd-confeti';
      p.textContent = elegir(piezas);
      p.style.left = Math.random() * 100 + 'vw';
      p.style.fontSize = 1.2 + Math.random() * 1.6 + 'rem';
      p.style.animationDuration = 1.6 + Math.random() * 1.6 + 's';
      p.style.animationDelay = Math.random() * 0.4 + 's';
      document.body.appendChild(p);
      setTimeout(() => p.remove(), 4000);
    }
  }

  let decir = () => {};
  document.addEventListener('DOMContentLoaded', () => {
    if (!document.body.classList.contains('game-page')) return;
    const lulu = document.createElement('div');
    lulu.className = 'kd-mascota';
    lulu.setAttribute('aria-hidden', 'true');
    lulu.innerHTML = '<div class="kd-buho">🦉</div><div class="kd-globo"></div>';
    document.body.appendChild(lulu);
    const globo = lulu.querySelector('.kd-globo');
    let reloj;
    decir = (texto, animo) => {
      globo.textContent = texto;
      lulu.dataset.animo = animo;
      lulu.classList.add('habla');
      clearTimeout(reloj);
      reloj = setTimeout(() => lulu.classList.remove('habla'), 3000);
    };
    decir('¡Hola! Yo te ayudo 💜', 'bien');
  });

  new MutationObserver(registros => {
    for (const r of registros) {
      const t = r.target, antes = r.oldValue || '';
      if (t.id === 'feedback' && t.classList.contains('correct') && !antes.includes('correct')) { confeti(18); decir(elegir(bien), 'bien'); }
      if (t.id === 'feedback' && t.classList.contains('incorrect') && !antes.includes('incorrect')) decir(elegir(mal), 'mal');
      if (t.id === 'finished' && antes.includes('hidden') && !t.classList.contains('hidden')) { confeti(70); decir('¡Terminaste! ¡Eres increíble! 🏆', 'bien'); }
    }
  }).observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ['class'], attributeOldValue: true });
})();
