/* Punto de entrada: junta los módulos y arranca la página */
import { CFG } from './config.js';
import { $, aHora, aMinutos, hoy, sumarDias, sumarMeses } from './utils.js';
import { api, apiDirecta } from './api.js';
import { estado } from './estado.js';
import { dibujar, iniciarCalendario } from './calendario.js';
import { iniciarModales, abrirApartar, abrirApartarLab, abrirCancelar } from './modales.js';
import { iniciarAdmin, dibujarAdmin, mostrarPantalla, abrirAdminReserva, quitarBloqueo } from './admin.js';
import { iniciarLabs } from './laboratorios.js';
import { quitarOcupacion } from './adminLabs.js';
import { iniciarDias } from './disponibles.js';
import { mensaje } from './mensajes.js';
import { actualizarBloques, bloques } from './horario.js';
import { actualizarBloquesLab } from './horarioLab.js';

$('#modo').textContent = CFG.API_URL
  ? 'Conectado a Google Sheets · datos compartidos'
  : 'Modo local de pruebas · los datos solo se guardan en este navegador';

// Indicador de conexión (arriba a la derecha)
function mostrarConexion(ok) {
  const el = $('#enlinea');
  if (!CFG.API_URL) { el.className = 'enlinea local'; el.textContent = 'Modo local'; return; }
  const hora = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  const viejo = ok && estado.datos.version !== CFG.SCRIPT_VERSION;   // el script publicado no es el último
  el.className = 'enlinea ' + (!ok ? 'mal' : viejo ? 'viejo' : 'ok');
  el.textContent = !ok ? 'Sin conexión · reintentando…'
    : viejo ? 'En línea, pero el script está desactualizado: falta crear la Versión nueva'
    : 'En línea · actualizado ' + hora;
}

let avisado = false;   // ya se avisó que se perdió la conexión

function aplicarConfiguracionCelda(config = {}) {
  const anterior = `${CFG.NOMBRE_CELDA}|${CFG.HORA_INI}|${CFG.HORA_FIN}|${CFG.DIAS_ANTICIPACION}|${CFG.MAX_BLOQUES_CELDA}`;
  if (typeof config.nombre === 'string' && config.nombre.trim()) CFG.NOMBRE_CELDA = config.nombre;
  if (/^\d{2}:\d{2}$/.test(config.abre) && /^\d{2}:\d{2}$/.test(config.cierra) &&
      aMinutos(config.abre) % 30 === 0 && aMinutos(config.cierra) % 30 === 0 &&
      aMinutos(config.abre) < 1440 && aMinutos(config.cierra) <= 1410 &&
      aMinutos(config.cierra) > aMinutos(config.abre)) {
    CFG.HORA_INI = config.abre;
    CFG.HORA_FIN = config.cierra;
  }
  const dias = Number(config.diasAnticipacion);
  if (config.diasAnticipacion !== '' && config.diasAnticipacion !== null &&
      config.diasAnticipacion !== undefined && Number.isInteger(dias) && dias >= 0 && dias <= 365) {
    CFG.DIAS_ANTICIPACION = dias;
  }
  const maxBloques = Number(config.maxBloques);
  if (Number.isInteger(maxBloques) && maxBloques >= 1 && maxBloques <= 48 &&
      maxBloques <= (aMinutos(CFG.HORA_FIN) - aMinutos(CFG.HORA_INI)) / 30) {
    CFG.MAX_BLOQUES_CELDA = maxBloques;
  }
  const actual = `${CFG.NOMBRE_CELDA}|${CFG.HORA_INI}|${CFG.HORA_FIN}|${CFG.DIAS_ANTICIPACION}|${CFG.MAX_BLOQUES_CELDA}`;
  if (actual === anterior) return;

  actualizarBloques();
  const horas = bloques.map(aHora);
  const llenar = (selector, opciones) => {
    const select = $(selector), valor = select.value;
    select.innerHTML = opciones.map(hora => `<option>${hora}</option>`).join('');
    select.value = opciones.includes(valor) ? valor : (opciones[0] || '');
  };
  llenar('#inicio', horas);
  llenar('#bIni', horas);
  llenar('#bFin', bloques.map(t => aHora(t + 30)));
  $('#tituloApp').textContent = 'Reservas · ' + CFG.NOMBRE_CELDA;
  document.title = 'Reservas · ' + CFG.NOMBRE_CELDA;
}

