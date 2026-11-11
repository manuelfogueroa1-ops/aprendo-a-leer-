// Panel docente central: reportes de todos los estudiantes y administración.
'use strict';
const $ = selector => document.querySelector(selector);
const { esc, fechaCorta, detalleHtml } = window.InformeDocente;

async function api(url, opciones = {}) {
  const respuesta = await fetch(url, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    ...opciones
  });
  const datos = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok) {
    const error = new Error(datos.error || 'Ocurrió un error.');
    error.status = respuesta.status;
    if (respuesta.status === 401 && yo && !url.endsWith('/login')) mostrarLogin('Tu sesión terminó. Vuelve a ingresar.');
    throw error;
  }
  return datos;
}
const enviar = (url, cuerpo = {}) => api(url, { method: 'POST', body: JSON.stringify(cuerpo) });

// Hace cuánto tiempo, en palabras («hace 5 minutos»).
function hace(iso) {
  if (!iso) return '';
  const minutos = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutos < 1) return 'hace menos de un minuto';
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.round(minutos / 60);
  if (horas < 48) return `hace ${horas} h`;
  return `hace ${Math.round(horas / 24)} días`;
}

// ---------- Sesión ----------
let yo = null;
let refresco = null;

function mostrarLogin(mensaje = '') {
  yo = null;
  clearInterval(refresco);
  $('#vistaPanel').classList.add('hidden');
  $('#barraUsuario').classList.add('hidden');
  $('#vistaLogin').classList.remove('hidden');
  $('#estadoLogin').textContent = mensaje;
}

function mostrarPanel(datos) {
  yo = datos;
  $('#vistaLogin').classList.add('hidden');
  $('#vistaPanel').classList.remove('hidden');
  $('#barraUsuario').classList.remove('hidden');
  $('#usuarioNombre').textContent = `${datos.nombre} · ${datos.rol === 'admin' ? 'Administrador/a' : 'Profesor/a'}`;
  if (datos.nombreServidor) $('#nombreServidor').textContent = datos.nombreServidor;
  $('#pestanaAdmin').classList.toggle('hidden', datos.rol !== 'admin');
  cambiarVista('estudiantes');
  clearInterval(refresco);
  // Actualiza los reportes cada minuto mientras el panel está abierto.
  refresco = setInterval(() => { if (!document.hidden) actualizarVistaActual(true); }, 60000);
}

$('#formLogin').addEventListener('submit', async evento => {
  evento.preventDefault();
  const formulario = evento.currentTarget;
  const form = new FormData(formulario);
  const boton = $('#botonLogin');
  boton.disabled = true;
  $('#estadoLogin').textContent = '';
  try {
    await enviar('/api/panel/login', { usuario: form.get('usuario'), password: form.get('password') });
    formulario.elements.password.value = '';
    mostrarPanel(await api('/api/panel/me'));
  } catch (error) {
    $('#estadoLogin').textContent = error.message;
  } finally {
    boton.disabled = false;
  }
});

$('#salir').addEventListener('click', async () => {
  await enviar('/api/panel/logout').catch(() => {});
  mostrarLogin('Sesión cerrada.');
});

// ---------- Pestañas ----------
let vistaActual = 'estudiantes';
function cambiarVista(nombre) {
  vistaActual = nombre;
  document.querySelectorAll('.pestana').forEach(b => b.classList.toggle('activa', b.dataset.vista === nombre));
  document.querySelectorAll('.vista').forEach(v => v.classList.toggle('hidden', v.id !== `vista-${nombre}`));
  actualizarVistaActual(false);
}
document.querySelectorAll('.pestana').forEach(b => b.addEventListener('click', () => cambiarVista(b.dataset.vista)));

function actualizarVistaActual(silencioso) {
  if (vistaActual === 'estudiantes') return estudianteAbierto ? abrirEstudiante(estudianteAbierto, { actualizar: true }) : cargarEstudiantes(silencioso);
  if (vistaActual === 'equipos') return cargarEquipos();
  if (vistaActual === 'admin') return cargarAdmin();
}

// ---------- Estudiantes ----------
let estudiantes = [];
let estudianteAbierto = null;

function textoRecepcion(iso) {
  if (!iso) return '<small class="recepcion antigua">Aún no se recibe ningún avance</small>';
  const dias = (Date.now() - new Date(iso).getTime()) / 86400000;
  return `<small class="recepcion${dias > 7 ? ' antigua' : ''}">Último avance recibido: ${esc(fechaCorta(iso))}</small>`;
}

