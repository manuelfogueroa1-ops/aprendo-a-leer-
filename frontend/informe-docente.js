// Informe docente compartido entre el panel de cada computador y el panel central.
// Genera el HTML del detalle de un estudiante: refuerzo sugerido, intentos y respuestas.
(function () {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[character]));

function fechaCorta(iso) {
  const fecha = iso ? new Date(iso) : null;
  return fecha && !Number.isNaN(fecha.getTime()) ? fecha.toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short' }) : '';
}
// Letras que los niños suelen confundir al empezar a leer (parecidas al verlas).
const PARES_CONFUSOS = [['b', 'd'], ['p', 'q'], ['b', 'p'], ['m', 'n']];
const esParConfuso = (a, b) => PARES_CONFUSOS.some(([x, y]) => (a === x && b === y) || (a === y && b === x));

// Reúne los errores de todos los intentos para saber qué palabras cuestan más.
function analizarErrores(resultados) {
  const palabras = new Map();
  const confusiones = new Set();
  const anotar = (actividad, palabra, nota) => {
    const clave = `${actividad}|${palabra}`;
    const item = palabras.get(clave) || { actividad, palabra, veces: 0, notas: [] };
    item.veces += 1;
    if (nota && item.notas.length < 3 && !item.notas.includes(nota)) item.notas.push(nota);
    palabras.set(clave, item);
  };
  for (const r of resultados) {
    const tipo = r.detalle?.actividad;
    for (const x of Array.isArray(r.detalle?.respuestas) ? r.detalle.respuestas : []) {
      if (tipo === 'silabas' && x.correcta === false) anotar(tipo, x.palabra, `formó “${x.respuesta}”`);
      if (tipo === 'silabas_iniciales' && x.correcta === false) anotar(tipo, x.palabra, `eligió “${x.respuesta}”`);
      if ((tipo === 'letras' || tipo === 'letras_iniciales') && x.correcta === false) {
        anotar(tipo, x.palabra, `eligió “${x.letraElegida}”${x.letraCorrecta ? `, era “${x.letraCorrecta}”` : ''}`);
        if (x.letraCorrecta && esParConfuso(x.letraElegida, x.letraCorrecta)) confusiones.add([x.letraElegida, x.letraCorrecta].sort().join('/'));
      }
      if (tipo === 'unir-palabra-imagen' && x.correctaPrimerIntento === false) {
        anotar(tipo, x.palabra, `la unió después de ${x.intentos} intentos`);
      }
      if (tipo === 'cuento' && x.correcta === false) {
        anotar(tipo, x.palabra, `eligió “${x.letraElegida}”, era “${x.letraCorrecta}”`);
        if (esParConfuso(x.letraElegida, x.letraCorrecta)) confusiones.add([x.letraElegida, x.letraCorrecta].sort().join('/'));
      }
      if (tipo === 'pronunciacion') {
        const fallos = (x.intentos || []).filter(i => i.correcta === false);
        const conAudio = (x.intentos || []).some(i => i.audio);
        if (conAudio) continue; // con grabación, la profesora la escucha: no hay nada que "reforzar" automáticamente
        if (x.confirmadaComoPracticada) anotar(tipo, x.palabra, 'la marcó como practicada');
        else if (fallos.length) anotar(tipo, x.palabra, fallos[0].escuchado ? `escuchó “${fallos[0].escuchado}”` : '');
      }
    }
  }
  return { palabras: [...palabras.values()].sort((a, b) => b.veces - a.veces), confusiones: [...confusiones] };
}

