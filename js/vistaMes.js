/* Vista MES: un cuadro por día con puntitos de color de los equipos usados */
import { CFG } from './config.js';
import { hoy, sumarDias, inicioSemana, nombresDias, diaDelMes } from './utils.js';
import { estado, activasDe, bloqueosDe } from './estado.js';

export function htmlMes() {
  const mes = estado.fecha.slice(0, 7);
  const hoyStr = hoy();
  let html = '<table class="tabla mes"><tr>' + nombresDias().map(n => `<th>${n}</th>`).join('') + '</tr>';

  let d = inicioSemana(mes + '-01');
  do {
    html += '<tr>';
    for (let i = 0; i < 7; i++) {
      const activas = activasDe(d);
      const usados = CFG.EQUIPOS.filter(e => activas.some(x => x.equipos.includes(e)));
      const puntos = usados.map(e => `<i class="chip" style="background:${CFG.COLORES[e]}"></i>`).join('');
      const clases = 'm' + (d.slice(0, 7) !== mes ? ' fuera' : '') + (d === hoyStr ? ' hoyc' : '');
      html += `<td class="${clases}" data-ir="${d}"><b>${diaDelMes(d)}</b>` +
        `<div class="chips">${puntos}</div>` +
        (activas.length ? `<small>${activas.length} reserv.</small>` : '') +
        (bloqueosDe(d).length ? '<small class="bq">Bloqueo</small>' : '') + '</td>';
      d = sumarDias(d, 1);
    }
    html += '</tr>';
  } while (d.slice(0, 7) === mes);
  return html + '</table>';
}
