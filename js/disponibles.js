/* Días en los que se puede apartar (anticipación, fines de semana cerrados y días bloqueados por completo)
   y la ventana "Días disponibles" que lleva directo a uno de ellos. */
import { CFG } from './config.js';
import { $, nombreDia, diaDelMes, sumarDias } from './utils.js';
import { fechaMinima } from './validacion.js';
import { diaProhibido, bloqueado } from './estado.js';
import { bloques } from './horario.js';

export const diaDisponible = fecha =>
  fecha >= fechaMinima() && !diaProhibido(fecha) && bloques.some(t => !bloqueado(fecha, t));

// Los próximos `n` días en los que se puede apartar
export function proximosDias(n) {
  const dias = [], tope = sumarDias(fechaMinima(), 120);
  for (let f = fechaMinima(); dias.length < n && f <= tope; f = sumarDias(f, 1)) {
    if (diaDisponible(f)) dias.push(f);
  }
  return dias;
}

// alElegir(fecha) lo define main.js (lleva el calendario a ese día)
export function iniciarDias(alElegir) {
  $('#abrirDias').onclick = () => {
    $('#notaDias').textContent = `Se aparta con ${CFG.DIAS_ANTICIPACION} días de anticipación. Los sábados y domingos están cerrados, salvo autorización del administrador.`;
    $('#listaDias').innerHTML = proximosDias(14).map(f => {
      const mes = new Date(f + 'T12:00').toLocaleDateString('es-MX', { month: 'short' });
      return `<button class="dia-btn" data-f="${f}"><span>${nombreDia(f)}</span><b>${diaDelMes(f)}</b><small>${mes}</small></button>`;
    }).join('') || '<p class="sub">No hay días disponibles en los próximos meses.</p>';
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