function pintarEstudiantes() {
  const texto = $('#buscar').value.trim().toLocaleLowerCase('es-CL');
  const lista = estudiantes.filter(s => `${s.Nombre} ${s.Apellido}`.toLocaleLowerCase('es-CL').includes(texto));
  const caja = $('#tarjetas');
  if (!estudiantes.length) { caja.innerHTML = '<p>Todavía no se ha recibido ningún estudiante. Vincula los computadores en «Administración».</p>'; return; }
  if (!lista.length) { caja.innerHTML = '<p>Ningún nombre coincide con la búsqueda.</p>'; return; }
  caja.innerHTML = lista.map(s => {
    const n = Number(s.Completadas || 0);
    const resumen = n ? `${n} ${n === 1 ? 'actividad' : 'actividades'} · promedio ${Math.round(s.Promedio)} %` : 'Aún sin actividades completadas';
    return `<button type="button" class="student-card" data-id="${esc(s.EstudianteID)}">
      <span class="student-icon" aria-hidden="true">📚</span>
      <span class="tcard-text">${esc(s.Nombre)} ${esc(s.Apellido)}<small>${esc(resumen)}</small>${textoRecepcion(s.UltimaRecepcion)}
        ${s.Equipos ? `<small>💻 ${esc(s.Equipos.split(',').join(', '))}</small>` : ''}</span>
      <span class="student-enter" aria-hidden="true">→</span>
    </button>`;
  }).join('');
}

async function cargarEstudiantes(silencioso = false) {
  if (!silencioso) $('#estadoLista').textContent = 'Cargando…';
  try {
    const datos = await api('/api/panel/resumen');
    estudiantes = datos.estudiantes;
    pintarEstudiantes();
    $('#estadoLista').textContent = `Actualizado: ${new Date().toLocaleTimeString('es-CL', { timeStyle: 'short' })}`;
  } catch (error) {
    $('#estadoLista').textContent = error.message;
  }
}

async function abrirEstudiante(id, { actualizar = false } = {}) {
  estudianteAbierto = id;
  $('#listaEstudiantes').classList.add('hidden');
  $('#detalleEstudiante').classList.remove('hidden');
  const caja = $('#contenidoDetalle');
  const abiertos = new Set([...caja.querySelectorAll('details[open]')].map(el => el.dataset.intento));
  if (!actualizar) caja.textContent = 'Cargando…';
  try {
    const datos = await api(`/api/panel/estudiantes/${encodeURIComponent(id)}`);
    if (estudianteAbierto !== id) return;
    const chips = `<span>Último avance recibido <b>${esc(fechaCorta(datos.ultimaRecepcion)) || '—'}</b></span>
      <span>⭐ <b>${esc(datos.minijuegos.Estrellas)}</b> estrellas en ${esc(datos.minijuegos.Jugados)} minijuegos</span>`;
    caja.innerHTML = `<p class="aviso-sincronizacion">ℹ️ Se muestra lo recibido hasta ahora. Si el alumno está trabajando en un computador sin internet, ese avance llegará cuando el equipo se reconecte.</p>`
      + detalleHtml(datos, {
        abiertos: actualizar ? abiertos : new Set(),
        chips,
        equipoDe: r => `<p class="note">💻 Computador: <b>${esc(r.Equipo)}</b> · recibido ${esc(fechaCorta(r.FechaRecepcion))}</p>`
      });
    if (!actualizar) window.scrollTo({ top: 0 });
  } catch (error) {
    caja.textContent = error.message;
  }
}

$('#buscar').addEventListener('input', pintarEstudiantes);
$('#actualizar').addEventListener('click', () => cargarEstudiantes());
$('#actualizarDetalle').addEventListener('click', () => estudianteAbierto && abrirEstudiante(estudianteAbierto, { actualizar: true }));
$('#tarjetas').addEventListener('click', evento => {
  const tarjeta = evento.target.closest('[data-id]');
  if (tarjeta) abrirEstudiante(tarjeta.dataset.id);
});
$('#volver').addEventListener('click', () => {
  estudianteAbierto = null;
  $('#detalleEstudiante').classList.add('hidden');
  $('#listaEstudiantes').classList.remove('hidden');
  cargarEstudiantes(true);
});

