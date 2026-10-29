/* Almacenamiento: modo local (pruebas) o Google Sheets. El resto de la app solo usa `api` */
import { CFG } from './config.js';
import { validar, NOMBRE_EQUIPO } from './validacion.js';
import { hoy, esFinDeSemana } from './utils.js';

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
const leerLS = (clave, valorInicial) => { try { return JSON.parse(localStorage.getItem(clave)) || valorInicial; } catch (e) { return valorInicial; } };
const equiposLocal = () => leerLS(LSE, CFG.EQUIPOS.map(nombre => ({ nombre, color: CFG.COLORES[nombre] })));

const Local = {
  // La lista pública nunca incluye matrícula ni código
  async list() {
    const res = cargarLocal().map(({ matricula, pin, ...publico }) => publico);
    return { res, blq: bloqueosTodos(), equipos: equiposLocal(), autorizados: leerLS(LSA, []), laboratorios: leerLS(LSL, []), usoLab: leerLS(LSU, []) };
  },

  async create(r) {
    const todas = cargarLocal();
    if (!r.fechas || !r.fechas.length || r.fechas.length > CFG.MAX_DIAS) {
      return { error: 'Elige entre 1 y ' + CFG.MAX_DIAS + ' días.' };
    }
    // Se validan todos los días antes de guardar ninguno
    for (const f of r.fechas) {
      const error = validar({ ...r, fecha: f }, todas, bloqueosTodos(), leerLS(LSA, []));
      if (error) return { error: f + ': ' + error };
    }

    const pin = String(1000 + Math.floor(Math.random() * 9000));   // un código para todos los días
    r.fechas.forEach((f, i) => {
      const { fechas, ...resto } = r;
      todas.push({ ...resto, fecha: f, id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5) + i, pin, estado: 'Activa' });
    });
    guardarLocal(todas);
    return { ok: 1, pin, n: r.fechas.length };
  },

  async cancel(o) {
    const todas = cargarLocal();
    const x = todas.find(y => y.id === o.id && y.estado === 'Activa');
    if (!x) return { error: 'Reserva no encontrada.' };

    const esAdmin = esAdminLocal(o);
    if (o.admin && !esAdmin) return NO_ADMIN;
    const datosCorrectos = !o.admin &&
      x.matricula.toLowerCase() === String(o.matricula || '').trim().toLowerCase() &&
      x.pin === String(o.codigo || '').trim();
    if (!esAdmin && !datosCorrectos) return { error: 'Matrícula o código incorrectos.' };

    x.estado = 'Cancelada';
    guardarLocal(todas);
    return { ok: 1 };
  },

  // ----- Administrador -----
  async admin(codigo) { return esAdminLocal({ admin: codigo }) ? { ok: 1 } : NO_ADMIN; },

  async borrar(o) {
    if (!esAdminLocal(o)) return NO_ADMIN;
    guardarLocal(cargarLocal().filter(x => x.id !== o.id));
    return { ok: 1 };
  },

  async bloquear(o) {
    if (!esAdminLocal(o)) return NO_ADMIN;
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

  // ----- Laboratorios -----
  async labGuardar(o) {
    if (!esAdminLocal(o)) return NO_ADMIN;
    const nombre = String(o.nombre || '').trim(), lista = leerLS(LSL, []);
    if (!NOMBRE_EQUIPO.test(nombre)) return { error: 'Nombre inválido: usa letras, números y + - / ( ) . (máximo 30).' };
    if (!/^\d{2}:\d{2}$/.test(o.abre) || !/^\d{2}:\d{2}$/.test(o.cierra) || o.cierra <= o.abre) return { error: 'Horario de apertura inválido.' };
    if (lista.some(l => l.nombre.toLowerCase() === nombre.toLowerCase() && l.id !== o.id)) return { error: 'Ya existe un laboratorio con ese nombre.' };
    const datos = { nombre, ubicacion: String(o.ubicacion || '').trim().slice(0, 60), abre: o.abre, cierra: o.cierra };
    const i = lista.findIndex(l => l.id === o.id);
    if (o.id && i < 0) return { error: 'Laboratorio no encontrado.' };
    if (i >= 0) lista[i] = { id: o.id, ...datos }; else lista.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), ...datos });
    localStorage.setItem(LSL, JSON.stringify(lista));
    return { ok: 1 };
  },

  async labQuitar(o) {
    if (!esAdminLocal(o)) return NO_ADMIN;
    localStorage.setItem(LSL, JSON.stringify(leerLS(LSL, []).filter(l => l.id !== o.id)));
    localStorage.setItem(LSU, JSON.stringify(leerLS(LSU, []).filter(u => u.lab !== o.id)));
    return { ok: 1 };
  },

  async labOcupar(o) {
    if (!esAdminLocal(o)) return NO_ADMIN;
    if (!leerLS(LSL, []).some(l => l.id === o.lab)) return { error: 'Laboratorio no encontrado.' };
    if (!Array.isArray(o.fechas) || !o.fechas.length || o.fechas.length > 60) return { error: 'Elige entre 1 y 60 fechas.' };
    if (o.fin <= o.inicio) return { error: 'Horario inválido.' };
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
const Remote = {
  async list() {
    const respuesta = await fetch(CFG.API_URL + '?action=list');
    return respuesta.json();
  },
  async post(datos) {
    const respuesta = await fetch(CFG.API_URL, { method: 'POST', body: JSON.stringify(datos) });
    return respuesta.json();
  },
  create(r) { return this.post({ action: 'create', ...r }); },
  cancel(o) { return this.post({ action: 'cancel', ...o }); },
  admin(codigo) { return this.post({ action: 'admin', admin: codigo }); },
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
  labLiberar(o) { return this.post({ action: 'labLiberar', ...o }); }
};

// Si hay URL se usa Google Sheets; si no, el modo local
export const api = CFG.API_URL ? Remote : Local;
