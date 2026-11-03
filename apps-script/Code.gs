/**
 * Reservas · Celda de Manufactura — backend en Google Sheets
 * Pasos: pega este código en Extensiones > Apps Script, ejecuta configurar() una vez
 * y luego Implementar > Nueva implementación > Aplicación web.
 */
const CFG = {
  HORA_INI: '08:00', HORA_FIN: '20:00',   // igual que en el HTML
  NOMBRE_CELDA: 'Celda de Manufactura',
  MAX_BLOQUES: 3,                          // 3 bloques de 30 min = 1 h 30 min
  MAX_DIAS: 31,                            // fechas máximas por reserva, siempre del mismo mes
  DIAS_ANTICIPACION: 5,                    // hay que apartar con al menos 5 días de anticipación
  DIAS_LAB_DEFAULT: [1, 2, 3, 4, 5],      // lunes a viernes
  ADMIN: 'maestro123',                     // código del maestro: CÁMBIALO
  VERSION: 'v13',                          // sube este número cuando cambies el script (la web lo compara)
  DIAS_HISTORIAL: 30                       // reservas más viejas pasan a "Historial"
};

// Material con el que arranca la hoja "Equipos" (después el administrador lo edita desde la web)
const EQUIPOS_INICIALES = [['Celda', '#00D26A'], ['Brazo', '#2BC5C5'], ['Banda + Cámara', '#F2B705'], ['Cortadora', '#B79CFF']];
const NOMBRE_OK = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9 +\-\/().]{1,30}$/;

const COLS = ['id', 'creado', 'fecha', 'inicio', 'fin', 'equipos', 'nombre', 'matricula', 'pin', 'estado', 'otros'];
const HOJAS = {
  Reservas: COLS, Historial: COLS,
  Bloqueos: ['fecha', 'inicio', 'fin', 'motivo'],
  Equipos: ['nombre', 'color'],
  Autorizados: ['fecha', 'motivo'],         // sábados y domingos que el administrador permitió
  Laboratorios: ['id', 'nombre', 'ubicacion', 'abre', 'cierra', 'diasAnticipacion', 'diasDisponibles'],
  ConfiguracionCelda: ['clave', 'valor'],
  UsoLab: ['lab', 'fecha', 'inicio', 'fin', 'motivo'],   // ratos en que un laboratorio está ocupado
  ImplementosLab: ['id', 'lab', 'nombre', 'color'],
  ReservasLab: ['id', 'creado', 'lab', 'fecha', 'inicio', 'fin', 'implementos', 'nombre', 'matricula', 'pin', 'estado', 'otros']
};
const TZ = Session.getScriptTimeZone();

