const transporter = require('../../config/mail.config');
const fs = require('fs').promises;
const path = require('path');

// Cache para almacenar las plantillas en memoria
const templateCache = new Map();

/**
 * Servicio para el envío de correos electrónicos con soporte para plantillas y caché
 */
const sendEmail = async (to, subject, templateName, context = {}) => {
  try {
    let html;
    
    // Si la plantilla ya está en caché, la usamos. Si no, la leemos del disco.
    if (templateCache.has(templateName)) {
      html = templateCache.get(templateName);
    } else {
      const templatePath = path.join(__dirname, 'templates', `${templateName}.html`);
      html = await fs.readFile(templatePath, 'utf8');
      templateCache.set(templateName, html);
      console.log(`Plantilla '${templateName}' cargada en caché.`);
    }

    // Reemplazo de variables en el template {{variable}}
    let renderedHtml = html;
    Object.keys(context).forEach(key => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      renderedHtml = renderedHtml.replace(regex, context[key]);
    });

    const mailOptions = {
      from: process.env.EMAIL_FROM || 'noreply@unahur-portal.com',
      to,
      subject,
      html: renderedHtml,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`Email enviado a ${to}: ${info.messageId}`);
    return info;
  } catch (error) {
    console.error('Error enviando email:', error);
    throw error;
  }
};

module.exports = {
  sendEmail,
};
