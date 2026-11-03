/* Configuración: lo que normalmente se edita (horarios, equipos, colores, URL del script) */

export const CFG = {
  // URL del Apps Script. Si está vacía, la web funciona en modo local de pruebas.
  API_URL: 'https://script.google.com/macros/s/AKfycbx7vI5wPBpMMGzlFF0VdPN5w-AOGWGw0dKFR7oF5wiRdyYVMDur7ZPT-hJl30H88-qX/exec',

  HORA_INI: '08:00',   // la celda abre
  HORA_FIN: '20:00',   // la celda cierra
  NOMBRE_CELDA: 'Celda de Manufactura',
  MAX_BLOQUES: 3,      // bloques de 30 min por reserva (3 = 1 h 30 min)
  MAX_DIAS: 31,        // fechas máximas por reserva, siempre del mismo mes
  DIAS_ANTICIPACION: 5, // hay que apartar con al menos estos días de anticipación
  DIAS_LAB_DEFAULT: [1, 2, 3, 4, 5], // lunes a viernes
  SCRIPT_VERSION: 'v13', // debe coincidir con VERSION en Code.gs (avisa si el script publicado está viejo)

  // Solo para pruebas en modo local. En Google Sheets el código vive en Code.gs.
  ADMIN_LOCAL: '',

  // Material inicial (el administrador lo agrega, edita y quita desde su panel).
  // Cada equipo tiene su color. "Banda + Cámara" va junta porque solo se usan a la vez.
  EQUIPOS: ['Celda', 'Brazo', 'Banda + Cámara', 'Cortadora'],
  COLORES: { 'Celda': '#00D26A', 'Brazo': '#2BC5C5', 'Banda + Cámara': '#F2B705', 'Cortadora': '#B79CFF' },

  // Solo modo local. Ej: { fecha: '2026-10-28', inicio: '08:00', fin: '12:00', motivo: 'Clase' }
  BLOQUEOS: []
};
