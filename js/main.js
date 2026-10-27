/* Punto de entrada: junta los módulos y arranca la página */
import { CFG } from './config.js';
import { $, hoy, sumarDias, sumarMeses } from './utils.js';
import { api } from './api.js';
import { estado } from './estado.js';
import { dibujar, dibujarLeyenda, iniciarCalendario } from './calendario.js';
import { iniciarModales, abrirApartar, abrirCancelar } from './modales.js';

$('#modo').textContent = CFG.API_URL
  ? 'Conectado a Google Sheets · datos compartidos'
  : 'Modo local de pruebas · los datos solo se guardan en este navegador';

// Lee las reservas (de Sheets o local) y redibuja
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

// Arranque
dibujarLeyenda();
iniciarCalendario({
  alLibre: (hora, equipo) => abrirApartar(estado.fecha, hora, equipo),
  alOcupada: abrirCancelar,
  alDia: fecha => { estado.fecha = fecha; estado.vista = 'dia'; dibujar(); }
});
iniciarModales(cargar);
cargar();
setInterval(cargar, 60000);   // se actualiza solo cada minuto
