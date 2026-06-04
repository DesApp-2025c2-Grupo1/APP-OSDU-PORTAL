const nodemailer = require('nodemailer');

const smtpHost = process.env.SMTP_HOST;
const smtpPort = Number(process.env.SMTP_PORT || 1025);
const isMailEnabled = Boolean(smtpHost) && process.env.NODE_ENV !== 'test';

const mailConfig = {
  host: smtpHost,
  port: smtpPort,
  secure: smtpPort === 465,
  auth: process.env.SMTP_USER ? {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  } : undefined,
};

const transporter = isMailEnabled ? nodemailer.createTransport(mailConfig) : null;

// Verificar la conexión al inicio
if (isMailEnabled) {
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
