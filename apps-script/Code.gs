/**
 * Reservas · Celda de Manufactura — backend en Google Sheets
 * Pasos: pega este código en Extensiones > Apps Script, ejecuta configurar() una vez
 * y luego Implementar > Nueva implementación > Aplicación web.
 */
const CFG = {
  HORA_INI: '08:00', HORA_FIN: '20:00',   // igual que en el HTML
  MAX_BLOQUES: 3,                          // 3 bloques de 30 min = 1 h 30 min
  MAX_DIAS: 5,                             // días que se pueden apartar en una sola reserva
  DIAS_ANTICIPACION: 5,                    // hay que apartar con al menos 5 días de anticipación
  ADMIN: 'maestro123',                     // código del maestro: CÁMBIALO
  VERSION: 'v6',                           // sube este número cuando cambies el script (la web lo compara)
  DIAS_HISTORIAL: 30,                      // reservas más viejas pasan a "Historial"
  EQUIPOS: ['Celda', 'Brazo', 'Banda + Cámara', 'Cortadora']
};
const COLS = ['id', 'creado', 'fecha', 'inicio', 'fin', 'equipos', 'nombre', 'matricula', 'pin', 'estado', 'otros'];
const TZ = Session.getScriptTimeZone();

// ---------- Configuración inicial (ejecutar UNA vez) ----------
function configurar() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const hojas = { Reservas: COLS, Historial: COLS, Bloqueos: ['fecha', 'inicio', 'fin', 'motivo'] };
  Object.keys(hojas).forEach(n => {
    const sh = ss.getSheetByName(n) || ss.insertSheet(n);
    sh.getRange(1, 1, sh.getMaxRows(), hojas[n].length).setNumberFormat('@'); // todo como texto
    sh.getRange(1, 1, 1, hojas[n].length).setValues([hojas[n]]).setFontWeight('bold');
    sh.setFrozenRows(1);
  });
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'limpiar').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('limpiar').timeBased().everyDays(1).atHour(3).create();
}

// ---------- Utilidades ----------
const ahora = () => Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm');
const mins = h => { const p = String(h).split(':'); return +p[0] * 60 + +p[1]; };
const txt = (v, f) => v instanceof Date ? Utilities.formatDate(v, TZ, f) : String(v);
const choca = (a, b) => a.some(x => b.includes(x));

function leer(nombre) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nombre);
  const v = sh.getDataRange().getValues(), h = v.shift();
  return v.map((r, n) => ({ r, fila: n + 2 }))                    // fila = número de fila real en la hoja
    .filter(({ r }) => r[0] !== '' || r[2] !== '' || r[1] !== '')
    .map(({ r, fila }) => {
      const o = { _fila: fila };
      h.forEach((k, i) => o[k] = txt(r[i], k === 'fecha' ? 'yyyy-MM-dd' : 'HH:mm'));
      return o;
    });
}
const salida = o => ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);

// ---------- API ----------
function doGet() {
  const corte = new Date(); corte.setDate(corte.getDate() - CFG.DIAS_HISTORIAL);
  const desde = Utilities.formatDate(corte, TZ, 'yyyy-MM-dd');   // se envían los últimos 30 días y los futuros
  const res = leer('Reservas').filter(r => r.fecha >= desde).map(r => ({
    id: r.id, fecha: r.fecha, inicio: r.inicio, fin: r.fin,
    equipos: r.equipos.split(',').map(s => s.trim()), nombre: r.nombre, estado: r.estado, otros: r.otros || ''
  })); // nunca se envían matrícula ni código
  const blq = leer('Bloqueos').filter(b => b.fecha && b.fecha >= desde)
    .map(b => ({ fecha: b.fecha, inicio: b.inicio, fin: b.fin, motivo: b.motivo }));
  return salida({ res, blq, version: CFG.VERSION });
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);                       // evita que dos personas aparten a la vez
  try {
    const o = JSON.parse(e.postData.contents);
    const accion = ACCIONES[o.action];
    return salida(accion ? accion(o) : { error: 'Acción inválida.' });
  } catch (err) {
    return salida({ error: 'Error del servidor: ' + err.message });
  } finally { lock.releaseLock(); }
}