// ---------- Computadores ----------
function chipContacto(e) {
  if (!e.Activo) return '<span class="chip chip-no">Desvinculado</span>';
  const minutos = e.UltimoContacto ? (Date.now() - new Date(e.UltimoContacto).getTime()) / 60000 : Infinity;
  return minutos <= 5 ? '<span class="chip chip-ok">Conectado</span>' : '<span class="chip chip-espera">Sin contacto reciente</span>';
}

async function cargarEquipos() {
  try {
    const { equipos } = await api('/api/panel/equipos');
    const admin = yo?.rol === 'admin';
    $('#tablaEquipos').innerHTML = equipos.length ? `<thead><tr><th>Computador</th><th>Estado</th><th>Último contacto</th><th>Último envío de datos</th><th>Versión</th>${admin ? '<th></th>' : ''}</tr></thead>
      <tbody>${equipos.map(e => `<tr>
        <td><b>${esc(e.Nombre)}</b><br><small>Vinculado ${esc(fechaCorta(e.FechaVinculo))}</small></td>
        <td>${chipContacto(e)}</td>
        <td>${esc(fechaCorta(e.UltimoContacto)) || '—'}<br><small>${esc(hace(e.UltimoContacto))}</small></td>
        <td>${esc(fechaCorta(e.UltimoEnvio)) || '—'}<br><small>${esc(hace(e.UltimoEnvio))}</small></td>
        <td>${esc(e.VersionApp || '—')}</td>
        ${admin ? `<td>${e.Activo ? `<button type="button" class="secondary-button" data-revocar="${esc(e.DispositivoID)}" data-nombre="${esc(e.Nombre)}">Revocar acceso</button>` : ''}</td>` : ''}
      </tr>`).join('')}</tbody>` : '<tbody><tr><td>Todavía no hay computadores vinculados.</td></tr></tbody>';
    $('#estadoEquipos').textContent = '';
  } catch (error) {
    $('#estadoEquipos').textContent = error.message;
  }
}

$('#tablaEquipos').addEventListener('click', async evento => {
  const boton = evento.target.closest('[data-revocar]');
  if (!boton) return;
  if (!confirm(`¿Revocar el acceso de «${boton.dataset.nombre}»?\n\nEse computador dejará de enviar avances hasta que se vuelva a vincular con un código nuevo. Lo que ya envió se conserva.`)) return;
  try {
    await enviar(`/api/admin/equipos/${encodeURIComponent(boton.dataset.revocar)}/revocar`);
    cargarEquipos();
  } catch (error) {
    $('#estadoEquipos').textContent = error.message;
  }
});

// ---------- Mi cuenta ----------
$('#formClave').addEventListener('submit', async evento => {
  evento.preventDefault();
  const form = evento.currentTarget;
  try {
    await enviar('/api/panel/clave', { actual: form.elements.actual.value, nueva: form.elements.nueva.value });
    form.reset();
    $('#estadoClave').textContent = 'Contraseña actualizada. Se cerraron tus otras sesiones abiertas.';
  } catch (error) {
    $('#estadoClave').textContent = error.message;
  }
});

