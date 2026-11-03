/* Bloques de 30 minutos que cubren el horario configurado de los laboratorios */
import { CFG } from './config.js';
import { aMinutos } from './utils.js';

export const bloquesLab = [];

export function actualizarBloquesLab(laboratorios) {
  const horarios = laboratorios.filter(l =>
    /^\d{2}:\d{2}$/.test(l.abre) && /^\d{2}:\d{2}$/.test(l.cierra) &&
    aMinutos(l.cierra) > aMinutos(l.abre));
  const inicio = horarios.length ? Math.min(...horarios.map(l => aMinutos(l.abre))) : aMinutos(CFG.HORA_INI);
  const fin = horarios.length ? Math.max(...horarios.map(l => aMinutos(l.cierra))) : aMinutos(CFG.HORA_FIN);
  bloquesLab.length = 0;
  for (let t = inicio; t < fin; t += 30) bloquesLab.push(t);
}

actualizarBloquesLab([]);
