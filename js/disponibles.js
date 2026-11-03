/* Días en los que se puede apartar (anticipación, fines de semana cerrados y días bloqueados por completo)
   y la ventana "Días disponibles" que lleva directo a uno de ellos. */
import { CFG } from './config.js';
import { $, nombreDia, diaDelMes, nombreMes, sumarDias, diaSemana } from './utils.js';
import { fechaMinima } from './validacion.js';
import { estado, diaProhibido, bloqueado, labActual, implementosDeLab } from './estado.js';
import { bloques } from './horario.js';
import { bloquesDeLab } from './labDatos.js';

export const diaDisponible = fecha =>
  fecha >= fechaMinima() && !diaProhibido(fecha) && bloques.some(t => !bloqueado(fecha, t));

// Todos los días en que se puede apartar durante el mes indicado
export function diasDisponiblesDelMes(mes) {
  const dias = [];
  for (let f = mes + '-01'; f.slice(0, 7) === mes; f = sumarDias(f, 1)) {
    if (diaDisponible(f)) dias.push(f);
  }
  return dias;
}

export function diasDisponiblesLabDelMes(mes, lab) {
  if (!lab || !implementosDeLab(lab).length) return [];
  const dias = [];
  for (let fecha = mes + '-01'; fecha.slice(0, 7) === mes; fecha = sumarDias(fecha, 1)) {
    const disponibles = Array.isArray(lab.diasDisponibles) ? lab.diasDisponibles : CFG.DIAS_LAB_DEFAULT;
    if (fecha < fechaMinima(lab.diasAnticipacion ?? CFG.DIAS_ANTICIPACION) ||
        !disponibles.includes(diaSemana(fecha)) || diaProhibido(fecha)) continue;
    if (bloquesDeLab(lab, fecha).some(slot => slot.tipo === 'libre')) dias.push(fecha);
  }
  return dias;
}

// alElegir(fecha) lo define main.js (lleva el calendario a ese día)
export function iniciarDias(alElegir) {
  $('#abrirDias').onclick = () => {
    const mes = estado.fecha.slice(0, 7);
    const esLab = estado.seccion === 'labs';
    const lab = esLab ? labActual() : null;
    const dias = esLab ? diasDisponiblesLabDelMes(mes, lab) : diasDisponiblesDelMes(mes);
    $('#modalDias h2').textContent = esLab ? `Días disponibles · ${lab?.nombre || 'Laboratorios'}` : 'Días disponibles';
    $('#notaDias').textContent = esLab
      ? lab
        ? `Días disponibles de ${nombreMes(mes + '-01')} para ${lab.nombre}. Anticipación: ${lab.diasAnticipacion ?? CFG.DIAS_ANTICIPACION} días. Solo se muestran días con horarios e implementos libres.`
        : 'Selecciona un laboratorio para consultar sus días disponibles.'
      : `Días disponibles de ${nombreMes(mes + '-01')}. Se requieren ${CFG.DIAS_ANTICIPACION} días de anticipación. Puedes elegir hasta ${CFG.MAX_DIAS} fechas del mismo mes por reserva.`;
    $('#listaDias').innerHTML = dias.map(f => {
      const mesAbreviado = new Date(f + 'T12:00').toLocaleDateString('es-MX', { month: 'short' });
      return `<button class="dia-btn" data-f="${f}"><span>${nombreDia(f)}</span><b>${diaDelMes(f)}</b><small>${mesAbreviado}</small></button>`;
    }).join('') || (esLab && !lab
      ? '<p class="sub">No hay laboratorios disponibles.</p>'
      : esLab && !implementosDeLab(lab).length
        ? '<p class="sub">Este laboratorio todavía no tiene implementos reservables.</p>'
        : '<p class="sub">No hay días disponibles en este mes. Usa los botones del calendario para consultar otro mes.</p>');
    $('#modalDias').showModal();
  };
  $('#listaDias').onclick = ev => {
    const boton = ev.target.closest('[data-f]');
    if (!boton) return;
    $('#modalDias').close();
    alElegir(boton.dataset.f);
  };
  $('#cerrarDias').onclick = () => $('#modalDias').close();
}
