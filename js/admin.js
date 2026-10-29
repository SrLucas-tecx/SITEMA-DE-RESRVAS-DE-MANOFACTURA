/* Modo administrador: pantalla propia para el material, los fines de semana autorizados,
   los bloqueos y las reservas. También las acciones rápidas desde el calendario. */
import { $, aMinutos, aHora, escapar, hoy, sumarDias, nombreDia, esFinDeSemana } from './utils.js';
import { api } from './api.js';
import { estado, listaEquipos, colorDe, autorizados } from './estado.js';
import { bloques } from './horario.js';
import { NOMBRE_EQUIPO } from './validacion.js';
import { mensaje, confirmar, ejecutar } from './mensajes.js';
import { dibujarAdminLabs, iniciarAdminLabs } from './adminLabs.js';

const error = (donde, texto) => { $(donde).innerHTML = `<div class="msg e">${escapar(texto)}</div>`; };
const sinConexion = { error: 'Sin conexión con el servidor.' };

/* ---------- Pantallas: calendario o panel de administración ---------- */
export function mostrarPantalla(cual) {
  estado.pantalla = cual;
  const admin = !!estado.admin, enPanel = admin && cual === 'admin';
  $('#pantallaAdmin').hidden = !enPanel;
  $('#pantallaCalendario').hidden = enPanel;
  $('#bannerAdmin').hidden = !(admin && !enPanel);
  $('#abrirLogin').hidden = admin;
  document.body.classList.toggle('admin', admin);
  if (enPanel) dibujarAdmin();
}

function salir() {
  estado.admin = null;
  mostrarPantalla('calendario');
}

/* ---------- Entrar ---------- */
function abrirLogin() {
  $('#acod').value = '';
  $('#aout').innerHTML = '';
  $('#modalLogin').showModal();
}

async function entrar() {
  const codigo = $('#acod').value.trim();
  let r;
  try { r = await api.admin(codigo); } catch (e) { r = sinConexion; }
  if (r.error) return error('#aout', r.error);

  estado.admin = codigo;   // solo vive en memoria: al recargar la página se sale
  $('#modalLogin').close();
  mostrarPantalla('admin');
}

/* ---------- Panel: listas ---------- */
const porFecha = (a, b) => (a.fecha + a.inicio).localeCompare(b.fecha + b.inicio);

export function dibujarAdmin() {
  if (!estado.admin || estado.pantalla !== 'admin') return;
  const hoyStr = hoy();

  $('#listaEquipos').innerHTML = listaEquipos().map(e =>
    `<li><i class="chip" style="background:${colorDe(e.nombre)}"></i><b>${escapar(e.nombre)}</b>` +
    `<span class="acc"><button data-eq-edit="${escapar(e.nombre)}">Editar</button>` +
    `<button class="peligro" data-eq-del="${escapar(e.nombre)}">Quitar</button></span></li>`).join('')
    || '<li class="sub">Todavía no hay material. Agrega el primero.</li>';

  $('#listaAutorizados').innerHTML = autorizados().filter(a => a.fecha >= hoyStr)
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
    .map(a => `<li><span><b>${nombreDia(a.fecha)} ${a.fecha}</b>${a.motivo ? ' · ' + escapar(a.motivo) : ''}</span>` +
      `<span class="acc"><button data-aut-del="${a.fecha}">Quitar</button></span></li>`).join('')
    || '<li class="sub">Ninguna fecha autorizada.</li>';

  $('#listaBloqueos').innerHTML = estado.datos.blq.filter(b => b.fecha >= hoyStr).sort(porFecha)
    .map(b => `<li><span><b>${b.fecha}</b> · ${b.inicio}–${b.fin}${b.motivo ? ' · ' + escapar(b.motivo) : ''}</span>` +
      `<span class="acc"><button data-bq-del="${b.fecha}|${b.inicio}|${b.fin}">Quitar</button></span></li>`).join('')
    || '<li class="sub">Sin horarios bloqueados.</li>';

  $('#listaReservas').innerHTML = estado.datos.res.filter(x => x.fecha >= hoyStr).sort(porFecha).slice(0, 60)
    .map(x => {
      const activa = x.estado === 'Activa';
      return `<li class="${activa ? '' : 'can'}"><span><b>${x.fecha}</b> · ${x.inicio}–${x.fin} · ${escapar(x.equipos.join(', '))} · ${escapar(x.nombre)}${activa ? '' : ' (cancelado)'}</span>` +
        `<span class="acc">${activa ? `<button data-r-cancel="${x.id}">Cancelar</button>` : ''}` +
        `<button class="peligro" data-r-del="${x.id}">Eliminar</button></span></li>`;
    }).join('') || '<li class="sub">Sin reservas próximas.</li>';
  dibujarAdminLabs();
}

