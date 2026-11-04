/* Popups: apartar una reserva (uno o varios días) y cancelarla */
import { CFG } from './config.js';
import { $, aMinutos, aHora, ahora, escapar, nombreDia, diaDelMes, sumarDias, diaSemana } from './utils.js';
import { validar, fechaMinima } from './validacion.js';
import { api } from './api.js';
import { estado, nombresEquipos, colorDe, autorizados, diaProhibido, laboratorios, implementosDeLab, reservasLabTodos, usoLabTodos } from './estado.js';
import { bloques } from './horario.js';

const casillas = () => [...document.querySelectorAll('#eq input')];
let fechasSel = [];   // días elegidos para esta reserva
let equiposPorFecha = new Map();
let fechasPersonalizadas = new Set();
let reservaLab = null;
let tipoCancelar = 'celda';

// "2026-10-28" -> "mié 28/10"
const etiqueta = f => `${nombreDia(f)} ${diaDelMes(f)}/${f.slice(5, 7)}`;
const disponibleLab = (lab, fecha) =>
  (Array.isArray(lab.diasDisponibles) ? lab.diasDisponibles : CFG.DIAS_LAB_DEFAULT).includes(diaSemana(fecha));

function actualizarDuraciones() {
  const inicio = aMinutos($('#inicio').value);
  const cierre = aMinutos(reservaLab ? reservaLab.cierra : CFG.HORA_FIN);
  const disponibles = Math.max(0, Math.floor((cierre - inicio) / 30));
  const autorizada = !!estado.admin && $('#autorizarTiempoExtendido').checked;
  const limite = Math.min(disponibles, autorizada
    ? disponibles
    : reservaLab ? reservaLab.maxBloques ?? CFG.MAX_BLOQUES : CFG.MAX_BLOQUES_CELDA);
  const anterior = Number($('#dur').value);
  $('#dur').innerHTML = Array.from({ length: limite }, (_, i) => {
    const minutos = (i + 1) * 30;
    const texto = minutos < 60 ? `${minutos} min`
      : `${Math.floor(minutos / 60)} h${minutos % 60 ? ` ${minutos % 60} min` : ''}`;
    return `<option value="${i + 1}">${texto}</option>`;
  }).join('');
  if (limite) $('#dur').value = String(anterior >= 1 && anterior <= limite ? anterior : 1);
}

function primerDiaLab(lab, fecha) {
  let dia = fecha;
  while (diaProhibido(dia) || !disponibleLab(lab, dia)) dia = sumarDias(dia, 1);
  return dia;
}

/* ---------- Días elegidos (chips con ✕) ---------- */
function dibujarFechas() {
  $('#fechasSel').innerHTML = fechasSel.map(f =>
    `<span class="fchip">${etiqueta(f)} <button type="button" data-q="${f}" title="Quitar">✕</button></span>`).join('');
  dibujarEquiposPorFecha();
}

function dibujarEquiposPorFecha() {
  const contenedor = $('#eqPorFecha');
  if (!$('#variosDias').checked || fechasSel.length < 2) {
    contenedor.innerHTML = '';
    return;
  }
  const opciones = casillas();
  contenedor.innerHTML = fechasSel.map(fecha =>
    `<section class="eq-dia"><b>Material para ${etiqueta(fecha)}</b><div class="eq">` +
      (opciones.length ? opciones.map(c =>
        `<label><input type="checkbox" data-fecha="${fecha}" value="${escapar(c.value)}"${equiposPorFecha.get(fecha)?.includes(c.value) ? ' checked' : ''}>${escapar(c.value)}</label>`).join('')
        : '<span class="sub">Selecciona primero el material que quieres reservar.</span>') +
    '</div></section>').join('');
}

function agregarFecha() {
  const f = $('#fechaR').value;
  $('#fechaR').value = '';
  if (!f || fechasSel.includes(f)) return;
  const diasAnticipacion = reservaLab?.diasAnticipacion ?? CFG.DIAS_ANTICIPACION;
  const minimo = fechaMinima(diasAnticipacion);
  if (f < minimo) {
    const recurso = reservaLab ? 'Este laboratorio' : 'La celda';
    $('#out').innerHTML = `<div class="msg e">${recurso} requiere ${diasAnticipacion} días de anticipación. Primer día disponible: ${minimo}.</div>`;
    return;
  }
  if (reservaLab && !disponibleLab(reservaLab, f)) {
    $('#out').innerHTML = '<div class="msg e">Este laboratorio no está disponible ese día de la semana.</div>';
    return;
  }
  if (diaProhibido(f)) {
    $('#out').innerHTML = '<div class="msg e">Los sábados y domingos no se pueden apartar (solo con autorización del administrador).</div>';
    return;
  }
  if ($('#variosDias').checked && fechasSel.length && f.slice(0, 7) !== fechasSel[0].slice(0, 7)) {
    $('#out').innerHTML = '<div class="msg e">Todas las fechas de una reserva deben pertenecer al mismo mes.</div>';
    return;
  }
  if ($('#variosDias').checked && fechasSel.length >= CFG.MAX_DIAS) {
    $('#out').innerHTML = `<div class="msg e">Máximo ${CFG.MAX_DIAS} fechas por reserva.</div>`;
    return;
  }
  $('#out').innerHTML = '';
  if (!$('#variosDias').checked) {
    fechasSel = [];
    equiposPorFecha.clear();
    fechasPersonalizadas.clear();
  }
  fechasSel.push(f);
  fechasSel.sort();
  equiposPorFecha.set(f, casillas().filter(c => c.checked).map(c => c.value));
  dibujarFechas();
}

