/* Vista SEMANA: horas en filas, un día por columna.
   Cada celda tiene una barrita por equipo: de color si está reservado, verde si está libre
   y con rayas si no está disponible. */
import { aHora, ahora, hoy, sumarDias, inicioSemana, nombreDia, diaDelMes } from './utils.js';
import { estado, ocupante, bloqueado, nombresEquipos, colorDe, diaProhibido } from './estado.js';
import { bloques } from './horario.js';
import { fechaMinima } from './validacion.js';

export function htmlSemana() {
  const lunes = inicioSemana(estado.fecha);
  const dias = Array.from({ length: 7 }, (_, i) => sumarDias(lunes, i));
  const equipos = nombresEquipos();
  const horaActual = ahora(), hoyStr = hoy(), minimo = fechaMinima();

  let html = '<table class="tabla semana"><tr><th></th>' + dias.map(d =>
    `<th class="${d === hoyStr ? 'hoyc' : ''}${diaProhibido(d) ? ' finde' : ''}" data-ir="${d}"><span>${nombreDia(d)}</span><b>${diaDelMes(d)}</b></th>`).join('') + '</tr>';

  for (const t of bloques) {
    html += `<tr class="${t % 60 === 0 ? 'hora' : 'media'}"><td class="h">${aHora(t)}</td>`;
    for (const d of dias) {
      if (bloqueado(d, t)) {                      // clase o bloqueo: franjas amarillas
        html += `<td class="bq" data-ir="${d}"></td>`;
        continue;
      }
      const cerrado = d + ' ' + aHora(t) < horaActual || d < minimo || diaProhibido(d);
      const segs = equipos.map(e => ocupante(d, t, e)
        ? `<i style="background:${colorDe(e)}"></i>`
        : `<i class="${cerrado ? 'no' : 'libre'}"></i>`).join('');
      html += `<td class="s" data-ir="${d}"><div class="segs">${segs}</div></td>`;
    }
    html += '</tr>';
  }
  return html + '</table>';
}