/* ---------- Panel: acciones ---------- */
function clicPanel(ev, recargar) {
  const d = ev.target.dataset, admin = estado.admin;
  if (d.eqEdit !== undefined) abrirEquipo(d.eqEdit);
  else if (d.eqDel !== undefined) {
    ejecutar(`¿Quitar "${d.eqDel}" de la celda? Ya no aparecerá en el calendario.`, () => api.equipoQuitar({ admin, nombre: d.eqDel }), recargar);
  } else if (d.autDel) {
    ejecutar(`¿Quitar la autorización del ${d.autDel}?`, () => api.desautorizar({ admin, fecha: d.autDel }), recargar);
  } else if (d.bqDel) {
    const [fecha, inicio, fin] = d.bqDel.split('|');
    ejecutar(`¿Quitar el bloqueo del ${fecha} de ${inicio} a ${fin}?`, () => api.desbloquear({ admin, fecha, inicio, fin }), recargar);
  } else if (d.rCancel) {
    ejecutar('¿Cancelar esta reserva? Quedará tachada en el calendario.', () => api.cancel({ id: d.rCancel, admin }), recargar);
  } else if (d.rDel) {
    ejecutar('¿Eliminar esta reserva definitivamente? No se puede deshacer.', () => api.borrar({ id: d.rDel, admin }), recargar);
  }
}

/* ---------- Material: agregar y editar ---------- */
let editando = null;   // nombre del material que se está editando (null = agregar uno nuevo)

function abrirEquipo(nombre) {
  editando = nombre || null;
  $('#eTitulo').textContent = nombre ? 'Editar material' : 'Agregar material';
  $('#eNombre').value = nombre || '';
  $('#eColor').value = nombre ? colorDe(nombre) : '#00d26a';
  $('#eout').innerHTML = '';
  $('#modalEquipo').showModal();
}

async function guardarEquipo(recargar) {
  const nombre = $('#eNombre').value.trim();
  if (!NOMBRE_EQUIPO.test(nombre)) return error('#eout', 'Nombre inválido: usa letras, números y + - / ( ) . (máximo 30).');
  let r;
  try { r = await api.equipoGuardar({ admin: estado.admin, nombre, color: $('#eColor').value, anterior: editando }); }
  catch (e) { r = sinConexion; }
  if (r.error) return error('#eout', r.error);
  $('#modalEquipo').close();
  recargar();
}

/* ---------- Fines de semana autorizados ---------- */
async function autorizar(recargar) {
  const fecha = $('#autFecha').value;
  if (!fecha || !esFinDeSemana(fecha)) return mensaje('Elige un sábado o un domingo.');
  let r;
  try { r = await api.autorizar({ admin: estado.admin, fecha, motivo: $('#autMotivo').value.trim() }); }
  catch (e) { r = sinConexion; }
  if (r.error) return mensaje(r.error);
  $('#autFecha').value = '';
  $('#autMotivo').value = '';
  recargar();
}

/* ---------- Reserva tocada en el calendario (modo admin) ---------- */
export function abrirAdminReserva(id) {
  estado.seleccionada = id;
  const x = estado.datos.res.find(y => y.id === id);
  $('#ainfo').innerHTML = `<b>${escapar(x.nombre)}</b><br>${x.fecha} · ${x.inicio}–${x.fin}<br>${escapar(x.equipos.join(', '))}` +
    (x.otros ? `<br>Otros: ${escapar(x.otros)}` : '');
  $('#adout').innerHTML = '';
  $('#modalAdmin').showModal();
}

