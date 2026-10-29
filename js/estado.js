/* Estado compartido y consultas sobre los datos cargados */
import { CFG } from './config.js';
import { hoy, aMinutos, chocan, esFinDeSemana } from './utils.js';

export const estado = {
  fecha: hoy(),                  // día de referencia (el calendario se centra en él)
  vista: 'semana',               // 'dia' | 'semana' | 'mes'
  datos: { res: [], blq: [] },   // reservas y bloqueos (más equipos y autorizados cuando los manda el servidor)
  seleccionada: null,            // id de la reserva que se quiere cancelar
  admin: null,                   // código de administrador (solo en memoria; al recargar se sale)
  pantalla: 'calendario',        // 'calendario' | 'admin'
  seccion: 'celda',              // 'celda' | 'labs' (pestaña del calendario)
  labId: null                    // laboratorio que se está viendo en la pestaña Laboratorios
};

/* ---------- Material de la celda (lo registra el administrador) ---------- */
// Si el servidor no manda una lista, se usa la inicial de config.js
export const listaEquipos = () => Array.isArray(estado.datos.equipos)
  ? estado.datos.equipos
  : CFG.EQUIPOS.map(nombre => ({ nombre, color: CFG.COLORES[nombre] }));

export const nombresEquipos = () => listaEquipos().map(e => e.nombre);

export function colorDe(nombre) {
  const e = listaEquipos().find(x => x.nombre === nombre);
  return e && /^#[0-9a-f]{6}$/i.test(e.color) ? e.color : '#999999';
}

/* ---------- Sábados y domingos: prohibidos salvo autorización del administrador ---------- */
export const autorizados = () => estado.datos.autorizados || [];
export const autorizacion = fecha => autorizados().find(a => a.fecha === fecha);
export const diaProhibido = fecha => esFinDeSemana(fecha) && !autorizacion(fecha);

/* ---------- Reservas y bloqueos ---------- */
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

/* ---------- Laboratorios y sus ratos ocupados ---------- */
export const laboratorios = () => estado.datos.laboratorios || [];
export const usoLabTodos = () => estado.datos.usoLab || [];
export const usoLab = fecha => usoLabTodos().filter(u => u.fecha === fecha);

// Laboratorio elegido (si ya no existe, el primero)
export const labActual = () => laboratorios().find(l => l.id === estado.labId) || laboratorios()[0];
