/* Calendario: elige la vista (día / semana / mes) y dibuja leyenda y lista del día */
import { CFG } from './config.js';
import { $, escapar, nombreDia, nombreMes, inicioSemana, sumarDias } from './utils.js';
import { estado, reservasDe } from './estado.js';
import { htmlDia } from './vistaDia.js';
import { htmlSemana } from './vistaSemana.js';
import { htmlMes } from './vistaMes.js';

const VISTAS = { dia: htmlDia, semana: htmlSemana, mes: htmlMes };

// Leyenda: cuadrito de color + nombre de cada equipo
export function dibujarLeyenda() {
  const notas = CFG.NOTAS || {};
  $('#leyenda').innerHTML = CFG.EQUIPOS.map(e =>
    `<span class="item"><i class="chip" style="background:${CFG.COLORES[e]}"></i><b>${e}</b>` +
    (notas[e] ? ` <small>· ${notas[e]}</small>` : '') + '</span>').join('');
}

function titulo() {
  const f = estado.fecha;
  if (estado.vista === 'mes') return nombreMes(f);
  if (estado.vista === 'semana') return 'Semana del ' + inicioSemana(f) + ' al ' + sumarDias(inicioSemana(f), 6);
  return nombreDia(f) + ' ' + f;
}

// Lista de reservas del día de referencia (las canceladas salen tachadas)
function dibujarLista() {
  $('#tituloLista').textContent = 'Reservas del ' + estado.fecha;
  const filas = reservasDe(estado.fecha)
    .sort((a, b) => a.inicio.localeCompare(b.inicio))
    .map(x => {
      const activa = x.estado === 'Activa';
      return `<li class="${activa ? '' : 'can'}">${x.inicio}–${x.fin} · ${escapar(x.equipos.join(', '))} · ${escapar(x.nombre)}` +
        (x.otros ? `<br><small>Otros: ${escapar(x.otros)}</small>` : '') + (activa ? '' : ' (cancelado)') + '</li>';
    });
  $('#lista').innerHTML = filas.join('') || '<li class="sub">Sin reservas este día.</li>';

  estado.datos.blq.filter(b => b.fecha === estado.fecha).forEach(b => {
    $('#lista').insertAdjacentHTML('afterbegin',
      `<li class="sub">${b.inicio}–${b.fin} · No disponible: ${escapar(b.motivo || 'bloqueado')}</li>`);
  });
}

export function dibujar() {
  $('#fecha').value = estado.fecha;
  $('#tituloVista').textContent = titulo();
  $('#vista').innerHTML = VISTAS[estado.vista]();
  document.querySelectorAll('[data-v]').forEach(b => b.classList.toggle('on', b.dataset.v === estado.vista));
  dibujarLista();
}

// Clics: celda libre (día) · reserva ocupada · día (semana y mes)
export function iniciarCalendario({ alLibre, alOcupada, alDia }) {
  $('#vista').onclick = ev => {
    const el = ev.target.closest('td, th');
    if (!el) return;
    if (el.dataset.t) alLibre(el.dataset.t, el.dataset.e);
    else if (el.dataset.id) alOcupada(el.dataset.id);
    else if (el.dataset.ir) alDia(el.dataset.ir);
  };
}
