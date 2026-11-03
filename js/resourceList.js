import { $, escapar } from './utils.js';
import { NOMBRE_EQUIPO } from './validacion.js';
import { confirmar, mensaje } from './mensajes.js';

const sinConexion = { error: 'Sin conexión con el servidor.' };
let guardarActivo = null;

export function iniciarResourceList({
  listSelector, addSelector, title, emptyText, getItems, getId, getName, getColor,
  getContext, save, remove, confirmRemove, onSaved
}) {
  let editingId = null;
  const lista = $(listSelector);

  function dibujar() {
    lista.innerHTML = getItems().map(item =>
      `<li class="resource-row"><i class="chip" style="background:${escapar(getColor(item))}"></i>` +
      `<b class="resource-name">${escapar(getName(item))}</b>` +
      `<span class="acc"><button data-resource-edit="${escapar(getId(item))}">Editar</button>` +
      `<button class="peligro" data-resource-del="${escapar(getId(item))}">Quitar</button></span></li>`
    ).join('') || `<li class="sub">${escapar(emptyText)}</li>`;
  }

  function abrir(item = null) {
    editingId = item ? getId(item) : null;
    guardarActivo = guardar;
    $('#eTitulo').textContent = item ? `Editar ${title.toLowerCase()}` : `Agregar ${title.toLowerCase()}`;
    $('#eNombre').value = item ? getName(item) : '';
    $('#eColor').value = item ? getColor(item) : '#00d26a';
    $('#eout').innerHTML = '';
    $('#modalEquipo').showModal();
  }

  async function guardar() {
    const nombre = $('#eNombre').value.trim();
    if (!NOMBRE_EQUIPO.test(nombre)) {
      $('#eout').innerHTML = '<div class="msg e">Nombre inválido: usa letras, números y + - / ( ) . (máximo 30).</div>';
      return;
    }
    let resultado;
    try {
      resultado = await save({ id: editingId, nombre, color: $('#eColor').value, context: getContext() });
    } catch (e) { resultado = sinConexion; }
    if (resultado.error) {
      $('#eout').innerHTML = `<div class="msg e">${escapar(resultado.error)}</div>`;
      return;
    }
    $('#modalEquipo').close();
    await onSaved();
    dibujar();
  }

  async function quitar(id) {
    const item = getItems().find(recurso => getId(recurso) === id);
    if (!item) return;
    if (!(await confirmar(confirmRemove(item), { aceptar: 'Sí, quitar', peligro: true }))) return;
    let resultado;
    try {
      resultado = await remove({ item, context: getContext() });
    } catch (e) { resultado = sinConexion; }
    if (resultado.error) {
      mensaje(resultado.error);
      return;
    }
    await onSaved();
    dibujar();
  }

  $(addSelector).onclick = () => abrir();
  lista.onclick = ev => {
    const boton = ev.target.closest('[data-resource-edit], [data-resource-del]');
    if (!boton) return;
    if (boton.dataset.resourceEdit !== undefined) {
      const item = getItems().find(recurso => getId(recurso) === boton.dataset.resourceEdit);
      if (item) abrir(item);
    } else {
      quitar(boton.dataset.resourceDel);
    }
  };
  return { dibujar, agregar: () => abrir() };
}

$('#eGuardar').addEventListener('click', () => guardarActivo?.());