const NOMBRE_ACTIVIDAD = {
  silabas: 'Sílabas',
  silabas_iniciales: 'Sílabas iniciales',
  letras: 'Letras',
  letras_iniciales: 'Letras iniciales',
  pronunciacion: 'Pronunciación',
  cuento: 'Cuento',
  'unir-palabra-imagen': 'Unir palabra e imagen'
};
function bloqueRefuerzo(resultados) {
  if (!resultados.length) return '';
  const { palabras, confusiones } = analizarErrores(resultados);
  if (!palabras.length) return '<section class="reinforce reinforce-ok"><h4>Para reforzar</h4><p>🎉 Sin errores registrados en sus actividades.</p></section>';
  const tipos = new Set(palabras.map(p => p.actividad));
  const ideas = [];
  if (tipos.has('silabas')) ideas.push('<b>Sílabas:</b> separa la palabra con palmadas (ca-sa) y deja que la arme con tarjetas antes de repetir la actividad.');
  if (tipos.has('silabas_iniciales')) ideas.push('<b>Sílabas iniciales:</b> practiquen una familia de consonante a la vez (pa-pe-pi-po-pu), leyendo cada combinación en voz alta.');
  if (tipos.has('unir-palabra-imagen')) ideas.push('<b>Unir palabra e imagen:</b> lean la palabra en voz alta, nombren el dibujo y después busquen juntos las letras que aparecen en ambos.');
  if (tipos.has('letras') || tipos.has('letras_iniciales')) ideas.push(confusiones.length
    ? `<b>Letras:</b> confunde ${confusiones.map(esc).join(' y ')}. Trabaja una letra a la vez, con su sonido y su trazo (letras de lija o escritas en arena), y evita enseñar juntas las que se parecen.`
    : '<b>Letras:</b> pídele que diga la palabra completa en voz alta antes de elegir la letra que falta.');
  if (tipos.has('cuento')) ideas.push('<b>Cuento:</b> lean el cuento juntos en voz alta y pídele que diga la palabra completa antes de elegir la letra que falta.');
  if (tipos.has('pronunciacion')) ideas.push('<b>Pronunciación:</b> di la palabra despacio y repítanla juntos, por sílabas. Si el micrófono no la reconoce, escúchalo tú: puede ser el equipo y no el niño.');
  return `<section class="reinforce"><h4>Para reforzar</h4>
    <ul class="weak-words">${palabras.slice(0, 6).map(p => `<li><b>${esc(p.palabra)}</b> <span class="tag">${NOMBRE_ACTIVIDAD[p.actividad]}</span> — ${p.veces} ${p.veces === 1 ? 'vez' : 'veces'}${p.notas.length ? `<small>${p.notas.map(esc).join(' · ')}</small>` : ''}</li>`).join('')}</ul>
    <h5>Ideas para trabajar</h5><ul>${ideas.map(i => `<li>${i}</li>`).join('')}</ul>
    <p class="note">Sugerencias automáticas a partir de sus respuestas. No reemplazan tu criterio como profesora.</p></section>`;
}

function lineasRespuesta(detalle) {
  const tipo = detalle?.actividad;
  const lista = Array.isArray(detalle?.respuestas) ? detalle.respuestas : [];
  if (!lista.length) return '<li class="ans-none">No hay detalle guardado de este intento.</li>';
  return lista.map(x => {
    const palabra = `<b>${esc(x.palabra)}</b>`;
    if (tipo === 'silabas') return x.correcta ? `<li class="ans-ok">✓ ${palabra}</li>` : `<li class="ans-bad">✗ ${palabra} — formó “${esc(x.respuesta)}”</li>`;
    if (tipo === 'silabas_iniciales') return x.correcta ? `<li class="ans-ok">✓ ${palabra}</li>` : `<li class="ans-bad">✗ ${palabra} — eligió “${esc(x.respuesta)}”</li>`;
    if (tipo === 'letras' || tipo === 'letras_iniciales') return x.correcta ? `<li class="ans-ok">✓ ${palabra}</li>`
      : `<li class="ans-bad">✗ ${palabra} — eligió “${esc(x.letraElegida)}”${x.letraCorrecta ? `, era “${esc(x.letraCorrecta)}”` : ''}</li>`;
    if (tipo === 'cuento') {
      return x.correcta ? `<li class="ans-ok">✓ ${palabra}</li>`
        : `<li class="ans-bad">✗ ${palabra} — eligió “${esc(x.letraElegida)}”, era “${esc(x.letraCorrecta)}”</li>`;
    }
    if (tipo === 'pronunciacion') {
      const grabacion = (x.intentos || []).find(i => i.audio);
      if (grabacion) {
        return grabacion.audioGuardado === false
          ? `<li class="ans-warn">⚠ ${palabra} — se grabó, pero el audio no se pudo guardar</li>`
          : `<li class="ans-ok">🎙️ ${palabra} — grabación guardada (escúchala más abajo)</li>`;
      }
      const fallos = (x.intentos || []).filter(i => i.correcta === false);
      const oidos = fallos.map(i => i.escuchado).filter(Boolean).map(o => `“${esc(o)}”`).join(', ');
      if (x.confirmadaComoPracticada) return `<li class="ans-warn">⚠ ${palabra} — la marcó como practicada, el micrófono no la confirmó${oidos ? ` (escuchó ${oidos})` : ''}</li>`;
      return `<li class="ans-ok">✓ ${palabra}${fallos.length ? ` — a la ${fallos.length + 1}.ª vez${oidos ? ` (antes escuchó ${oidos})` : ''}` : ''}</li>`;
    }
    if (tipo === 'unir-palabra-imagen') {
      return x.correctaPrimerIntento
        ? `<li class="ans-ok">✓ ${palabra} — unió la imagen correcta al primer intento</li>`
        : `<li class="ans-warn">✓ ${palabra} — la unió correctamente al intento ${esc(x.intentos)}</li>`;
    }
    return `<li>${palabra}</li>`;
  }).join('');
}

