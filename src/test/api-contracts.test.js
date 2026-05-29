const adminProvidersService = require('../modules/prestadores/services/admin.providers.service');
const agendasService = require('../modules/agendas/services/agendas.service');
const affiliatesService = require('../modules/affiliates/services/affiliates.service');
const prestadoresService = require('../modules/prestadores/services/prestadores.service');

describe('API contracts normalization', () => {
  it('normaliza aliases de prestadores al contrato canónico', () => {
    const payload = adminProvidersService._private.normalizeProviderPayload({
      cuit: '20-12345678-9',
      nombre: 'Ana',
      apellido: 'Perez',
      email: 'ana@example.com',
      telefono: '1122334455',
      tipo_prestador: 'profesional',
      especialidades: [1],
      lugares_atencion: [{ calle: 'Calle 1', localidad: 'Hurlingham', provincia: 'Buenos Aires', cp: '1686' }],
    });

    expect(payload).toMatchObject({
      cuitCuil: '20-12345678-9',
      nombreCompleto: 'Ana Perez',
      tipoPrestador: 'profesional',
      mails: ['ana@example.com'],
      telefonos: ['1122334455'],
      especialidades: [1],
    });
    expect(payload.lugaresAtencion).toHaveLength(1);
  });

  it('normaliza aliases de agendas al contrato canónico', () => {
    const payload = agendasService._private.normalizeAgendaPayload({
      cuit: '20123456789',
      especialidadId: 2,
      lugarId: 3,
      duracion: 20,
      fecha_inicio: '2026-01-01',
      active: true,
      blocks: [{ dias: ['Lunes'], desde: '09:00', hasta: '13:00' }],
    });

    expect(payload).toMatchObject({
      cuitCuil: '20123456789',
      idEspecialidad: 2,
      idLugar: 3,
      duracionTurno: 20,
      fechaInicio: '2026-01-01',
      estaActivo: true,
    });
    expect(payload.bloques).toHaveLength(1);
  });

  it('normaliza aliases de reintegros al contrato canónico', () => {
    const payload = affiliatesService._private.normalizeReintegroPayload({
      requestDate: '2026-02-01',
      doctor: 'Dra. Gomez',
      specialty: 'Clinica',
      place: 'Consultorio',
      invoiceCuit: '20123456789',
      invoiceAmount: 1000,
      paymentMethod: 'Transferencia',
      description: 'Control',
    });

    expect(payload).toMatchObject({
      fechaPrestacion: '2026-02-01',
      medico: 'Dra. Gomez',
      especialidad: 'Clinica',
      lugarAtencion: 'Consultorio',
      facturaCuit: '20123456789',
      facturaValor: 1000,
      formaPago: 'Transferencia',
      observaciones: 'Control',
    });
  });

  it('normaliza aliases de estado de solicitudes', () => {
    const payload = prestadoresService._private.normalizeSolicitudStatusPayload({
      status: 'Aprobada',
      reason: 'Documentación correcta',
    });

    expect(payload).toEqual({
      estado: 'Aprobada',
      motivo: 'Documentación correcta',
    });
  });
});
