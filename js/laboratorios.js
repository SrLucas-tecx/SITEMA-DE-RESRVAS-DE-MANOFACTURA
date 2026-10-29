/* Sección LABORATORIOS: la lista de laboratorios (barra lateral) y el calendario propio del que se elige */
import { CFG } from './config.js';
import { $, aMinutos, aHora, escapar, nombreDia, nombreMes, inicioSemana, sumarDias } from './utils.js';
import { estado, laboratorios, labActual } from './estado.js';
import { resumenLab } from './labDatos.js';
import { htmlDiaLab, htmlSemanaLab, htmlMesLab } from './vistaLab.js';

const VISTAS = { dia: htmlDiaLab, semana: htmlSemanaLab, mes: htmlMesLab };

function periodo() {
  const f = estado.fecha;
  if (estado.vista === 'mes') return nombreMes(f);
  if (estado.vista === 'semana') return 'Semana del ' + inicioSemana(f) + ' al ' + sumarDias(inicioSemana(f), 6);
  return nombreDia(f) + ' ' + f;
}

export function dibujarLabs() {
  const lab = labActual();
  if (lab) estado.labId = lab.id;

  // Lista: cada laboratorio con su nombre, su estado y una barra del día
  const inicio = aMinutos(CFG.HORA_INI), total = aMinutos(CFG.HORA_FIN) - inicio;
  $('#listaLabsPublica').innerHTML = laboratorios().map(l => {
    const r = resumenLab(l, estado.fecha);
    const barra = r.tramos.map(s =>
      `<span class="seg ${s.tipo}" style="left:${(s.ini - inicio) / total * 100}%;width:${(s.fin - s.ini) / total * 100}%"></span>`).join('');
    return `<button class="lab-item${l.id === estado.labId ? ' sel' : ''}" data-lab="${escapar(l.id)}">` +
      `<span><b>${escapar(l.nombre)}</b><small>${l.abre}–${l.cierra}${l.ubicacion ? ' · ' + escapar(l.ubicacion) : ''}</small></span>` +
      `<span class="estado-lab ${r.estado.clase}">${escapar(r.estado.texto)}</span>` +
      `<span class="barra mini">${barra}</span></button>`;
  }).join('') || '<p class="sub">Todavía no hay laboratorios registrados. El administrador puede agregarlos desde su panel.</p>';

  // Calendario propio del laboratorio elegido
  $('#tituloLabs').textContent = lab ? lab.nombre : 'Laboratorios';
  $('#subLab').textContent = lab ? `${lab.abre}–${lab.cierra}${lab.ubicacion ? ' · ' + lab.ubicacion : ''} · ${periodo()}` : '';
  $('#vistaLab').innerHTML = lab ? VISTAS[estado.vista](lab)
    : '<p class="sub" style="padding:12px">Todavía no hay laboratorios. El administrador puede agregarlos desde su panel.</p>';
}

// Clics: elegir laboratorio · celda libre · bloque ocupado · día (semana y mes)
export function iniciarLabs({ alLibre, alOcupado, alDia }) {
  $('#listaLabsPublica').onclick = ev => {
    const boton = ev.target.closest('[data-lab]');
    if (!boton) return;
    estado.labId = boton.dataset.lab;
    dibujarLabs();
  };
  $('#vistaLab').onclick = ev => {
    const el = ev.target.closest('td, th');
    if (!el) return;
    if (el.dataset.labT) alLibre(el.dataset.labF, el.dataset.labT);
    else if (el.dataset.uso) alOcupado(...el.dataset.uso.split('|'));
    else if (el.dataset.ir) alDia(el.dataset.ir);
  };
}