// El material lo registra el administrador, por eso se dibuja cada vez que se abre el popup
function dibujarEquipos(equipos = nombresEquipos().map(nombre => ({ nombre, color: colorDe(nombre) }))) {
  $('#eq').innerHTML = equipos.map(e =>
    `<label><input type="checkbox" value="${escapar(e.nombre)}"><i class="chip" style="background:${e.color}"></i>${escapar(e.nombre)}</label>`).join('')
    || '<span class="sub">Todavía no hay material registrado.</span>';
}

/* ---------- Abrir popups ---------- */
// Con hora y equipo (clic en una celda libre) deja el formulario ya llenado
export function abrirApartar(fecha, inicio, equipo) {
  reservaLab = null;
  $('#apartTitulo').textContent = 'Apartar';
  $('#autorizarTiempoExtendidoLabel').hidden = !estado.admin;
  $('#autorizarTiempoExtendido').checked = false;
  const minimo = fechaMinima();
  $('#fechaR').min = minimo;
  let primero = minimo;                       // primer día que se puede apartar (sin fin de semana cerrado)
  while (diaProhibido(primero)) primero = sumarDias(primero, 1);
  fechasSel = [fecha && fecha >= minimo && !diaProhibido(fecha) ? fecha : primero];
  dibujarEquipos();
  equiposPorFecha = new Map();
  fechasPersonalizadas = new Set();
  $('#variosDias').checked = false;
  $('#controlesVariosDias').hidden = true;
  $('#fechaR').value = '';
  $('#personas').value = '';
  if (inicio) {
    $('#inicio').value = inicio;
    casillas().forEach(c => c.checked = (c.value === equipo));
  }
  actualizarDuraciones();
  equiposPorFecha.set(fechasSel[0], casillas().filter(c => c.checked).map(c => c.value));
  dibujarFechas();
  $('#formApartar').hidden = false;
  $('#exito').hidden = true;
  $('#out').innerHTML = '';
  $('#modalApartar').showModal();
}

export function abrirApartarLab(fecha, inicio, labId, nombreImplemento) {
  const lab = laboratorios().find(l => l.id === labId);
  if (!lab) return;
  reservaLab = lab;
  $('#apartTitulo').textContent = `Apartar en ${lab.nombre}`;
  $('#autorizarTiempoExtendidoLabel').hidden = !estado.admin;
  $('#autorizarTiempoExtendido').checked = false;
  const minimo = fechaMinima(lab.diasAnticipacion ?? CFG.DIAS_ANTICIPACION);
  $('#fechaR').min = minimo;
  const primero = primerDiaLab(lab, minimo);
  fechasSel = [fecha && fecha >= minimo && !diaProhibido(fecha) && disponibleLab(lab, fecha) ? fecha : primero];
  const disponibles = inicio ? implementosDeLab(lab).filter(item =>
    !usoLabTodos().some(u => u.lab === lab.id && u.fecha === fechasSel[0] && aMinutos(inicio) < aMinutos(u.fin) && aMinutos(inicio) >= aMinutos(u.inicio)) &&
    !reservasLabTodos().some(r => r.estado === 'Activa' && r.lab === lab.id && r.fecha === fechasSel[0] &&
      aMinutos(r.inicio) <= aMinutos(inicio) && aMinutos(inicio) < aMinutos(r.fin) && r.equipos.includes(item.nombre)))
    : implementosDeLab(lab);
  dibujarEquipos(disponibles);
  equiposPorFecha = new Map();
  fechasPersonalizadas = new Set();
  $('#variosDias').checked = false;
  $('#controlesVariosDias').hidden = true;
  $('#fechaR').value = '';
  $('#personas').value = '';
  if (inicio) {
    $('#inicio').value = inicio;
    casillas().forEach(c => c.checked = c.value === nombreImplemento);
  }
  actualizarDuraciones();
  equiposPorFecha.set(fechasSel[0], casillas().filter(c => c.checked).map(c => c.value));
  dibujarFechas();
  $('#formApartar').hidden = false;
  $('#exito').hidden = true;
  $('#out').innerHTML = '';
  $('#modalApartar').showModal();
}

