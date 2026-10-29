/* Calendario PROPIO de un laboratorio: vistas día, semana y mes.
   Verde = libre · rayas amarillas = ocupado · rayas grises = cerrado */
import { aHora, hoy, sumarDias, inicioSemana, nombreDia, nombresDias, diaDelMes, escapar } from './utils.js';
import { estado } from './estado.js';
import { bloques } from './horario.js';
import { bloquesDeLab, tramos } from './labDatos.js';

// Celda de un tramo ocupado o cerrado: UN solo bloque que cubre todas sus horas
function celdaTramo(x, fecha, filas) {
  const ocupado = x.tipo === 'ocupado';
  return `<td class="${ocupado ? 'lo' : 'x'}" rowspan="${filas}"` +
    (ocupado ? ` data-uso="${fecha}|${aHora(x.ini)}|${aHora(x.fin)}"` : '') +
    `><b>${escapar(x.motivo)}</b><small>${aHora(x.ini)}–${aHora(x.fin)}</small></td>`;
}

const celdaLibre = (fecha, t) => `<td class="ll" data-lab-f="${fecha}" data-lab-t="${aHora(t)}"></td>`;
const claseFila = t => t % 60 === 0 ? 'hora' : 'media';

/* ---------- Día: horas en filas ---------- */
export function htmlDiaLab(lab) {
  const f = estado.fecha, lista = tramos(bloquesDeLab(lab, f));
  let html = `<table class="tabla dia"><thead><tr><th></th><th>${escapar(lab.nombre)}</th></tr></thead><tbody>`;
  for (const t of bloques) {
    html += `<tr class="${claseFila(t)}"><td class="h">${aHora(t)}</td>`;
    const x = lista.find(y => y.ini <= t && t < y.fin);
    if (x.tipo === 'libre') html += celdaLibre(f, t);
    else if (t === x.ini) html += celdaTramo(x, f, (x.fin - x.ini) / 30);   // lo demás lo cubre este bloque
    html += '</tr>';
  }
  return html + '</tbody></table>';
}

/* ---------- Semana: un día por columna ---------- */
export function htmlSemanaLab(lab) {
  const lunes = inicioSemana(estado.fecha), hoyStr = hoy();
  const dias = Array.from({ length: 7 }, (_, i) => sumarDias(lunes, i));
  const porDia = dias.map(d => tramos(bloquesDeLab(lab, d)));
  const resto = Array(7).fill(0);   // filas que todavía cubre un bloque ya dibujado

  let html = '<table class="tabla semana"><tr><th></th>' + dias.map(d =>
    `<th class="${d === hoyStr ? 'hoyc' : ''}" data-ir="${d}"><span>${nombreDia(d)}</span><b>${diaDelMes(d)}</b></th>`).join('') + '</tr>';

  for (const t of bloques) {
    html += `<tr class="${claseFila(t)}"><td class="h">${aHora(t)}</td>`;
    dias.forEach((d, k) => {
      if (resto[k] > 0) { resto[k]--; return; }
      const x = porDia[k].find(y => y.ini <= t && t < y.fin);
      if (x.tipo === 'libre') { html += celdaLibre(d, t); return; }
      const n = (x.fin - t) / 30;
      resto[k] = n - 1;
      html += celdaTramo(x, d, n);
    });
    html += '</tr>';
  }
  return html + '</table>';
}

/* ---------- Mes: un cuadro por día ---------- */
export function htmlMesLab(lab) {
  const mes = estado.fecha.slice(0, 7), hoyStr = hoy();
  let html = '<table class="tabla mes"><tr>' + nombresDias().map(n => `<th>${n}</th>`).join('') + '</tr>';

  let d = inicioSemana(mes + '-01');
  do {
    html += '<tr>';
    for (let i = 0; i < 7; i++) {
      const slots = bloquesDeLab(lab, d);
      const abiertas = slots.filter(s => s.tipo !== 'cerrado').length / 2;
      const libres = slots.filter(s => s.tipo === 'libre').length / 2;
      const ocupadas = slots.filter(s => s.tipo === 'ocupado').length / 2;
      const clases = 'm' + (d.slice(0, 7) !== mes ? ' fuera' : '') + (d === hoyStr ? ' hoyc' : '') + (abiertas ? ' disp' : ' nodisp');
      html += `<td class="${clases}" data-ir="${d}"><b>${diaDelMes(d)}</b>` +
        (abiertas ? `<small>Libre ${libres} h</small>` : '<small>Cerrado</small>') +
        (ocupadas ? `<small class="bq">Ocupado ${ocupadas} h</small>` : '') + '</td>';
      d = sumarDias(d, 1);
    }
    html += '</tr>';
  } while (d.slice(0, 7) === mes);
  return html + '</table>';
}
