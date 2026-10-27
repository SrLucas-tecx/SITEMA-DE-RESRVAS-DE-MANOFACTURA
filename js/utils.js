/* Utilidades: horas, fechas y funciones pequeñas que usan los demás módulos */

export const $ = selector => document.querySelector(selector);

// "14:30" -> 870 (minutos desde medianoche)
export function aMinutos(hora) {
  const [h, min] = hora.split(':');
  return Number(h) * 60 + Number(min);
}

// 870 -> "14:30"
export function aHora(minutos) {
  const h = String(Math.floor(minutos / 60)).padStart(2, '0');
  const min = String(minutos % 60).padStart(2, '0');
  return h + ':' + min;
}

const dos = n => String(n).padStart(2, '0');

// Date -> "2026-10-28"
export function formatoFecha(d) {
  return d.getFullYear() + '-' + dos(d.getMonth() + 1) + '-' + dos(d.getDate());
}

export const hoy = () => formatoFecha(new Date());

// "2026-10-28 14:30" (hora actual, para comparar con horarios)
export function ahora() {
  const d = new Date();
  return formatoFecha(d) + ' ' + dos(d.getHours()) + ':' + dos(d.getMinutes());
}

// Suma o resta días a una fecha "YYYY-MM-DD"
export function sumarDias(fecha, n) {
  const d = new Date(fecha + 'T12:00');
  d.setDate(d.getDate() + n);
  return formatoFecha(d);
}

// ¿Dos listas de equipos usan algo en común?
export function chocan(a, b) {
  return a.some(equipo => b.includes(equipo));
}

// Evita que un nombre escrito por alguien rompa la página
export function escapar(texto) {
  const mapa = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
  return String(texto).replace(/[&<>"]/g, c => mapa[c]);
}

/* ---------- Calendario: semanas, meses y nombres ---------- */
const DIAS = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

// Lunes de la semana de una fecha "YYYY-MM-DD"
export function inicioSemana(fecha) {
  const d = new Date(fecha + 'T12:00');
  d.setDate(d.getDate() - (d.getDay() + 6) % 7);
  return formatoFecha(d);
}

// Mueve la fecha n meses (queda en el día 1 para evitar saltos raros)
export function sumarMeses(fecha, n) {
  const d = new Date(fecha + 'T12:00');
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  return formatoFecha(d);
}

export const nombreDia = fecha => DIAS[(new Date(fecha + 'T12:00').getDay() + 6) % 7];
export const nombresDias = () => DIAS;
export const diaDelMes = fecha => Number(fecha.slice(8));
export function nombreMes(fecha) {
  const d = new Date(fecha + 'T12:00');
  return MESES[d.getMonth()] + ' ' + d.getFullYear();
}
