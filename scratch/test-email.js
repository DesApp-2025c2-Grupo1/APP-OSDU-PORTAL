require('dotenv').config();
const mailService = require('../src/modules/mail/mail.service');

const testEmail = async () => {
  console.log('Iniciando prueba de envío de email...');
  try {
    await mailService.sendEmail(
      'test@example.com',
      'Prueba de Funcionamiento - Portal UNAHUR',
      'account_activated',
      { name: 'Usuario de Prueba' }
    );
    console.log('Prueba finalizada con éxito. Revisa el dashboard de Mailpit en http://localhost:8025');
  } catch (error) {
    console.error('La prueba de email falló:', error);
  }
};

testEmail();
