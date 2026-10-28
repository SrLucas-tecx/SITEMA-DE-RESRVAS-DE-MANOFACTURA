/* Almacenamiento: modo local (pruebas) o Google Sheets. El resto de la app solo usa `api` */
import { CFG } from './config.js';
import { validar } from './validacion.js';

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

const Local = {
  // La lista pública nunca incluye matrícula ni código
  async list() {
    const res = cargarLocal().map(({ matricula, pin, ...publico }) => publico);
    return { res, blq: bloqueosTodos() };
  },

  async create(r) {
    const todas = cargarLocal();
    if (!r.fechas || !r.fechas.length || r.fechas.length > CFG.MAX_DIAS) {
      return { error: 'Elige entre 1 y ' + CFG.MAX_DIAS + ' días.' };
    }
    // Se validan todos los días antes de guardar ninguno
    for (const f of r.fechas) {
      const error = validar({ ...r, fecha: f }, todas, bloqueosTodos());
      if (error) return { error: f + ': ' + error };
    }

    const pin = String(1000 + Math.floor(Math.random() * 9000));   // un código para todos los días
    r.fechas.forEach((f, i) => {
      const { fechas, ...resto } = r;
      todas.push({ ...resto, fecha: f, id: Date.now().toString(36) + i, pin, estado: 'Activa' });
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
  desbloquear(o) { return this.post({ action: 'desbloquear', ...o }); }
};

// Si hay URL se usa Google Sheets; si no, el modo local
export const api = CFG.API_URL ? Remote : Local;
