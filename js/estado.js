/* Estado compartido y consultas sobre las reservas cargadas */
import { hoy, aMinutos, chocan } from './utils.js';

export const estado = {
  fecha: hoy(),                  // día de referencia (el calendario se centra en él)
  vista: 'semana',               // 'dia' | 'semana' | 'mes'
  datos: { res: [], blq: [] },   // reservas y bloqueos cargados
  seleccionada: null             // id de la reserva que se quiere cancelar
};

export const reservasDe = fecha => estado.datos.res.filter(x => x.fecha === fecha);
export const activasDe = fecha => reservasDe(fecha).filter(x => x.estado === 'Activa');
export const bloqueosDe = fecha => estado.datos.blq.filter(b => b.fecha === fecha);

// Reserva activa que ocupa ese equipo en ese bloque (o undefined)
export function ocupante(fecha, t, equipo) {
  return activasDe(fecha).find(y =>
    aMinutos(y.inicio) <= t && t < aMinutos(y.fin) && chocan(y.equipos, [equipo]));
}

// ¿Ese bloque está bloqueado (clase)?
export const bloqueado = (fecha, t) =>
  bloqueosDe(fecha).some(b => aMinutos(b.inicio) <= t && t < aMinutos(b.fin));
