/* Calendario: leyenda de colores, tabla del día y lista de reservas */
import { CFG } from './config.js';
import { $, aMinutos, aHora, ahora, chocan, escapar } from './utils.js';
import { estado, reservasDelDia } from './estado.js';

// Bloques de 30 min del día: [480, 510, 540, ...]
export const bloques = [];
for (let t = aMinutos(CFG.HORA_INI); t < aMinutos(CFG.HORA_FIN); t += 30) bloques.push(t);

// Leyenda: cuadrito de color + nombre de cada equipo
export function dibujarLeyenda() {
  $('#leyenda').innerHTML = CFG.EQUIPOS.map(e =>
    `<span class="item"><i class="chip" style="background:${CFG.COLORES[e]}"></i><b>${e}</b>` +
    (CFG.NOTAS[e] ? ` <small>· ${CFG.NOTAS[e]}</small>` : '') + '</span>').join('');
}

export function dibujar() {
  const { fecha, datos } = estado;
  $('#fecha').value = fecha;

  const activas = reservasDelDia().filter(x => x.estado === 'Activa');
  const bloqueosDia = datos.blq.filter(b => b.fecha === fecha);
  const horaActual = ahora();

  // Encabezado: una columna por equipo, con su color
  let html = '<tr><th></th>' +
    CFG.EQUIPOS.map(e => `<th style="border-top:4px solid ${CFG.COLORES[e]}">${e}</th>`).join('') + '</tr>';

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

// Clic en una celda: libre -> alLibre(hora, equipo) · ocupada -> alOcupada(id)
export function iniciarCalendario(alLibre, alOcupada) {
  $('#grid').onclick = ev => {
    const td = ev.target.closest('td');
    if (!td) return;
    if (td.dataset.t) alLibre(td.dataset.t, td.dataset.e);
    else if (td.dataset.id) alOcupada(td.dataset.id);
  };
}
