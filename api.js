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

const Local = {
  // La lista pública nunca incluye matrícula ni código
  async list() {
    const res = cargarLocal().map(({ matricula, pin, ...publico }) => publico);
    return { res, blq: CFG.BLOQUEOS };
  },

  async create(r) {
    const todas = cargarLocal();
    const error = validar(r, todas, CFG.BLOQUEOS);
    if (error) return { error };

    const nueva = {
      ...r,
      id: Date.now().toString(36),
      pin: String(1000 + Math.floor(Math.random() * 9000)),
      estado: 'Activa'
    };
    todas.push(nueva);
    guardarLocal(todas);
    return { ok: 1, pin: nueva.pin };
  },

  async cancel(o) {
    const todas = cargarLocal();
    const x = todas.find(y => y.id === o.id && y.estado === 'Activa');
    if (!x) return { error: 'Reserva no encontrada.' };

    const esAdmin = !!CFG.ADMIN_LOCAL && o.codigo.trim() === CFG.ADMIN_LOCAL;
    const datosCorrectos =
      x.matricula.toLowerCase() === o.matricula.trim().toLowerCase() &&
      x.pin === o.codigo.trim();
    if (!esAdmin && !datosCorrectos) return { error: 'Matrícula o código incorrectos.' };

    x.estado = 'Cancelada';
    guardarLocal(todas);
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
  cancel(o) { return this.post({ action: 'cancel', ...o }); }
};

// Si hay URL se usa Google Sheets; si no, el modo local
export const api = CFG.API_URL ? Remote : Local;
