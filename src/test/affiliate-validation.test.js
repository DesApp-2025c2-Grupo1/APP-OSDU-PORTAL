const { affiliateSchema, normalizeAffiliatePayload } = require('../modules/affiliates/utils/validation');

describe('Affiliate payload contract', () => {
  it('valida el payload canónico en español usado por los frontends', () => {
    const { error, value } = affiliateSchema.validate({
      nroDocumento: '12345678',
      tipoDocumento: 'DNI',
      fechaNacimiento: '1990-01-01',
      nombre: 'Ana',
      apellido: 'Perez',
      idPlan: 1,
      email: 'ana@example.com',
      telefono: '1122334455',
      grupoFamiliar: [{
        nombreCompleto: 'Luis Perez',
        parentesco: 'Hijo',
        nroDocumento: '23456789',
        tipoDocumento: 'DNI',
        fechaNacimiento: '2015-01-01',
        nombre: 'Luis',
        apellido: 'Perez',
        email: 'luis@example.com',
        telefono: '1122334455',
        situaciones: [{ id: 3, fechaFin: null }],
      }],
      situaciones: [{ id: 2, fechaFin: null }],
    });

    expect(error).toBeUndefined();
    expect(value.nroDocumento).toBe('12345678');
    expect(value.fechaNacimiento).toBe('1990-01-01');
    expect(value.grupoFamiliar[0].nroDocumento).toBe('23456789');
    expect(value.grupoFamiliar[0].fechaNacimiento).toBe('2015-01-01');
  });

  it('normaliza el payload en inglés usado por el frontend admin', () => {
    const payload = normalizeAffiliatePayload({
      document_number: '12345678',
      document_type: 'DNI',
      birth_date: '1990-01-01',
      first_name: 'Ana',
      last_name: 'Perez',
      plan_id: '1',
      email: 'ana@example.com',
      phone: '1122334455',
      family_group: [{
        full_name: 'Luis Perez',
        relationship: 'Hijo',
        document_number: '23456789',
        document_type: 'DNI',
        birth_date: '2015-01-01',
        first_name: 'Luis',
        last_name: 'Perez',
        email: 'luis@example.com',
        phone: '1122334455',
        situations: [{ id: 3, fecha_fin: null }],
      }],
      situations: [{ id: 2, fecha_fin: null }],
    });

    const { error, value } = affiliateSchema.validate(payload);

    expect(error).toBeUndefined();
    expect(value).toMatchObject({
      fechaNacimiento: '1990-01-01',
      nroDocumento: '12345678',
      tipoDocumento: 'DNI',
      nombre: 'Ana',
      apellido: 'Perez',
      idPlan: 1,
      grupoFamiliar: [{
        nroDocumento: '23456789',
        parentesco: 'Hijo',
        fechaNacimiento: '2015-01-01',
        nombre: 'Luis',
        apellido: 'Perez',
      }],
      situaciones: [{ id: 2, fechaFin: null }],
    });
  });
});
