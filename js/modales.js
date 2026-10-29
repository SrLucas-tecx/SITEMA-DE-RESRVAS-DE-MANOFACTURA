/* Popups: apartar una reserva (uno o varios días) y cancelarla */
import { CFG } from './config.js';
import { $, aMinutos, aHora, escapar, nombreDia, diaDelMes, sumarDias } from './utils.js';
import { validar, fechaMinima } from './validacion.js';
import { api } from './api.js';
import { estado, nombresEquipos, colorDe, autorizados, diaProhibido } from './estado.js';
import { bloques } from './horario.js';

const casillas = () => [...document.querySelectorAll('#eq input')];
let fechasSel = [];   // días elegidos para esta reserva

// "2026-10-28" -> "mié 28/10"
const etiqueta = f => `${nombreDia(f)} ${diaDelMes(f)}/${f.slice(5, 7)}`;

/* ---------- Días elegidos (chips con ✕) ---------- */
function dibujarFechas() {
  $('#fechasSel').innerHTML = fechasSel.map(f =>
    `<span class="fchip">${etiqueta(f)} <button type="button" data-q="${f}" title="Quitar">✕</button></span>`).join('');
}

function agregarFecha() {
  const f = $('#fechaR').value;
  $('#fechaR').value = '';
  if (!f || fechasSel.includes(f)) return;
  if (f < fechaMinima()) {
    $('#out').innerHTML = `<div class="msg e">Hay que apartar con ${CFG.DIAS_ANTICIPACION} días de anticipación. Primer día disponible: ${fechaMinima()}.</div>`;
    return;
  }
  if (diaProhibido(f)) {
    $('#out').innerHTML = '<div class="msg e">Los sábados y domingos no se pueden apartar (solo con autorización del administrador).</div>';
    return;
  }
  if (fechasSel.length >= CFG.MAX_DIAS) {
    $('#out').innerHTML = `<div class="msg e">Máximo ${CFG.MAX_DIAS} días por reserva.</div>`;
    return;
  }
  $('#out').innerHTML = '';
  fechasSel.push(f);
  fechasSel.sort();
  dibujarFechas();
}

// El material lo registra el administrador, por eso se dibuja cada vez que se abre el popup
function dibujarEquipos() {
  $('#eq').innerHTML = nombresEquipos().map(e =>
    `<label><input type="checkbox" value="${escapar(e)}"><i class="chip" style="background:${colorDe(e)}"></i>${escapar(e)}</label>`).join('')
    || '<span class="sub">Todavía no hay material registrado.</span>';
}

/* ---------- Abrir popups ---------- */
// Con hora y equipo (clic en una celda libre) deja el formulario ya llenado
export function abrirApartar(fecha, inicio, equipo) {
  const minimo = fechaMinima();
  $('#fechaR').min = minimo;
  let primero = minimo;                       // primer día que se puede apartar (sin fin de semana cerrado)
  while (diaProhibido(primero)) primero = sumarDias(primero, 1);
  fechasSel = [fecha && fecha >= minimo && !diaProhibido(fecha) ? fecha : primero];
  dibujarFechas();
  dibujarEquipos();
  if (inicio) {
    $('#inicio').value = inicio;
    casillas().forEach(c => c.checked = (c.value === equipo));
  }
  $('#formApartar').hidden = false;
  $('#exito').hidden = true;
  $('#out').innerHTML = '';
  $('#modalApartar').showModal();
}

export function abrirCancelar(id) {
  estado.seleccionada = id;
  const x = estado.datos.res.find(y => y.id === id);
  $('#cinfo').textContent = `${x.fecha} · ${x.nombre} · ${x.equipos.join(', ')} · ${x.inicio}–${x.fin}`;
  $('#cout').innerHTML = '';
  $('#modalCancelar').showModal();
}

/* ---------- Acciones ---------- */
async function apartar(recargar) {
  const inicio = $('#inicio').value;
  agregarFecha();   // si dejaron una fecha escrita sin agregar, se cuenta
  const r = {
    nombre: $('#nombre').value,
    matricula: $('#matricula').value,
    otros: $('#otros').value.trim(),
    inicio: inicio,
    fin: aHora(aMinutos(inicio) + 30 * $('#dur').value),
    equipos: casillas().filter(c => c.checked).map(c => c.value),
    fechas: [...fechasSel]
  };

  // Primero se valida aquí cada día; el servidor vuelve a validar al guardar
  $('#out').innerHTML = '';
  const activas = estado.datos.res.filter(x => x.estado === 'Activa');
  if (!r.fechas.length) {
    $('#out').innerHTML = '<div class="msg e">Elige al menos un día.</div>';
    return;
  }
  for (const f of r.fechas) {
    const error = validar({ ...r, fecha: f }, activas, estado.datos.blq, autorizados());
    if (error) {
      const dia = r.fechas.length > 1 ? etiqueta(f) + ': ' : '';
      $('#out').innerHTML = `<div class="msg e">${escapar(dia + error)}</div>`;
      return;
    }
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
    $('#exitoDias').textContent = r.fechas.length > 1
      ? `Se apartaron ${r.fechas.length} días (${r.fechas.map(etiqueta).join(', ')}). El mismo código sirve para cancelar cada día.`
      : '';
    $('#formApartar').hidden = true;
    $('#exito').hidden = false;
    $('#nombre').value = '';
    $('#matricula').value = '';
    $('#otros').value = '';
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

  // Días: al elegir una fecha se agrega; la ✕ la quita
  $('#fechaR').onchange = agregarFecha;
  $('#fechasSel').onclick = ev => {
    const q = ev.target.dataset.q;
    if (!q) return;
    fechasSel = fechasSel.filter(f => f !== q);
    dibujarFechas();
  };

  // Botones
  $('#abrirApartar').onclick = () => abrirApartar();
  $('#apartar').onclick = () => apartar(recargar);
  $('#cerrarApartar').onclick = () => $('#modalApartar').close();
  $('#cerrarExito').onclick = () => $('#modalApartar').close();
  $('#cancelar').onclick = () => cancelar(recargar);
  $('#cerrar').onclick = () => $('#modalCancelar').close();
}
