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
        nombre: 'Luis',
        apellido: 'Perez',
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

  it('normaliza un nombre completo legacy de dos palabras sin duplicar apellido', () => {
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
        full_name: 'Luis Gomez',
        relationship: 'Hijo',
        document_number: '23456789',
        document_type: 'DNI',
        birth_date: '2015-01-01',
      }],
    });

    const { error, value } = affiliateSchema.validate(payload);

    expect(error).toBeUndefined();
    expect(value.grupoFamiliar[0]).toMatchObject({
      nombre: 'Luis',
      apellido: 'Gomez',
      nombreCompleto: 'Luis Gomez',
    });
  });

  it('rechaza familiares sin apellido para no guardar nombre duplicado', () => {
    const payload = normalizeAffiliatePayload({
      nroDocumento: '12345678',
      tipoDocumento: 'DNI',
      fechaNacimiento: '1990-01-01',
      nombre: 'Ana',
      apellido: 'Perez',
      idPlan: 1,
      email: 'ana@example.com',
      telefono: '1122334455',
      grupoFamiliar: [{
        nombreCompleto: 'Luis',
        parentesco: 'Hijo',
        nroDocumento: '23456789',
        tipoDocumento: 'DNI',
        fechaNacimiento: '2015-01-01',
      }],
    });

    const { error, value } = affiliateSchema.validate(payload, { abortEarly: false });

    expect(value.grupoFamiliar[0]).toMatchObject({
      nombre: 'Luis',
      apellido: '',
    });
    expect(error).toBeDefined();
    expect(error.details.some((detail) => detail.path.join('.') === 'grupoFamiliar.0.apellido')).toBe(true);
  });

  it('rechaza documento y fecha de nacimiento inválidos con el mismo contrato que los frontends', () => {
    const { error } = affiliateSchema.validate({
      nroDocumento: '123',
      tipoDocumento: 'DNI',
      fechaNacimiento: '2999-01-01',
      nombre: 'Ana',
      apellido: 'Perez',
      idPlan: 1,
      email: 'ana@example.com',
      telefono: '1122334455',
    }, { abortEarly: false });

    expect(error).toBeDefined();
    expect(error.details.map((detail) => detail.message)).toEqual(
      expect.arrayContaining([
        'El DNI debe tener 7 u 8 dígitos numéricos.',
        'La fecha no puede ser futura.',
      ])
    );
  });

  it('valida pasaporte con el formato aceptado por backend y frontends', () => {
    const { error } = affiliateSchema.validate({
      nroDocumento: 'AB123456',
      tipoDocumento: 'Pasaporte',
      fechaNacimiento: '1990-01-01',
      nombre: 'Ana',
      apellido: 'Perez',
      idPlan: 1,
      email: 'ana@example.com',
      telefono: '1122334455',
    });

    expect(error).toBeUndefined();
  });
});
