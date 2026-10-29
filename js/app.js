/* =====================================================
   RESERVAS · CELDA DE MANUFACTURA
   ===================================================== */

/* ---------- 1. CONFIGURACIÓN (lo que normalmente se edita) ---------- */
const CFG = {
  // URL del Apps Script. Si está vacía, la web funciona en modo local de pruebas.
  API_URL: 'https://script.google.com/macros/s/AKfycbxtAyCIYqkkki2b8cCBxo3QajA9FwkA3fo-XOuFO6L_UN6hROu3GHcdWClvkaD1lQHx/exec',

  HORA_INI: '08:00',   // la celda abre
  HORA_FIN: '20:00',   // la celda cierra
  MAX_BLOQUES: 3,      // bloques de 30 min por reserva (3 = 1 h 30 min)

  // Solo para pruebas en modo local. En Google Sheets el código vive en Code.gs.
  ADMIN_LOCAL: '',

  // Cada equipo tiene su color. "Banda + Cámara" va junta porque solo se usan a la vez.
  EQUIPOS: ['Celda', 'Brazo', 'Banda + Cámara', 'Cortadora'],
  COLORES: { 'Celda': '#00D26A', 'Brazo': '#2BC5C5', 'Banda + Cámara': '#F2B705', 'Cortadora': '#B79CFF' },


  // Solo modo local. Ej: { fecha: '2026-10-28', inicio: '08:00', fin: '12:00', motivo: 'Clase' }
  BLOQUEOS: []
};



/* ---------- 2. UTILIDADES ---------- */
const $ = selector => document.querySelector(selector);

// "14:30" -> 870 (minutos desde medianoche)
function aMinutos(hora) {
  const [h, min] = hora.split(':');
  return Number(h) * 60 + Number(min);
}

// 870 -> "14:30"
function aHora(minutos) {
  const h = String(Math.floor(minutos / 60)).padStart(2, '0');
  const min = String(minutos % 60).padStart(2, '0');
  return h + ':' + min;
}

const dos = n => String(n).padStart(2, '0');

// Date -> "2026-10-28"
function formatoFecha(d) {
  return d.getFullYear() + '-' + dos(d.getMonth() + 1) + '-' + dos(d.getDate());
}

const hoy = () => formatoFecha(new Date());

// "2026-10-28 14:30" (hora actual, para comparar con horarios)
function ahora() {
  const d = new Date();
  return formatoFecha(d) + ' ' + dos(d.getHours()) + ':' + dos(d.getMinutes());
}

// Suma o resta días a una fecha "YYYY-MM-DD"
function sumarDias(fecha, n) {
  const d = new Date(fecha + 'T12:00');
  d.setDate(d.getDate() + n);
  return formatoFecha(d);
}

// ¿Dos listas de equipos usan algo en común?
function chocan(a, b) {
  return a.some(equipo => b.includes(equipo));
}

