/* Calendario PROPIO de un laboratorio: vistas día, semana y mes.
   Verde = libre · rayas amarillas = ocupado · rayas grises = cerrado */
import { aHora, aMinutos, hoy, sumarDias, inicioSemana, nombreDia, nombresDias, diaDelMes, escapar, etiquetaCalendario } from './utils.js';
import { estado, implementosDeLab } from './estado.js';
import { bloquesLab } from './horarioLab.js';
import { bloquesDeLab } from './labDatos.js';
const claseFila = t => t % 60 === 0 ? 'hora' : 'media';

/* ---------- Día: horas en filas ---------- */
export function htmlDiaLab(lab) {
  const f = estado.fecha, items = implementosDeLab(lab);
  if (!items.length) return '<p class="sub" style="padding:12px">Este laboratorio todavía no tiene implementos. El administrador puede agregarlos desde su panel.</p>';
  const porItem = items.map(item => bloquesDeLab(lab, f, item));
  const resto = items.map(() => 0);
  let restoUso = 0;
  let html = '<table class="tabla dia"><thead><tr><th></th>' + items.map(item =>
    `<th style="--col:${item.color}"><i class="chip" style="background:${item.color}"></i>${etiquetaCalendario(item.nombre)}</th>`).join('') + '</tr></thead><tbody>';
  for (let i = 0; i < bloquesLab.length; i++) {
    const t = bloquesLab[i];
    html += `<tr class="${claseFila(t)}"><td class="h">${aHora(t)}</td>`;
    const primero = porItem[0][i];
    if (restoUso > 0) {
      restoUso--;
    } else if (primero.uso) {
      const filas = Math.min(bloquesLab.length - i, Math.max(1, (aMinutos(primero.uso.fin) - t) / 30));
      restoUso = filas - 1;
      html += `<td class="lo" colspan="${items.length}" rowspan="${filas}" data-uso="${f}|${primero.uso.inicio}|${primero.uso.fin}">` +
        `<b>${etiquetaCalendario(primero.motivo)}</b><small>${primero.uso.inicio}–${primero.uso.fin}</small></td>`;
    } else {
      items.forEach((item, k) => {
        if (resto[k] > 0) { resto[k]--; return; }
        const x = porItem[k][i];
        if (x.tipo === 'libre') {
          html += `<td class="ll" data-lab-f="${f}" data-lab-t="${aHora(t)}" data-lab-item="${escapar(item.nombre)}"></td>`;
        } else if (x.reserva) {
          const filas = Math.max(1, (aMinutos(x.reserva.fin) - t) / 30);
          resto[k] = filas - 1;
          html += `<td class="o" rowspan="${filas}" style="--col:${item.color}" data-lab-res="${escapar(x.reserva.id)}" data-lab-item="${escapar(item.nombre)}">` +
            `<b>${etiquetaCalendario(x.reserva.nombre.split(' ')[0])}</b><small>${x.reserva.inicio}–${x.reserva.fin}</small>` +
            (x.reserva.personas ? `<small>${escapar(String(x.reserva.personas))} personas</small>` : '') + '</td>';
        } else {
          html += '<td class="x"></td>';
        }
      });
    }
    html += '</tr>';
  }
  return html + '</tbody></table>';
}

/* ---------- Semana: un día por columna ---------- */
export function htmlSemanaLab(lab) {
  const items = implementosDeLab(lab);
  if (!items.length) return '<p class="sub" style="padding:12px">Este laboratorio todavía no tiene implementos. El administrador puede agregarlos desde su panel.</p>';
  const lunes = inicioSemana(estado.fecha), hoyStr = hoy();
  const dias = Array.from({ length: 7 }, (_, i) => sumarDias(lunes, i));
  const porDia = dias.map(d => items.map(item => bloquesDeLab(lab, d, item)));
  let html = '<div class="lab-legend">' + items.map(item =>
    `<span><i class="chip" style="background:${item.color}"></i>${etiquetaCalendario(item.nombre)}</span>`).join('') +
    '</div><table class="tabla semana lab-semana"><tr><th></th>' + dias.map(d =>
    `<th class="${d === hoyStr ? 'hoyc' : ''}" data-ir="${d}"><span>${nombreDia(d)}</span><b>${diaDelMes(d)}</b></th>`).join('') + '</tr>';

  for (let fila = 0; fila < bloquesLab.length; fila++) {
    const t = bloquesLab[fila];
    html += `<tr class="${claseFila(t)}"><td class="h">${aHora(t)}</td>`;
    dias.forEach((d, diaIndex) => {
      const uso = porDia[diaIndex].map(slots => slots[fila]).find(slot => slot.uso);
      if (uso) {
        html += `<td class="s"><div class="lab-activity" data-uso="${d}|${uso.uso.inicio}|${uso.uso.fin}" title="${escapar(uso.motivo)}">${etiquetaCalendario(uso.motivo || 'Ocupado')}</div></td>`;
        return;
      }
      const segmentos = items.map((item, itemIndex) => {
        const slot = porDia[diaIndex][itemIndex][fila];
        if (slot.tipo === 'libre') {
          return `<i class="libre lab-resource-free" data-lab-f="${d}" data-lab-t="${aHora(t)}" data-lab-item="${escapar(item.nombre)}" title="${escapar(item.nombre)} · Libre"></i>`;
        }
        if (slot.reserva) {
          return `<i class="lab-booked" style="background:${item.color}" data-lab-res="${escapar(slot.reserva.id)}" data-lab-item="${escapar(item.nombre)}" title="${escapar(item.nombre)} · ${escapar(slot.reserva.nombre)} · ${slot.reserva.inicio}–${slot.reserva.fin}${slot.reserva.personas ? ` · ${escapar(String(slot.reserva.personas))} personas` : ''}"></i>`;
        }
        return `<i class="no" title="${escapar(item.nombre)} · ${escapar(slot.motivo)}"></i>`;
      }).join('');
      html += `<td class="s"><div class="segs lab-segs">${segmentos}</div></td>`;
    });
    html += '</tr>';
  }
  return html + '</table>';
}

/* ---------- Mes: un cuadro por día ---------- */
export function htmlMesLab(lab) {
  const items = implementosDeLab(lab);
  if (!items.length) return '<p class="sub" style="padding:12px">Este laboratorio todavía no tiene implementos. El administrador puede agregarlos desde su panel.</p>';
  const mes = estado.fecha.slice(0, 7), hoyStr = hoy();
  let html = '<table class="tabla mes"><tr>' + nombresDias().map(n => `<th>${n}</th>`).join('') + '</tr>';

  let d = inicioSemana(mes + '-01');
  do {
    html += '<tr>';
    for (let i = 0; i < 7; i++) {
      const porImplemento = items.map(item => bloquesDeLab(lab, d, item));
      const porHorario = bloquesLab.map((_, k) => porImplemento.map(slots => slots[k]));
      const abiertas = porHorario.filter(slots => slots.some(s => s.tipo !== 'cerrado')).length / 2;
      const libres = porHorario.filter(slots => slots.some(s => s.tipo === 'libre')).length / 2;
      const ocupadas = porHorario.filter(slots => slots.some(s => s.reserva)).length / 2;
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
