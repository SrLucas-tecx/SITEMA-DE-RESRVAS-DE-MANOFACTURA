/* Punto de entrada: junta los módulos y arranca la página */
import { CFG } from './config.js';
import { $, hoy, sumarDias } from './utils.js';
import { api } from './api.js';
import { estado } from './estado.js';
import { dibujar, dibujarLeyenda, iniciarCalendario } from './calendario.js';
import { iniciarModales, abrirApartar, abrirCancelar } from './modales.js';

$('#modo').textContent = CFG.API_URL
  ? 'Conectado a Google Sheets · datos compartidos'
  : 'Modo local de pruebas · los datos solo se guardan en este navegador';

// Lee las reservas (de Sheets o local) y redibuja el calendario
async function cargar() {
  try {
    estado.datos = await api.list();
    if (!estado.datos.res) throw new Error('respuesta inválida');
    $('#aviso').innerHTML = '';
  } catch (e) {
    estado.datos = { res: [], blq: [] };
    $('#aviso').innerHTML = '<div class="msg e">No se pudo leer los datos. Intenta recargar la página.</div>';
  }
  dibujar();
}

// Navegación por fechas
function irA(fecha) {
  estado.fecha = fecha || hoy();
  dibujar();
}
$('#fecha').onchange = e => irA(e.target.value);
$('#prev').onclick = () => irA(sumarDias(estado.fecha, -1));
$('#next').onclick = () => irA(sumarDias(estado.fecha, 1));
$('#hoy').onclick = () => irA(hoy());

// Arranque
dibujarLeyenda();
iniciarCalendario(abrirApartar, abrirCancelar);
iniciarModales(cargar);
cargar();
setInterval(cargar, 60000);   // se actualiza solo cada minuto
