/* Popups: apartar una reserva y cancelarla */
import { CFG } from './config.js';
import { $, aMinutos, aHora, escapar } from './utils.js';
import { validar } from './validacion.js';
import { api } from './api.js';
import { estado } from './estado.js';
import { bloques } from './calendario.js';

const casillas = () => [...document.querySelectorAll('#eq input')];

/* ---------- Abrir popups ---------- */
// Con hora y equipo (clic en una celda libre) deja el formulario ya llenado
export function abrirApartar(inicio, equipo) {
  if (inicio) {
    $('#inicio').value = inicio;
    casillas().forEach(c => c.checked = (c.value === equipo));
  }
  $('#formApartar').hidden = false;
  $('#exito').hidden = true;
  $('#out').innerHTML = '';
  $('#resumen').textContent = 'Fecha: ' + estado.fecha;
  $('#modalApartar').showModal();
}

export function abrirCancelar(id) {
  estado.seleccionada = id;
  const x = estado.datos.res.find(y => y.id === id);
  $('#cinfo').textContent = `${x.nombre} · ${x.equipos.join(', ')} · ${x.inicio}–${x.fin}`;
  $('#cout').innerHTML = '';
  $('#modalCancelar').showModal();
}

/* ---------- Acciones ---------- */
async function apartar(recargar) {
  const inicio = $('#inicio').value;
  const r = {
    nombre: $('#nombre').value,
    matricula: $('#matricula').value,
    fecha: estado.fecha,
    inicio: inicio,
    fin: aHora(aMinutos(inicio) + 30 * $('#dur').value),
    equipos: casillas().filter(c => c.checked).map(c => c.value)
  };

  // Primero se valida aquí; el servidor vuelve a validar al guardar
  $('#out').innerHTML = '';
  const error = validar(r, estado.datos.res.filter(x => x.estado === 'Activa'), estado.datos.blq);
  if (error) {
    $('#out').innerHTML = `<div class="msg e">${error}</div>`;
    return;
  }

  $('#apartar').disabled = true;
  let respuesta;
  try { respuesta = await api.create(r); }
  catch (e) { respuesta = { error: 'Sin conexión con el servidor.' }; }
  $('#apartar').disabled = false;

  if (respuesta.error) {
    $('#out').innerHTML = `<div class="msg e">${escapar(respuesta.error)}</div>`;
  } else {
    $('#codigo').textContent = respuesta.pin;   // se muestra en el popup de éxito
    $('#formApartar').hidden = true;
    $('#exito').hidden = false;
    $('#nombre').value = '';
    $('#matricula').value = '';
  }
  recargar();
}

async function cancelar(recargar) {
  let respuesta;
  try {
    respuesta = await api.cancel({ id: estado.seleccionada, matricula: $('#cmat').value, codigo: $('#ccod').value });
  } catch (e) {
    respuesta = { error: 'Sin conexión con el servidor.' };
  }

  if (respuesta.error) {
    $('#cout').innerHTML = `<div class="msg e">${escapar(respuesta.error)}</div>`;
  } else {
    $('#cout').innerHTML = '<div class="msg">Reserva cancelada. El horario quedó libre.</div>';
    $('#ccod').value = '';
    recargar();
  }
}

/* ---------- Inicio ---------- */
// recargar = función que vuelve a leer los datos y redibuja
export function iniciarModales(recargar) {
  // Llenar selects y casillas del formulario
  $('#inicio').innerHTML = bloques.map(t => `<option>${aHora(t)}</option>`).join('');
  $('#dur').innerHTML = Array.from({ length: CFG.MAX_BLOQUES }, (_, i) =>
    `<option value="${i + 1}">${(i + 1) * 30} min</option>`).join('');
  $('#eq').innerHTML = CFG.EQUIPOS.map(e =>
    `<label><input type="checkbox" value="${e}"><i class="chip" style="background:${CFG.COLORES[e]}"></i>${e}</label>`).join('');

  // Botones
  $('#abrirApartar').onclick = () => abrirApartar();
  $('#apartar').onclick = () => apartar(recargar);
  $('#cerrarApartar').onclick = () => $('#modalApartar').close();
  $('#cerrarExito').onclick = () => $('#modalApartar').close();
  $('#cancelar').onclick = () => cancelar(recargar);
  $('#cerrar').onclick = () => $('#modalCancelar').close();
}