// ---------- Configuración inicial (ejecutar UNA vez) ----------
function configurar() {
  Object.keys(HOJAS).forEach(n => {
    const sh = hoja(n);
    sh.getRange(1, 1, sh.getMaxRows(), HOJAS[n].length).setNumberFormat('@'); // todo como texto
    sh.getRange(1, 1, 1, HOJAS[n].length).setValues([HOJAS[n]]).setFontWeight('bold');
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
const lista = texto => String(texto).split(',').map(s => s.trim());   // "Celda, Brazo" -> ['Celda', 'Brazo']

// ¿Es sábado o domingo? ("2026-11-07")
function esFinDeSemana(dia) {
  const p = dia.split('-').map(Number);
  const w = new Date(p[0], p[1] - 1, p[2], 12).getDay();
  return w === 0 || w === 6;
}
function diaSemana(dia) {
  const p = dia.split('-').map(Number);
  return new Date(p[0], p[1] - 1, p[2], 12).getDay();
}
function diasLaboratorio(valor) {
  const texto = String(valor || '').trim();
  if (!texto) return CFG.DIAS_LAB_DEFAULT;
  const dias = texto.split(',').map(Number).filter((d, i, todos) =>
    Number.isInteger(d) && d >= 0 && d <= 6 && todos.indexOf(d) === i);
  return dias.length ? dias : CFG.DIAS_LAB_DEFAULT;
}

// Devuelve la hoja; si falta (por ejemplo "Equipos" en una hoja anterior) se crea sola
function hoja(nombre) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(nombre);
  if (!sh) {
    sh = ss.insertSheet(nombre);
    const cols = HOJAS[nombre];
    sh.getRange(1, 1, sh.getMaxRows(), cols.length).setNumberFormat('@');
    sh.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold');
    sh.setFrozenRows(1);
    if (nombre === 'Equipos') EQUIPOS_INICIALES.forEach(e => sh.appendRow(e));
  }
  return sh;
}

function leer(nombre) {
  const v = hoja(nombre).getDataRange().getValues(), h = v.shift();
  return v.map((r, n) => ({ r, fila: n + 2 }))                    // fila = número de fila real en la hoja
    .filter(({ r }) => r.some(c => c !== ''))
    .map(({ r, fila }) => {
      const o = { _fila: fila };
      h.forEach((k, i) => o[k] = txt(r[i], k === 'fecha' ? 'yyyy-MM-dd' : 'HH:mm'));
      return o;
    });
}
const leerEquipos = () => leer('Equipos').filter(e => e.nombre);
const salida = o => ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);

function leerConfiguracionCelda() {
  const config = {
    nombre: CFG.NOMBRE_CELDA, abre: CFG.HORA_INI, cierra: CFG.HORA_FIN,
    diasAnticipacion: CFG.DIAS_ANTICIPACION
  };
  leer('ConfiguracionCelda').forEach(({ clave, valor }) => {
    if (clave === 'nombre' && String(valor || '').trim()) config.nombre = String(valor).trim();
    else if ((clave === 'abre' || clave === 'cierra') && HORA_OK.test(valor) &&
        mins(valor) >= 0 && mins(valor) < 1440 && mins(valor) % 30 === 0) config[clave] = valor;
    else if (clave === 'diasAnticipacion' && valor !== '' && Number.isInteger(Number(valor)) &&
        Number(valor) >= 0 && Number(valor) <= 365) config.diasAnticipacion = Number(valor);
  });
  if (mins(config.cierra) <= mins(config.abre) || mins(config.cierra) > 1410) {
    config.abre = CFG.HORA_INI;
    config.cierra = CFG.HORA_FIN;
  }
  return config;
}

// ---------- API ----------
function doGet() {
  const corte = new Date(); corte.setDate(corte.getDate() - CFG.DIAS_HISTORIAL);
  const desde = Utilities.formatDate(corte, TZ, 'yyyy-MM-dd');   // se envían los últimos 30 días y los futuros
  const res = leer('Reservas').filter(r => r.fecha >= desde).map(r => ({
    id: r.id, fecha: r.fecha, inicio: r.inicio, fin: r.fin,
    equipos: lista(r.equipos), nombre: r.nombre, estado: r.estado, otros: r.otros || ''
  })); // nunca se envían matrícula ni código
  const blq = leer('Bloqueos').filter(b => b.fecha && b.fecha >= desde)
    .map(b => ({ fecha: b.fecha, inicio: b.inicio, fin: b.fin, motivo: b.motivo }));
  const equipos = leerEquipos().map(e => ({ nombre: e.nombre, color: e.color }));
  const autorizados = leer('Autorizados').filter(a => a.fecha && a.fecha >= desde)
    .map(a => ({ fecha: a.fecha, motivo: a.motivo || '' }));
  const configuracionCelda = leerConfiguracionCelda();
  const laboratorios = leer('Laboratorios').filter(l => l.id)
    .map(l => ({
      id: l.id, nombre: l.nombre, ubicacion: l.ubicacion || '', abre: l.abre, cierra: l.cierra,
      diasAnticipacion: Number.isInteger(Number(l.diasAnticipacion)) &&
        l.diasAnticipacion !== '' && l.diasAnticipacion !== null && l.diasAnticipacion !== undefined
        ? Number(l.diasAnticipacion) : CFG.DIAS_ANTICIPACION,
      diasDisponibles: diasLaboratorio(l.diasDisponibles)
    }));
  const usoLab = leer('UsoLab').filter(u => u.fecha && u.fecha >= desde)
    .map(u => ({ lab: u.lab, fecha: u.fecha, inicio: u.inicio, fin: u.fin, motivo: u.motivo || '' }));
  const implementosLab = leer('ImplementosLab').filter(i => i.id && i.lab)
    .map(i => ({ id: i.id, lab: i.lab, nombre: i.nombre, color: i.color }));
  const resLab = leer('ReservasLab').filter(r => r.fecha >= desde).map(r => ({
    id: r.id, lab: r.lab, fecha: r.fecha, inicio: r.inicio, fin: r.fin,
    equipos: lista(r.implementos), nombre: r.nombre, estado: r.estado, otros: r.otros || ''
  }));
  return salida({ res, blq, equipos, autorizados, configuracionCelda, laboratorios, usoLab, implementosLab, resLab, version: CFG.VERSION });
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
  const config = leerConfiguracionCelda();
  const nombre = String(r.nombre || '').trim(), mat = String(r.matricula || '').trim();
  const eq = Array.isArray(r.equipos) ? r.equipos : [];
  const fechas = [...new Set(Array.isArray(r.fechas) ? r.fechas : [r.fecha])];   // uno o varios días
  if (nombre.length < 3) return { error: 'Escribe tu nombre completo.' };
  if (mat.length < 4) return { error: 'Escribe tu matrícula.' };
  const validos = leerEquipos().map(e => e.nombre);
  const noValidos = eq.filter(x => validos.indexOf(x) < 0);
  if (!eq.length) return { error: 'Elige al menos una parte de la celda.' };
  if (noValidos.length) return { error: 'El servidor no reconoce: ' + noValidos.join(', ') + '. Puede que el administrador lo haya quitado; recarga la página.' };
  if (!fechas.length || fechas.length > CFG.MAX_DIAS) return { error: 'Elige entre 1 y ' + CFG.MAX_DIAS + ' fechas.' };
  if (fechas.some(dia => !/^\d{4}-\d{2}-\d{2}$/.test(dia))) return { error: 'Fecha inválida.' };
  if (new Set(fechas.map(dia => dia.slice(0, 7))).size > 1) return { error: 'Todas las fechas de una reserva deben pertenecer al mismo mes.' };
  if (!/^\d{2}:\d{2}$/.test(r.inicio) || !/^\d{2}:\d{2}$/.test(r.fin)) return { error: 'Hora inválida.' };
  const i = mins(r.inicio), f = mins(r.fin);
  if (i % 30 !== 0 || f % 30 !== 0 || (f - i) < 30 || (f - i) > (30 * CFG.MAX_BLOQUES)) return { error: 'Duración máxima: ' + (CFG.MAX_BLOQUES * 30) + ' minutos.' };
  if (i < mins(config.abre) || f > mins(config.cierra)) return { error: 'Fuera del horario de la celda.' };

  // Se validan todos los días antes de guardar ninguno
  const bloqueos = leer('Bloqueos'), reservas = leer('Reservas');
  const permitidos = leer('Autorizados').map(a => a.fecha);       // fines de semana autorizados
  const lim = new Date(); lim.setDate(lim.getDate() + config.diasAnticipacion);
  const minimo = Utilities.formatDate(lim, TZ, 'yyyy-MM-dd');   // primer día que ya se puede apartar
  for (const dia of fechas) {
    if (dia < minimo) return { error: dia + ': hay que apartar con ' + config.diasAnticipacion + ' días de anticipación (primer día disponible: ' + minimo + ').' };
    if (esFinDeSemana(dia) && permitidos.indexOf(dia) < 0) return { error: dia + ': los sábados y domingos no se pueden apartar (solo con autorización del administrador).' };
    if (dia + ' ' + r.inicio < ahora()) return { error: dia + ': ese horario ya pasó.' };
    for (const b of bloqueos)
      if (b.fecha === dia && i < mins(b.fin) && f > mins(b.inicio)) return { error: dia + ': horario no disponible (' + (b.motivo || 'bloqueado') + ').' };
    for (const x of reservas)
      if (x.estado === 'Activa' && x.fecha === dia && i < mins(x.fin) && f > mins(x.inicio) && choca(lista(x.equipos), eq))
        return { error: dia + ': ya está ocupado (' + x.equipos + ' de ' + x.inicio + ' a ' + x.fin + ').' };
  }

  const pin = String(1000 + Math.floor(Math.random() * 9000));   // un código para todos los días
  const sh = hoja('Reservas');
  fechas.forEach(dia => sh.appendRow(
    [Utilities.getUuid().slice(0, 8), ahora(), dia, r.inicio, r.fin, eq.join(', '), nombre, mat, pin, 'Activa', String(r.otros || '').trim().slice(0, 200)]
  ));
  return { ok: 1, pin: pin, n: fechas.length };
}

function cancelar(o) {
  const hojaReserva = o.tipo === 'lab' ? 'ReservasLab' : 'Reservas';
  const x = leer(hojaReserva).find(y => y.id === o.id && y.estado === 'Activa');
  if (!x) return { error: 'Reserva no encontrada.' };
  if (o.admin) {
    if (!adminOk(o)) return NO_ADMIN;
  } else if (!(x.matricula.toLowerCase() === String(o.matricula || '').trim().toLowerCase() && x.pin === String(o.codigo || '').trim())) {
    return { error: 'Matrícula o código incorrectos.' };
  }
  hoja(hojaReserva).getRange(x._fila, HOJAS[hojaReserva].indexOf('estado') + 1).setValue('Cancelada');
  return { ok: 1 };
}

// ---------- Limpieza diaria: pasa lo viejo a "Historial           " ----------
function limpiar() {
  const sh = hoja('Reservas'), hist = hoja('Historial');
  const corte = new Date(); corte.setDate(corte.getDate() - CFG.DIAS_HISTORIAL);
  const lim = Utilities.formatDate(corte, TZ, 'yyyy-MM-dd');
  const filas = leer('Reservas');
  for (let i = filas.length - 1; i >= 0; i--) {
    if (filas[i].fecha < lim) {
      hist.appendRow(COLS.map(k => filas[i][k]));
      sh.deleteRow(filas[i]._fila);
    }
  }
  const uso = leer('UsoLab');                 // también se borran las ocupaciones de laboratorio ya pasadas
  for (let i = uso.length - 1; i >= 0; i--) if (uso[i].fecha < lim) hoja('UsoLab').deleteRow(uso[i]._fila);
  const resLab = leer('ReservasLab');
  for (let i = resLab.length - 1; i >= 0; i--) {
    if (resLab[i].fecha < lim) {
      hoja('ReservasLab').deleteRow(resLab[i]._fila);
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
  const hojaReserva = o.tipo === 'lab' ? 'ReservasLab' : 'Reservas';
  const x = leer(hojaReserva).find(y => y.id === o.id);
  if (!x) return { error: 'Reserva no encontrada.' };
  hoja(hojaReserva).deleteRow(x._fila);
  return { ok: 1 };
}

// Agrega bloqueos (clases, mantenimiento…) en una o varias fechas
function bloquear(o) {
  if (!adminOk(o)) return NO_ADMIN;
  const fechas = [...new Set(Array.isArray(o.fechas) ? o.fechas : [])];
  if (!fechas.length || fechas.length > 60) return { error: 'Elige entre 1 y 60 fechas.' };
  if (fechas.some(f => !/^\d{4}-\d{2}-\d{2}$/.test(f))) return { error: 'Fecha inválida.' };
  if (!/^\d{2}:\d{2}$/.test(o.inicio) || !/^\d{2}:\d{2}$/.test(o.fin) || mins(o.fin) <= mins(o.inicio)) return { error: 'Horario inválido.' };
  const motivo = String(o.motivo || '').trim().slice(0, 60);
  fechas.forEach(f => hoja('Bloqueos').appendRow([f, o.inicio, o.fin, motivo]));
  return { ok: 1, n: fechas.length };
}

function desbloquear(o) {
  if (!adminOk(o)) return NO_ADMIN;
  const b = leer('Bloqueos').find(x => x.fecha === o.fecha && x.inicio === o.inicio && x.fin === o.fin);
  if (!b) return { error: 'Bloqueo no encontrado.' };
  hoja('Bloqueos').deleteRow(b._fila);
  return { ok: 1 };
}

// ----- Material de la celda: agregar, editar (con o sin renombrar) y quitar -----
function equipoGuardar(o) {
  if (!adminOk(o)) return NO_ADMIN;
  const nombre = String(o.nombre || '').trim(), color = String(o.color || '');
  if (!NOMBRE_OK.test(nombre)) return { error: 'Nombre inválido: usa letras, números y + - / ( ) . (máximo 30).' };
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) return { error: 'Color inválido.' };
  const actuales = leerEquipos();
  if (actuales.some(e => e.nombre.toLowerCase() === nombre.toLowerCase() && e.nombre !== o.anterior)) return { error: 'Ya existe un material con ese nombre.' };
  if (!o.anterior) { hoja('Equipos').appendRow([nombre, color]); return { ok: 1 }; }
  const e = actuales.find(x => x.nombre === o.anterior);
  if (!e) return { error: 'Material no encontrado.' };
  hoja('Equipos').getRange(e._fila, 1, 1, 2).setValues([[nombre, color]]);
  if (nombre !== o.anterior) renombrarEnReservas(o.anterior, nombre);
  return { ok: 1 };
}

// Si se cambia el nombre de un material, las reservas que lo usan se actualizan
function renombrarEnReservas(viejo, nuevo) {
  const sh = hoja('Reservas'), n = sh.getLastRow() - 1;
  if (n < 1) return;
  const rango = sh.getRange(2, COLS.indexOf('equipos') + 1, n, 1);
  rango.setValues(rango.getValues().map(([v]) => [lista(v).map(s => s === viejo ? nuevo : s).join(', ')]));
}

function equipoQuitar(o) {
  if (!adminOk(o)) return NO_ADMIN;
  const e = leerEquipos().find(x => x.nombre === o.nombre);
  if (!e) return { error: 'Material no encontrado.' };
  const hoy = ahora().slice(0, 10);
  const usadas = leer('Reservas').filter(x => x.estado === 'Activa' && x.fecha >= hoy && lista(x.equipos).indexOf(o.nombre) >= 0).length;
  if (usadas) return { error: 'Tiene ' + usadas + ' reserva(s) activa(s). Cancélalas primero.' };
  hoja('Equipos').deleteRow(e._fila);
  return { ok: 1 };
}

// ----- Sábados y domingos: cerrados salvo autorización -----
function autorizar(o) {
  if (!adminOk(o)) return NO_ADMIN;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(o.fecha) || !esFinDeSemana(o.fecha)) return { error: 'Elige un sábado o un domingo.' };
  if (o.fecha < ahora().slice(0, 10)) return { error: 'Esa fecha ya pasó.' };
  if (leer('Autorizados').some(a => a.fecha === o.fecha)) return { error: 'Esa fecha ya está autorizada.' };
  hoja('Autorizados').appendRow([o.fecha, String(o.motivo || '').trim().slice(0, 60)]);
  return { ok: 1 };
}

function desautorizar(o) {
  if (!adminOk(o)) return NO_ADMIN;
  const a = leer('Autorizados').find(x => x.fecha === o.fecha);
  if (!a) return { error: 'Autorización no encontrada.' };
  const usadas = leer('Reservas').filter(x => x.estado === 'Activa' && x.fecha === o.fecha).length;
  if (usadas) return { error: 'Hay ' + usadas + ' reserva(s) activa(s) ese día. Cancélalas primero.' };
  hoja('Autorizados').deleteRow(a._fila);
  return { ok: 1 };
}

// ----- Laboratorios: datos, horario de apertura y ratos ocupados -----
const HORA_OK = /^\d{2}:\d{2}$/;
const DIAS_VALIDOS = [0, 1, 2, 3, 4, 5, 6];

function celdaGuardar(o) {
  if (!adminOk(o)) return NO_ADMIN;
  const nombre = String(o.nombre || '').trim(), diasAnticipacion = Number(o.diasAnticipacion);
  if (!NOMBRE_OK.test(nombre)) return { error: 'Nombre inválido: usa letras, números y + - / ( ) . (máximo 30).' };
  if (!HORA_OK.test(o.abre) || !HORA_OK.test(o.cierra) ||
      mins(o.abre) < 0 || mins(o.abre) >= 1440 || mins(o.cierra) < 30 || mins(o.cierra) > 1410 ||
      mins(o.abre) % 30 || mins(o.cierra) % 30 || mins(o.cierra) <= mins(o.abre)) {
    return { error: 'Horario inválido: usa horas en intervalos de 30 minutos y asegúrate de que el cierre sea posterior a la apertura.' };
  }
  if (o.diasAnticipacion === '' || o.diasAnticipacion === null || o.diasAnticipacion === undefined ||
      !Number.isInteger(diasAnticipacion) || diasAnticipacion < 0 || diasAnticipacion > 365) {
    return { error: 'La anticipación debe ser un número entero entre 0 y 365 días.' };
  }
  const reservas = leer('Reservas'), hoy = ahora().slice(0, 10);
  if (reservas.some(r => r.estado === 'Activa' && r.fecha >= hoy &&
      (mins(r.inicio) < mins(o.abre) || mins(r.fin) > mins(o.cierra)))) {
    return { error: 'El horario nuevo dejaría reservas activas fuera de horario. Cancélalas o ajusta el horario antes.' };
  }
  const sh = hoja('ConfiguracionCelda');
  const config = { nombre, abre: o.abre, cierra: o.cierra, diasAnticipacion };
  Object.keys(config).forEach(clave => {
    const fila = leer('ConfiguracionCelda').find(r => r.clave === clave);
    if (fila) sh.getRange(fila._fila, 2).setValue(String(config[clave]));
    else sh.appendRow([clave, String(config[clave])]);
  });
  return { ok: 1 };
}

function labGuardar(o) {
  if (!adminOk(o)) return NO_ADMIN;
  const nombre = String(o.nombre || '').trim(), ubicacion = String(o.ubicacion || '').trim().slice(0, 60);
  const nuevo = !o.id;
  const abre = nuevo && (o.abre === undefined || o.abre === null) ? CFG.HORA_INI : o.abre;
  const cierra = nuevo && (o.cierra === undefined || o.cierra === null) ? CFG.HORA_FIN : o.cierra;
  const valorAnticipacion = nuevo && (o.diasAnticipacion === undefined || o.diasAnticipacion === null)
    ? CFG.DIAS_ANTICIPACION : o.diasAnticipacion;
  const diasAnticipacion = Number(valorAnticipacion);
  const diasDisponibles = nuevo && (o.diasDisponibles === undefined || o.diasDisponibles === null)
    ? CFG.DIAS_LAB_DEFAULT.slice()
    : Array.isArray(o.diasDisponibles) ? o.diasDisponibles : [];
  if (!NOMBRE_OK.test(nombre)) return { error: 'Nombre inválido: usa letras, números y + - / ( ) . (máximo 30).' };
  if (!HORA_OK.test(abre) || !HORA_OK.test(cierra) || mins(abre) % 30 || mins(cierra) % 30 ||
      mins(abre) < 0 || mins(abre) >= 1440 || mins(cierra) < 30 || mins(cierra) > 1440 ||
      mins(cierra) <= mins(abre)) return { error: 'Horario de apertura inválido.' };
  if (valorAnticipacion === '' || valorAnticipacion === null || valorAnticipacion === undefined ||
      !Number.isInteger(diasAnticipacion) || diasAnticipacion < 0 || diasAnticipacion > 365) {
    return { error: 'La anticipación debe ser un número entero entre 0 y 365 días.' };
  }
  if (!diasDisponibles.length || diasDisponibles.some((d, i) =>
      !Number.isInteger(d) || DIAS_VALIDOS.indexOf(d) < 0 || diasDisponibles.indexOf(d) !== i)) {
    return { error: 'Selecciona al menos un día disponible.' };
  }
  const labs = leer('Laboratorios').filter(l => l.id);
  if (labs.some(l => l.nombre.toLowerCase() === nombre.toLowerCase() && l.id !== o.id)) return { error: 'Ya existe un laboratorio con ese nombre.' };
  if (!o.id) {
    hoja('Laboratorios').appendRow([Utilities.getUuid().slice(0, 8), nombre, ubicacion, abre, cierra, diasAnticipacion, diasDisponibles.join(',')]);
    return { ok: 1 };
  }
  const l = labs.find(x => x.id === o.id);
  if (!l) return { error: 'Laboratorio no encontrado.' };
  const hoy = ahora().slice(0, 10);
  const reservasActivas = leer('ReservasLab').filter(r => r.lab === o.id && r.estado === 'Activa' && r.fecha >= hoy);
  const reservaFueraDeHorario = reservasActivas.some(r =>
    (mins(r.inicio) < mins(abre) || mins(r.fin) > mins(cierra)));
  if (reservaFueraDeHorario) return { error: 'El nuevo horario dejaría una reserva activa fuera de horario. Cancélala o ajusta el horario de la reserva primero.' };
  if (reservasActivas.some(r => diasDisponibles.indexOf(diaSemana(r.fecha)) < 0)) {
    return { error: 'Los nuevos días no están disponibles para una reserva activa. Cancélala o conserva ese día habilitado.' };
  }
  hoja('Laboratorios').getRange(l._fila, 2, 1, 6).setValues([[nombre, ubicacion, abre, cierra, diasAnticipacion, diasDisponibles.join(',')]]);
  return { ok: 1 };
}

function labQuitar(o) {
  if (!adminOk(o)) return NO_ADMIN;
  const l = leer('Laboratorios').find(x => x.id === o.id);
  if (!l) return { error: 'Laboratorio no encontrado.' };
  const uso = leer('UsoLab');
  for (let i = uso.length - 1; i >= 0; i--) if (uso[i].lab === o.id) hoja('UsoLab').deleteRow(uso[i]._fila);   // de abajo hacia arriba
  [leer('ImplementosLab'), leer('ReservasLab')].forEach((filas, indice) => {
    const nombreHoja = indice === 0 ? 'ImplementosLab' : 'ReservasLab';
    for (let i = filas.length - 1; i >= 0; i--) if (filas[i].lab === o.id) hoja(nombreHoja).deleteRow(filas[i]._fila);
  });
  hoja('Laboratorios').deleteRow(l._fila);
  return { ok: 1 };
}

function labImplementoGuardar(o) {
  if (!adminOk(o)) return NO_ADMIN;
  const nombre = String(o.nombre || '').trim(), color = String(o.color || '');
  if (!NOMBRE_OK.test(nombre)) return { error: 'Nombre inválido: usa letras, números y + - / ( ) . (máximo 30).' };
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) return { error: 'Color inválido.' };
  if (!leer('Laboratorios').some(l => l.id === o.lab)) return { error: 'Laboratorio no encontrado.' };
  const actuales = leer('ImplementosLab').filter(i => i.lab === o.lab);
  if (actuales.some(i => i.nombre.toLowerCase() === nombre.toLowerCase() && i.id !== o.id)) return { error: 'Ya existe un implemento con ese nombre en este laboratorio.' };
  if (!o.id) {
    hoja('ImplementosLab').appendRow([Utilities.getUuid().slice(0, 8), o.lab, nombre, color]);
    return { ok: 1 };
  }
  const item = actuales.find(i => i.id === o.id);
  if (!item) return { error: 'Implemento no encontrado.' };
  hoja('ImplementosLab').getRange(item._fila, 3, 1, 2).setValues([[nombre, color]]);
  if (nombre !== item.nombre) {
    const sh = hoja('ReservasLab'), filas = leer('ReservasLab').filter(r => r.lab === o.lab);
    filas.forEach(r => {
      const actualizados = lista(r.implementos).map(x => x === item.nombre ? nombre : x).join(', ');
      sh.getRange(r._fila, HOJAS.ReservasLab.indexOf('implementos') + 1).setValue(actualizados);
    });
  }
  return { ok: 1 };
}

