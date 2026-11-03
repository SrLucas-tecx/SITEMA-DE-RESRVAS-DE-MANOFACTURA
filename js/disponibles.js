/* Días en los que se puede apartar (anticipación, fines de semana cerrados y días bloqueados por completo)
   y la ventana "Días disponibles" que lleva directo a uno de ellos. */
import { CFG } from './config.js';
import { $, nombreDia, diaDelMes, nombreMes, sumarDias } from './utils.js';
import { fechaMinima } from './validacion.js';
import { estado, diaProhibido, bloqueado } from './estado.js';
import { bloques } from './horario.js';

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

// alElegir(fecha) lo define main.js (lleva el calendario a ese día)
export function iniciarDias(alElegir) {
  $('#abrirDias').onclick = () => {
    const mes = estado.fecha.slice(0, 7);
    const dias = diasDisponiblesDelMes(mes);
    $('#notaDias').textContent = `Días disponibles de ${nombreMes(mes + '-01')}. Se requieren ${CFG.DIAS_ANTICIPACION} días de anticipación. Puedes elegir hasta ${CFG.MAX_DIAS} fechas del mismo mes por reserva.`;
    $('#listaDias').innerHTML = dias.map(f => {
      const mesAbreviado = new Date(f + 'T12:00').toLocaleDateString('es-MX', { month: 'short' });
      return `<button class="dia-btn" data-f="${f}"><span>${nombreDia(f)}</span><b>${diaDelMes(f)}</b><small>${mesAbreviado}</small></button>`;
    }).join('') || '<p class="sub">No hay días disponibles en este mes. Usa los botones del calendario para consultar otro mes.</p>';
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
