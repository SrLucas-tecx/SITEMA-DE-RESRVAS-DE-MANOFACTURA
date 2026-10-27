/* Validación de reservas (horario, duración, bloqueos y choques) */
import { CFG } from './config.js';
import { aMinutos, ahora, chocan, hoy, sumarDias } from './utils.js';

// Primer día que ya se puede apartar (hoy + días de anticipación)
export const fechaMinima = () => sumarDias(hoy(), CFG.DIAS_ANTICIPACION);

// Devuelve un texto con el error, o null si la reserva es válida
export function validar(r, reservas, bloqueos) {
  if (!r.nombre || r.nombre.trim().length < 3) return 'Escribe tu nombre completo.';
  if (!r.matricula || r.matricula.trim().length < 4) return 'Escribe tu matrícula.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(r.fecha)) return 'Elige una fecha.';
  if (!r.equipos.length) return 'Elige al menos una parte de la celda.';

  const inicio = aMinutos(r.inicio);
  const fin = aMinutos(r.fin);

  if (fin - inicio < 30 || fin - inicio > 30 * CFG.MAX_BLOQUES) {
    return 'Duración máxima: ' + CFG.MAX_BLOQUES * 30 + ' minutos.';
  }
  if (inicio < aMinutos(CFG.HORA_INI) || fin > aMinutos(CFG.HORA_FIN)) {
    return 'Fuera del horario de la celda.';
  }
  if (r.fecha < fechaMinima()) {
    return 'Hay que apartar con ' + CFG.DIAS_ANTICIPACION + ' días de anticipación. Primer día disponible: ' + fechaMinima() + '.';
  }
  if (r.fecha + ' ' + r.inicio < ahora()) return 'Ese horario ya pasó.';

  // ¿Cae en un horario bloqueado (clases)?
  for (const b of bloqueos) {
    if (b.fecha === r.fecha && inicio < aMinutos(b.fin) && fin > aMinutos(b.inicio)) {
      return 'Horario no disponible: ' + (b.motivo || 'bloqueado');
    }
  }

  // ¿Choca con otra reserva activa? (mismo horario y mismo equipo)
  for (const x of reservas) {
    const mismoDia = x.estado === 'Activa' && x.fecha === r.fecha;
    const mismoHorario = inicio < aMinutos(x.fin) && fin > aMinutos(x.inicio);
    if (mismoDia && mismoHorario && chocan(x.equipos, r.equipos)) {
      return 'Ya está ocupado (' + x.equipos.join(', ') + ' de ' + x.inicio + ' a ' + x.fin + ').';
    }
  }
  return null;
}
