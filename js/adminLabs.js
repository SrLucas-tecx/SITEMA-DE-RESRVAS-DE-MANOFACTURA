/* Panel de administración: laboratorios (horario de apertura) y los ratos en que están ocupados */
import { CFG } from './config.js';
import { $, aMinutos, aHora, escapar, hoy, sumarDias, diaSemana } from './utils.js';
import { api } from './api.js';
import { estado, laboratorios, usoLabTodos, labActual, implementosLabTodos } from './estado.js';
import { NOMBRE_EQUIPO } from './validacion.js';
import { mensaje, ejecutar } from './mensajes.js';
import { iniciarResourceList } from './resourceList.js';

const error = (donde, texto) => { $(donde).innerHTML = `<div class="msg e">${escapar(texto)}</div>`; };
const sinConexion = { error: 'Sin conexión con el servidor.' };
const DIAS_NOMBRE = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const textoDias = dias => dias.map(dia => DIAS_NOMBRE[dia]).join(', ');
const diasLab = lab => Array.isArray(lab?.diasDisponibles) && lab.diasDisponibles.length
  ? lab.diasDisponibles : CFG.DIAS_LAB_DEFAULT;
let editando = null;   // id del laboratorio que se está editando (null = uno nuevo)
let labImplementos = null;
let recursosLab = null;
let verLab = () => {}; // abre el calendario propio de un laboratorio (lo define main.js)
let alDetalle = () => {};

/* ---------- Listas del panel ---------- */
export function dibujarAdminLabs() {
  const labs = laboratorios();
  const hoyStr = hoy(), nombres = Object.fromEntries(labs.map(l => [l.id, l.nombre]));

  $('#listaLabs').innerHTML = labs.map(l =>
    `<li class="admin-lab-row"><span class="admin-row-info"><b>${escapar(l.nombre)}</b><small>${l.abre}–${l.cierra} · máximo ${((l.maxBloques ?? CFG.MAX_BLOQUES) * 30)} min${l.ubicacion ? ' · ' + escapar(l.ubicacion) : ''} · ${escapar(textoDias(diasLab(l)))}</small></span>` +
    `<span class="acc"><button class="p" data-lab-open="${escapar(l.id)}">Abrir laboratorio</button><button data-lab-ver="${escapar(l.id)}">Calendario</button><button data-lab-edit="${escapar(l.id)}">Editar</button>` +
    `<button class="peligro" data-lab-del="${escapar(l.id)}">Quitar</button></span></li>`).join('')
    || '<li class="sub">Todavía no hay laboratorios. Agrega el primero.</li>';

  const labDetalle = laboratorios().find(l => l.id === labImplementos);
  $('#adminLabLista').hidden = !!labDetalle;
  $('#adminLabDetalle').hidden = !labDetalle;
  if (labDetalle) {
    $('#adminLabNombre').textContent = labDetalle.nombre;
    $('#adminLabInfo').textContent = `${labDetalle.abre}–${labDetalle.cierra} · máximo ${(labDetalle.maxBloques ?? CFG.MAX_BLOQUES) * 30} min por reserva${labDetalle.ubicacion ? ` · ${labDetalle.ubicacion}` : ''} · ${textoDias(diasLab(labDetalle))} · requiere ${labDetalle.diasAnticipacion ?? CFG.DIAS_ANTICIPACION} días de anticipación`;
    recursosLab?.dibujar();
  } else {
    labImplementos = null;
  }

  $('#listaUsoLab').innerHTML = usoLabTodos().filter(u => u.fecha >= hoyStr && nombres[u.lab])
    .sort((a, b) => (a.fecha + a.inicio).localeCompare(b.fecha + b.inicio)).slice(0, 60)
    .map(u => `<li><span><b>${u.fecha}</b> · ${u.inicio}–${u.fin} · ${escapar(nombres[u.lab])}${u.motivo ? ' · ' + escapar(u.motivo) : ''}</span>` +
      `<span class="acc"><button data-uso-del="${escapar(u.lab)}|${u.fecha}|${u.inicio}|${u.fin}">Quitar</button></span></li>`).join('')
    || '<li class="sub">Sin ocupaciones registradas.</li>';
}

