/* Ventanas de aviso y de confirmación (en lugar de los alert y confirm del navegador) */
import { $ } from './utils.js';

// Abre la ventana y devuelve una promesa: true si se aceptó, false si se canceló o se cerró
async function abrir(texto, { titulo, aceptar, cancelar, peligro }) {
  const ventana = $('#modalMensaje');
  while (ventana.open) await new Promise(r => setTimeout(r, 100));   // si ya hay un aviso abierto, espera su turno
  return new Promise(resolve => {
    let resultado = false;
    $('#mTitulo').textContent = titulo;
    $('#mTexto').textContent = texto;
    $('#mAceptar').textContent = aceptar;
    $('#mAceptar').className = peligro ? 'peligro' : 'p';
    $('#mCancelar').hidden = !cancelar;
    $('#mCancelar').textContent = cancelar || '';
    $('#mAceptar').onclick = () => { resultado = true; ventana.close(); };
    $('#mCancelar').onclick = () => ventana.close();
    ventana.onclose = () => resolve(resultado);   // también al cerrar con Esc
    ventana.showModal();
  });
}

// Aviso con un solo botón
export const mensaje = (texto, titulo = 'Aviso') => abrir(texto, { titulo, aceptar: 'Entendido' });

// Pregunta con Cancelar / Aceptar
export const confirmar = (texto, { aceptar = 'Aceptar', peligro = false } = {}) =>
  abrir(texto, { titulo: 'Confirmar', aceptar, cancelar: 'Cancelar', peligro });

// Pregunta (si hace falta), ejecuta la llamada al servidor, avisa si falla y, si todo salió bien, recarga los datos
export async function ejecutar(pregunta, llamada, recargar) {
  if (pregunta && !(await confirmar(pregunta, { aceptar: 'Sí, continuar', peligro: true }))) return;
  let r;
  try { r = await llamada(); } catch (e) { r = { error: 'Sin conexión con el servidor.' }; }
  if (r.error) return mensaje(r.error);
  recargar();
}
