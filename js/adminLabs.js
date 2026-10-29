/* Panel de administración: laboratorios (horario de apertura) y los ratos en que están ocupados */
import { CFG } from './config.js';
import { $, aMinutos, aHora, escapar, hoy, sumarDias } from './utils.js';
import { api } from './api.js';
import { estado, laboratorios, usoLabTodos } from './estado.js';
import { bloques } from './horario.js';
import { NOMBRE_EQUIPO } from './validacion.js';
import { mensaje, ejecutar } from './mensajes.js';

const error = (donde, texto) => { $(donde).innerHTML = `<div class="msg e">${escapar(texto)}</div>`; };
const sinConexion = { error: 'Sin conexión con el servidor.' };
let editando = null;   // id del laboratorio que se está editando (null = uno nuevo)

/* ---------- Listas del panel ---------- */
export function dibujarAdminLabs() {
  const hoyStr = hoy(), nombres = Object.fromEntries(laboratorios().map(l => [l.id, l.nombre]));

  $('#listaLabs').innerHTML = laboratorios().map(l =>
    `<li><span><b>${escapar(l.nombre)}</b> · ${l.abre}–${l.cierra}${l.ubicacion ? ' · ' + escapar(l.ubicacion) : ''}</span>` +
    `<span class="acc"><button data-lab-edit="${escapar(l.id)}">Editar</button>` +
    `<button class="peligro" data-lab-del="${escapar(l.id)}">Quitar</button></span></li>`).join('')
    || '<li class="sub">Todavía no hay laboratorios. Agrega el primero.</li>';

  $('#listaUsoLab').innerHTML = usoLabTodos().filter(u => u.fecha >= hoyStr && nombres[u.lab])
    .sort((a, b) => (a.fecha + a.inicio).localeCompare(b.fecha + b.inicio)).slice(0, 60)
    .map(u => `<li><span><b>${u.fecha}</b> · ${u.inicio}–${u.fin} · ${escapar(nombres[u.lab])}${u.motivo ? ' · ' + escapar(u.motivo) : ''}</span>` +
      `<span class="acc"><button data-uso-del="${escapar(u.lab)}|${u.fecha}|${u.inicio}|${u.fin}">Quitar</button></span></li>`).join('')
    || '<li class="sub">Sin ocupaciones registradas.</li>';
}

function clic(ev, recargar) {
  const d = ev.target.dataset, admin = estado.admin;
  if (d.labEdit !== undefined) abrirLab(d.labEdit);
  else if (d.labDel !== undefined) {
    const lab = laboratorios().find(l => l.id === d.labDel);
    ejecutar(`¿Quitar el laboratorio "${lab ? lab.nombre : ''}"? También se borran sus ocupaciones registradas.`,
      () => api.labQuitar({ admin, id: d.labDel }), recargar);
  } else if (d.usoDel) {
    const [lab, fecha, inicio, fin] = d.usoDel.split('|');
    ejecutar(`¿Quitar la ocupación del ${fecha} de ${inicio} a ${fin}?`,
      () => api.labLiberar({ admin, lab, fecha, inicio, fin }), recargar);
  }
}

/* ---------- Agregar o editar un laboratorio ---------- */
function abrirLab(id) {
  editando = id || null;
  const lab = laboratorios().find(l => l.id === id);
  $('#lTitulo').textContent = lab ? 'Editar laboratorio' : 'Agregar laboratorio';
  $('#lNombre').value = lab ? lab.nombre : '';
  $('#lUbicacion').value = lab ? lab.ubicacion : '';
  $('#lAbre').value = lab ? lab.abre : CFG.HORA_INI;
  $('#lCierra').value = lab ? lab.cierra : CFG.HORA_FIN;
  $('#lout').innerHTML = '';
  $('#modalLab').showModal();
}

async function guardarLab(recargar) {
  const nombre = $('#lNombre').value.trim(), abre = $('#lAbre').value, cierra = $('#lCierra').value;
  if (!NOMBRE_EQUIPO.test(nombre)) return error('#lout', 'Nombre inválido: usa letras, números y + - / ( ) . (máximo 30).');
  if (aMinutos(cierra) <= aMinutos(abre)) return error('#lout', 'La hora de cierre debe ser después de la de apertura.');
  let r;
  try { r = await api.labGuardar({ admin: estado.admin, id: editando, nombre, ubicacion: $('#lUbicacion').value.trim(), abre, cierra }); }
  catch (e) { r = sinConexion; }
  if (r.error) return error('#lout', r.error);
  $('#modalLab').close();
  recargar();
}

/* ---------- Registrar cuándo está ocupado ---------- */
function abrirUso() {
  if (!laboratorios().length) return mensaje('Primero agrega un laboratorio.');
  $('#uLab').innerHTML = laboratorios().map(l => `<option value="${escapar(l.id)}">${escapar(l.nombre)}</option>`).join('');
  $('#uFecha').value = estado.fecha;
  $('#uHasta').value = '';
  $('#uMotivo').value = '';
  $('#uout').innerHTML = '';
  $('#modalUsoLab').showModal();
}

async function guardarUso(recargar) {
  const fecha = $('#uFecha').value, hasta = $('#uHasta').value, inicio = $('#uIni').value, fin = $('#uFin').value;
  if (!fecha) return error('#uout', 'Elige una fecha.');
  if (aMinutos(fin) <= aMinutos(inicio)) return error('#uout', 'La hora final debe ser después de la inicial.');

  // Con "repetir cada semana hasta" se registra el mismo día de cada semana (máx. 60)
  const fechas = [fecha];
  for (let d = sumarDias(fecha, 7); hasta && d <= hasta && fechas.length < 60; d = sumarDias(d, 7)) fechas.push(d);

  let r;
  try { r = await api.labOcupar({ admin: estado.admin, lab: $('#uLab').value, fechas, inicio, fin, motivo: $('#uMotivo').value.trim() }); }
  catch (e) { r = sinConexion; }
  if (r.error) return error('#uout', r.error);
  $('#modalUsoLab').close();
  recargar();
}

/* ---------- Inicio ---------- */
export function iniciarAdminLabs(recargar) {
  const horas = bloques.map(t => `<option>${aHora(t)}</option>`).join('');
  const fines = bloques.map(t => `<option>${aHora(t + 30)}</option>`).join('');
  $('#lAbre').innerHTML = horas;    $('#lCierra').innerHTML = fines;
  $('#uIni').innerHTML = horas;     $('#uFin').innerHTML = fines;

  $('#adminLabs').onclick = ev => clic(ev, recargar);
  $('#adminUsoLab').onclick = ev => clic(ev, recargar);
  $('#nuevoLab').onclick = () => abrirLab();
  $('#nuevoUso').onclick = abrirUso;
  $('#lCerrar').onclick = () => $('#modalLab').close();
  $('#lGuardar').onclick = () => guardarLab(recargar);
  $('#uCerrar').onclick = () => $('#modalUsoLab').close();
  $('#uGuardar').onclick = () => guardarUso(recargar);
}
