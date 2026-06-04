const { renderTemplate } = require('../modules/mail/mail.service');

describe('Mail templates', () => {
  it('incluye la clave inicial en el correo de bienvenida', async () => {
    const html = await renderTemplate('welcome', {
      name: 'Ana',
      initialPassword: 'ClaveTemporal123',
    });

    expect(html).toContain('fue dada de alta con exito');
    expect(html).toContain('ClaveTemporal123');
  });
});
