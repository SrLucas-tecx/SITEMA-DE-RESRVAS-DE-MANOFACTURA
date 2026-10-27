/* Configuración: lo que normalmente se edita (horarios, equipos, colores, URL del script) */

export const CFG = {
  // URL del Apps Script. Si está vacía, la web funciona en modo local de pruebas.
  API_URL: 'https://script.google.com/macros/s/AKfycbxpvg8_6x3fzd93TcemCOHVRXH1WW1Qc7lsn_3IyXPTogTqJUVBVLrGI3Nf8mAROD--/exec',

  HORA_INI: '08:00',   // la celda abre
  HORA_FIN: '20:00',   // la celda cierra
  MAX_BLOQUES: 3,      // bloques de 30 min por reserva (3 = 1 h 30 min)
  MAX_DIAS: 5,         // días que se pueden apartar en una sola reserva
  DIAS_ANTICIPACION: 5, // hay que apartar con al menos estos días de anticipación
  SCRIPT_VERSION: 'v5', // debe coincidir con VERSION en Code.gs (avisa si el script publicado está viejo)

  // Solo para pruebas en modo local. En Google Sheets el código vive en Code.gs.
  ADMIN_LOCAL: '',

  // Cada equipo tiene su color. "Banda + Cámara" va junta porque solo se usan a la vez.
  EQUIPOS: ['Celda', 'Brazo', 'Banda + Cámara', 'Cortadora'],
  COLORES: { 'Celda': '#00D26A', 'Brazo': '#2BC5C5', 'Banda + Cámara': '#F2B705', 'Cortadora': '#B79CFF' },
  NOTAS: { 'Cortadora': 'La usan sobre todo los de primer año' },

  // Solo modo local. Ej: { fecha: '2026-10-28', inicio: '08:00', fin: '12:00', motivo: 'Clase' }
  BLOQUEOS: []
};