function crear(r) {
  const nombre = String(r.nombre || '').trim(), mat = String(r.matricula || '').trim();
  const eq = Array.isArray(r.equipos) ? r.equipos : [];
  const fechas = [...new Set(Array.isArray(r.fechas) ? r.fechas : [r.fecha])];   // uno o varios días
  if (nombre.length < 3) return { error: 'Escribe tu nombre completo.' };
  if (mat.length < 4) return { error: 'Escribe tu matrícula.' };
  const noValidos = eq.filter(x => CFG.EQUIPOS.indexOf(x) < 0);
  if (!eq.length) return { error: 'Elige al menos una parte de la celda.' };
  if (noValidos.length) return { error: 'El servidor no reconoce: ' + noValidos.join(', ') + '. Revisa la lista EQUIPOS en Code.gs y crea una Versión nueva.' };
  if (!fechas.length || fechas.length > CFG.MAX_DIAS) return { error: 'Elige entre 1 y ' + CFG.MAX_DIAS + ' días.' };
  if (!/^\d{2}:\d{2}$/.test(r.inicio) || !/^\d{2}:\d{2}$/.test(r.fin)) return { error: 'Hora inválida.' };
  const i = mins(r.inicio), f = mins(r.fin);
  if (i % 30 !== 0 || f % 30 !== 0 || (f - i) < 30 || (f - i) > (30 * CFG.MAX_BLOQUES)) return { error: 'Duración máxima: ' + (CFG.MAX_BLOQUES * 30) + ' minutos.' };
  if (i < mins(CFG.HORA_INI) || f > mins(CFG.HORA_FIN)) return { error: 'Fuera del horario de la celda.' };

  // Se validan todos los días antes de guardar ninguno
  const bloqueos = leer('Bloqueos'), reservas = leer('Reservas');
  const lim = new Date(); lim.setDate(lim.getDate() + CFG.DIAS_ANTICIPACION);
  const minimo = Utilities.formatDate(lim, TZ, 'yyyy-MM-dd');   // primer día que ya se puede apartar
  for (const dia of fechas) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return { error: 'Fecha inválida.' };
    if (dia < minimo) return { error: dia + ': hay que apartar con ' + CFG.DIAS_ANTICIPACION + ' días de anticipación (primer día disponible: ' + minimo + ').' };
    if (dia + ' ' + r.inicio < ahora()) return { error: dia + ': ese horario ya pasó.' };
    for (const b of bloqueos)
      if (b.fecha === dia && i < mins(b.fin) && f > mins(b.inicio)) return { error: dia + ': horario no disponible (' + (b.motivo || 'bloqueado') + ').' };
    for (const x of reservas)
      if (x.estado === 'Activa' && x.fecha === dia && i < mins(x.fin) && f > mins(x.inicio) &&
          choca(x.equipos.split(',').map(s => s.trim()), eq))
        return { error: dia + ': ya está ocupado (' + x.equipos + ' de ' + x.inicio + ' a ' + x.fin + ').' };
  }

  const pin = String(1000 + Math.floor(Math.random() * 9000));   // un código para todos los días
  const hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Reservas');
  fechas.forEach(dia => hoja.appendRow(
    [Utilities.getUuid().slice(0, 8), ahora(), dia, r.inicio, r.fin, eq.join(', '), nombre, mat, pin, 'Activa', String(r.otros || '').trim().slice(0, 200)]
  ));
  return { ok: 1, pin: pin, n: fechas.length };
}

function cancelar(o) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Reservas');
  const filas = leer('Reservas');
  const idx = filas.findIndex(x => x.id === o.id && x.estado === 'Activa');
  if (idx < 0) return { error: 'Reserva no encontrada.' };
  const x = filas[idx], cod = String(o.codigo || '').trim();
  if (o.admin) {
    if (!adminOk(o)) return NO_ADMIN;                // el administrador no necesita matrícula ni código
  } else if (!(x.matricula.toLowerCase() === String(o.matricula || '').trim().toLowerCase() && x.pin === cod)) {
    return { error: 'Matrícula o código incorrectos.' };
  }
  sh.getRange(x._fila, COLS.indexOf('estado') + 1).setValue('Cancelada');
  return { ok: 1 };
}

// ---------- Limpieza diaria: pasa lo viejo a "Historial" ----------
function limpiar() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName('Reservas'), hist = ss.getSheetByName('Historial');
  const corte = new Date(); corte.setDate(corte.getDate() - CFG.DIAS_HISTORIAL);
  const lim = Utilities.formatDate(corte, TZ, 'yyyy-MM-dd');
  const filas = leer('Reservas');
  for (let i = filas.length - 1; i >= 0; i--) {
    if (filas[i].fecha < lim) {
      hist.appendRow(COLS.map(k => filas[i][k]));
      sh.deleteRow(filas[i]._fila);
    }
  }
}

// ---------- Modo administrador ----------
const NO_ADMIN = { error: 'Código de administrador incorrecto (si fallaste varias veces, espera 10 minutos).' };

// Revisa el código del administrador. Con 5 intentos fallidos se bloquea 10 minutos.
function adminOk(o) {
  const cache = CacheService.getScriptCache();
  const fallos = Number(cache.get('fallos') || 0);
  if (fallos >= 5) return false;
  if (String(o.admin || '').trim() !== CFG.ADMIN) {
    cache.put('fallos', String(fallos + 1), 600);
    return false;
  }
  cache.remove('fallos');
  return true;
}

// Elimina la fila de la reserva (para borrar pruebas o errores)
function borrar(o) {
  if (!adminOk(o)) return NO_ADMIN;
  const x = leer('Reservas').find(y => y.id === o.id);
  if (!x) return { error: 'Reserva no encontrada.' };
  SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Reservas').deleteRow(x._fila);
  return { ok: 1 };
}

// Agrega bloqueos (clases, mantenimiento…) en una o varias fechas
function bloquear(o) {
  if (!adminOk(o)) return NO_ADMIN;
  const fechas = [...new Set(Array.isArray(o.fechas) ? o.fechas : [])];
  if (!fechas.length || fechas.length > 60) return { error: 'Elige entre 1 y 60 fechas.' };
  if (fechas.some(f => !/^\d{4}-\d{2}-\d{2}$/.test(f))) return { error: 'Fecha inválida.' };
  if (!/^\d{2}:\d{2}$/.test(o.inicio) || !/^\d{2}:\d{2}$/.test(o.fin) || mins(o.fin) <= mins(o.inicio)) return { error: 'Horario inválido.' };
  const hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Bloqueos');
  const motivo = String(o.motivo || '').trim().slice(0, 60);
  fechas.forEach(f => hoja.appendRow([f, o.inicio, o.fin, motivo]));
  return { ok: 1, n: fechas.length };
}

function desbloquear(o) {
  if (!adminOk(o)) return NO_ADMIN;
  const b = leer('Bloqueos').find(x => x.fecha === o.fecha && x.inicio === o.inicio && x.fin === o.fin);
  if (!b) return { error: 'Bloqueo no encontrado.' };
  SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Bloqueos').deleteRow(b._fila);
  return { ok: 1 };
}

const ACCIONES = {
  create: crear, cancel: cancelar, borrar: borrar, bloquear: bloquear, desbloquear: desbloquear,
  admin: o => adminOk(o) ? { ok: 1 } : NO_ADMIN
};