function lineasAvance(avance) {
  if (!avance) return '<li class="ans-none">Todavía no hay un punto de avance sincronizado para este intento. Los registros anteriores a esta mejora no incluyen ese detalle.</li>';
  const porcentaje = Math.round(avance.Completadas / avance.TotalPreguntas * 100);
  return `<li class="ongoing-progress">
    <b>${esc(avance.Completadas)} de ${esc(avance.TotalPreguntas)} completadas (${esc(porcentaje)} %)</b>
    <progress max="${esc(avance.TotalPreguntas)}" value="${esc(avance.Completadas)}" aria-label="Avance del intento"></progress>
    <span>Último punto guardado: pregunta ${esc(avance.PreguntaActual)} de ${esc(avance.TotalPreguntas)}.</span>
    <span><b>Está trabajando en:</b> ${esc(avance.Consigna)}</span>
    <span><b>Respuesta o situación:</b> ${esc(avance.RespuestaActual || 'Aún no ha respondido esta pregunta.')}</span>
    <span>Faltan ${esc(avance.TotalPreguntas - avance.Completadas)} por completar. ${avance.Pausada ? 'La actividad estaba en pausa al guardar.' : ''}</span>
    <small>Última sincronización: ${esc(fechaCorta(avance.FechaActualizacion))}. Este registro muestra el último avance recibido.</small>
  </li>`;
}

  // datos: { estudiante, resultados }. opciones:
  //  - abiertos: Set con los ResultadoID cuyos detalles estaban desplegados.
  //  - audiosDe(r), equipoDe(r): HTML adicional para cada intento.
  //  - chips: HTML adicional en la fila de indicadores.
  function detalleHtml({ estudiante, resultados }, { abiertos = new Set(), audiosDe = () => '', equipoDe = () => '', chips = '' } = {}) {
    const hechos = resultados.filter(r => r.Estado === 'Completada');
    const enCurso = resultados.filter(r => r.Estado === 'En progreso');
    const promedio = hechos.length ? Math.round(hechos.reduce((t, r) => t + (r.Puntuacion || 0), 0) / hechos.length) : null;
    return `<h3 class="detail-name">${esc(estudiante.Nombre)} ${esc(estudiante.Apellido)}</h3>
      <div class="detail-chips">
        <span><b>${hechos.length}</b> ${hechos.length === 1 ? 'intento completado' : 'intentos completados'}</span>
        <span><b>${enCurso.length}</b> ${enCurso.length === 1 ? 'intento en progreso' : 'intentos en progreso'}</span>
        <span>Promedio <b>${promedio === null ? '—' : `${promedio} %`}</b></span>
        <span>Última vez <b>${esc(fechaCorta(resultados[0]?.FechaInicio)) || '—'}</b></span>
        ${chips}
      </div>
      ${bloqueRefuerzo(hechos)}
      <h4>Registro de actividades</h4>
      ${resultados.length ? resultados.map(r => {
        const completado = r.Estado === 'Completada';
        const enProgreso = r.Estado === 'En progreso';
        const estado = completado ? 'Completada' : enProgreso ? 'En progreso' : r.Estado;
        const resultado = completado
          ? `${esc(Math.round(r.Puntuacion ?? 0))} % <small>(${esc(r.Aciertos)}/${esc(Number(r.Aciertos) + Number(r.Errores))})</small>`
          : `<span class="attempt-state">${esc(estado)}</span>${enProgreso && r.avance ? ` <small>${esc(r.avance.Completadas)}/${esc(r.avance.TotalPreguntas)} completadas</small>` : ''}`;
        const detalle = completado
          ? lineasRespuesta(r.detalle)
          : enProgreso ? lineasAvance(r.avance) : '<li class="ans-none">Esta actividad no se completó.</li>';
        return `<details class="attempt" data-intento="${esc(r.ResultadoID)}"${abiertos.has(String(r.ResultadoID)) ? ' open' : ''}>
        <summary><span class="attempt-name">${esc(r.Actividad)}</span><span>${esc(fechaCorta(r.FechaInicio))}</span>
          <span class="score">${resultado}</span></summary>
        <ul class="answers">${detalle}</ul>
        ${audiosDe(r)}
        ${completado ? `<p class="note">Duración: ${esc(r.DuracionSegundos ?? '—')} s</p>` : ''}
        ${equipoDe(r)}
      </details>`;
      }).join('') : '<p>Todavía no hay actividades registradas.</p>'}`;
  }

  window.InformeDocente = { esc, fechaCorta, analizarErrores, bloqueRefuerzo, lineasRespuesta, lineasAvance, detalleHtml };
})();
