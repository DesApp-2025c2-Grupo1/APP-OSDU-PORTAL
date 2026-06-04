const { sendEmail } = require('./mail.service');

const TEMPLATE_MAP = new Map([
  ['WELCOME',        { subject: '¡Bienvenido a OSDU!',                  template: 'welcome' }],
  ['REG_RECEIVED',   { subject: 'Recibimos tu solicitud de afiliación',  template: 'registration_received' }],
  ['PWD_CHANGE',     { subject: 'Contraseña cambiada',                     template: 'password_changed' }],
  ['APPT_CREATE',    { subject: 'Nuevo turno creado',                      template: 'appointment_created' }],
  ['APPT_STATUS',    { subject: 'Estado del turno actualizado',             template: 'appointment_status' }],
  ['APPT_CANCEL',    { subject: 'Turno cancelado',                         template: 'appointment_status' }],
  ['REQ_STATUS',     { subject: 'Estado de su solicitud actualizado',       template: 'request_status' }],
  ['ACCOUNT_ON',     { subject: 'Tu cuenta fue activada',                  template: 'account_activated' }],
  ['ACCOUNT_OFF',    { subject: 'Tu cuenta fue desactivada',               template: 'account_deactivated' }],
  ['SITUATION',      { subject: 'Situación terapéutica actualizada',       template: 'situation_changed' }],
]);

/**
 * Envía una notificación de email por tipo.
 * Si el envío falla, registra el error pero NO lo propaga (no debe bloquear flujos críticos).
 * @param {string} type - Clave del TEMPLATE_MAP
 * @param {string} to - Email destinatario
 * @param {Object} context - Variables de la plantilla
 */
async function notify(type, to, context = {}) {
  const entry = TEMPLATE_MAP.get(type);
  if (!entry) {
    console.error(`[NOTIFY] Tipo de notificación desconocido: ${type}`);
    return;
  }
  try {
    await sendEmail(to, entry.subject, entry.template, context);
  } catch (err) {
    // El email no debe romper la transacción de negocio que lo generó
    console.error(`[NOTIFY] Error enviando notificación '${type}':`, err.message);
  }
}

module.exports = { notify };
