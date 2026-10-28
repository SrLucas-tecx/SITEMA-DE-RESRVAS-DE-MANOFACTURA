/* Modo administrador: entrar, cancelar o eliminar reservas y bloquear horarios */
import { CFG } from './config.js';
import { $, aMinutos, aHora, escapar, sumarDias } from './utils.js';
import { api } from './api.js';
import { estado } from './estado.js';
import { bloques } from './horario.js';

const error = (donde, texto) => { $(donde).innerHTML = `<div class="msg e">${escapar(texto)}</div>`; };

// Muestra u oculta lo que solo ve el administrador
function mostrarModo() {
  const activo = !!estado.admin;
  $('#bannerAdmin').hidden = !activo;
  $('#abrirLogin').hidden = activo;
  document.body.classList.toggle('admin', activo);
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
  try { r = await api.admin(codigo); }
  catch (e) { r = { error: 'Sin conexión con el servidor.' }; }
  if (r.error) return error('#aout', r.error);

  estado.admin = codigo;   // solo vive en memoria: al recargar la página se sale
  $('#modalLogin').close();
  mostrarModo();
}

/* ---------- Reservas: cancelar o eliminar ---------- */
export function abrirAdminReserva(id) {
  estado.seleccionada = id;
  const x = estado.datos.res.find(y => y.id === id);
  $('#ainfo').innerHTML = `<b>${escapar(x.nombre)}</b><br>${x.fecha} · ${x.inicio}–${x.fin}<br>${escapar(x.equipos.join(', '))}` +
    (x.otros ? `<br>Otros: ${escapar(x.otros)}` : '');
  $('#adout').innerHTML = '';
  $('#modalAdmin').showModal();
}

// metodo = 'cancel' (queda tachada) o 'borrar' (se elimina de la hoja)
async function accion(metodo, aviso, recargar) {
  if (aviso && !confirm(aviso)) return;
  let r;
  try { r = await api[metodo]({ id: estado.seleccionada, admin: estado.admin }); }
  catch (e) { r = { error: 'Sin conexión con el servidor.' }; }
  if (r.error) return error('#adout', r.error);
  $('#modalAdmin').close();
  recargar();
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
  catch (e) { r = { error: 'Sin conexión con el servidor.' }; }
  if (r.error) return error('#bout', r.error);
  $('#modalBloqueo').close();
  recargar();
}

// Clic en un bloqueo con el modo admin activo: preguntar y quitarlo
export async function quitarBloqueo(fecha, inicio, fin, recargar) {
  if (!confirm(`¿Quitar el bloqueo del ${fecha} de ${inicio} a ${fin}?`)) return;
  let r;
  try { r = await api.desbloquear({ admin: estado.admin, fecha, inicio, fin }); }
  catch (e) { r = { error: 'Sin conexión con el servidor.' }; }
  if (r.error) alert(r.error);
  else recargar();
}

/* ---------- Inicio ---------- */
export function iniciarAdmin(recargar) {
  $('#bIni').innerHTML = bloques.map(t => `<option>${aHora(t)}</option>`).join('');
  $('#bFin').innerHTML = bloques.map(t => `<option>${aHora(t + 30)}</option>`).join('');

  $('#abrirLogin').onclick = abrirLogin;
  $('#cerrarLogin').onclick = () => $('#modalLogin').close();
  $('#entrarAdmin').onclick = entrar;
  $('#acod').onkeydown = ev => { if (ev.key === 'Enter') entrar(); };
  $('#salirAdmin').onclick = () => { estado.admin = null; mostrarModo(); };

  $('#aCerrar').onclick = () => $('#modalAdmin').close();
  $('#aCancelar').onclick = () => accion('cancel', null, recargar);
  $('#aBorrar').onclick = () => accion('borrar', '¿Eliminar esta reserva definitivamente? No se puede deshacer.', recargar);

  $('#bloquear').onclick = abrirBloqueo;
  $('#bCerrar').onclick = () => $('#modalBloqueo').close();
  $('#bGuardar').onclick = () => guardarBloqueo(recargar);
}
