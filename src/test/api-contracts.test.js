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

  it('normaliza la solicitud de receta al contrato clínico del afiliado', () => {
    const payload = affiliatesService._private.normalizeRecetaPayload({
      motivo: 'Renovacion de tratamiento',
      descripcion: 'Dolor persistente informado al medico',
      medicamento: 'Ibuprofeno',
      observaciones: 'Turno de control solicitado',
    });

    expect(payload).toMatchObject({
      motivoSolicitud: 'Renovacion de tratamiento',
      descripcionSintomas: 'Dolor persistente informado al medico',
      medicamentoSolicitado: 'Ibuprofeno',
      observaciones: 'Turno de control solicitado',
    });
  });

  it('serializa fechas de trámites de afiliados en DD/MM/AAAA', () => {
    const reintegro = affiliatesService._private.serializeReintegro({
      id: 1,
      request_number: 'REI-1',
      affiliate_id: 2,
      request_date: '2026-06-05',
      updated_at: '2026-06-07T12:00:00.000Z',
      created_at: '2026-06-05T12:00:00.000Z',
      status: 'Pendiente',
    });

    const receta = affiliatesService._private.serializeReceta({
      id: 2,
      request_number: 'REC-1',
      affiliate_id: 2,
      request_date: '2026-06-06',
      fecha_emision: '2026-06-08',
      updated_at: '2026-06-09T12:00:00.000Z',
      created_at: '2026-06-06T12:00:00.000Z',
      status: 'Aprobada',
    });

    const autorizacion = affiliatesService._private.serializeAutorizacion({
      id: 3,
      request_number: 'AUT-1',
      affiliate_id: 2,
      request_date: '2026-06-10',
      fecha_prevista: '2026-06-15',
      updated_at: '2026-06-11T12:00:00.000Z',
      created_at: '2026-06-10T12:00:00.000Z',
      status: 'En análisis',
    });

    expect(reintegro.fechaPrestacion).toBe('05/06/2026');
    expect(reintegro.fechaEstado).toBe('07/06/2026');
    expect(receta.fecha).toBe('06/06/2026');
    expect(receta.fechaEmision).toBe('08/06/2026');
    expect(receta.fechaEstado).toBe('09/06/2026');
    expect(autorizacion.fechaPrevista).toBe('15/06/2026');
    expect(autorizacion.fechaEstado).toBe('11/06/2026');
  });

  it('serializa recetas con estados y datos de solicitud claros para el afiliado', () => {
    const receta = affiliatesService._private.serializeReceta({
      id: 2,
      request_number: 'REC-2',
      affiliate_id: 2,
      request_date: '2026-06-06',
      updated_at: '2026-06-09T12:00:00.000Z',
      created_at: '2026-06-06T12:00:00.000Z',
      status: 'Observada',
      status_reason: 'Adjuntar informe del medico tratante',
      description: [
        'Motivo de la solicitud:\nRenovacion de tratamiento',
        'Descripción de síntomas o situación médica:\nDolor persistente',
        'Medicamento solicitado como referencia:\nIbuprofeno',
        'Observaciones adicionales:\nSin observaciones',
      ].join('\n\n'),
    });

    expect(receta).toMatchObject({
      motivoSolicitud: 'Renovacion de tratamiento',
      descripcionSintomas: 'Dolor persistente',
      medicamentoSolicitado: 'Ibuprofeno',
      observaciones: '',
      estado: 'Información adicional requerida',
      mensajeObservacion: 'Adjuntar informe del medico tratante',
      recetaEmitida: false,
    });
  });

  it('expone rutas de documentos adjuntos en el contrato del afiliado', async () => {
    const payload = await affiliatesService._private.serializeAffiliate({
      id: 7,
      user_id: 4,
      document_number: '12345678',
      document_type: 'DNI',
      first_name: 'Ana',
      last_name: 'Perez',
      birth_date: '1990-01-01',
      address: 'Calle 1',
      city: 'Hurlingham',
      province: 'Buenos Aires',
      phone: '1122334455',
      email: 'ana@example.com',
      credencial_number: '100-1',
      plan_id: 1,
      plan_type: 'Plan Oro',
      holder_affiliate_id: null,
      relationship: 'Titular',
      status: true,
      activation_scheduled_at: null,
      deactivation_scheduled_at: null,
      created_at: '2026-06-05T00:00:00.000Z',
      dni_document_path: '/uploads/dni-ana.jpg',
      payslip_document_path: '/uploads/recibo-ana.pdf',
    }, { 7: [] });

    expect(payload).toMatchObject({
      dni_document_path: '/uploads/dni-ana.jpg',
      payslip_document_path: '/uploads/recibo-ana.pdf',
    });
  });

  it('mantiene el formato canónico de credenciales de afiliados', () => {
    expect(affiliatesService._private.formatCredentialNumber(7, 1)).toBe('0000007-01');
    expect(affiliatesService._private.formatCredentialNumber('42', 3)).toBe('0000042-03');
    expect(affiliatesService._private.getCredentialParts('0000042-03')).toEqual({
      base: '0000042',
      suffix: 3,
    });
    expect(affiliatesService._private.getCredentialParts('credencial-pendiente')).toBeNull();
    expect(affiliatesService._private.getCredentialParts('0000042-AA')).toBeNull();
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

  it('serializa adjuntos de solicitudes con ruta pública de descarga', () => {
    const payload = prestadoresService._private.serializeRequest({
      id: 10,
      request_number: 'AUT-123',
      affiliate_id: 22,
      affiliate_name: 'Ana Perez',
      type: 'Autorizacion',
      status: 'Pendiente',
      status_reason: null,
      request_date: '2026-06-05',
      description: 'Orden médica adjunta',
      attachment_name: 'orden.pdf',
      attachment_type: 'application/pdf',
      attachment_size: 2048,
      attachment_path: 'orden-123.pdf',
    });

    expect(payload.fecha).toBe('05/06/2026');
    expect(payload.adjunto).toEqual({
      nombre: 'orden.pdf',
      tipo: 'application/pdf',
      tamanio: 2048,
      ruta: '/uploads/orden-123.pdf',
    });
  });
});
