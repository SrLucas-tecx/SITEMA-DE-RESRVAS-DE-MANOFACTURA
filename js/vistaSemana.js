/* Vista SEMANA: horas en filas, un día por columna.
   Cada celda tiene una barrita por equipo (con su color si está ocupado). */
import { CFG } from './config.js';
import { aHora, ahora, hoy, sumarDias, inicioSemana, nombreDia, diaDelMes } from './utils.js';
import { estado, ocupante, bloqueado } from './estado.js';
import { bloques } from './horario.js';
import { fechaMinima } from './validacion.js';

export function htmlSemana() {
  const lunes = inicioSemana(estado.fecha);
  const dias = Array.from({ length: 7 }, (_, i) => sumarDias(lunes, i));
  const horaActual = ahora(), hoyStr = hoy();

  let html = '<table class="tabla semana"><tr><th></th>' + dias.map(d =>
    `<th class="${d === hoyStr ? 'hoyc' : ''}" data-ir="${d}"><span>${nombreDia(d)}</span><b>${diaDelMes(d)}</b></th>`).join('') + '</tr>';

  for (const t of bloques) {
    html += `<tr class="${t % 60 === 0 ? 'hora' : 'media'}"><td class="h">${aHora(t)}</td>`;
    for (const d of dias) {
      if (bloqueado(d, t)) {
        html += `<td class="x" data-ir="${d}">—</td>`;
        continue;
      }
      const segs = CFG.EQUIPOS.map(e =>
        ocupante(d, t, e) ? `<i style="background:${CFG.COLORES[e]}"></i>` : '<i></i>').join('');
      const pasado = (d + ' ' + aHora(t) < horaActual || d < fechaMinima()) ? ' pas' : '';
      html += `<td class="s${pasado}" data-ir="${d}"><div class="segs">${segs}</div></td>`;
    }
    html += '</tr>';
  }
  return html + '</table>';
}
