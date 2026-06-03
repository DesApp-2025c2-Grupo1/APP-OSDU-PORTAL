const nodemailer = require('nodemailer');

const smtpHost = process.env.SMTP_HOST;
const smtpPort = process.env.SMTP_PORT || 1025;
const isMailEnabled = Boolean(smtpHost);

const mailConfig = {
  host: smtpHost,
  port: smtpPort,
  secure: false, // true for 465, false for other ports
  auth: process.env.SMTP_USER ? {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  } : undefined,
};

const transporter = nodemailer.createTransport(mailConfig);

// Verificar la conexión al inicio
if (isMailEnabled && process.env.NODE_ENV !== 'test') {
  transporter.verify((error) => {
    if (error) {
      console.error('Error al conectar con el servidor SMTP:', error);
    } else {
      console.log('Servidor SMTP listo para enviar correos');
    }
  });
} else if (process.env.NODE_ENV !== 'test') {
  console.warn('SMTP deshabilitado: definir SMTP_HOST para enviar correos');
}

module.exports = { transporter, isMailEnabled };
