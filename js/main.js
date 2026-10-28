/* Punto de entrada: junta los módulos y arranca la página */
import { CFG } from './config.js';
import { $, hoy, sumarDias, sumarMeses } from './utils.js';
import { api } from './api.js';
import { estado } from './estado.js';
import { dibujar, dibujarLeyenda, iniciarCalendario } from './calendario.js';
import { iniciarModales, abrirApartar, abrirCancelar } from './modales.js';
import { iniciarAdmin, abrirAdminReserva, quitarBloqueo } from './admin.js';

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

// Lee las reservas (de Sheets o local) y redibuja
async function cargar() {
  try {
    estado.datos = await api.list();
    if (!estado.datos.res) throw new Error('respuesta inválida');
    $('#aviso').innerHTML = '';
    mostrarConexion(true);
  } catch (e) {
    estado.datos = { res: [], blq: [] };
    mostrarConexion(false);
    $('#aviso').innerHTML = '<div class="msg e">No se pudo leer los datos. Intenta recargar la página.</div>';
  }
  dibujar();
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

// Cambiar de vista
document.querySelectorAll('[data-v]').forEach(b => {
  b.onclick = () => { estado.vista = b.dataset.v; dibujar(); };
});

// Si el navegador pierde o recupera internet
window.addEventListener('offline', () => mostrarConexion(false));
window.addEventListener('online', cargar);

// Arranque
dibujarLeyenda();
iniciarCalendario({
  alLibre: (hora, equipo) => abrirApartar(estado.fecha, hora, equipo),
  alOcupada: id => estado.admin ? abrirAdminReserva(id) : abrirCancelar(id),
  alBloqueo: (inicio, fin) => estado.admin && quitarBloqueo(estado.fecha, inicio, fin, cargar),
  alDia: fecha => { estado.fecha = fecha; estado.vista = 'dia'; dibujar(); }
});
iniciarModales(cargar);
iniciarAdmin(cargar);
cargar();
setInterval(cargar, 60000);   // se actualiza solo cada minuto
