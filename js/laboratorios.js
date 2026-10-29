/* Sección LABORATORIOS: cada laboratorio muestra si está libre u ocupado y cómo va su día */
import { CFG } from './config.js';
import { $, aMinutos, aHora, ahora, hoy, escapar, nombreDia } from './utils.js';
import { estado, laboratorios, usoLab, diaProhibido } from './estado.js';
import { bloques } from './horario.js';

// Estado de cada bloque de 30 min de ese laboratorio ese día: 'cerrado' | 'ocupado' | 'libre'
function bloquesDeLab(lab, fecha) {
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
function tramos(slots) {
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

export function dibujarLabs() {
  const fecha = estado.fecha;
  $('#tituloLabs').textContent = 'Disponibilidad del ' + nombreDia(fecha) + ' ' + fecha;
  const inicio = aMinutos(CFG.HORA_INI), total = aMinutos(CFG.HORA_FIN) - inicio;
  const horas = [0, 1, 2, 3, 4].map(k => `<small>${aHora(inicio + total * k / 4)}</small>`).join('');

  $('#listaLabsPublica').innerHTML = laboratorios().map(lab => {
    const r = resumenLab(lab, fecha);
    const barra = r.tramos.map(s =>
      `<span class="seg ${s.tipo}" style="left:${(s.ini - inicio) / total * 100}%;width:${(s.fin - s.ini) / total * 100}%" ` +
      `title="${escapar(aHora(s.ini) + '–' + aHora(s.fin) + (s.motivo ? ' · ' + s.motivo : ''))}"></span>`).join('');
    const usos = r.tramos.filter(s => s.tipo === 'ocupado')
      .map(s => `<li>${aHora(s.ini)}–${aHora(s.fin)} · ${escapar(s.motivo)}</li>`).join('');
    return `<article class="lab"><div class="lab-cab"><div><b>${escapar(lab.nombre)}</b>` +
      `<small>${lab.abre}–${lab.cierra}${lab.ubicacion ? ' · ' + escapar(lab.ubicacion) : ''}</small></div>` +
      `<span class="estado-lab ${r.estado.clase}">${escapar(r.estado.texto)}</span></div>` +
      `<div class="barra">${barra}</div><div class="horas">${horas}</div>` +
      (usos ? `<ul class="usos">${usos}</ul>` : '') + '</article>';
  }).join('') || '<p class="sub">Todavía no hay laboratorios registrados. El administrador puede agregarlos desde su panel.</p>';
}