// ---------- Administración ----------
async function cargarAdmin() {
  try {
    const [{ codigos }, { usuarios }, respaldos] = await Promise.all([
      api('/api/admin/codigos'), api('/api/admin/usuarios'), api('/api/admin/respaldos')
    ]);
    const ahora = Date.now();
    $('#tablaCodigos').innerHTML = codigos.length ? `<thead><tr><th>Descripción</th><th>Creado</th><th>Vence</th><th>Usos</th><th>Estado</th><th></th></tr></thead>
      <tbody>${codigos.map(c => {
        const vigente = c.Activo && new Date(c.Expira).getTime() > ahora;
        return `<tr><td>${esc(c.Descripcion || '—')}</td><td>${esc(fechaCorta(c.FechaCreacion))}<br><small>${esc(c.CreadoPor || '')}</small></td>
          <td>${esc(fechaCorta(c.Expira))}</td><td>${esc(c.Usos)}</td>
          <td>${vigente ? '<span class="chip chip-ok">Vigente</span>' : '<span class="chip chip-no">Inactivo</span>'}</td>
          <td>${vigente ? `<button type="button" class="secondary-button" data-desactivar-codigo="${esc(c.CodigoID)}">Desactivar</button>` : ''}</td></tr>`;
      }).join('')}</tbody>` : '';
    $('#tablaUsuarios').innerHTML = `<thead><tr><th>Nombre</th><th>Usuario</th><th>Permiso</th><th>Último acceso</th><th></th></tr></thead>
      <tbody>${usuarios.map(u => `<tr><td>${esc(u.Nombre)} ${esc(u.Apellido)}</td><td>${esc(u.Usuario)}</td>
        <td>${u.Rol === 'admin' ? 'Administrador/a' : 'Profesor/a'}${u.Activo ? '' : ' <span class="chip chip-no">Desactivada</span>'}</td>
        <td>${esc(fechaCorta(u.UltimoAcceso)) || '—'}</td>
        <td>${u.Usuario === yo?.usuario ? '' : `<button type="button" class="secondary-button" data-usuario="${esc(u.UsuarioID)}" data-activo="${u.Activo ? '0' : '1'}">${u.Activo ? 'Desactivar' : 'Reactivar'}</button>`}</td></tr>`).join('')}</tbody>`;
    $('#listaRespaldos').innerHTML = respaldos.respaldos.length
      ? `<ul>${respaldos.respaldos.map(r => `<li>${esc(fechaCorta(r.fecha))} · <code>${esc(r.nombre)}</code> (${esc(Math.round(r.tamano / 1024))} KB)</li>`).join('')}</ul>`
      : '<p class="note">Todavía no hay respaldos. Se crea el primero al iniciar el servidor.</p>';
    $('#estadoAdmin').textContent = '';
  } catch (error) {
    $('#estadoAdmin').textContent = error.message;
  }
}

$('#formCodigo').addEventListener('submit', async evento => {
  evento.preventDefault();
  const form = evento.currentTarget;
  try {
    const { codigo, expira } = await enviar('/api/admin/codigos', { descripcion: form.elements.descripcion.value, dias: Number(form.elements.dias.value) });
    const caja = $('#codigoNuevo');
    const conexion = `${location.protocol === 'https:' ? location.host : location.origin}/${codigo}`;
    caja.innerHTML = `Código de conexión (cópialo ahora: no se volverá a mostrar)<code>${esc(conexion)}</code>
      <button type="button" class="secondary-button" id="copiarCodigo">📋 Copiar</button>
      <small>Pégalo tal cual en cada computador, en Acceso docente → Servidor central. Vigente hasta: ${esc(fechaCorta(expira))}</small>`;
    caja.classList.remove('hidden');
    const botonCopiar = $('#copiarCodigo');
    botonCopiar.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(conexion); botonCopiar.textContent = '✓ Copiado'; }
      catch { botonCopiar.textContent = 'Selecciónalo y copia con Ctrl+C'; }
    });
    form.elements.descripcion.value = '';
    cargarAdmin();
  } catch (error) {
    $('#estadoAdmin').textContent = error.message;
  }
});

$('#tablaCodigos').addEventListener('click', async evento => {
  const boton = evento.target.closest('[data-desactivar-codigo]');
  if (!boton) return;
  try { await enviar(`/api/admin/codigos/${boton.dataset.desactivarCodigo}/desactivar`); cargarAdmin(); } catch (error) { $('#estadoAdmin').textContent = error.message; }
});

$('#formUsuario').addEventListener('submit', async evento => {
  evento.preventDefault();
  const form = evento.currentTarget;
  try {
    await enviar('/api/admin/usuarios', Object.fromEntries(new FormData(form)));
    form.reset();
    $('#estadoUsuario').textContent = 'Cuenta creada. Entrega el usuario y la contraseña inicial a la persona por un medio seguro.';
    cargarAdmin();
  } catch (error) {
    $('#estadoUsuario').textContent = error.message;
  }
});

$('#tablaUsuarios').addEventListener('click', async evento => {
  const boton = evento.target.closest('[data-usuario]');
  if (!boton) return;
  try {
    await enviar(`/api/admin/usuarios/${boton.dataset.usuario}/activo`, { activo: boton.dataset.activo === '1' });
    cargarAdmin();
  } catch (error) {
    $('#estadoUsuario').textContent = error.message;
  }
});

// ---------- Inicio ----------
api('/api/panel/me').then(mostrarPanel).catch(() => mostrarLogin());
