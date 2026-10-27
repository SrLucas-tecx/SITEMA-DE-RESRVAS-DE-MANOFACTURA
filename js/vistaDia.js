/* Vista DÍA: horas en filas, un equipo por columna */
import { CFG } from './config.js';
import { aMinutos, aHora, ahora, escapar } from './utils.js';
import { estado, ocupante, bloqueado } from './estado.js';
import { bloques } from './horario.js';
import { fechaMinima } from './validacion.js';

export function htmlDia() {
  const f = estado.fecha, horaActual = ahora();
  const pronto = f < fechaMinima();   // dentro de los días de anticipación
  let html = pronto
    ? `<div class="msg e" style="margin:0 0 8px">Este día ya no se puede apartar: hay que pedirlo con ${CFG.DIAS_ANTICIPACION} días de anticipación (primer día disponible: ${fechaMinima()}).</div>`
    : '';
  html += '<table class="tabla"><tr><th></th>' +
    CFG.EQUIPOS.map(e => `<th style="border-top:4px solid ${CFG.COLORES[e]}">${e}</th>`).join('') + '</tr>';

  for (const t of bloques) {
    html += `<tr${t % 60 === 0 ? ' class="hora"' : ''}><td class="h">${aHora(t)}</td>`;
    for (const equipo of CFG.EQUIPOS) {
      const x = ocupante(f, t, equipo);
      if (x) {
        // El nombre solo se muestra en el primer bloque de la reserva
        const nombre = aMinutos(x.inicio) === t ? escapar(x.nombre.split(' ')[0]) : '·';
        html += `<td class="o" style="background:${CFG.COLORES[equipo]}" data-id="${x.id}">${nombre}</td>`;
      } else if (bloqueado(f, t)) {
        html += '<td class="x">—</td>';
      } else if (pronto || f + ' ' + aHora(t) < horaActual) {
        html += '<td class="x"></td>';
      } else {
        html += `<td class="l" data-t="${aHora(t)}" data-e="${equipo}"></td>`;
      }
    }
    html += '</tr>';
  }
  return html + '</table>';
}
