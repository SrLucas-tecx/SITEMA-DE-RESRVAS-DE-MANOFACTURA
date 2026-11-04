/* Validación de reservas (horario, duración, bloqueos y choques) */
import { CFG } from './config.js';
import { aMinutos, ahora, chocan, hoy, sumarDias, esFinDeSemana } from './utils.js';

// Primer día que ya se puede apartar (hoy + días de anticipación)
export const fechaMinima = (dias = CFG.DIAS_ANTICIPACION) => sumarDias(hoy(), dias);

// Nombre permitido para un material (letras, números, espacios y + - / ( ) .)
export const NOMBRE_EQUIPO = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9 +\-\/().]{1,30}$/;
export const normalizarMatricula = matricula => {
  const valor = String(matricula || '').trim().toUpperCase();
  if (/^\d{7}$/.test(valor)) return 'AL0' + valor;
  if (/^AL0\d{7}$/.test(valor)) return valor;
  return /^AL\d{7}$/.test(valor) ? 'AL0' + valor.slice(2) : null;
};
export const matriculaValida = matricula => normalizarMatricula(matricula) !== null;

// Devuelve un texto con el error, o null si la reserva es válida.
// autorizados = sábados o domingos que el administrador permitió: [{ fecha, motivo }]
export function validar(r, reservas, bloqueos, autorizados = [], opciones = {}) {
  if (!r.nombre || r.nombre.trim().length < 3) return 'Escribe tu nombre completo.';
  if (!matriculaValida(r.matricula)) return 'La matrícula debe iniciar con AL0 y tener exactamente 7 dígitos numéricos.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(r.fecha)) return 'Elige una fecha.';
  if (!r.equipos.length) return 'Elige al menos una parte de la celda.';

  const inicio = aMinutos(r.inicio);
  const fin = aMinutos(r.fin);

  const maxBloques = opciones.maxBloques || CFG.MAX_BLOQUES_CELDA;
  if (fin - inicio < 30 || (fin - inicio > 30 * maxBloques && !opciones.duracionAutorizada)) {
    return 'Duración máxima: ' + maxBloques * 30 + ' minutos. El administrador debe autorizar más tiempo.';
  }
  if (inicio < aMinutos(CFG.HORA_INI) || fin > aMinutos(CFG.HORA_FIN)) {
    return 'Fuera del horario de la celda.';
  }
  if (r.fecha < fechaMinima()) {
    return 'Hay que apartar con ' + CFG.DIAS_ANTICIPACION + ' días de anticipación. Primer día disponible: ' + fechaMinima() + '.';
  }
  if (esFinDeSemana(r.fecha) && !autorizados.some(a => a.fecha === r.fecha)) {
    return 'Los sábados y domingos no se pueden apartar (solo con autorización del administrador).';
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
