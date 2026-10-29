/* Datos de un laboratorio en un día: qué bloques están libres, ocupados o cerrados */
import { aMinutos, aHora, ahora, hoy } from './utils.js';
import { usoLab, diaProhibido } from './estado.js';
import { bloques } from './horario.js';

// Estado de cada bloque de 30 min de ese laboratorio ese día: 'cerrado' | 'ocupado' | 'libre'
export function bloquesDeLab(lab, fecha) {
  const usos = usoLab(fecha).filter(u => u.lab === lab.id);
  const abre = aMinutos(lab.abre), cierra = aMinutos(lab.cierra);
  return bloques.map(t => {
    if (diaProhibido(fecha)) return { t, tipo: 'cerrado', motivo: 'Fin de semana' };
    if (t < abre || t >= cierra) return { t, tipo: 'cerrado', motivo: 'Fuera de horario' };
    const uso = usos.find(u => aMinutos(u.inicio) <= t && t < aMinutos(u.fin));
    return uso ? { t, tipo: 'ocupado', motivo: uso.motivo || 'Ocupado' } : { t, tipo: 'libre', motivo: '' };
  });
}

// Junta bloques seguidos iguales en tramos: [{ ini, fin, tipo, motivo }]
export function tramos(slots) {
  const lista = [];
  for (const s of slots) {
    const ultimo = lista[lista.length - 1];
    if (ultimo && ultimo.tipo === s.tipo && ultimo.motivo === s.motivo) ultimo.fin = s.t + 30;
    else lista.push({ ini: s.t, fin: s.t + 30, tipo: s.tipo, motivo: s.motivo });
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