export function abrirCancelar(id, tipo = 'celda') {
  tipoCancelar = tipo;
  estado.seleccionada = id;
  const x = (tipo === 'lab' ? reservasLabTodos() : estado.datos.res).find(y => y.id === id);
  const laboratorio = tipo === 'lab' ? laboratorios().find(l => l.id === x.lab) : null;
  $('#cinfo').textContent = `${x.fecha} · ${laboratorio ? laboratorio.nombre + ' · ' : ''}${x.nombre} · ${x.equipos.join(', ')} · ${x.inicio}–${x.fin}${x.personas ? ` · ${x.personas} personas` : ''}`;
  $('#cout').innerHTML = '';
  $('#modalCancelar').showModal();
}

/* ---------- Acciones ---------- */
async function apartar(recargar) {
  if (CFG.API_URL && estado.datos.version !== CFG.SCRIPT_VERSION) {
    $('#out').innerHTML = '<div class="msg e">El servidor de reservas está desactualizado. Pide al administrador que publique la nueva versión antes de apartar.</div>';
    return;
  }
  const inicio = $('#inicio').value;
  agregarFecha();   // si dejaron una fecha escrita sin agregar, se cuenta
  const r = {
    nombre: $('#nombre').value,
    matricula: $('#matricula').value,
    otros: $('#otros').value.trim(),
    inicio: inicio,
    fin: aHora(aMinutos(inicio) + 30 * $('#dur').value),
    autorizarDuracion: $('#autorizarTiempoExtendido').checked,
    admin: $('#autorizarTiempoExtendido').checked ? estado.admin : undefined,
    equipos: casillas().filter(c => c.checked).map(c => c.value),
    equiposPorFecha: fechasSel.map(fecha => ({
      fecha,
      equipos: equiposPorFecha.get(fecha) || casillas().filter(c => c.checked).map(c => c.value)
    })),
    variosDias: $('#variosDias').checked,
    personas: $('#personas').value,
    fechas: [...fechasSel]
  };

  // Primero se valida aquí cada día; el servidor vuelve a validar al guardar
  $('#out').innerHTML = '';
  const activas = estado.datos.res.filter(x => x.estado === 'Activa');
  if (!r.fechas.length) {
    $('#out').innerHTML = '<div class="msg e">Elige al menos un día.</div>';
    return;
  }
  const personas = Number(r.personas);
  if (!r.personas || !Number.isSafeInteger(personas) || personas < 1) {
    $('#out').innerHTML = '<div class="msg e">Escribe un número entero de personas (mínimo 1).</div>';
    return;
  }
  r.personas = personas;
  for (const f of r.fechas) {
    const equiposDia = r.equiposPorFecha.find(dia => dia.fecha === f)?.equipos || [];
    let error;
    if (reservaLab) {
      const inicioMin = aMinutos(r.inicio), finMin = aMinutos(r.fin);
      const maxBloques = reservaLab.maxBloques ?? CFG.MAX_BLOQUES;
      const diasAnticipacion = reservaLab.diasAnticipacion ?? CFG.DIAS_ANTICIPACION;
      const minimo = fechaMinima(diasAnticipacion);
      if (!r.nombre.trim() || r.nombre.trim().length < 3) error = 'Escribe tu nombre completo.';
      else if (!r.matricula.trim() || r.matricula.trim().length < 4) error = 'Escribe tu matrícula.';
      else if (!equiposDia.length) error = 'Elige al menos un implemento para este día.';
      else if (f < minimo) error = `Este laboratorio requiere ${diasAnticipacion} días de anticipación. Primer día disponible: ${minimo}.`;
      else if (!disponibleLab(reservaLab, f)) error = 'Este laboratorio no está disponible ese día de la semana.';
      else if (diaProhibido(f)) error = 'Los sábados y domingos no se pueden apartar (solo con autorización del administrador).';
      else if (finMin - inicioMin > 30 * maxBloques && !(r.autorizarDuracion && estado.admin)) error = `Duración máxima: ${maxBloques * 30} minutos. El administrador debe autorizar más tiempo.`;
      else if (inicioMin < aMinutos(reservaLab.abre) || finMin > aMinutos(reservaLab.cierra)) error = 'Fuera del horario de apertura del laboratorio.';
      else if (f + ' ' + r.inicio < ahora()) error = 'Ese horario ya pasó.';
      else if (usoLabTodos().some(u => u.lab === reservaLab.id && u.fecha === f && inicioMin < aMinutos(u.fin) && finMin > aMinutos(u.inicio))) error = 'El laboratorio está ocupado por una actividad.';
      else if (reservasLabTodos().some(x => x.estado === 'Activa' && x.lab === reservaLab.id && x.fecha === f && inicioMin < aMinutos(x.fin) && finMin > aMinutos(x.inicio) && x.equipos.some(e => equiposDia.includes(e)))) error = 'Uno de los implementos ya está reservado en ese horario.';
    } else {
      error = validar({ ...r, fecha: f, equipos: equiposDia }, activas, estado.datos.blq, autorizados(), {
        maxBloques: Number(estado.datos.configuracionCelda?.maxBloques) || CFG.MAX_BLOQUES_CELDA,
        duracionAutorizada: r.autorizarDuracion && !!estado.admin
      });
    }
    if (error) {
      const dia = r.fechas.length > 1 ? etiqueta(f) + ': ' : '';
      $('#out').innerHTML = `<div class="msg e">${escapar(dia + error)}</div>`;
      return;
    }
  }

  $('#apartar').disabled = true;
  let respuesta;
  try { respuesta = reservaLab ? await api.createLab({ ...r, lab: reservaLab.id }) : await api.create(r); }
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
    $('#personas').value = '';
    reservaLab = null;
  }
  recargar();
}

