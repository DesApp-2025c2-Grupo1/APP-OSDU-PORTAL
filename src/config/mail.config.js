const nodemailer = require('nodemailer');

const mailConfig = {
  host: process.env.SMTP_HOST || 'localhost',
  port: process.env.SMTP_PORT || 1025,
  secure: false, // true for 465, false for other ports
  auth: process.env.SMTP_USER ? {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  } : undefined,
};

const transporter = nodemailer.createTransport(mailConfig);

// Verificar la conexión al inicio
if (process.env.NODE_ENV !== 'test') {
  transporter.verify((error) => {
    if (error) {
      console.error('Error al conectar con el servidor SMTP:', error);
    } else {
      console.log('Servidor SMTP listo para enviar correos');
    }
  });
}

module.exports = transporter;