function labImplementoQuitar(o) {
  if (!adminOk(o)) return NO_ADMIN;
  const item = leer('ImplementosLab').find(i => i.id === o.id && i.lab === o.lab);
  if (!item) return { error: 'Implemento no encontrado.' };
  const hoy = ahora().slice(0, 10);
  const usadas = leer('ReservasLab').filter(r => r.lab === o.lab && r.estado === 'Activa' && r.fecha >= hoy && lista(r.implementos).indexOf(item.nombre) >= 0).length;
  if (usadas) return { error: 'Tiene ' + usadas + ' reserva(s) activa(s). Cancélalas primero.' };
  hoja('ImplementosLab').deleteRow(item._fila);
  return { ok: 1 };
}

function crearReservaLab(r) {
  const nombre = String(r.nombre || '').trim(), mat = String(r.matricula || '').trim();
  const implementos = Array.isArray(r.equipos) ? r.equipos : [];
  const lab = leer('Laboratorios').find(l => l.id === r.lab);
  if (!lab) return { error: 'Laboratorio no encontrado.' };
  if (nombre.length < 3) return { error: 'Escribe tu nombre completo.' };
  if (mat.length < 4) return { error: 'Escribe tu matrícula.' };
  const validos = leer('ImplementosLab').filter(i => i.lab === r.lab).map(i => i.nombre);
  if (!implementos.length) return { error: 'Elige al menos un implemento.' };
  if (implementos.some(x => validos.indexOf(x) < 0)) return { error: 'El servidor no reconoce uno de los implementos. Recarga la página.' };
  const fechas = [...new Set(Array.isArray(r.fechas) ? r.fechas : [])];
  if (!fechas.length || fechas.length > CFG.MAX_DIAS) return { error: 'Elige entre 1 y ' + CFG.MAX_DIAS + ' fechas.' };
  if (fechas.some(dia => !/^\d{4}-\d{2}-\d{2}$/.test(dia))) return { error: 'Fecha inválida.' };
  if (new Set(fechas.map(dia => dia.slice(0, 7))).size > 1) return { error: 'Todas las fechas de una reserva deben pertenecer al mismo mes.' };
  if (!/^\d{2}:\d{2}$/.test(r.inicio) || !/^\d{2}:\d{2}$/.test(r.fin)) return { error: 'Hora inválida.' };
  const inicio = mins(r.inicio), fin = mins(r.fin);
  if (inicio % 30 !== 0 || fin % 30 !== 0 || fin - inicio < 30 || fin - inicio > 30 * CFG.MAX_BLOQUES) return { error: 'Duración máxima: ' + (CFG.MAX_BLOQUES * 30) + ' minutos.' };
  if (inicio < mins(lab.abre) || fin > mins(lab.cierra)) return { error: 'Fuera del horario de apertura del laboratorio.' };
  const diasAnticipacion = Number.isInteger(Number(lab.diasAnticipacion)) &&
    lab.diasAnticipacion !== '' && lab.diasAnticipacion !== null && lab.diasAnticipacion !== undefined
    ? Number(lab.diasAnticipacion) : CFG.DIAS_ANTICIPACION;
  const diasDisponibles = diasLaboratorio(lab.diasDisponibles);
  const limite = new Date(); limite.setDate(limite.getDate() + diasAnticipacion);
  const minimo = Utilities.formatDate(limite, TZ, 'yyyy-MM-dd');
  const autorizados = leer('Autorizados').map(a => a.fecha);
  const ocupaciones = leer('UsoLab').filter(u => u.lab === r.lab);
  const reservas = leer('ReservasLab').filter(x => x.lab === r.lab);
  for (const dia of fechas) {
    if (dia < minimo) return { error: dia + ': este laboratorio requiere ' + diasAnticipacion + ' días de anticipación (primer día disponible: ' + minimo + ').' };
    if (diasDisponibles.indexOf(diaSemana(dia)) < 0) return { error: dia + ': este laboratorio no está disponible ese día de la semana.' };
    if (esFinDeSemana(dia) && autorizados.indexOf(dia) < 0) return { error: dia + ': los sábados y domingos no se pueden apartar (solo con autorización del administrador).' };
    if (dia + ' ' + r.inicio < ahora()) return { error: dia + ': ese horario ya pasó.' };
    if (ocupaciones.some(u => u.fecha === dia && inicio < mins(u.fin) && fin > mins(u.inicio))) return { error: dia + ': el laboratorio está ocupado por una actividad.' };
    if (reservas.some(x => x.estado === 'Activa' && x.fecha === dia && inicio < mins(x.fin) && fin > mins(x.inicio) && choca(lista(x.implementos), implementos))) {
      return { error: dia + ': uno de los implementos ya está reservado en ese horario.' };
    }
  }
  const pin = String(1000 + Math.floor(Math.random() * 9000));
  fechas.forEach(dia => hoja('ReservasLab').appendRow([
    Utilities.getUuid().slice(0, 8), ahora(), r.lab, dia, r.inicio, r.fin,
    implementos.join(', '), nombre, mat, pin, 'Activa', String(r.otros || '').trim().slice(0, 200)
  ]));
  return { ok: 1, pin, n: fechas.length };
}