async function cancelar(recargar) {
  let respuesta;
  try {
    respuesta = await api.cancel({ id: estado.seleccionada, tipo: tipoCancelar, matricula: $('#cmat').value, codigo: $('#ccod').value });
  } catch (e) {
    respuesta = { error: 'Sin conexión con el servidor.' };
  }

  if (respuesta.error) {
    $('#cout').innerHTML = `<div class="msg e">${escapar(respuesta.error)}</div>`;
  } else {
    $('#cout').innerHTML = `<div class="msg">${tipoCancelar === 'lab' ? 'Reserva cancelada. El implemento quedó disponible.' : 'Reserva cancelada. El horario quedó libre.'}</div>`;
    $('#ccod').value = '';
    recargar();
  }
}

/* ---------- Inicio ---------- */
// recargar = función que vuelve a leer los datos y redibuja
export function iniciarModales(recargar) {
  // Llenar selects y casillas del formulario
  $('#inicio').innerHTML = bloques.map(t => `<option>${aHora(t)}</option>`).join('');
  actualizarDuraciones();
  $('#inicio').onchange = actualizarDuraciones;
  $('#autorizarTiempoExtendido').onchange = actualizarDuraciones;

  // Días: al elegir una fecha se agrega; la ✕ la quita
  $('#fechaR').onchange = agregarFecha;
  $('#modalApartar').addEventListener('close', () => { reservaLab = null; });
  $('#fechasSel').onclick = ev => {
    const q = ev.target.dataset.q;
    if (!q) return;
    fechasSel = fechasSel.filter(f => f !== q);
    equiposPorFecha.delete(q);
    fechasPersonalizadas.delete(q);
    dibujarFechas();
  };
  $('#variosDias').onchange = () => {
    $('#controlesVariosDias').hidden = !$('#variosDias').checked;
    if (!$('#variosDias').checked && fechasSel.length > 1) {
      fechasSel = fechasSel.slice(0, 1);
      equiposPorFecha = new Map([[fechasSel[0], equiposPorFecha.get(fechasSel[0]) || []]]);
      fechasPersonalizadas = new Set(fechasPersonalizadas.has(fechasSel[0]) ? [fechasSel[0]] : []);
    }
    if (!$('#variosDias').checked) $('#fechaR').value = '';
    dibujarFechas();
  };
  $('#eq').onchange = () => {
    const seleccionados = casillas().filter(c => c.checked).map(c => c.value);
    fechasSel.forEach(fecha => {
      if (!fechasPersonalizadas.has(fecha)) equiposPorFecha.set(fecha, seleccionados);
    });
    dibujarEquiposPorFecha();
  };
  $('#eqPorFecha').onchange = ev => {
    const input = ev.target.closest('input[data-fecha]');
    if (!input) return;
    const fecha = input.dataset.fecha;
    const seleccionados = [...document.querySelectorAll('#eqPorFecha input[data-fecha]:checked')]
      .filter(c => c.dataset.fecha === fecha).map(c => c.value);
    equiposPorFecha.set(fecha, seleccionados);
    fechasPersonalizadas.add(fecha);
  };

  // Botones
  $('#abrirApartar').onclick = () => abrirApartar();
  $('#apartar').onclick = () => apartar(recargar);
  $('#cerrarApartar').onclick = () => $('#modalApartar').close();
  $('#cerrarExito').onclick = () => $('#modalApartar').close();
  $('#cancelar').onclick = () => cancelar(recargar);
  $('#cerrar').onclick = () => $('#modalCancelar').close();
}