// metodo = 'cancel' (queda tachada) o 'borrar' (se elimina de la hoja)
async function accion(metodo, pregunta, recargar) {
  if (pregunta && !(await confirmar(pregunta, { aceptar: 'Sí, eliminar', peligro: true }))) return;
  let r;
  try { r = await api[metodo]({ id: estado.seleccionada, admin: estado.admin }); } catch (e) { r = sinConexion; }
  if (r.error) return error('#adout', r.error);
  $('#modalAdmin').close();
  recargar();
}

// Clic en un bloqueo del calendario con el modo admin activo: preguntar y quitarlo
export async function quitarBloqueo(fecha, inicio, fin, recargar) {
  if (!(await confirmar(`¿Quitar el bloqueo del ${fecha} de ${inicio} a ${fin}?`, { aceptar: 'Sí, quitar', peligro: true }))) return;
  let r;
  try { r = await api.desbloquear({ admin: estado.admin, fecha, inicio, fin }); } catch (e) { r = sinConexion; }
  if (r.error) mensaje(r.error);
  else recargar();
}

/* ---------- Bloqueos (clases, mantenimiento…) ---------- */
function abrirBloqueo() {
  $('#bFecha').value = estado.fecha;
  $('#bHasta').value = '';
  $('#bMotivo').value = '';
  $('#bout').innerHTML = '';
  $('#modalBloqueo').showModal();
}

async function guardarBloqueo(recargar) {
  const fecha = $('#bFecha').value, hasta = $('#bHasta').value;
  const inicio = $('#bIni').value, fin = $('#bFin').value;
  if (!fecha) return error('#bout', 'Elige una fecha.');
  if (aMinutos(fin) <= aMinutos(inicio)) return error('#bout', 'La hora final debe ser después de la inicial.');

  // Con "repetir cada semana hasta" se bloquea el mismo día de cada semana (máx. 60)
  const fechas = [fecha];
  for (let d = sumarDias(fecha, 7); hasta && d <= hasta && fechas.length < 60; d = sumarDias(d, 7)) fechas.push(d);

  let r;
  try { r = await api.bloquear({ admin: estado.admin, fechas, inicio, fin, motivo: $('#bMotivo').value.trim() }); }
  catch (e) { r = sinConexion; }
  if (r.error) return error('#bout', r.error);
  $('#modalBloqueo').close();
  recargar();
}

/* ---------- Inicio ---------- */
export function iniciarAdmin(recargar, verLab) {
  iniciarAdminLabs(recargar, verLab);
  $('#bIni').innerHTML = bloques.map(t => `<option>${aHora(t)}</option>`).join('');
  $('#bFin').innerHTML = bloques.map(t => `<option>${aHora(t + 30)}</option>`).join('');

  // Entrar, salir y cambiar de pantalla
  $('#abrirLogin').onclick = abrirLogin;
  $('#cerrarLogin').onclick = () => $('#modalLogin').close();
  $('#entrarAdmin').onclick = entrar;
  $('#acod').onkeydown = ev => { if (ev.key === 'Enter') entrar(); };
  $('#irPanel').onclick = () => mostrarPantalla('admin');
  $('#verCalendario').onclick = () => mostrarPantalla('calendario');
  $('#salirAdmin').onclick = salir;
  $('#salirAdmin2').onclick = salir;

  // Panel
  $('#pantallaAdmin').onclick = ev => clicPanel(ev, recargar);
  $('#nuevoEquipo').onclick = () => abrirEquipo();
  $('#eCerrar').onclick = () => $('#modalEquipo').close();
  $('#eGuardar').onclick = () => guardarEquipo(recargar);
  $('#autorizar').onclick = () => autorizar(recargar);
  $('#bloquear').onclick = abrirBloqueo;
  $('#bCerrar').onclick = () => $('#modalBloqueo').close();
  $('#bGuardar').onclick = () => guardarBloqueo(recargar);

  // Reserva tocada en el calendario
  $('#aCerrar').onclick = () => $('#modalAdmin').close();
  $('#aCancelar').onclick = () => accion('cancel', null, recargar);
  $('#aBorrar').onclick = () => accion('borrar', '¿Eliminar esta reserva definitivamente? No se puede deshacer.', recargar);
}