function labOcupar(o) {
  if (!adminOk(o)) return NO_ADMIN;
  const lab = leer('Laboratorios').find(l => l.id === o.lab);
  if (!lab) return { error: 'Laboratorio no encontrado.' };
  const fechas = [...new Set(Array.isArray(o.fechas) ? o.fechas : [])];
  if (!fechas.length || fechas.length > 60) return { error: 'Elige entre 1 y 60 fechas.' };
  if (fechas.some(f => !/^\d{4}-\d{2}-\d{2}$/.test(f))) return { error: 'Fecha inválida.' };
  if (!HORA_OK.test(o.inicio) || !HORA_OK.test(o.fin) || mins(o.fin) <= mins(o.inicio)) return { error: 'Horario inválido.' };
  if (mins(o.inicio) < mins(lab.abre) || mins(o.fin) > mins(lab.cierra)) return { error: 'Fuera del horario de apertura del laboratorio.' };
  const reservas = leer('ReservasLab').filter(r => r.lab === o.lab && r.estado === 'Activa');
  if (reservas.some(r => fechas.includes(r.fecha) && mins(o.inicio) < mins(r.fin) && mins(o.fin) > mins(r.inicio))) {
    return { error: 'Hay reservas activas de implementos en ese horario. Cancélalas primero.' };
  }
  const motivo = String(o.motivo || '').trim().slice(0, 60);
  fechas.forEach(f => hoja('UsoLab').appendRow([o.lab, f, o.inicio, o.fin, motivo]));
  return { ok: 1, n: fechas.length };
}

function labLiberar(o) {
  if (!adminOk(o)) return NO_ADMIN;
  const u = leer('UsoLab').find(x => x.lab === o.lab && x.fecha === o.fecha && x.inicio === o.inicio && x.fin === o.fin);
  if (!u) return { error: 'No se encontró esa ocupación.' };
  hoja('UsoLab').deleteRow(u._fila);
  return { ok: 1 };
}

const ACCIONES = {
  create: crear, createLab: crearReservaLab, cancel: cancelar, borrar: borrar, bloquear: bloquear, desbloquear: desbloquear,
  equipoGuardar: equipoGuardar, equipoQuitar: equipoQuitar, autorizar: autorizar, desautorizar: desautorizar,
  labGuardar: labGuardar, labQuitar: labQuitar, labOcupar: labOcupar, labLiberar: labLiberar,
  labImplementoGuardar: labImplementoGuardar, labImplementoQuitar: labImplementoQuitar,
  celdaGuardar: celdaGuardar,
  admin: o => adminOk(o) ? { ok: 1 } : NO_ADMIN
};
