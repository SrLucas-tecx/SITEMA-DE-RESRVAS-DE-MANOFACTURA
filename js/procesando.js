/* Indicador "Procesando…": aparece si una acción tarda más de un instante,
   para que nadie piense que la página se trabó. */
import { $ } from './utils.js';

const RETRASO = 150;   // ms antes de mostrarlo (así no parpadea en acciones instantáneas)
const MINIMO = 450;    // ms mínimos a la vista, para que alcance a leerse

let pendientes = 0;    // cuántas acciones siguen en curso
let aparecer = null, ocultar = null;
let visible = false, visibleDesde = 0;

function mostrar() {
  const el = $('#procesando');
  if (el.showPopover) { if (!el.matches(':popover-open')) el.showPopover(); }   // queda por encima de las ventanas abiertas
  else el.classList.add('visible');
  visible = true;
  visibleDesde = Date.now();
}

function esconder() {
  const el = $('#procesando');
  if (el.hidePopover) { if (el.matches(':popover-open')) el.hidePopover(); }
  else el.classList.remove('visible');
  visible = false;
}

function empezar(texto) {
  pendientes++;
  clearTimeout(ocultar);
  document.body.classList.add('ocupado');       // evita doble clic mientras se procesa
  if (pendientes === 1) {
    $('#procesandoTexto').textContent = texto;
    if (!visible) aparecer = setTimeout(mostrar, RETRASO);
  }
}

function terminar() {
  pendientes = Math.max(0, pendientes - 1);
  if (pendientes) return;
  clearTimeout(aparecer);
  document.body.classList.remove('ocupado');
  if (visible) ocultar = setTimeout(esconder, Math.max(0, MINIMO - (Date.now() - visibleDesde)));
}

// Ejecuta `accion` (una función async) mostrando el indicador mientras tarde
export async function conIndicador(accion, texto = 'Procesando…') {
  empezar(texto);
  try { return await accion(); }
  finally { terminar(); }
}
