/* Bloques de 30 minutos del horario de la celda: [480, 510, 540, ...] */
import { CFG } from './config.js';
import { aMinutos } from './utils.js';

export const bloques = [];
for (let t = aMinutos(CFG.HORA_INI); t < aMinutos(CFG.HORA_FIN); t += 30) bloques.push(t);
