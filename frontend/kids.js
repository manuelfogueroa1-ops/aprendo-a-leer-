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

  // El mismo búho personalizado de la pantalla principal da las indicaciones.
  const decir = (mensaje, animo) => {
    if (!window.mascota) return;
    window.mascota.animar(animo === 'mal' ? 'anim-sacude' : 'anim-salto');
    // No hablar encima de la pronunciación de las sílabas.
    window.mascota.decir(mensaje, { voz: false });
  };
  document.addEventListener('DOMContentLoaded', () => {
    if (document.body.classList.contains('game-page')) decir('¡Hola! ¡Vamos a aprender!', 'bien');
  });

  new MutationObserver(registros => {
    for (const r of registros) {
      const t = r.target, antes = r.oldValue || '';
      if (t.id === 'feedback' && t.classList.contains('correct') && !antes.includes('correct')) { confeti(18); decir(elegir(bien), 'bien'); }
      if (t.id === 'feedback' && t.classList.contains('incorrect') && !antes.includes('incorrect')) decir(elegir(mal), 'mal');
      if (t.id === 'finished' && antes.includes('hidden') && !t.classList.contains('hidden')) { confeti(70); decir('¡Lo lograste! ¡Eres increíble!', 'bien'); }
    }
  }).observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ['class'], attributeOldValue: true });
})();

// Cursor nativo: el búho acompaña una flecha grande cuyo extremo marca el clic.
(() => {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'cursor-preference';
  let enabled = true;
  try { enabled = localStorage.getItem('lectura-cursor-buho') !== 'off'; } catch {}
  const update = () => {
    const studentPanel = document.querySelector('#estudiante');
    const studentArea = document.body.classList.contains('game-page') || (studentPanel && !studentPanel.classList.contains('hidden'));
    button.hidden = !studentArea;
    document.documentElement.classList.toggle('student-cursor', Boolean(studentArea && enabled));
    button.textContent = enabled ? '🦉 Cursor grande: activado' : '🦉 Activar cursor grande';
    button.setAttribute('aria-pressed', String(enabled));
  };
  button.addEventListener('click', () => {
    enabled = !enabled;
    try { localStorage.setItem('lectura-cursor-buho', enabled ? 'on' : 'off'); } catch {}
    update();
  });
  const drawCursor = () => {
    const owl = document.querySelector('#mascota .cuerpo > img');
    if (!owl?.complete || !owl.naturalWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.shadowColor = '#fff'; ctx.shadowBlur = 3;
    const ratio = Math.min(38 / owl.naturalWidth, 42 / owl.naturalHeight);
    ctx.drawImage(owl, 26, 20, owl.naturalWidth * ratio, owl.naturalHeight * ratio);
    ctx.shadowBlur = 0;
    ctx.beginPath(); ctx.moveTo(3, 3); ctx.lineTo(3, 42); ctx.lineTo(14, 32);
    ctx.lineTo(23, 50); ctx.lineTo(32, 45); ctx.lineTo(23, 28); ctx.lineTo(38, 27); ctx.closePath();
    ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = '#382553'; ctx.stroke();
    document.documentElement.style.setProperty('--student-cursor', `url("${canvas.toDataURL()}") 3 3, auto`);
  };
  const init = () => {
    document.body.appendChild(button);
    const panel = document.querySelector('#estudiante');
    if (panel) new MutationObserver(update).observe(panel, { attributes: true, attributeFilter: ['class'] });
    const owl = document.querySelector('#mascota .cuerpo > img');
    if (owl) { owl.addEventListener('load', drawCursor); drawCursor(); }
    update();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