// Evita que un nombre escrito por alguien rompa la página
function escapar(texto) {
  const mapa = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
  return String(texto).replace(/[&<>"]/g, c => mapa[c]);
}


/* ---------- 3. VALIDACIÓN ---------- */
// Devuelve un texto con el error, o null si la reserva es válida
function validar(r, reservas, bloqueos) {
  if (!r.nombre || r.nombre.trim().length < 3) return 'Escribe tu nombre completo.';
  if (!r.matricula || r.matricula.trim().length < 4) return 'Escribe tu matrícula.';
  if (!r.equipos.length) return 'Elige al menos una parte de la celda.';

  const inicio = aMinutos(r.inicio);
  const fin = aMinutos(r.fin);

  if (fin - inicio < 30 || fin - inicio > 30 * CFG.MAX_BLOQUES) {
    return 'Duración máxima: ' + CFG.MAX_BLOQUES * 30 + ' minutos.';
  }
  if (inicio < aMinutos(CFG.HORA_INI) || fin > aMinutos(CFG.HORA_FIN)) {
    return 'Fuera del horario de la celda.';
  }
  if (r.fecha + ' ' + r.inicio < ahora()) return 'Ese horario ya pasó.';

  // ¿Cae en un horario bloqueado (clases)?
  for (const b of bloqueos) {
    if (b.fecha === r.fecha && inicio < aMinutos(b.fin) && fin > aMinutos(b.inicio)) {
      return 'Horario no disponible: ' + (b.motivo || 'bloqueado');
    }
  }

  // ¿Choca con otra reserva activa? (mismo horario y mismo equipo)
  for (const x of reservas) {
    const mismoDia = x.estado === 'Activa' && x.fecha === r.fecha;
    const mismoHorario = inicio < aMinutos(x.fin) && fin > aMinutos(x.inicio);
    if (mismoDia && mismoHorario && chocan(x.equipos, r.equipos)) {
      return 'Ya está ocupado (' + x.equipos.join(', ') + ' de ' + x.inicio + ' a ' + x.fin + ').';
    }
  }
  return null;
}


/* ---------- 4. ALMACENAMIENTO ---------- */
/* Modo LOCAL: guarda en este navegador (solo pruebas) */
const LS = 'reservas_celda_v1';

function cargarLocal() {
  try { return JSON.parse(localStorage.getItem(LS)) || []; }
  catch (e) { return []; }
}

function guardarLocal(lista) {
  localStorage.setItem(LS, JSON.stringify(lista));
}

const Local = {
  // La lista pública nunca incluye matrícula ni código
  async list() {
    const res = cargarLocal().map(({ matricula, pin, ...publico }) => publico);
    return { res, blq: CFG.BLOQUEOS };
  },

  async create(r) {
    const todas = cargarLocal();
    const error = validar(r, todas, CFG.BLOQUEOS);
    if (error) return { error };

    const nueva = {
      ...r,
      id: Date.now().toString(36),
      pin: String(1000 + Math.floor(Math.random() * 9000)),
      estado: 'Activa'
    };
    todas.push(nueva);
    guardarLocal(todas);
    return { ok: 1, pin: nueva.pin };
  },

  async cancel(o) {
    const todas = cargarLocal();
    const x = todas.find(y => y.id === o.id && y.estado === 'Activa');
    if (!x) return { error: 'Reserva no encontrada.' };

    const esAdmin = !!CFG.ADMIN_LOCAL && o.codigo.trim() === CFG.ADMIN_LOCAL;
    const datosCorrectos =
      x.matricula.toLowerCase() === o.matricula.trim().toLowerCase() &&
      x.pin === o.codigo.trim();
    if (!esAdmin && !datosCorrectos) return { error: 'Matrícula o código incorrectos.' };

    x.estado = 'Cancelada';
    guardarLocal(todas);
    return { ok: 1 };
  }
};

/* Modo REMOTO: habla con el Apps Script (Google Sheets) */
const Remote = {
  async list() {
    const respuesta = await fetch(CFG.API_URL + '?action=list');
    return respuesta.json();
  },
  async post(datos) {
    const respuesta = await fetch(CFG.API_URL, { method: 'POST', body: JSON.stringify(datos) });
    return respuesta.json();
  },
  create(r) { return this.post({ action: 'create', ...r }); },
  cancel(o) { return this.post({ action: 'cancel', ...o }); }
};

// Si hay URL se usa Google Sheets; si no, el modo local
const api = CFG.API_URL ? Remote : Local;


/* ---------- 5. ESTADO Y PANTALLA ---------- */
let fecha = hoy();                 // día que se está viendo
let datos = { res: [], blq: [] };  // reservas y bloqueos cargados
let seleccionada = null;           // id de la reserva que se quiere cancelar

$('#modo').textContent = CFG.API_URL
  ? 'Conectado a Google Sheets · datos compartidos'
  : 'Modo local de pruebas · los datos solo se guardan en este navegador';

// Lista de bloques de 30 min del día: [480, 510, 540, ...]
const bloques = [];
for (let t = aMinutos(CFG.HORA_INI); t < aMinutos(CFG.HORA_FIN); t += 30) bloques.push(t);

// Llenar selects y casillas del formulario
$('#inicio').innerHTML = bloques.map(t => `<option>${aHora(t)}</option>`).join('');

$('#dur').innerHTML = Array.from({ length: CFG.MAX_BLOQUES }, (_, i) =>
  `<option value="${i + 1}">${(i + 1) * 30} min</option>`).join('');

$('#eq').innerHTML = CFG.EQUIPOS.map(e =>
  `<label><input type="checkbox" value="${e}"><i class="chip" style="background:${CFG.COLORES[e]}"></i>${e}</label>`).join('');

// Leyenda: cuadrito de color + nombre de cada equipo
$('#leyenda').innerHTML = CFG.EQUIPOS.map(e =>
  `<span class="item"><i class="chip" style="background:${CFG.COLORES[e]}"></i><b>${e}</b>` +
  (CFG.NOTAS[e] ? ` <small>· ${CFG.NOTAS[e]}</small>` : '') + '</span>').join('');

const casillas = () => [...document.querySelectorAll('#eq input')];
const reservasDelDia = () => datos.res.filter(x => x.fecha === fecha);


/* ---------- 6. DIBUJAR CALENDARIO Y LISTA ---------- */
function dibujar() {
  $('#fecha').value = fecha;

  const activas = reservasDelDia().filter(x => x.estado === 'Activa');
  const bloqueosDia = datos.blq.filter(b => b.fecha === fecha);
  const horaActual = ahora();

  // Encabezado: una columna por equipo
  let html = '<tr><th></th>' + CFG.EQUIPOS.map(e => `<th style="border-top:4px solid ${CFG.COLORES[e]}">${e}</th>`).join('') + '</tr>';

  // Una fila por cada bloque de 30 min
  for (const t of bloques) {
    html += `<tr><td class="h">${aHora(t)}</td>`;

    for (const equipo of CFG.EQUIPOS) {
      const ocupada = activas.find(y =>
        aMinutos(y.inicio) <= t && t < aMinutos(y.fin) && chocan(y.equipos, [equipo]));
      const bloqueado = bloqueosDia.some(b => aMinutos(b.inicio) <= t && t < aMinutos(b.fin));
      const pasado = fecha + ' ' + aHora(t) < horaActual;

      if (ocupada) {
        // El nombre solo se muestra en el primer bloque de la reserva
        const nombre = aMinutos(ocupada.inicio) === t ? escapar(ocupada.nombre.split(' ')[0]) : '·';
        html += `<td class="o" style="background:${CFG.COLORES[equipo]}" data-id="${ocupada.id}">${nombre}</td>`;
      } else if (bloqueado) {
        html += '<td class="x">—</td>';
      } else if (pasado) {
        html += '<td class="x"></td>';
      } else {
        html += `<td class="l" data-t="${aHora(t)}" data-e="${equipo}"></td>`;
      }
    }
    html += '</tr>';
  }
  $('#grid').innerHTML = html;

  // Lista de reservas del día (las canceladas salen tachadas)
  const filas = reservasDelDia()
    .sort((a, b) => a.inicio.localeCompare(b.inicio))
    .map(x => {
      const clase = x.estado === 'Activa' ? '' : 'can';
      const nota = x.estado === 'Activa' ? '' : ' (cancelado)';
      return `<li class="${clase}">${x.inicio}–${x.fin} · ${escapar(x.equipos.join(', '))} · ${escapar(x.nombre)}${nota}</li>`;
    });
  $('#lista').innerHTML = filas.join('') || '<li class="sub">Sin reservas este día.</li>';

  // Horarios bloqueados al inicio de la lista
  bloqueosDia.forEach(b => {
    $('#lista').insertAdjacentHTML('afterbegin',
      `<li class="sub">${b.inicio}–${b.fin} · No disponible: ${escapar(b.motivo || 'bloqueado')}</li>`);
  });
}

async function cargar() {
  try {
    datos = await api.list();
    $('#aviso').innerHTML = '';
    if (!datos.res) throw new Error('respuesta inválida');
  } catch (e) {
    datos = { res: [], blq: [] };
    $('#aviso').innerHTML = '<div class="msg e">No se pudo leer los datos. Intenta recargar la página.</div>';
  }
  dibujar();
}


/* ---------- 7. EVENTOS ---------- */
// Clic en el calendario: celda libre = llenar formulario, celda roja = abrir cancelación
$('#grid').onclick = ev => {
  const td = ev.target.closest('td');
  if (!td) return;

  if (td.dataset.t) {
    $('#inicio').value = td.dataset.t;
    casillas().forEach(c => c.checked = (c.value === td.dataset.e));
    abrirApartar();
  } else if (td.dataset.id) {
    seleccionada = td.dataset.id;
    const x = datos.res.find(y => y.id === seleccionada);
    $('#cinfo').textContent = `${x.nombre} · ${x.equipos.join(', ')} · ${x.inicio}–${x.fin}`;
    $('#modalCancelar').showModal();
    $('#cout').innerHTML = '';
    $('#cmat').focus();
  }
};

// Botón Apartar
$('#apartar').onclick = async () => {
  const inicio = $('#inicio').value;
  const r = {
    nombre: $('#nombre').value,
    matricula: $('#matricula').value,
    fecha: fecha,
    inicio: inicio,
    fin: aHora(aMinutos(inicio) + 30 * $('#dur').value),
    equipos: casillas().filter(c => c.checked).map(c => c.value)
  };

  // Primero se valida aquí; el servidor vuelve a validar al guardar
  $('#out').innerHTML = '';
  const error = validar(r, datos.res.filter(x => x.estado === 'Activa'), datos.blq);
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
  cargar();
};

// Botón Cancelar reserva
$('#cancelar').onclick = async () => {
  let respuesta;
  try {
    respuesta = await api.cancel({ id: seleccionada, matricula: $('#cmat').value, codigo: $('#ccod').value });
  } catch (e) {
    respuesta = { error: 'Sin conexión con el servidor.' };
  }

  if (respuesta.error) {
    $('#cout').innerHTML = `<div class="msg e">${escapar(respuesta.error)}</div>`;
  } else {
    $('#cout').innerHTML = '<div class="msg">Reserva cancelada. El horario quedó libre.</div>';
    $('#ccod').value = '';
    cargar();
  }
};

$('#cerrar').onclick = () => $('#modalCancelar').close();

// Popup de apartar
function abrirApartar() {
  $('#formApartar').hidden = false;
  $('#exito').hidden = true;
  $('#out').innerHTML = '';
  $('#resumen').textContent = 'Fecha: ' + fecha;
  $('#modalApartar').showModal();
}
$('#abrirApartar').onclick = abrirApartar;
$('#cerrarApartar').onclick = () => $('#modalApartar').close();
$('#cerrarExito').onclick = () => $('#modalApartar').close();

// Navegación por fechas
$('#fecha').onchange = e => { fecha = e.target.value || hoy(); dibujar(); };
$('#prev').onclick = () => { fecha = sumarDias(fecha, -1); dibujar(); };
$('#next').onclick = () => { fecha = sumarDias(fecha, 1); dibujar(); };
$('#hoy').onclick = () => { fecha = hoy(); dibujar(); };


/* ---------- 8. INICIO ---------- */
cargar();
setInterval(cargar, 60000);   // se actualiza solo cada minuto