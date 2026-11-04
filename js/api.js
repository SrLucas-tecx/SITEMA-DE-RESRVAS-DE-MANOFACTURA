/* Almacenamiento: modo local (pruebas) o Google Sheets. El resto de la app solo usa `api` */
import { CFG } from './config.js';
import { validar, NOMBRE_EQUIPO } from './validacion.js';
import { hoy, esFinDeSemana, aMinutos, ahora, sumarDias, diaSemana } from './utils.js';
import { conIndicador } from './procesando.js';

/* Modo LOCAL: guarda en este navegador (solo pruebas) */
const LS = 'reservas_celda_v1';

function cargarLocal() {
  try { return JSON.parse(localStorage.getItem(LS)) || []; }
  catch (e) { return []; }
}

function guardarLocal(lista) {
  localStorage.setItem(LS, JSON.stringify(lista));
}

// Bloqueos creados en modo local (se suman a CFG.BLOQUEOS)
const LSB = 'bloqueos_celda_v1';
const bloqueosLocal = () => { try { return JSON.parse(localStorage.getItem(LSB)) || []; } catch (e) { return []; } };
const bloqueosTodos = () => [...CFG.BLOQUEOS, ...bloqueosLocal()];
const esAdminLocal = o => !!CFG.ADMIN_LOCAL && String(o.admin || '').trim() === CFG.ADMIN_LOCAL;
const NO_ADMIN = { error: 'Código de administrador incorrecto (en modo local es ADMIN_LOCAL, en config.js).' };

// Material y fines de semana autorizados en modo local
const LSE = 'equipos_celda_v1', LSA = 'autorizados_celda_v1', LSL = 'labs_celda_v1', LSU = 'usolab_celda_v1';
const LSI = 'implementos_labs_v1', LSRL = 'reservas_labs_v1';
const LSC = 'config_celda_v1';
const leerLS = (clave, valorInicial) => { try { return JSON.parse(localStorage.getItem(clave)) || valorInicial; } catch (e) { return valorInicial; } };
const equiposLocal = () => leerLS(LSE, CFG.EQUIPOS.map(nombre => ({ nombre, color: CFG.COLORES[nombre] })));
const implementosLocal = () => leerLS(LSI, []);
const reservasLabLocal = () => leerLS(LSRL, []);
const diasLabValidos = dias => Array.isArray(dias) && dias.length > 0 &&
  dias.every(dia => Number.isInteger(dia) && dia >= 0 && dia <= 6) &&
  new Set(dias).size === dias.length;
const diasLab = lab => diasLabValidos(lab.diasDisponibles) ? lab.diasDisponibles : CFG.DIAS_LAB_DEFAULT;
const maxBloquesLab = lab => {
  const disponibles = Math.floor((aMinutos(lab.cierra) - aMinutos(lab.abre)) / 30);
  const configurado = Number.isInteger(Number(lab.maxBloques)) && Number(lab.maxBloques) > 0
    ? Number(lab.maxBloques) : CFG.MAX_BLOQUES;
  return Math.max(1, Math.min(configurado, disponibles));
};
const maxPersonasLab = lab => {
  const maximo = Number(lab.maxPersonas);
  return Number.isInteger(maximo) && maximo >= 1 && maximo <= CFG.MAX_PERSONAS
    ? maximo : CFG.MAX_PERSONAS;
};
const equiposParaFecha = (r, fecha) => {
  if (!Array.isArray(r.equiposPorFecha)) return Array.isArray(r.equipos) ? r.equipos : [];
  return r.equiposPorFecha.find(dia => dia.fecha === fecha)?.equipos || [];
};
const numeroPersonas = valor => valor === undefined || valor === null
  ? 1 : Number.isSafeInteger(Number(valor)) && Number(valor) >= 1 ? Number(valor) : null;
const configuracionCeldaLocal = () => ({
  nombre: CFG.NOMBRE_CELDA, abre: CFG.HORA_INI, cierra: CFG.HORA_FIN,
  diasAnticipacion: CFG.DIAS_ANTICIPACION, maxBloques: CFG.MAX_BLOQUES_CELDA, ...leerLS(LSC, {})
});
const horaValida = hora => /^\d{2}:\d{2}$/.test(hora) && aMinutos(hora) >= 0 &&
  aMinutos(hora) < 1440 && aMinutos(hora) % 30 === 0;
