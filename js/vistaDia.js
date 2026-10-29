/* Vista DÍA: horas en filas, un equipo por columna.
   Cada reserva y cada bloqueo se dibuja como UN solo bloque que cubre todas sus horas. */
import { CFG } from './config.js';
import { aMinutos, aHora, ahora, escapar } from './utils.js';
import { estado, ocupante, bloqueoEn, nombresEquipos, colorDe, diaProhibido, autorizacion } from './estado.js';
import { bloques } from './horario.js';
import { fechaMinima } from './validacion.js';

// Cuántas filas cubre un bloque que empieza en la fila i y termina a la hora `fin`
const filasHasta = (fin, t, i) => Math.max(1, Math.min((aMinutos(fin) - t) / 30, bloques.length - i));

export function htmlDia() {
  const f = estado.fecha, horaActual = ahora(), equipos = nombresEquipos();
  const resto = {};                   // equipo -> filas que todavía cubre un bloque ya dibujado
  let restoBloqueo = 0;               // filas que todavía cubre un bloqueo ya dibujado

  // ¿Este día se puede apartar? (anticipación y fines de semana)
  const aviso = f < fechaMinima()
    ? `Este día ya no se puede apartar: hay que pedirlo con ${CFG.DIAS_ANTICIPACION} días de anticipación (primer día disponible: ${fechaMinima()}).`
    : diaProhibido(f) ? 'Los sábados y domingos no se pueden apartar, salvo que el administrador los autorice para un caso especial.' : '';
  const auth = autorizacion(f);

  let html = aviso ? `<div class="msg e" style="margin:8px">${aviso}</div>` : '';
  if (auth) html += `<div class="msg" style="margin:8px">Día autorizado por el administrador${auth.motivo ? ': ' + escapar(auth.motivo) : ''}.</div>`;
  if (!equipos.length) return html + '<p class="sub" style="padding:12px">Todavía no hay material registrado. El administrador puede agregarlo desde su panel.</p>';

  html += '<table class="tabla dia"><thead><tr><th></th>' + equipos.map(e =>
    `<th style="--col:${colorDe(e)}"><i class="chip" style="background:${colorDe(e)}"></i>${escapar(e)}</th>`).join('') + '</tr></thead><tbody>';

  bloques.forEach((t, i) => {
    html += `<tr class="${t % 60 === 0 ? 'hora' : 'media'}"><td class="h">${aHora(t)}</td>`;
    const bq = bloqueoEn(f, t);

    if (restoBloqueo > 0) {
      restoBloqueo--;                         // ya lo cubre el bloqueo de arriba
    } else if (bq) {
      const n = filasHasta(bq.fin, t, i);
      restoBloqueo = n - 1;
      html += `<td class="bq" colspan="${equipos.length}" rowspan="${n}" data-bq="${bq.inicio}|${bq.fin}">` +
        `<b>${escapar(bq.motivo || 'No disponible')}</b><small>${bq.inicio}–${bq.fin}</small></td>`;
    } else {
      for (const equipo of equipos) {
        if (resto[equipo] > 0) { resto[equipo]--; continue; }   // ya lo cubre una reserva de arriba
        const x = ocupante(f, t, equipo);
        if (x) {
          const n = filasHasta(x.fin, t, i);
          resto[equipo] = n - 1;
          html += `<td class="o" rowspan="${n}" style="--col:${colorDe(equipo)}" data-id="${x.id}">` +
            `<b>${escapar(x.nombre.split(' ')[0])}</b><small>${x.inicio}–${x.fin}</small></td>`;
        } else if (aviso || f + ' ' + aHora(t) < horaActual) {
          html += '<td class="x"></td>';
        } else {
          html += `<td class="l" data-t="${aHora(t)}" data-e="${escapar(equipo)}"></td>`;
        }
      }
    }
    html += '</tr>';
  });
  return html + '</tbody></table>';
}
