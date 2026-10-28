/* Estado compartido y consultas sobre las reservas cargadas */
import { hoy, aMinutos, chocan } from './utils.js';

export const estado = {
  fecha: hoy(),                  // día de referencia (el calendario se centra en él)
  vista: 'semana',               // 'dia' | 'semana' | 'mes'
  datos: { res: [], blq: [] },   // reservas y bloqueos cargados
  seleccionada: null,            // id de la reserva que se quiere cancelar
  admin: null                    // código de administrador (solo en memoria; al recargar se sale)
};

export const reservasDe = fecha => estado.datos.res.filter(x => x.fecha === fecha);
export const activasDe = fecha => reservasDe(fecha).filter(x => x.estado === 'Activa');
export const bloqueosDe = fecha => estado.datos.blq.filter(b => b.fecha === fecha);

// Reserva activa que ocupa ese equipo en ese bloque (o undefined)
export function ocupante(fecha, t, equipo) {
  return activasDe(fecha).find(y =>
    aMinutos(y.inicio) <= t && t < aMinutos(y.fin) && chocan(y.equipos, [equipo]));
}

// Bloqueo (clase, mantenimiento…) que cubre ese bloque, o undefined
export const bloqueoEn = (fecha, t) =>
  bloqueosDe(fecha).find(b => aMinutos(b.inicio) <= t && t < aMinutos(b.fin));

// ¿Ese bloque está bloqueado?
export const bloqueado = (fecha, t) => !!bloqueoEn(fecha, t);
