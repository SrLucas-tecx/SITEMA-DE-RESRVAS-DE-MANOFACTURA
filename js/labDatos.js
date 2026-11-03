/* Datos de un laboratorio en un día: qué bloques están libres, ocupados o cerrados */
import { CFG } from './config.js';
import { aMinutos, aHora, ahora, hoy, sumarDias, diaSemana } from './utils.js';
import { usoLab, diaProhibido, implementosDeLab, reservasLabDe } from './estado.js';
import { bloquesLab } from './horarioLab.js';

// Estado de cada bloque: 'cerrado' | 'ocupado' | 'libre'
export function bloquesDeLab(lab, fecha, implemento = null) {
  const usos = usoLab(fecha).filter(u => u.lab === lab.id);
  const items = implementosDeLab(lab);
  const reservas = reservasLabDe(fecha).filter(r => r.lab === lab.id && r.estado === 'Activa');
  const abre = aMinutos(lab.abre), cierra = aMinutos(lab.cierra);
  const valorAnticipacion = lab.diasAnticipacion;
  const diasAnticipacion = valorAnticipacion !== '' && valorAnticipacion !== null &&
    valorAnticipacion !== undefined && Number.isInteger(Number(valorAnticipacion))
    ? Number(valorAnticipacion) : CFG.DIAS_ANTICIPACION;
  const diasDisponibles = Array.isArray(lab.diasDisponibles) ? lab.diasDisponibles : CFG.DIAS_LAB_DEFAULT;
  const minimo = sumarDias(hoy(), diasAnticipacion);
  return bloquesLab.map(t => {
    if (diaProhibido(fecha)) return { t, tipo: 'cerrado', motivo: 'Fin de semana' };
    if (!diasDisponibles.includes(diaSemana(fecha))) return { t, tipo: 'cerrado', motivo: 'Día no disponible' };
    if (fecha < minimo) return { t, tipo: 'cerrado', motivo: `Anticipación: ${diasAnticipacion} días` };
    if (fecha === hoy() && fecha + ' ' + aHora(t) < ahora()) return { t, tipo: 'cerrado', motivo: 'Horario pasado' };
    if (t < abre || t >= cierra) return { t, tipo: 'cerrado', motivo: 'Fuera de horario' };
    const uso = usos.find(u => aMinutos(u.inicio) <= t && t < aMinutos(u.fin));
    if (uso) return { t, tipo: 'ocupado', motivo: uso.motivo || 'Ocupado', uso };
    const ocupadas = reservas.filter(r => aMinutos(r.inicio) <= t && t < aMinutos(r.fin));
    if (implemento) {
      const reserva = ocupadas.find(r => r.equipos.includes(implemento.nombre));
      return reserva
        ? { t, tipo: 'ocupado', motivo: reserva.nombre, reserva }
        : { t, tipo: 'libre', motivo: '' };
    }
    if (!items.length) return { t, tipo: 'cerrado', motivo: 'Sin implementos' };
    const disponibles = items.some(item => !ocupadas.some(r => r.equipos.includes(item.nombre)));
    return disponibles
      ? { t, tipo: 'libre', motivo: '' }
      : { t, tipo: 'ocupado', motivo: 'Todos los implementos reservados' };
  });
}

// Junta bloques seguidos iguales en tramos: [{ ini, fin, tipo, motivo }]
export function tramos(slots) {
  const lista = [];
  for (const s of slots) {
    const ultimo = lista[lista.length - 1];
    const mismoUso = ultimo && ((!ultimo.uso && !s.uso) ||
      (ultimo.uso && s.uso && ultimo.uso.inicio === s.uso.inicio && ultimo.uso.fin === s.uso.fin));
    if (ultimo && ultimo.tipo === s.tipo && ultimo.motivo === s.motivo && mismoUso) ultimo.fin = s.t + 30;
    else lista.push({ ini: s.t, fin: s.t + 30, tipo: s.tipo, motivo: s.motivo, uso: s.uso });
  }
  return lista;
}

// Texto y color del estado: "ahora" si se mira hoy, resumen del día si se mira otro
function estadoDe(fecha, slots) {
  if (fecha === hoy()) {
    const [h, m] = ahora().slice(11).split(':').map(Number);
    const min = h * 60 + m, i = slots.findIndex(s => s.t <= min && min < s.t + 30);
    if (i < 0 || slots[i].tipo === 'cerrado') return { clase: 'cerrado', texto: 'Cerrado ahora' };
    const sig = slots.slice(i).find(s => s.tipo !== slots[i].tipo);   // primer bloque distinto
    const hasta = sig ? ' hasta las ' + aHora(sig.t) : ' hasta el cierre';
    return slots[i].tipo === 'libre'
      ? { clase: 'libre', texto: 'Libre ahora' + hasta }
      : { clase: 'ocupado', texto: 'Ocupado' + hasta + (slots[i].motivo ? ' · ' + slots[i].motivo : '') };
  }
  if (diaProhibido(fecha)) return { clase: 'cerrado', texto: 'Cerrado (fin de semana)' };
  const libres = slots.filter(s => s.tipo === 'libre').length / 2;
  const abiertas = slots.filter(s => s.tipo !== 'cerrado').length / 2;
  if (!libres) return { clase: 'ocupado', texto: 'Sin disponibilidad este día' };
  return libres === abiertas
    ? { clase: 'libre', texto: 'Libre todo el horario' }
    : { clase: 'libre', texto: `Disponible ${libres} h de ${abiertas} h` };
}

export function resumenLab(lab, fecha) {
  const slots = bloquesDeLab(lab, fecha);
  return { slots, estado: estadoDe(fecha, slots), tramos: tramos(slots) };
}