function clic(ev, recargar) {
  const boton = ev.target.closest('[data-lab-open], [data-lab-ver], [data-lab-edit], [data-lab-del], #volverLabs, #editarLabDetalle');
  if (!boton) return;
  const d = boton.dataset, admin = estado.admin;
  if (d.labOpen !== undefined) {
    labImplementos = d.labOpen;
    alDetalle();
    dibujarAdminLabs();
  } else if (d.labVer !== undefined) verLab(d.labVer);
  else if (d.labEdit !== undefined || boton.id === 'editarLabDetalle') abrirLab(d.labEdit || labImplementos);
  else if (d.labDel !== undefined) {
    const lab = laboratorios().find(l => l.id === d.labDel);
    ejecutar(`¿Quitar el laboratorio "${lab ? lab.nombre : ''}"? También se borran sus implementos, reservas y ocupaciones registradas.`,
      () => api.labQuitar({ admin, id: d.labDel }), async () => {
        if (labImplementos === d.labDel) labImplementos = null;
        await recargar();
      });
  } else if (boton.id === 'volverLabs') {
    labImplementos = null;
    dibujarAdminLabs();
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
  $('#lMaxDuracion').value = (lab ? lab.maxBloques ?? CFG.MAX_BLOQUES : CFG.MAX_BLOQUES) * 30;
  actualizarTopeDuracionLab();
  $('#lAnticipacion').value = lab ? (lab.diasAnticipacion ?? CFG.DIAS_ANTICIPACION) : CFG.DIAS_ANTICIPACION;
  const dias = diasLab(lab);
  document.querySelectorAll('#lDias input').forEach(input => { input.checked = dias.includes(Number(input.value)); });
  $('#lout').innerHTML = '';
  $('#modalLab').showModal();
}

function actualizarTopeDuracionLab() {
  const maximo = Math.max(30, aMinutos($('#lCierra').value) - aMinutos($('#lAbre').value));
  $('#lMaxDuracion').max = maximo;
  if (Number($('#lMaxDuracion').value) > maximo) $('#lMaxDuracion').value = maximo;
}

async function guardarLab(recargar) {
  const nombre = $('#lNombre').value.trim(), abre = $('#lAbre').value, cierra = $('#lCierra').value;
  const maxDuracion = $('#lMaxDuracion').value.trim(), maxBloques = Number(maxDuracion) / 30;
  if (!NOMBRE_EQUIPO.test(nombre)) return error('#lout', 'Nombre inválido: usa letras, números y + - / ( ) . (máximo 30).');
  if (aMinutos(cierra) <= aMinutos(abre)) return error('#lout', 'La hora de cierre debe ser después de la de apertura.');
  if (!maxDuracion || !Number.isInteger(maxBloques) || maxBloques < 1 ||
      Number(maxDuracion) > aMinutos(cierra) - aMinutos(abre)) {
    return error('#lout', 'La duración máxima debe ser de al menos 30 minutos y no superar el horario disponible del laboratorio.');
  }
  const valorAnticipacion = $('#lAnticipacion').value.trim();
  const diasAnticipacion = Number(valorAnticipacion);
  const diasDisponibles = [...document.querySelectorAll('#lDias input:checked')].map(input => Number(input.value));
  if (!valorAnticipacion || !Number.isInteger(diasAnticipacion) || diasAnticipacion < 0 || diasAnticipacion > 365) {
    return error('#lout', 'La anticipación debe ser un número entero entre 0 y 365 días.');
  }
  if (!diasDisponibles.length) return error('#lout', 'Selecciona al menos un día disponible.');
  let r;
  try { r = await api.labGuardar({ admin: estado.admin, id: editando, nombre, ubicacion: $('#lUbicacion').value.trim(), abre, cierra, diasAnticipacion, diasDisponibles, maxBloques }); }
  catch (e) { r = sinConexion; }
  if (r.error) return error('#lout', r.error);
  $('#modalLab').close();
  recargar();
}

/* ---------- Registrar cuándo está ocupado ---------- */
// prefill (opcional): { lab, fecha, inicio } cuando se toca una celda libre del calendario del laboratorio
export function abrirUso(prefill = {}) {
  if (!laboratorios().length) return mensaje('Primero agrega un laboratorio.');
  $('#uLab').innerHTML = laboratorios().map(l => `<option value="${escapar(l.id)}">${escapar(l.nombre)}</option>`).join('');
  $('#uLab').value = prefill.lab || (labActual() || {}).id;
  $('#uFecha').value = prefill.fecha || estado.fecha;
  $('#uSemanas').value = '1';
  document.querySelectorAll('#uDias input[type="checkbox"]').forEach(input => {
    input.checked = input.value === String(diaSemana($('#uFecha').value));
  });
  $('#uTodos').checked = false;
  $('#uIni').selectedIndex = 0;
  $('#uFin').selectedIndex = 1;
  if (prefill.inicio) {
    $('#uIni').value = prefill.inicio;
    $('#uFin').value = aHora(aMinutos(prefill.inicio) + 30);
  }
  $('#uMotivo').value = '';
  $('#uout').innerHTML = '';
  $('#modalUsoLab').showModal();
}

async function guardarUso(recargar) {
  const fecha = $('#uFecha').value, semanas = Number($('#uSemanas').value);
  const inicio = $('#uIni').value, fin = $('#uFin').value;
  if (!fecha) return error('#uout', 'Elige una fecha.');
  if (!Number.isInteger(semanas) || semanas < 1 || semanas > 52) {
    return error('#uout', 'Elige entre 1 y 52 semanas.');
  }
  if (aMinutos(fin) <= aMinutos(inicio)) return error('#uout', 'La hora final debe ser después de la inicial.');

  const dias = new Set([...document.querySelectorAll('#uDias input[type="checkbox"]:checked')]
    .filter(input => input.id !== 'uTodos').map(input => Number(input.value)));
  if ($('#uTodos').checked) for (let dia = 0; dia <= 6; dia++) dias.add(dia);
  if (!dias.size) return error('#uout', 'Selecciona al menos un día de la semana.');
  const fechas = [];
  const limite = sumarDias(fecha, semanas * 7);
  for (let dia = fecha; dia < limite; dia = sumarDias(dia, 1)) {
    if (dias.has(diaSemana(dia))) fechas.push(dia);
  }

  let r;
  try { r = await api.labOcupar({ admin: estado.admin, lab: $('#uLab').value, fechas, inicio, fin, motivo: $('#uMotivo').value.trim() }); }
  catch (e) { r = sinConexion; }
  if (r.error) return error('#uout', r.error);
  $('#modalUsoLab').close();
  recargar();
}

/* ---------- Inicio ---------- */
// Clic en un bloque ocupado del calendario del laboratorio con el modo admin activo: preguntar y quitarlo
export function quitarOcupacion(fecha, inicio, fin, recargar) {
  const lab = labActual();
  return ejecutar(`¿Quitar la ocupación de ${lab.nombre} del ${fecha} de ${inicio} a ${fin}?`,
    () => api.labLiberar({ admin: estado.admin, lab: lab.id, fecha, inicio, fin }), recargar);
}

export function iniciarAdminLabs(recargar, verCalendario, abrirDetalle) {
  verLab = verCalendario;
  alDetalle = abrirDetalle;
  recursosLab = iniciarResourceList({
    listSelector: '#listaImplementosLab',
    addSelector: '#nuevoImplementoLab',
    title: 'implemento',
    emptyText: 'Este laboratorio todavía no tiene implementos.',
    getItems: () => implementosLabTodos().filter(item => item.lab === labImplementos),
    getId: item => item.id,
    getName: item => item.nombre,
    getColor: item => item.color,
    getContext: () => ({ lab: labImplementos }),
    save: ({ id, nombre, color, context }) => api.labImplementoGuardar({
      admin: estado.admin, lab: context.lab, id, nombre, color
    }),
    remove: ({ item, context }) => api.labImplementoQuitar({
      admin: estado.admin, lab: context.lab, id: item.id
    }),
    confirmRemove: item => `¿Quitar "${item.nombre}"? No se podrá reservar en este laboratorio.`,
    onSaved: recargar
  });
  $('#adminVistaLaboratorios').onclick = ev => clic(ev, recargar);
  $('#nuevoLab').onclick = () => abrirLab();
  $('#listaUsoLab').onclick = ev => {
    const boton = ev.target.closest('[data-uso-del]');
    if (!boton) return;
    const [lab, fecha, inicio, fin] = boton.dataset.usoDel.split('|');
    ejecutar(`¿Quitar la ocupación del ${fecha} de ${inicio} a ${fin}?`,
      () => api.labLiberar({ admin: estado.admin, lab, fecha, inicio, fin }), recargar);
  };
  const horas = Array.from({ length: 48 }, (_, i) => `<option>${aHora(i * 30)}</option>`).join('');
  const fines = Array.from({ length: 48 }, (_, i) => `<option>${aHora((i + 1) * 30)}</option>`).join('');
  $('#lAbre').innerHTML = horas;    $('#lCierra').innerHTML = fines;
  $('#lAbre').onchange = actualizarTopeDuracionLab;
  $('#lCierra').onchange = actualizarTopeDuracionLab;
  $('#uIni').innerHTML = horas;     $('#uFin').innerHTML = fines;

  $('#nuevoUso').onclick = () => abrirUso();
  $('#lCerrar').onclick = () => $('#modalLab').close();
  $('#lGuardar').onclick = () => guardarLab(recargar);
  $('#uCerrar').onclick = () => $('#modalUsoLab').close();
  $('#uGuardar').onclick = () => guardarUso(recargar);
  $('#uFecha').onchange = () => {
    if ($('#uTodos').checked) return;
    document.querySelectorAll('#uDias input[type="checkbox"]').forEach(input => {
      input.checked = input.value === String(diaSemana($('#uFecha').value));
    });
  };
  $('#uTodos').onchange = () => {
    document.querySelectorAll('#uDias input[type="checkbox"]').forEach(input => {
      if (input.id !== 'uTodos') input.checked = $('#uTodos').checked;
    });
  };
  document.querySelectorAll('#uDias input[type="checkbox"]:not(#uTodos)').forEach(input => {
    input.onchange = () => {
      $('#uTodos').checked = [...document.querySelectorAll('#uDias input[type="checkbox"]:not(#uTodos)')]
        .every(dia => dia.checked);
    };
  });
}
