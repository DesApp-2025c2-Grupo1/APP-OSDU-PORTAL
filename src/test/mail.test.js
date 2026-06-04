const { renderTemplate } = require('../modules/mail/mail.service');
const fs = require('fs');
const path = require('path');

describe('Mail templates', () => {
  it('incluye la clave inicial en el correo de bienvenida', async () => {
    const html = await renderTemplate('welcome', {
      name: 'Ana',
      initialPassword: 'ClaveTemporal123',
    });

    expect(html).toContain('fue dada de alta con exito');
    expect(html).toContain('ClaveTemporal123');
  });

  it('no menciona UNAHUR en los templates de correo', () => {
    const templatesDir = path.join(__dirname, '../modules/mail/templates');
    const templateFiles = fs.readdirSync(templatesDir).filter((file) => file.endsWith('.html'));

    for (const file of templateFiles) {
      const html = fs.readFileSync(path.join(templatesDir, file), 'utf8');
      expect(html).not.toMatch(/UNAHUR|MediUNAHUR/i);
    }
  });
});
