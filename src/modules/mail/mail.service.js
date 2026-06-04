const { transporter, isMailEnabled } = require('../../config/mail.config');
const fs = require('fs').promises;
const path = require('path');

const templateCache = new Map();

/**
 * Escapa caracteres HTML para prevenir XSS en cuerpos de email.
 */
const escapeHtml = (value) => {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
};

/**
 * Lee una plantilla HTML del disco (o caché) e interpola las variables del contexto.
 * Los valores del contexto se escapan para prevenir XSS e inyección de plantillas.
 * @param {string} templateName - Nombre del archivo sin extensión (ej: 'welcome')
 * @param {Object} context - Variables a reemplazar en el formato {{key}}
 * @returns {Promise<string>} HTML renderizado
 */
const renderTemplate = async (templateName, context = {}) => {
  // Validar nombre de plantilla para prevenir path traversal
  if (!/^[a-z0-9_-]+$/i.test(templateName)) {
    throw new Error(`Nombre de plantilla inválido: ${templateName}`);
  }

  let html;

  if (templateCache.has(templateName)) {
    html = templateCache.get(templateName);
  } else {
    const templatePath = path.join(__dirname, 'templates', `${templateName}.html`);
    html = await fs.readFile(templatePath, 'utf8');
    templateCache.set(templateName, html);
  }

  // Interpolación segura: primero reemplazamos todas las claves de una sola pasada
  // Los valores se escapan para prevenir inyección de plantilla (un valor que contenga
  // "{{otraVariable}}" NO es procesado en una segunda pasada).
  const escapedContext = Object.fromEntries(
    Object.entries(context).map(([k, v]) => [k, escapeHtml(v)])
  );

  // Reemplazar todas las ocurrencias de una sola vez con una función de replace
  const rendered = html.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return Object.prototype.hasOwnProperty.call(escapedContext, key)
      ? escapedContext[key]
      : match; // Deja sin reemplazar si la clave no existe en el contexto
  });

  return rendered;
};

/**
 * Envía un correo electrónico usando una plantilla HTML.
 * @param {string} to - Destinatario
 * @param {string} subject - Asunto
 * @param {string} templateName - Nombre de la plantilla (sin .html)
 * @param {Object} context - Variables para interpolar en la plantilla
 */
const sendEmail = async (to, subject, templateName, context = {}) => {
  if (!isMailEnabled) {
    console.warn(`[MAIL] SMTP deshabilitado. Se omitió el envío de '${templateName}'.`);
    return null;
  }

  try {
    const html = await renderTemplate(templateName, context);

    const mailOptions = {
      from: process.env.EMAIL_FROM || 'noreply@osdu.com.ar',
      to,
      subject,
      html,
    };

    const info = await transporter.sendMail(mailOptions);
    // Solo logueamos el messageId, no el destinatario ni contenido (PII)
    console.log(`[MAIL] Enviado. ID: ${info.messageId}, Plantilla: ${templateName}`);
    return info;
  } catch (error) {
    console.error(`[MAIL ERROR] Fallo al enviar plantilla '${templateName}':`, error.message);
    throw error;
  }
};

module.exports = { sendEmail, renderTemplate };
