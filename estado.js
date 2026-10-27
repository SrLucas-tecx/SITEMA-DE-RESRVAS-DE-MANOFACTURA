/* Estado compartido: lo que todos los módulos leen y modifican */
import { hoy } from './utils.js';

export const estado = {
  fecha: hoy(),                  // día que se está viendo
  datos: { res: [], blq: [] },   // reservas y bloqueos cargados
  seleccionada: null             // id de la reserva que se quiere cancelar
};

export const reservasDelDia = () => estado.datos.res.filter(x => x.fecha === estado.fecha);