const horaLabValida = hora => /^\d{2}:\d{2}$/.test(hora) && aMinutos(hora) >= 0 &&
  aMinutos(hora) <= 1440 && aMinutos(hora) % 30 === 0;

const Local = {
  // La lista pública nunca incluye matrícula ni código
  async list() {
    const res = cargarLocal().map(({ matricula, pin, ...publico }) => publico);
    return {
      res, blq: bloqueosTodos(), equipos: equiposLocal(), autorizados: leerLS(LSA, []),
      configuracionCelda: configuracionCeldaLocal(),
      laboratorios: leerLS(LSL, []).map(l => ({
        ...l, maxBloques: maxBloquesLab(l), maxPersonas: maxPersonasLab(l), diasDisponibles: diasLab(l)
      })),
      usoLab: leerLS(LSU, []), implementosLab: implementosLocal(),
      resLab: reservasLabLocal().map(({ matricula, pin, ...publico }) => publico)
    };
  },

  async create(r) {
    const todas = cargarLocal();
    const duracionAutorizada = r.autorizarDuracion === true && esAdminLocal(r);
    if (r.autorizarDuracion === true && !duracionAutorizada) return NO_ADMIN;
    const maxBloques = Number(configuracionCeldaLocal().maxBloques) || CFG.MAX_BLOQUES_CELDA;
    const personas = numeroPersonas(r.personas);
    if (personas === null || personas > CFG.MAX_PERSONAS) {
      return { error: `El número de personas debe ser un entero entre 1 y ${CFG.MAX_PERSONAS}.` };
    }
    if (!Array.isArray(r.fechas) || !r.fechas.length || r.fechas.length > CFG.MAX_DIAS) {
      return { error: 'Elige entre 1 y ' + CFG.MAX_DIAS + ' fechas.' };
    }
    if (r.fechas.some(fecha => typeof fecha !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(fecha))) {
      return { error: 'Fecha inválida.' };
    }
    if (new Set(r.fechas.map(fecha => fecha.slice(0, 7))).size > 1) {
      return { error: 'Todas las fechas de una reserva deben pertenecer al mismo mes.' };
    }
    if (r.variosDias === false && r.fechas.length > 1) {
      return { error: 'Solo se permite una fecha si no activas la reserva de varios días.' };
    }
    // Se validan todos los días antes de guardar ninguno
    for (const f of r.fechas) {
      const error = validar({ ...r, fecha: f, equipos: equiposParaFecha(r, f) }, todas, bloqueosTodos(), leerLS(LSA, []), {
        maxBloques, duracionAutorizada
      });
      if (error) return { error: f + ': ' + error };
    }

    const pin = String(1000 + Math.floor(Math.random() * 9000));   // un código para todos los días
    r.fechas.forEach((f, i) => {
      const { fechas, equiposPorFecha, variosDias, admin, autorizarDuracion, ...resto } = r;
      todas.push({ ...resto, equipos: equiposParaFecha(r, f), personas, fecha: f, id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5) + i, pin, estado: 'Activa' });
    });
    guardarLocal(todas);
    return { ok: 1, pin, n: r.fechas.length };
  },

  async cancel(o) {
    const todas = o.tipo === 'lab' ? reservasLabLocal() : cargarLocal();
    const x = todas.find(y => y.id === o.id && y.estado === 'Activa');
    if (!x) return { error: 'Reserva no encontrada.' };

    const esAdmin = esAdminLocal(o);
    if (o.admin && !esAdmin) return NO_ADMIN;
    const datosCorrectos = !o.admin &&
      x.matricula.toLowerCase() === String(o.matricula || '').trim().toLowerCase() &&
      x.pin === String(o.codigo || '').trim();
    if (!esAdmin && !datosCorrectos) return { error: 'Matrícula o código incorrectos.' };

    if (o.alcance === 'material') {
      if (!Array.isArray(x.equipos) || !x.equipos.includes(o.equipo)) return { error: 'El material seleccionado no forma parte de esta reserva.' };
      if (x.equipos.length < 2) return { error: 'Esta reserva solo tiene un material; cancélala completa.' };
      x.equipos = x.equipos.filter(e => e !== o.equipo);
    } else {
      x.estado = 'Cancelada';
    }
    if (o.tipo === 'lab') localStorage.setItem(LSRL, JSON.stringify(todas));
    else guardarLocal(todas);
    return { ok: 1, parcial: o.alcance === 'material' };
  },

  // ----- Administrador -----
  async admin(codigo) { return esAdminLocal({ admin: codigo }) ? { ok: 1 } : NO_ADMIN; },

  async borrar(o) {
    if (!esAdminLocal(o)) return NO_ADMIN;
    if (o.tipo === 'lab') localStorage.setItem(LSRL, JSON.stringify(reservasLabLocal().filter(x => x.id !== o.id)));
    else guardarLocal(cargarLocal().filter(x => x.id !== o.id));
    return { ok: 1 };
  },

  async bloquear(o) {
    if (!esAdminLocal(o)) return NO_ADMIN;
    if (!Array.isArray(o.fechas) || !o.fechas.length || o.fechas.length > 365) {
      return { error: 'Elige entre 1 y 365 fechas para bloquear.' };
    }
    if (o.fechas.some(fecha => !/^\d{4}-\d{2}-\d{2}$/.test(fecha))) return { error: 'Fecha inválida.' };
    if (!horaValida(o.inicio) || !horaValida(o.fin) || aMinutos(o.fin) <= aMinutos(o.inicio)) {
      return { error: 'Horario inválido.' };
    }
    const lista = bloqueosLocal();
    o.fechas.forEach(fecha => lista.push({ fecha, inicio: o.inicio, fin: o.fin, motivo: o.motivo }));
    localStorage.setItem(LSB, JSON.stringify(lista));
    return { ok: 1, n: o.fechas.length };
  },

  async desbloquear(o) {
    if (!esAdminLocal(o)) return NO_ADMIN;
    const resto = bloqueosLocal().filter(b => !(b.fecha === o.fecha && b.inicio === o.inicio && b.fin === o.fin));
    localStorage.setItem(LSB, JSON.stringify(resto));
    return { ok: 1 };
  },

  // ----- Material y fines de semana -----
  async equipoGuardar(o) {
    if (!esAdminLocal(o)) return NO_ADMIN;
    const nombre = String(o.nombre || '').trim(), lista = equiposLocal();
    if (!NOMBRE_EQUIPO.test(nombre)) return { error: 'Nombre inválido: usa letras, números y + - / ( ) . (máximo 30).' };
    if (!/^#[0-9a-f]{6}$/i.test(o.color)) return { error: 'Color inválido.' };
    if (lista.some(e => e.nombre.toLowerCase() === nombre.toLowerCase() && e.nombre !== o.anterior)) return { error: 'Ya existe un material con ese nombre.' };
    const i = lista.findIndex(e => e.nombre === o.anterior);
    if (o.anterior && i < 0) return { error: 'Material no encontrado.' };
    if (i >= 0) {
      const todas = cargarLocal();   // al renombrar también se actualizan las reservas
      todas.forEach(x => { x.equipos = x.equipos.map(e => e === o.anterior ? nombre : e); });
      guardarLocal(todas);
      lista[i] = { nombre, color: o.color };
    } else {
      lista.push({ nombre, color: o.color });
    }
    localStorage.setItem(LSE, JSON.stringify(lista));
    return { ok: 1 };
  },

  async equipoQuitar(o) {
    if (!esAdminLocal(o)) return NO_ADMIN;
    const usadas = cargarLocal().filter(x => x.estado === 'Activa' && x.fecha >= hoy() && x.equipos.includes(o.nombre)).length;
    if (usadas) return { error: `Tiene ${usadas} reserva(s) activa(s). Cancélalas primero.` };
    localStorage.setItem(LSE, JSON.stringify(equiposLocal().filter(e => e.nombre !== o.nombre)));
    return { ok: 1 };
  },

  async autorizar(o) {
    if (!esAdminLocal(o)) return NO_ADMIN;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(o.fecha) || !esFinDeSemana(o.fecha)) return { error: 'Elige un sábado o un domingo.' };
    const lista = leerLS(LSA, []);
    if (lista.some(a => a.fecha === o.fecha)) return { error: 'Esa fecha ya está autorizada.' };
    lista.push({ fecha: o.fecha, motivo: String(o.motivo || '').trim().slice(0, 60) });
    localStorage.setItem(LSA, JSON.stringify(lista));
    return { ok: 1 };
  },

  async desautorizar(o) {
    if (!esAdminLocal(o)) return NO_ADMIN;
    const usadas = cargarLocal().filter(x => x.estado === 'Activa' && x.fecha === o.fecha).length;
    if (usadas) return { error: `Hay ${usadas} reserva(s) activa(s) ese día. Cancélalas primero.` };
    localStorage.setItem(LSA, JSON.stringify(leerLS(LSA, []).filter(a => a.fecha !== o.fecha)));
    return { ok: 1 };
  },

  async celdaGuardar(o) {
    if (!esAdminLocal(o)) return NO_ADMIN;
    const nombre = String(o.nombre || '').trim();
    const diasAnticipacion = Number(o.diasAnticipacion);
    const maxBloques = Number(o.maxBloques);
    if (!NOMBRE_EQUIPO.test(nombre)) return { error: 'Nombre inválido: usa letras, números y + - / ( ) . (máximo 30).' };
    if (!horaValida(o.abre) || !horaValida(o.cierra) || aMinutos(o.cierra) > 1410 || aMinutos(o.cierra) <= aMinutos(o.abre)) {
      return { error: 'Horario inválido: usa horas en intervalos de 30 minutos y asegúrate de que el cierre sea posterior a la apertura.' };
    }
    if (o.diasAnticipacion === '' || o.diasAnticipacion === null || o.diasAnticipacion === undefined ||
        !Number.isInteger(diasAnticipacion) || diasAnticipacion < 0 || diasAnticipacion > 365) {
      return { error: 'La anticipación debe ser un número entero entre 0 y 365 días.' };
    }
    if (o.maxBloques === '' || o.maxBloques === null || o.maxBloques === undefined ||
        !Number.isInteger(maxBloques) || maxBloques < 1 || maxBloques > 48 ||
        maxBloques * 30 > aMinutos(o.cierra) - aMinutos(o.abre)) {
      return { error: 'La duración máxima debe ser de al menos 30 minutos y no superar el horario disponible de la celda.' };
    }
    if (cargarLocal().some(r => r.estado === 'Activa' && r.fecha >= hoy() &&
        (aMinutos(r.inicio) < aMinutos(o.abre) || aMinutos(r.fin) > aMinutos(o.cierra)))) {
      return { error: 'El horario nuevo dejaría reservas activas fuera de horario. Cancélalas o ajusta el horario antes.' };
    }
    localStorage.setItem(LSC, JSON.stringify({ nombre, abre: o.abre, cierra: o.cierra, diasAnticipacion, maxBloques }));
    return { ok: 1 };
  },

  // ----- Laboratorios -----
  async labGuardar(o) {
    if (!esAdminLocal(o)) return NO_ADMIN;
    const nombre = String(o.nombre || '').trim(), lista = leerLS(LSL, []);
    const nuevo = !o.id;
    const abre = nuevo && (o.abre === undefined || o.abre === null) ? CFG.HORA_INI : o.abre;
    const cierra = nuevo && (o.cierra === undefined || o.cierra === null) ? CFG.HORA_FIN : o.cierra;
    const valorAnticipacion = nuevo && (o.diasAnticipacion === undefined || o.diasAnticipacion === null)
      ? CFG.DIAS_ANTICIPACION : o.diasAnticipacion;
    const diasAnticipacion = Number(valorAnticipacion);
    const diasDisponibles = nuevo && (o.diasDisponibles === undefined || o.diasDisponibles === null)
      ? CFG.DIAS_LAB_DEFAULT.slice() : o.diasDisponibles;
    const valorMaxPersonas = o.maxPersonas === undefined || o.maxPersonas === null
      ? CFG.MAX_PERSONAS : o.maxPersonas;
    const maxPersonas = Number(valorMaxPersonas);
    const valorMaxBloques = nuevo && (o.maxBloques === undefined || o.maxBloques === null)
      ? CFG.MAX_BLOQUES : o.maxBloques;
    if (!NOMBRE_EQUIPO.test(nombre)) return { error: 'Nombre inválido: usa letras, números y + - / ( ) . (máximo 30).' };
    if (!horaLabValida(abre) || !horaLabValida(cierra) || aMinutos(abre) >= 1440 ||
        aMinutos(cierra) <= aMinutos(abre)) return { error: 'Horario de apertura inválido.' };
    const maxBloques = Number(valorMaxBloques);
    if (valorAnticipacion === '' || valorAnticipacion === null || valorAnticipacion === undefined ||
        !Number.isInteger(diasAnticipacion) || diasAnticipacion < 0 || diasAnticipacion > 365) {
      return { error: 'La anticipación debe ser un número entero entre 0 y 365 días.' };
    }
    if (valorMaxBloques === '' || !Number.isInteger(maxBloques) || maxBloques < 1 || maxBloques > 48 ||
        maxBloques * 30 > aMinutos(cierra) - aMinutos(abre)) {
      return { error: 'La duración máxima debe ser de al menos 30 minutos y no superar el horario disponible del laboratorio.' };
    }
    if (!diasLabValidos(diasDisponibles)) return { error: 'Selecciona al menos un día disponible.' };
    if (valorMaxPersonas === '' || !Number.isInteger(maxPersonas) || maxPersonas < 1 || maxPersonas > CFG.MAX_PERSONAS) {
      return { error: `El máximo de personas debe ser un entero entre 1 y ${CFG.MAX_PERSONAS}.` };
    }
    if (lista.some(l => l.nombre.toLowerCase() === nombre.toLowerCase() && l.id !== o.id)) return { error: 'Ya existe un laboratorio con ese nombre.' };
    const datos = { nombre, ubicacion: String(o.ubicacion || '').trim().slice(0, 60), abre, cierra, diasAnticipacion, diasDisponibles, maxBloques, maxPersonas };
    const i = lista.findIndex(l => l.id === o.id);
    if (o.id && i < 0) return { error: 'Laboratorio no encontrado.' };
    const reservasActivas = reservasLabLocal().filter(r =>
      r.lab === o.id && r.estado === 'Activa' && r.fecha >= hoy());
    if (i >= 0 && reservasActivas.some(r =>
      aMinutos(r.inicio) < aMinutos(abre) || aMinutos(r.fin) > aMinutos(cierra))) {
      return { error: 'El nuevo horario dejaría una reserva activa fuera de horario. Cancélala o ajusta el horario de la reserva primero.' };
    }
    if (i >= 0 && reservasActivas.some(r => !diasDisponibles.includes(diaSemana(r.fecha)))) {
      return { error: 'Los nuevos días no están disponibles para una reserva activa. Cancélala o conserva ese día habilitado.' };
    }
    if (i >= 0) lista[i] = { id: o.id, ...datos }; else lista.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), ...datos });
    localStorage.setItem(LSL, JSON.stringify(lista));
    return { ok: 1 };
  },

  async labQuitar(o) {
    if (!esAdminLocal(o)) return NO_ADMIN;
    localStorage.setItem(LSL, JSON.stringify(leerLS(LSL, []).filter(l => l.id !== o.id)));
    localStorage.setItem(LSU, JSON.stringify(leerLS(LSU, []).filter(u => u.lab !== o.id)));
    localStorage.setItem(LSI, JSON.stringify(implementosLocal().filter(i => i.lab !== o.id)));
    localStorage.setItem(LSRL, JSON.stringify(reservasLabLocal().filter(r => r.lab !== o.id)));
    return { ok: 1 };
  },

  async labImplementoGuardar(o) {
    if (!esAdminLocal(o)) return NO_ADMIN;
    const nombre = String(o.nombre || '').trim(), lista = implementosLocal();
    if (!NOMBRE_EQUIPO.test(nombre)) return { error: 'Nombre inválido: usa letras, números y + - / ( ) . (máximo 30).' };
    if (!/^#[0-9a-f]{6}$/i.test(o.color)) return { error: 'Color inválido.' };
    if (!leerLS(LSL, []).some(l => l.id === o.lab)) return { error: 'Laboratorio no encontrado.' };
    if (lista.some(i => i.lab === o.lab && i.nombre.toLowerCase() === nombre.toLowerCase() && i.id !== o.id)) return { error: 'Ya existe un implemento con ese nombre en este laboratorio.' };
    const actual = lista.find(i => i.id === o.id && i.lab === o.lab);
    if (o.id && !actual) return { error: 'Implemento no encontrado.' };
    if (actual) {
      const anterior = actual.nombre;
      actual.nombre = nombre;
      actual.color = o.color;
      const reservas = reservasLabLocal();
      reservas.forEach(r => {
        if (r.lab === o.lab) r.equipos = r.equipos.map(e => e === anterior ? nombre : e);
      });
      localStorage.setItem(LSRL, JSON.stringify(reservas));
    } else {
      lista.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), lab: o.lab, nombre, color: o.color });
    }
    localStorage.setItem(LSI, JSON.stringify(lista));
    return { ok: 1 };
  },

  async labImplementoQuitar(o) {
    if (!esAdminLocal(o)) return NO_ADMIN;
    const item = implementosLocal().find(i => i.id === o.id && i.lab === o.lab);
    if (!item) return { error: 'Implemento no encontrado.' };
    const usadas = reservasLabLocal().filter(r => r.lab === o.lab && r.estado === 'Activa' && r.fecha >= hoy() && r.equipos.includes(item.nombre)).length;
    if (usadas) return { error: `Tiene ${usadas} reserva(s) activa(s). Cancélalas primero.` };
    localStorage.setItem(LSI, JSON.stringify(implementosLocal().filter(i => i.id !== o.id)));
    return { ok: 1 };
  },

  async createLab(r) {
    const duracionAutorizada = r.autorizarDuracion === true && esAdminLocal(r);
    if (r.autorizarDuracion === true && !duracionAutorizada) return NO_ADMIN;
    const personas = numeroPersonas(r.personas);
    const lab = leerLS(LSL, []).find(l => l.id === r.lab);
    if (!lab) return { error: 'Laboratorio no encontrado.' };
    const maxPersonas = maxPersonasLab(lab);
    if (personas === null || personas > maxPersonas) {
      return { error: `El número de personas debe ser un entero entre 1 y ${maxPersonas}.` };
    }
    const implementos = implementosLocal().filter(i => i.lab === r.lab).map(i => i.nombre);
    if (!r.nombre || r.nombre.trim().length < 3) return { error: 'Escribe tu nombre completo.' };
    if (!r.matricula || r.matricula.trim().length < 4) return { error: 'Escribe tu matrícula.' };
    if (!Array.isArray(r.fechas) || !r.fechas.length || r.fechas.length > CFG.MAX_DIAS) return { error: `Elige entre 1 y ${CFG.MAX_DIAS} fechas.` };
    if (r.variosDias === false && r.fechas.length > 1) return { error: 'Solo se permite una fecha si no activas la reserva de varios días.' };
    if (r.fechas.some(f => !/^\d{4}-\d{2}-\d{2}$/.test(f))) return { error: 'Fecha inválida.' };
    if (new Set(r.fechas.map(f => f.slice(0, 7))).size > 1) return { error: 'Todas las fechas de una reserva deben pertenecer al mismo mes.' };
    const inicio = aMinutos(r.inicio), fin = aMinutos(r.fin);
    const maxBloques = maxBloquesLab(lab);
    if (inicio % 30 !== 0 || fin % 30 !== 0 || fin - inicio < 30 ||
        (fin - inicio > 30 * maxBloques && !duracionAutorizada)) {
      return { error: `Duración máxima: ${maxBloques * 30} minutos. El administrador debe autorizar más tiempo.` };
    }
    if (inicio < aMinutos(lab.abre) || fin > aMinutos(lab.cierra)) return { error: 'Fuera del horario de apertura del laboratorio.' };
    const autorizados = leerLS(LSA, []);
    const reservas = reservasLabLocal();
    const usos = leerLS(LSU, []);
    const diasAnticipacion = lab.diasAnticipacion !== '' && lab.diasAnticipacion !== null &&
      lab.diasAnticipacion !== undefined && Number.isInteger(Number(lab.diasAnticipacion))
      ? Number(lab.diasAnticipacion) : CFG.DIAS_ANTICIPACION;
    const disponibles = diasLab(lab);
    for (const fecha of r.fechas) {
      const equiposDia = equiposParaFecha(r, fecha);
      if (!equiposDia.length) return { error: `${fecha}: elige al menos un implemento para este día.` };
      if (equiposDia.some(e => !implementos.includes(e))) return { error: 'El servidor no reconoce uno de los implementos. Recarga la página.' };
      if (fecha < sumarDias(hoy(), diasAnticipacion)) return { error: `${fecha}: este laboratorio requiere ${diasAnticipacion} días de anticipación.` };
      if (!disponibles.includes(diaSemana(fecha))) return { error: `${fecha}: este laboratorio no está disponible ese día de la semana.` };
      if (esFinDeSemana(fecha) && !autorizados.some(a => a.fecha === fecha)) return { error: `${fecha}: los sábados y domingos no se pueden apartar (solo con autorización del administrador).` };
      if (fecha + ' ' + r.inicio < ahora()) return { error: `${fecha}: ese horario ya pasó.` };
      if (reservas.some(x => x.estado === 'Activa' && x.lab === r.lab && x.fecha === fecha && inicio < aMinutos(x.fin) && fin > aMinutos(x.inicio) && x.equipos.some(e => equiposDia.includes(e)))) {
        return { error: `${fecha}: uno de los implementos ya está reservado en ese horario.` };
      }
      if (usos.some(u => u.lab === r.lab && u.fecha === fecha && inicio < aMinutos(u.fin) && fin > aMinutos(u.inicio))) return { error: `${fecha}: el laboratorio está ocupado por una actividad.` };
    }
    const pin = String(1000 + Math.floor(Math.random() * 9000));
    r.fechas.forEach((fecha, i) => {
      const { fechas, equiposPorFecha, variosDias, admin, autorizarDuracion, ...resto } = r;
      reservas.push({ ...resto, equipos: equiposParaFecha(r, fecha), personas, fecha, id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5) + i, pin, estado: 'Activa' });
    });
    localStorage.setItem(LSRL, JSON.stringify(reservas));
    return { ok: 1, pin, n: r.fechas.length };
  },

  async labOcupar(o) {
    if (!esAdminLocal(o)) return NO_ADMIN;
    const lab = leerLS(LSL, []).find(l => l.id === o.lab);
    if (!lab) return { error: 'Laboratorio no encontrado.' };
    if (!Array.isArray(o.fechas) || !o.fechas.length || o.fechas.length > 365) return { error: 'Elige entre 1 y 365 fechas para bloquear.' };
    if (!/^\d{2}:\d{2}$/.test(o.inicio) || !/^\d{2}:\d{2}$/.test(o.fin) || aMinutos(o.fin) <= aMinutos(o.inicio)) return { error: 'Horario inválido.' };
    if (aMinutos(o.inicio) < aMinutos(lab.abre) || aMinutos(o.fin) > aMinutos(lab.cierra)) return { error: 'Fuera del horario de apertura del laboratorio.' };
    if (o.fechas.some(fecha => !/^\d{4}-\d{2}-\d{2}$/.test(fecha))) return { error: 'Fecha inválida.' };
    const reservas = reservasLabLocal().filter(r => r.lab === o.lab && r.estado === 'Activa');
    if (reservas.some(r => o.fechas.includes(r.fecha) && aMinutos(o.inicio) < aMinutos(r.fin) && aMinutos(o.fin) > aMinutos(r.inicio))) {
      return { error: 'Hay reservas activas de implementos en ese horario. Cancélalas primero.' };
    }
    const lista = leerLS(LSU, []);
    o.fechas.forEach(fecha => lista.push({ lab: o.lab, fecha, inicio: o.inicio, fin: o.fin, motivo: String(o.motivo || '').trim().slice(0, 60) }));
    localStorage.setItem(LSU, JSON.stringify(lista));
    return { ok: 1, n: o.fechas.length };
  },

  async labLiberar(o) {
    if (!esAdminLocal(o)) return NO_ADMIN;
    localStorage.setItem(LSU, JSON.stringify(leerLS(LSU, []).filter(u => !(u.lab === o.lab && u.fecha === o.fecha && u.inicio === o.inicio && u.fin === o.fin))));
    return { ok: 1 };
  }
};