// Si se pierde la conexión se avisa UNA vez (en una ventana) y se sigue mostrando lo último que se leyó
function conexionPerdida() {
  mostrarConexion(false);
  if (avisado) return;
  avisado = true;
  mensaje('No se pudo conectar con el servidor. Se reintentará solo cada minuto; si sigue igual, recarga la página.');
}

// Lee las reservas (de Sheets o local) y redibuja
async function cargar(silencioso) {
  try {
    const datos = await (silencioso ? apiDirecta : api).list();
    if (!datos.res) throw new Error('respuesta inválida');
    aplicarConfiguracionCelda(datos.configuracionCelda);
    estado.datos = datos;
    actualizarBloquesLab(datos.laboratorios || []);
    avisado = false;
    mostrarConexion(true);
  } catch (e) {
    conexionPerdida();
  }
  dibujar();
  dibujarAdmin();   // solo se dibuja si el panel de administración está abierto
}

// Navegación: ◀ ▶ mueven un día, una semana o un mes según la vista
function irA(fecha) { estado.fecha = fecha || hoy(); dibujar(); }
function mover(n) {
  if (estado.vista === 'mes') irA(sumarMeses(estado.fecha, n));
  else irA(sumarDias(estado.fecha, estado.vista === 'semana' ? 7 * n : n));
}
$('#fecha').onchange = e => irA(e.target.value);
$('#prev').onclick = () => mover(-1);
$('#next').onclick = () => mover(1);
$('#hoy').onclick = () => irA(hoy());

// Pestañas: Celda de manufactura / Laboratorios
function cambiarSeccion(seccion) {
  estado.seccion = seccion;
  document.body.classList.toggle('sec-labs', seccion === 'labs');
  $('#ayudaCelda').hidden = seccion === 'labs';
  $('#ayudaLabs').hidden = seccion !== 'labs';
  document.querySelectorAll('[data-sec]').forEach(b => b.classList.toggle('on', b.dataset.sec === seccion));
  dibujar();
}
document.querySelectorAll('[data-sec]').forEach(boton => {
  boton.onclick = () => cambiarSeccion(boton.dataset.sec);
});

// Desde el panel de administración: abrir el calendario propio de un laboratorio
function irALab(id) {
  estado.labId = id;
  mostrarPantalla('calendario');
  cambiarSeccion('labs');
}

// Cambiar de vista
document.querySelectorAll('[data-v]').forEach(b => {
  b.onclick = () => { estado.vista = b.dataset.v; dibujar(); };
});

// Si el navegador pierde o recupera internet
window.addEventListener('offline', conexionPerdida);
window.addEventListener('online', () => cargar());

// Arranque
iniciarCalendario({
  alLibre: (hora, equipo) => abrirApartar(estado.fecha, hora, equipo),
  alOcupada: (id, equipo) => estado.admin ? abrirAdminReserva(id) : abrirCancelar(id, 'celda', equipo),
  alBloqueo: (inicio, fin) => estado.admin && quitarBloqueo(estado.fecha, inicio, fin, cargar),
  alDia: fecha => { estado.fecha = fecha; estado.vista = 'dia'; dibujar(); }
});
iniciarModales(cargar);
iniciarAdmin(cargar, irALab);
iniciarLabs({
  alLibre: (fecha, hora, implemento) => abrirApartarLab(fecha, hora, estado.labId, implemento),
  alReserva: (id, equipo) => estado.admin ? abrirAdminReserva(id, 'lab') : abrirCancelar(id, 'lab', equipo),
  alOcupado: (fecha, inicio, fin) => estado.admin && quitarOcupacion(fecha, inicio, fin, cargar),
  alDia: fecha => { estado.fecha = fecha; estado.vista = 'dia'; dibujar(); }
});
iniciarDias(fecha => { estado.fecha = fecha; estado.vista = 'dia'; dibujar(); });
cargar();
setInterval(() => cargar(true), 60000);   // se actualiza solo cada minuto