/* Modo REMOTO: habla con el Apps Script (Google Sheets) */
// Si el servidor no responde en 25 s se corta la petición (así la página nunca se queda esperando para siempre)
async function pedir(url, opciones) {
  const control = new AbortController();
  const corte = setTimeout(() => control.abort(), 25000);
  try {
    const respuesta = await fetch(url, { ...opciones, signal: control.signal });
    return await respuesta.json();
  } finally { clearTimeout(corte); }
}

const Remote = {
  list() { return pedir(CFG.API_URL + '?action=list'); },
  post(datos) { return pedir(CFG.API_URL, { method: 'POST', body: JSON.stringify(datos) }); },
  create(r) { return this.post({ action: 'create', ...r }); },
  cancel(o) { return this.post({ action: 'cancel', ...o }); },
  admin(codigo) { return this.post({ action: 'admin', admin: codigo }); },
  celdaGuardar(o) { return this.post({ action: 'celdaGuardar', ...o }); },
  borrar(o) { return this.post({ action: 'borrar', ...o }); },
  bloquear(o) { return this.post({ action: 'bloquear', ...o }); },
  desbloquear(o) { return this.post({ action: 'desbloquear', ...o }); },
  equipoGuardar(o) { return this.post({ action: 'equipoGuardar', ...o }); },
  equipoQuitar(o) { return this.post({ action: 'equipoQuitar', ...o }); },
  autorizar(o) { return this.post({ action: 'autorizar', ...o }); },
  desautorizar(o) { return this.post({ action: 'desautorizar', ...o }); },
  labGuardar(o) { return this.post({ action: 'labGuardar', ...o }); },
  labQuitar(o) { return this.post({ action: 'labQuitar', ...o }); },
  labOcupar(o) { return this.post({ action: 'labOcupar', ...o }); },
  labLiberar(o) { return this.post({ action: 'labLiberar', ...o }); },
  labImplementoGuardar(o) { return this.post({ action: 'labImplementoGuardar', ...o }); },
  labImplementoQuitar(o) { return this.post({ action: 'labImplementoQuitar', ...o }); },
  createLab(r) { return this.post({ action: 'createLab', ...r }); }
};

// Si hay URL se usa Google Sheets; si no, el modo local
const base = CFG.API_URL ? Remote : Local;

// Cada llamada muestra el indicador "Procesando…" mientras espera al servidor
const TEXTOS = {
  list: 'Cargando…', create: 'Guardando tu reserva…', createLab: 'Guardando tu reserva…',
  cancel: 'Cancelando…', admin: 'Verificando…', borrar: 'Eliminando…',
  celdaGuardar: 'Guardando configuración…',
  labImplementoGuardar: 'Guardando implemento…', labImplementoQuitar: 'Quitando implemento…'
};
export const api = new Proxy(base, {
  get(objeto, nombre) {
    const f = objeto[nombre];
    return typeof f === 'function' ? (...args) => conIndicador(() => f.apply(objeto, args), TEXTOS[nombre]) : f;
  }
});

// Sin indicador: para la actualización automática de cada minuto (no debe verse)
export const apiDirecta = base;
