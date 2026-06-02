const affiliateRepository = require('../repository/affiliate.repository');
const authService = require('../../auth/services/auth.service');
const affiliateModel = require('../model/affiliate.model');
const { notify } = require('../../mail/notification.service');
const { affiliateSchema, normalizeAffiliatePayload } = require('../utils/validation');
const { HttpError } = require('../../../utils/api-error');
const db = require('../../../database/db');
const { findAgendaForAppointment, hasOverlappingAppointment } = require('../../prestadores/repository/prestadores.repository');

const toMinutes = (time) => {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
};

const fromMinutes = (mins) => {
  const h = Math.floor(mins / 60).toString().padStart(2, '0');
  const m = (mins % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
};

const assertISODate = (fecha) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw new Error('La fecha debe tener formato YYYY-MM-DD');
  return fecha;
};

const assertTime = (time, field) => {
  if (!time || !/^\d{2}:\d{2}$/.test(time)) throw new Error(`${field} debe tener formato HH:mm`);
};

const DIA_MAP = {
  'Domingo':0,'domingo':0,'Sunday':0,
  'Lunes':1,'lunes':1,'Monday':1,
  'Martes':2,'martes':2,'Tuesday':2,
  'Miercoles':3,'miercoles':3,'Miércoles':3,'miércoles':3,'Wednesday':3,
  'Jueves':4,'jueves':4,'Thursday':4,
  'Viernes':5,'viernes':5,'Friday':5,
  'Sabado':6,'sabado':6,'Sábado':6,'sábado':6,'Saturday':6,
};
const normalizeDia = (d) => typeof d === 'number' ? d : (DIA_MAP[d] ?? -1);

const createAffiliate = async (req, res) => {
  if (req.body.grupoFamiliar && typeof req.body.grupoFamiliar === 'string') {
    try {
      req.body.grupoFamiliar = JSON.parse(req.body.grupoFamiliar);
    } catch (e) {
      // Joi manejará el error de validación
    }
  }
  if (req.body.family_group && typeof req.body.family_group === 'string') {
    try {
      req.body.family_group = JSON.parse(req.body.family_group);
    } catch (e) {}
  }
  if (req.body.situaciones && typeof req.body.situaciones === 'string') {
    try {
      req.body.situaciones = JSON.parse(req.body.situaciones);
    } catch (e) {
      // Ignore if not parseable, Joi will handle validation error
    }
  }
  if (req.body.situations && typeof req.body.situations === 'string') {
    try {
      req.body.situations = JSON.parse(req.body.situations);
    } catch (e) {}
  }

  const normalizedBody = normalizeAffiliatePayload(req.body);
  const { error, value } = affiliateSchema.validate(normalizedBody);
  if (error) {
    return res.status(400).json({ message: 'Datos inválidos', details: error.details });
  }

  const affiliate = new affiliateModel(value);
  const scheduledActivation = req.body.altaProgramadaEn
    || req.body.scheduledActivationAt
    || req.body.fechaAltaProgramada
    || req.body.fechaAlta
    || null;
  if (scheduledActivation) {
    const activationDate = new Date(scheduledActivation);
    if (Number.isNaN(activationDate.getTime())) {
      return res.status(400).json({ message: 'Fecha de alta programada invalida' });
    }
    if (activationDate.getTime() <= Date.now()) {
      return res.status(400).json({ message: 'La fecha de alta programada debe ser futura' });
    }
    affiliate.alta_programada_en = activationDate;
    affiliate.activo = false;
  } else if (req.user && req.user.role_name === 'ADMIN') {
    affiliate.activo = true;
  }

  if (req.files) {
    if (req.files.dni_document && req.files.dni_document[0]) {
      affiliate.ruta_documento_dni = `/uploads/${req.files.dni_document[0].filename}`;
    }
    if (req.files.payslip_document && req.files.payslip_document[0]) {
      affiliate.ruta_recibo_sueldo = `/uploads/${req.files.payslip_document[0].filename}`;
    }
  }

  const trx = await db.transaction();

  try {
    if (await existsAffiliate(affiliate.nro_documento, affiliate.tipo_documento, trx)) {
      await trx.rollback();
      return res.status(400).json({ message: 'El afiliado ya existe' });
    }

    const credencialNumber = await generateCredencialNumber(trx);

    // registerInternal ya NO llama a notify — lo hacemos aquí después del commit
    const user = await authService.registerInternal(affiliate.email, trx);

    affiliate.usuario_id = user.id;
    affiliate.nro_credencial = credencialNumber;

    const [newAffiliate] = await affiliateRepository.createAffiliate(affiliate, trx);
    await createAffiliateSituations(newAffiliate.id, value.situaciones || [], trx);
    await createFamilyGroupMembers(newAffiliate, value.grupoFamiliar || [], trx);

    await trx.commit();

    // Notificación DESPUÉS del commit, sin bloquear la respuesta al formulario.
    void notify('WELCOME', affiliate.email, {
      name: value.nombre,
    });

    return res.status(200).json({
      id: newAffiliate.id,
      message: scheduledActivation ? 'Afiliado programado exitosamente' : 'Afiliado creado exitosamente',
      scheduledActivationAt: scheduledActivation ? new Date(scheduledActivation).toISOString() : null,
    });

  } catch (error) {
    await trx.rollback();
    console.error('[AFFILIATES] Error al crear afiliado:', error.message);
    if (error.message === 'El usuario ya existe') {
      return res.status(400).json({ message: 'Ya existe un usuario con ese email' });
    }
    return res.status(500).json({ message: 'Error interno al procesar la solicitud' });
  }
};

const getAffiliatesList = async (req, res) => {
  try {
    await affiliateRepository.activateDueScheduledAffiliates();
    const { status } = req.query;

    if (status !== undefined) {
      const parsedStatus = status === 'true' || status === true;
      const affiliates = await affiliateRepository.getAffiliatesByStatus(parsedStatus);
      return res.status(200).json(await serializeAffiliates(affiliates));
    }

    const affiliates = await affiliateRepository.getAllAffiliates();
    return res.status(200).json(await serializeAffiliates(affiliates));
  } catch (error) {
    console.error('[AFFILIATES] Error en getAffiliatesList:', error.message);
    return res.status(500).json({ message: 'Error interno al obtener los afiliados' });
  }
};

const getAffiliateById = async (req, res) => {
  try {
    const { id } = req.params;
    const affiliate = await affiliateRepository.getAffiliateById(id);

    if (!affiliate) {
      return res.status(404).json({ message: 'El afiliado no existe' });
    }

    return res.status(200).json(await serializeAffiliate(affiliate));
  } catch (error) {
    console.error('[AFFILIATES] Error en getAffiliateById:', error.message);
    return res.status(500).json({ message: 'Error interno al obtener el afiliado' });
  }
};

const getAffiliateByUserId = async (id) => {
  return affiliateRepository.getAffiliateByUserId(id) || null;
};

const activateAffiliate = async (req, res) => {
  try {
    const { id } = req.params;

    const affiliate = await affiliateRepository.getAffiliateById(id);
    if (!affiliate) {
      return res.status(404).json({ message: 'El afiliado no existe' });
    }

    await affiliateRepository.updateAffiliateById(id, { status: true, activation_scheduled_at: null });

    await notify('ACCOUNT_ON', affiliate.email, {
      name: `${affiliate.first_name} ${affiliate.last_name}`.trim()
    });

    return res.status(200).json({ message: 'Afiliado activado exitosamente' });
  } catch (error) {
    console.error('[AFFILIATES] Error en activateAffiliate:', error.message);
    return res.status(500).json({ message: 'Error interno al activar el afiliado' });
  }
};

const deactivateAffiliate = async (req, res) => {
  try {
    const { id } = req.params;

    const affiliate = await affiliateRepository.getAffiliateById(id);
    if (!affiliate) {
      return res.status(404).json({ message: 'El afiliado no existe' });
    }

    await affiliateRepository.deactivateAffiliate(id);

    await notify('ACCOUNT_OFF', affiliate.email, {
      name: `${affiliate.first_name} ${affiliate.last_name}`.trim()
    });

    return res.status(200).json({ message: 'Afiliado desactivado exitosamente' });
  } catch (error) {
    console.error('[AFFILIATES] Error en deactivateAffiliate:', error.message);
    return res.status(500).json({ message: 'Error interno al desactivar el afiliado' });
  }
};

/* métodos auxiliares */

const existsAffiliate = async (document_number, document_type, trx) => {
  return affiliateRepository.existsAffiliate(document_number, document_type, trx);
};

const splitFullName = (fullName = '') => {
  const parts = String(fullName).trim().replace(/\s+/g, ' ').split(' ').filter(Boolean);
  return {
    firstName: parts[0] || '',
    lastName: parts.slice(1).join(' ') || parts[0] || ''
  };
};

const createAffiliateSituations = async (affiliateId, situations, trx) => {
  for (const situation of situations) {
    const typeRow = situation.id
      ? await trx('prestador_situation_types').where({ id: situation.id }).first()
      : null;

    await trx('prestador_affiliate_situations').insert({
      afiliado_id: affiliateId,
      tipo_situacion_id: typeRow?.id || null,
      tipo: typeRow?.nombre || situation.nombre || 'Situacion terapeutica',
      fecha_inicio: situation.fechaInicio || new Date().toISOString().split('T')[0],
      fecha_fin: situation.fechaFin || null,
      activa: !situation.fechaFin
    });
  }
};

const createFamilyGroupMembers = async (holder, familyGroup, trx) => {
  let index = 2;

  for (const member of familyGroup) {
    const documentType = member.tipoDocumento || 'DNI';
    const existing = await affiliateRepository.existsAffiliate(member.nroDocumento, documentType, trx);
    if (existing) throw new HttpError(409, `Ya existe un afiliado familiar con documento ${member.nroDocumento}`);

    const nameParts = splitFullName(member.nombreCompleto);
    const firstName = member.nombre || nameParts.firstName;
    const lastName = member.apellido || nameParts.lastName;
    const email = member.email || `${member.nroDocumento}@familiares.local`;
    const user = await authService.registerInternal(email, trx);
    const baseCredential = String(holder.credencial_number || '').split('-')[0] || String(holder.id).padStart(7, '0');

    const [createdRaw] = await trx('afiliados')
      .insert({
        usuario_id: user.id,
        nro_credencial: `${baseCredential}-${String(index).padStart(2, '0')}`,
        nro_documento: member.nroDocumento,
        tipo_documento: documentType,
        fecha_nacimiento: member.fechaNacimiento || holder.birth_date,
        nombre: firstName,
        apellido: lastName,
        telefono: member.telefono || holder.phone,
        email,
        direccion: member.direccion || holder.address || '',
        localidad: member.localidad || holder.city || '',
        provincia: member.provincia || holder.province || '',
        codigo_postal: member.codigoPostal || holder.postal_code || '',
        pais: holder.country || 'Argentina',
        plan_id: holder.plan_id,
        afiliado_titular_id: holder.id,
        parentesco: member.parentesco || 'Familiar a cargo',
        activo: holder.status
      })
      .returning('*');
    const created = await affiliateRepository.getAffiliateById(createdRaw.id || createdRaw, trx);

    await createAffiliateSituations(created.id, member.situaciones || [], trx);
    index += 1;
  }
};

const generateCredencialNumber = async (trx) => {
  const result = await affiliateRepository.getLastCredencialNumber(trx);
  const max = result ? result.max : null;

  if (!max) return '0000001-01';

  const [numberPart] = max.split('-');
  const nextNumber = parseInt(numberPart, 10) + 1;
  return `${nextNumber.toString().padStart(7, '0')}-01`;
};

const toDateStr = (val) => {
  if (!val) return null;
  if (val instanceof Date) return val.toISOString().split('T')[0];
  return String(val).split('T')[0];
};

const parseJsonArray = (value) => {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const serializeSituation = (row) => ({
  idSituacionAfiliado: row.id,
  fechaInicio: toDateStr(row.fecha_inicio),
  fechaFin: row.fecha_fin ? toDateStr(row.fecha_fin) : null,
  estado: row.activa ? 'Activa' : 'Finalizada',
  situacion: row.tipo,
  situacionTerapeutica: {
    idSituacion: row.tipo_situacion_id || row.id,
    nombre: row.tipo
  }
});

const getSituationsForAffiliateIds = async (affiliateIds) => {
  if (!affiliateIds.length) return {};

  let rows = [];
  try {
    rows = await db('prestador_affiliate_situations')
      .whereIn('afiliado_id', affiliateIds)
      .orderBy('fecha_inicio', 'desc')
      .orderBy('id', 'desc');
  } catch (error) {
    const message = String(error.message || '').toLowerCase();
    const optionalSituationTableMissing = ['42p01', '42703', 'SQLITE_ERROR'].includes(error.code)
      || message.includes('prestador_affiliate_situations')
      || message.includes('afiliado_id');
    if (process.env.NODE_ENV === 'test' && error.code === 'ECONNREFUSED') return {};
    if (!optionalSituationTableMissing) throw error;
    return {};
  }

  return rows.reduce((acc, row) => {
    acc[row.afiliado_id] = acc[row.afiliado_id] || [];
    acc[row.afiliado_id].push(serializeSituation(row));
    return acc;
  }, {});
};

const serializeAffiliate = async (affiliate, situationsByAffiliate = null) => {
  const situacionesMap = situationsByAffiliate || await getSituationsForAffiliateIds([affiliate.id]);
  const situaciones = situacionesMap[affiliate.id] || [];
  const parentesco = affiliate.relationship || (affiliate.holder_affiliate_id ? 'Familiar a cargo' : 'Titular');

  return {
    id: affiliate.id,
    idUsuario: affiliate.user_id,
    dni: affiliate.document_number,
    nroDocumento: affiliate.document_number,
    tipoDocumento: affiliate.document_type,
    nombre: affiliate.first_name,
    apellido: affiliate.last_name,
    fecha_nacimiento: toDateStr(affiliate.birth_date),
    fechaNacimiento: toDateStr(affiliate.birth_date),
    direccion: affiliate.address || '',
    localidad: affiliate.city || '',
    provincia: affiliate.province || '',
    telefono: affiliate.phone || '',
    telefonos: affiliate.phone ? [{ idTelefono: 0, telefono: affiliate.phone }] : [],
    email: affiliate.email || '',
    emailPrincipal: affiliate.email || '',
    emails: affiliate.email ? [{ idEmail: 0, email: affiliate.email }] : [],
    credencial: affiliate.credencial_number,
    credencial_number: affiliate.credencial_number,
    plan: {
      idPlan: affiliate.plan_id,
      id: affiliate.plan_id,
      nombre: affiliate.plan_type || affiliate.plan_code || ''
    },
    grupoFamiliar: affiliate.holder_affiliate_id || affiliate.id,
    idAfiliadoTitular: affiliate.holder_affiliate_id || null,
    parentesco,
    activo: !!affiliate.status,
    estado: affiliate.status ? 'Activo' : (affiliate.activation_scheduled_at ? 'Alta programada' : 'Pendiente'),
    fechaAlta: affiliate.created_at,
    fecha_alta: affiliate.activation_scheduled_at || affiliate.created_at,
    altaProgramada: affiliate.activation_scheduled_at || null,
    bajaProgramada: affiliate.deactivation_scheduled_at || null,
    situaciones
  };
};

const serializeAffiliates = async (affiliates) => {
  const situationsByAffiliate = await getSituationsForAffiliateIds(affiliates.map((a) => a.id));
  return Promise.all(affiliates.map((affiliate) => serializeAffiliate(affiliate, situationsByAffiliate)));
};

const normalizeAffiliatePatch = (body) => {
  const email = Array.isArray(body.emails) ? body.emails[0]?.email : body.email;
  const phone = Array.isArray(body.telefonos) ? body.telefonos[0]?.telefono : body.telefono;
  const plan = typeof body.plan === 'object' ? body.plan?.idPlan || body.plan?.id : body.plan;

  return {
    ...(body.dni || body.nroDocumento || body.document_number ? { document_number: body.dni || body.nroDocumento || body.document_number } : {}),
    ...(body.tipoDocumento || body.document_type ? { document_type: body.tipoDocumento || body.document_type } : {}),
    ...(body.nombre || body.first_name ? { first_name: body.nombre || body.first_name } : {}),
    ...(body.apellido || body.last_name ? { last_name: body.apellido || body.last_name } : {}),
    ...(body.fecha_nacimiento || body.fechaNacimiento || body.birth_date ? { birth_date: body.fecha_nacimiento || body.fechaNacimiento || body.birth_date } : {}),
    ...(body.direccion || body.address ? { address: body.direccion || body.address } : {}),
    ...(body.localidad || body.city ? { city: body.localidad || body.city } : {}),
    ...(body.provincia || body.province ? { province: body.provincia || body.province } : {}),
    ...(body.postal_code || body.codigoPostal ? { postal_code: body.postal_code || body.codigoPostal } : {}),
    ...(email ? { email } : {}),
    ...(phone ? { phone } : {}),
    ...(plan ? { plan_id: Number(plan) } : {}),
    ...(body.parentesco || body.relationship ? { relationship: body.parentesco || body.relationship } : {})
  };
};

const updateAffiliate = async (req, res) => {
  const affiliate = await affiliateRepository.getAffiliateByIdentifier(req.params.id);
  if (!affiliate) return res.status(404).json({ message: 'El afiliado no existe' });

  const patch = normalizeAffiliatePatch(req.body);
  if (Object.keys(patch).length === 0) return res.status(400).json({ message: 'No hay datos para actualizar' });

  await affiliateRepository.updateAffiliateById(affiliate.id, patch);
  const updated = await affiliateRepository.getAffiliateByIdentifier(affiliate.id);
  return res.status(200).json(await serializeAffiliate(updated));
};

const removeAffiliate = async (req, res) => {
  const affiliate = await affiliateRepository.getAffiliateByIdentifier(req.params.id);
  if (!affiliate) return res.status(404).json({ message: 'El afiliado no existe' });

  await affiliateRepository.deactivateAffiliate(affiliate.id);
  return res.status(200).json({ message: 'Afiliado dado de baja correctamente' });
};

const getFamilyGroup = async (req, res) => {
  const affiliate = await affiliateRepository.getAffiliateByIdentifier(req.params.identifier);
  if (!affiliate) return res.status(404).json({ message: 'El afiliado no existe' });

  const holderId = affiliate.holder_affiliate_id || affiliate.id;
  const family = await affiliateRepository.getFamilyByHolderId(holderId);
  return res.status(200).json({ affiliates: await serializeAffiliates(family) });
};

const generateFamilyCredentialNumber = async (holderId, trx) => {
  const family = await affiliateRepository.getFamilyByHolderId(holderId, trx);
  const titular = family.find((member) => member.id === holderId) || family[0];
  const base = String(titular?.credencial_number || '').split('-')[0] || String(holderId).padStart(7, '0');
  const next = family.length + 1;
  return `${base}-${String(next).padStart(2, '0')}`;
};

const createFamilyMember = async (req, res) => {
  const holder = await affiliateRepository.getAffiliateByIdentifier(req.params.identifier);
  if (!holder) return res.status(404).json({ message: 'El titular no existe' });

  const holderId = holder.holder_affiliate_id || holder.id;
  const payload = req.body;
  const email = Array.isArray(payload.emails) ? payload.emails[0]?.email : payload.email;
  const phone = Array.isArray(payload.telefonos) ? payload.telefonos[0]?.telefono : payload.telefono;

  if (!payload.dni && !payload.nroDocumento && !payload.document_number) {
    return res.status(400).json({ message: 'El DNI del familiar es requerido' });
  }
  if (!email) return res.status(400).json({ message: 'El email del familiar es requerido' });

  const trx = await db.transaction();
  try {
    const documentNumber = payload.dni || payload.nroDocumento || payload.document_number;
    const documentType = payload.tipoDocumento || payload.document_type || 'DNI';
    const existing = await affiliateRepository.existsAffiliate(documentNumber, documentType, trx);
    if (existing) {
      await trx.rollback();
      return res.status(409).json({ message: 'El afiliado ya existe' });
    }

    const user = await authService.registerInternal(email, trx);
    const [insertedRaw] = await trx('afiliados')
      .insert({
        usuario_id: user.id,
        nro_credencial: await generateFamilyCredentialNumber(holderId, trx),
        nro_documento: documentNumber,
        tipo_documento: documentType,
        fecha_nacimiento: payload.fecha_nacimiento || payload.fechaNacimiento || payload.birth_date,
        nombre: payload.nombre || payload.first_name,
        apellido: payload.apellido || payload.last_name,
        telefono: phone || holder.phone || '',
        email,
        direccion: payload.direccion || payload.address || holder.address || '',
        localidad: payload.localidad || payload.city || holder.city || '',
        provincia: payload.provincia || payload.province || holder.province || '',
        codigo_postal: payload.postal_code || holder.postal_code || '',
        pais: payload.country || holder.country || 'Argentina',
        plan_id: payload.plan || payload.planId || holder.plan_id,
        afiliado_titular_id: holderId,
        parentesco: payload.parentesco || payload.relationship || 'Familiar a cargo',
        activo: holder.status
      })
      .returning('*');
    const inserted = await affiliateRepository.getAffiliateById(insertedRaw.id || insertedRaw, trx);

    const situaciones = Array.isArray(payload.situaciones) ? payload.situaciones : [];
    for (const situacion of situaciones) {
      const typeRow = situacion.id
        ? await trx('prestador_situation_types').where({ id: situacion.id }).first()
        : null;
      await trx('prestador_affiliate_situations').insert({
        afiliado_id: inserted.id,
        tipo_situacion_id: typeRow?.id || null,
        tipo: typeRow?.nombre || situacion.nombre || 'Situacion terapeutica',
        fecha_inicio: situacion.fecha_inicio || new Date().toISOString().split('T')[0],
        fecha_fin: situacion.fecha_fin || null,
        activa: !situacion.fecha_fin
      });
    }

    await trx.commit();
    const created = await affiliateRepository.getAffiliateByIdentifier(inserted.id);
    return res.status(201).json(await serializeAffiliate(created));
  } catch (error) {
    await trx.rollback();
    return sendError(res, error, 'Error al crear familiar');
  }
};

const deleteFamilyMember = async (req, res) => {
  const affiliate = await affiliateRepository.getAffiliateByIdentifier(req.params.identifier);
  if (!affiliate) return res.status(404).json({ message: 'El afiliado no existe' });

  await affiliateRepository.deactivateAffiliate(affiliate.id);
  return res.status(200).json({ message: 'Afiliado dado de baja correctamente' });
};

const scheduleDeleteAffiliate = async (req, res) => {
  const affiliate = await affiliateRepository.getAffiliateByIdentifier(req.params.id);
  if (!affiliate) return res.status(404).json({ message: 'El afiliado no existe' });

  const scheduledDate = req.body.scheduledDate || req.body.fecha || req.body.scheduledAt;
  const date = new Date(scheduledDate);
  if (!scheduledDate || Number.isNaN(date.getTime())) {
    return res.status(400).json({ message: 'Fecha de baja programada invalida' });
  }

  await affiliateRepository.updateAffiliateById(affiliate.id, { deactivation_scheduled_at: date });
  return res.status(200).json({ message: 'Baja programada correctamente', scheduledDate: date.toISOString() });
};

const getScheduledAffiliates = async (req, res) => {
  await affiliateRepository.activateDueScheduledAffiliates();
  const affiliates = await affiliateRepository.getScheduledDeletions();
  return res.status(200).json({ affiliates: await serializeAffiliates(affiliates) });
};

const serializeAppointment = (row) => ({
  id: row.id,
  fecha: toDateStr(row.appointment_date),
  horaIni: row.start_time,
  horaFin: row.end_time,
  motivo: row.reason,
  nota: row.note || null,
  estado: row.status,
  motivoCancelacion: row.cancellation_reason || null,
  prestador: {
    nombre: row.prestador_first_name
      ? `${row.prestador_first_name} ${row.prestador_last_name}`
      : null,
    especialidad: row.especialidad || null,
  },
  lugar: {
    direccion: row.lugar_calle || null,
    localidad: row.lugar_localidad || null,
  },
});

const resolveTargetAffiliate = async (loggedAffiliate, afiliadoId) => {
  if (!afiliadoId || String(afiliadoId) === String(loggedAffiliate.id)) return loggedAffiliate;
  const holderId = loggedAffiliate.holder_affiliate_id || loggedAffiliate.id;
  const family = await affiliateRepository.getFamilyByHolderId(holderId);
  const target = family.find((m) => String(m.id) === String(afiliadoId));
  if (!target) throw Object.assign(new Error('No tenés permiso para gestionar este afiliado'), { status: 403 });
  return target;
};

const getMyAppointments = async (req, res) => {
  try {
    const affiliate = await affiliateRepository.getAffiliateByUserId(req.user.id);
    if (!affiliate) return res.status(404).json({ message: 'Afiliado no encontrado' });

    const { status, afiliadoId } = req.query;
    const target = await resolveTargetAffiliate(affiliate, afiliadoId);
    const rows = await affiliateRepository.getAppointmentsByAffiliate(target.id, status || null);
    return res.status(200).json(rows.map(serializeAppointment));
  } catch (error) {
    if (error.status === 403) return res.status(403).json({ message: error.message });
    console.error('[AFFILIATES] Error getMyAppointments:', error.message);
    return res.status(500).json({ message: 'Error al obtener los turnos' });
  }
};

const getAvailableSlots = async (req, res) => {
  try {
    const { agendaId, fecha } = req.query;
    if (!agendaId) return res.status(400).json({ message: 'agendaId es requerido' });
    if (!fecha) return res.status(400).json({ message: 'fecha es requerida' });
    assertISODate(fecha);

    const agenda = await db('agendas').where({ id: agendaId }).first();
    if (!agenda) return res.status(404).json({ message: 'Agenda no encontrada' });
    if (!agenda.esta_activo) return res.status(422).json({ message: 'La agenda no está activa' });

    const dayOfWeek = new Date(`${fecha}T00:00:00-03:00`).getDay();
    const bloques = Array.isArray(agenda.bloques) ? agenda.bloques : JSON.parse(agenda.bloques || '[]');
    const duracion = agenda.duracion_turno || 30;

    const allSlots = [];
    for (const bloque of bloques) {
      const dias = bloque.dias || [];
      if (dias.length > 0 && !dias.map(normalizeDia).includes(dayOfWeek)) continue;
      let start = toMinutes(bloque.desde);
      const end = toMinutes(bloque.hasta);
      while (start + duracion <= end) {
        allSlots.push({ horaIni: fromMinutes(start), horaFin: fromMinutes(start + duracion) });
        start += duracion;
      }
    }

    if (allSlots.length === 0) return res.status(200).json([]);

    const occupied = await affiliateRepository.getAppointmentsByPrestadorAndDate(agenda.prestador_id, fecha);

    const available = allSlots.filter(slot =>
      !occupied.some(a =>
        toMinutes(a.start_time) < toMinutes(slot.horaFin) &&
        toMinutes(a.end_time) > toMinutes(slot.horaIni)
      )
    );

    return res.status(200).json(available);
  } catch (error) {
    console.error('[AFFILIATES] Error getAvailableSlots:', error.message);
    return res.status(500).json({ message: 'Error al obtener slots disponibles' });
  }
};

const bookAppointment = async (req, res) => {
  try {
    const affiliate = await affiliateRepository.getAffiliateByUserId(req.user.id);
    if (!affiliate) return res.status(404).json({ message: 'Afiliado no encontrado' });

    const { agendaId, fecha, horaIni, horaFin, motivo, afiliadoId } = req.body;
    const target = await resolveTargetAffiliate(affiliate, afiliadoId);

    if (!agendaId) return res.status(400).json({ message: 'agendaId es requerido' });
    assertISODate(fecha);
    assertTime(horaIni, 'horaIni');
    assertTime(horaFin, 'horaFin');
    if (toMinutes(horaFin) <= toMinutes(horaIni))
      return res.status(422).json({ message: 'horaFin debe ser posterior a horaIni' });
    if (!motivo || !String(motivo).trim())
      return res.status(400).json({ message: 'El motivo es requerido' });

    const agenda = await db('agendas').where({ id: agendaId, esta_activo: true }).first();
    if (!agenda) return res.status(404).json({ message: 'Agenda no encontrada o inactiva' });

    const agendaValida = await findAgendaForAppointment(agenda.prestador_id, fecha, horaIni, horaFin);
    if (!agendaValida) return res.status(422).json({ message: 'El horario no pertenece a la agenda disponible' });

    const overlap = await hasOverlappingAppointment(agenda.prestador_id, fecha, horaIni, horaFin);
    if (overlap) return res.status(409).json({ message: 'Ese horario ya está ocupado' });

    const appointment = await affiliateRepository.createAffiliateAppointment({
      prestadorId: agenda.prestador_id,
      affiliateId: target.id,
      affiliateName: `${target.first_name} ${target.last_name}`,
      agendaId: agenda.id,
      especialidadId: agenda.especialidad_id,
      lugarId: agenda.lugar_id,
      fecha,
      horaIni,
      horaFin,
      motivo: String(motivo).trim(),
    });

    // Notificación al titular (quien tiene el email de sesión)
    await notify('APPT_CREATE', affiliate.email, {
      name: `${target.first_name} ${target.last_name}`.trim(),
      date: fecha,
      time: `${horaIni} - ${horaFin}`,
      doctor: '',
      motivo: String(motivo).trim(),
    });

    return res.status(201).json({
      id: appointment.id,
      fecha: toDateStr(appointment.appointment_date),
      horaIni: appointment.start_time,
      horaFin: appointment.end_time,
      estado: appointment.status,
      motivo: appointment.reason,
    });
  } catch (error) {
    console.error('[AFFILIATES] Error bookAppointment:', error.message);
    return res.status(500).json({ message: 'Error al reservar el turno' });
  }
};

const cancelAppointment = async (req, res) => {
  try {
    const affiliate = await affiliateRepository.getAffiliateByUserId(req.user.id);
    if (!affiliate) return res.status(404).json({ message: 'Afiliado no encontrado' });

    const { id } = req.params;
    const motivo = String(req.body.motivo || '').trim();
    if (!motivo) return res.status(400).json({ message: 'El motivo es requerido' });

    const appointment = await affiliateRepository.getAppointmentById(id);
    if (!appointment) return res.status(404).json({ message: 'Turno no encontrado' });

    // Verificar que el turno pertenece al afiliado autenticado o a un familiar
    const holderId = affiliate.holder_affiliate_id || affiliate.id;
    const family = await affiliateRepository.getFamilyByHolderId(holderId);
    const familyIds = Array.isArray(family) ? family.map((m) => m.id) : [holderId];
    if (!familyIds.includes(holderId)) familyIds.push(holderId);
    if (!familyIds.includes(appointment.affiliate_id))
      return res.status(403).json({ message: 'No tenés permiso para cancelar este turno' });

    if (appointment.status !== 'reservado')
      return res.status(422).json({ message: 'El turno no puede cancelarse en su estado actual' });

    const today = new Date().toISOString().split('T')[0];
    if (toDateStr(appointment.appointment_date) < today)
      return res.status(422).json({ message: 'No se puede cancelar un turno pasado' });

    const updated = await affiliateRepository.cancelAppointment(id, motivo);

    // Notificación al afiliado
    await notify('APPT_CANCEL', affiliate.email, {
      name: `${affiliate.first_name} ${affiliate.last_name}`.trim(),
      status: 'cancelado',
      date: toDateStr(appointment.appointment_date),
      motivo,
    });

    return res.status(200).json({
      id: updated.id,
      status: updated.status,
      estado: updated.status,
      motivoCancelacion: updated.cancellation_reason,
    });
  } catch (error) {
    console.error('[AFFILIATES] Error cancelAppointment:', error.message);
    return res.status(500).json({ message: 'Error al cancelar el turno' });
  }
};

// ── Reintegros ────────────────────────────────────────────────────────────────

const STATUS_REINTEGRO_MAP = {
  'Pendiente':    'Recibido',
  'En análisis':  'En análisis',
  'Observada':    'Observado',
  'Aprobada':     'Aprobado',
  'Rechazada':    'Rechazado',
};

const serializeReintegro = (r) => ({
  id: r.id,
  nro: r.request_number,
  idIntegrante: String(r.affiliate_id),
  fechaPrestacion: toDateStr(r.request_date),
  medico: r.medico_nombre,
  especialidad: r.especialidad,
  lugarAtencion: r.lugar_atencion,
  factura: {
    cuit: r.factura_cuit,
    valorTotal: r.factura_valor_total ? parseFloat(r.factura_valor_total) : 0,
  },
  formaPago: r.forma_pago,
  cbu: r.cbu || null,
  observaciones: r.description || '',
  estado: STATUS_REINTEGRO_MAP[r.status] || 'Recibido',
  estadoRaw: r.status,
  fechaEstado: toDateStr(r.updated_at || r.created_at),
  mensajeObservacion: r.status === 'Observada' ? (r.status_reason || null) : null,
  motivoEstado: r.status_reason || null,
  // Campos extra disponibles en consultas admin (JOIN con affiliates)
  afiliado: r.affiliate_first_name
    ? `${r.affiliate_first_name} ${r.affiliate_last_name}`.trim()
    : (r.affiliate_name || null),
  credencial: r.credencial_number || null,
});

const serializeReceta = (r) => ({
  id: r.id,
  nro: r.request_number,
  idIntegrante: String(r.affiliate_id),
  medicamento: r.medicamento_nombre,
  presentacion: r.medicamento_presentacion,
  cantidad: r.medicamento_cantidad || 0,
  fecha: toDateStr(r.fecha_emision || r.request_date),
  observaciones: r.description || '',
  estado: STATUS_REINTEGRO_MAP[r.status] || 'Recibido',
  estadoRaw: r.status,
  fechaEstado: toDateStr(r.updated_at || r.created_at),
  mensajeObservacion: r.status === 'Observada' ? (r.status_reason || null) : null,
  motivoEstado: r.status_reason || null,
  respuestaAfiliado: r.affiliate_response || null,
});

const serializeAutorizacion = (r) => ({
  id: r.id,
  nro: r.request_number,
  idIntegrante: String(r.affiliate_id),
  fechaPrevista: toDateStr(r.fecha_prevista || r.request_date),
  subtipo: r.subtipo_autorizacion || null,
  especialidad: r.especialidad,
  medico: r.medico_nombre,
  lugarPrestacion: r.lugar_atencion,
  diasInternacion: r.dias_internacion || 0,
  observaciones: r.description || '',
  estado: STATUS_REINTEGRO_MAP[r.status] || 'Recibido',
  estadoRaw: r.status,
  fechaEstado: toDateStr(r.updated_at || r.created_at),
  mensajeObservacion: r.status === 'Observada' ? (r.status_reason || null) : null,
  motivoEstado: r.status_reason || null,
  respuestaAfiliado: r.affiliate_response || null,
  adjuntoNombre: r.adjunto_nombre || null,
  adjuntoRuta: r.adjunto_ruta ? `/uploads/${r.adjunto_ruta}` : null,
});

/**
 * Resuelve el afiliado sobre el que se opera:
 *  - Si el body incluye `affiliateId` se valida que ese ID pertenezca al grupo familiar del titular.
 *  - Si no, se usa el propio titular.
 */
const resolveAffiliate = async (req) => {
  const holder = await affiliateRepository.getAffiliateByUserId(req.user.id);
  if (!holder) return null;

  const requestedId = req.body.affiliateId ? Number(req.body.affiliateId) : null;
  if (!requestedId || requestedId === holder.id) return holder;

  const member = await affiliateRepository.getFamilyMemberForHolder(requestedId, holder.id);
  return member || null; // null = no pertenece al grupo familiar
};

const normalizeReintegroPayload = (body = {}) => ({
  ...body,
  fechaPrestacion: body.fechaPrestacion || body.fecha_prestacion || body.requestDate,
  medico: body.medico || body.doctor,
  especialidad: body.especialidad || body.specialty,
  lugarAtencion: body.lugarAtencion || body.lugar_atencion || body.place,
  facturaCuit: body.facturaCuit || body.factura_cuit || body.invoiceCuit,
  facturaValor: body.facturaValor || body.factura_valor || body.invoiceAmount,
  formaPago: body.formaPago || body.forma_pago || body.paymentMethod,
  observaciones: body.observaciones || body.description,
});

const getMyReintegros = async (req, res) => {
  try {
    const affiliate = await affiliateRepository.getAffiliateByUserId(req.user.id);
    if (!affiliate) return res.status(404).json({ message: 'Afiliado no encontrado' });

    const rows = await affiliateRepository.getFamilyTramitesByTipo(affiliate.id, 'Reintegro');
    return res.status(200).json(rows.map(serializeReintegro));
  } catch (error) {
    console.error('Error getMyReintegros:', error);
    return res.status(500).json({ message: 'Error al obtener los reintegros' });
  }
};

const submitReintegro = async (req, res) => {
  try {
    const affiliate = await resolveAffiliate(req);
    if (!affiliate) return res.status(404).json({ message: 'Afiliado no encontrado o no pertenece al grupo familiar' });

    const { fechaPrestacion, medico, especialidad, lugarAtencion, facturaCuit, facturaValor, formaPago, cbu, observaciones } = normalizeReintegroPayload(req.body);

    if (!fechaPrestacion) return res.status(400).json({ message: 'La fecha de prestación es requerida' });
    assertISODate(fechaPrestacion);
    if (!medico || !String(medico).trim()) return res.status(400).json({ message: 'El médico es requerido' });
    if (!especialidad || !String(especialidad).trim()) return res.status(400).json({ message: 'La especialidad es requerida' });
    if (!lugarAtencion || !String(lugarAtencion).trim()) return res.status(400).json({ message: 'El lugar de atención es requerido' });
    if (!facturaCuit || !String(facturaCuit).trim()) return res.status(400).json({ message: 'El CUIT del emisor es requerido' });
    const valor = parseFloat(String(facturaValor).replace(',', '.'));
    if (!facturaValor || isNaN(valor) || valor <= 0) return res.status(400).json({ message: 'El valor total de la factura debe ser mayor a 0' });
    if (!formaPago) return res.status(400).json({ message: 'La forma de pago es requerida' });
    if (formaPago === 'Transferencia' && (!cbu || String(cbu).replace(/\D/g, '').length < 22)) {
      return res.status(400).json({ message: 'El CBU/CVU debe tener 22 dígitos para transferencia' });
    }

    const reintegro = await affiliateRepository.createReintegro(affiliate.id, {
      affiliateName: `${affiliate.first_name} ${affiliate.last_name}`,
      fechaPrestacion,
      medico: String(medico).trim(),
      especialidad: String(especialidad).trim(),
      lugarAtencion: String(lugarAtencion).trim(),
      facturaCuit: String(facturaCuit).trim(),
      facturaValor: valor,
      formaPago,
      cbu: cbu || null,
      observaciones: observaciones || null,
    });

    return res.status(201).json(serializeReintegro(reintegro));
  } catch (error) {
    console.error('Error submitReintegro:', error);
    return res.status(500).json({ message: 'Error al enviar el reintegro' });
  }
};

const responderObservacion = async (req, res) => {
  try {
    const affiliate = await affiliateRepository.getAffiliateByUserId(req.user.id);
    if (!affiliate) return res.status(404).json({ message: 'Afiliado no encontrado' });

    const { id } = req.params;
    const respuesta = String(req.body.respuesta || '').trim();
    if (!respuesta) return res.status(400).json({ message: 'La respuesta es requerida' });

    const reintegro = await affiliateRepository.responderObservacion(id, affiliate.id, respuesta);
    if (!reintegro) return res.status(404).json({ message: 'Reintegro no encontrado o no está en estado Observada' });

    return res.status(200).json(serializeReintegro(reintegro));
  } catch (error) {
    console.error('Error responderObservacion:', error);
    return res.status(500).json({ message: 'Error al enviar la respuesta' });
  }
};

// ── Recetas y autorizaciones ─────────────────────────────────────────────────

const getMyRecetas = async (req, res) => {
  try {
    const affiliate = await affiliateRepository.getAffiliateByUserId(req.user.id);
    if (!affiliate) return res.status(404).json({ message: 'Afiliado no encontrado' });

    const rows = await affiliateRepository.getFamilyTramitesByTipo(affiliate.id, 'Receta');
    return res.status(200).json(rows.map(serializeReceta));
  } catch (error) {
    console.error('Error getMyRecetas:', error);
    return res.status(500).json({ message: 'Error al obtener las recetas' });
  }
};

const submitReceta = async (req, res) => {
  try {
    const affiliate = await resolveAffiliate(req);
    if (!affiliate) return res.status(404).json({ message: 'Afiliado no encontrado o no pertenece al grupo familiar' });

    const medicamento = String(req.body.medicamento || req.body.medicamentoNombre || '').trim();
    const presentacion = String(req.body.presentacion || '').trim();
    const fechaEmision = req.body.fecha || req.body.fechaEmision;
    const cantidad = Number(req.body.cantidad);

    if (!medicamento) return res.status(400).json({ message: 'El medicamento es requerido' });
    if (!presentacion) return res.status(400).json({ message: 'La presentación es requerida' });
    if (!fechaEmision) return res.status(400).json({ message: 'La fecha de emisión es requerida' });
    assertISODate(fechaEmision);
    if (!Number.isInteger(cantidad) || cantidad <= 0) return res.status(400).json({ message: 'La cantidad debe ser mayor a 0' });

    const receta = await affiliateRepository.createReceta(affiliate.id, {
      affiliateName: `${affiliate.first_name} ${affiliate.last_name}`.trim(),
      medicamento,
      presentacion,
      cantidad,
      fechaEmision,
      observaciones: req.body.observaciones || null,
    });

    return res.status(201).json(serializeReceta(receta));
  } catch (error) {
    console.error('Error submitReceta:', error);
    return res.status(500).json({ message: 'Error al enviar la receta' });
  }
};

const responderRecetaObservacion = async (req, res) => {
  try {
    const affiliate = await affiliateRepository.getAffiliateByUserId(req.user.id);
    if (!affiliate) return res.status(404).json({ message: 'Afiliado no encontrado' });
    const respuesta = String(req.body.respuesta || '').trim();
    if (!respuesta) return res.status(400).json({ message: 'La respuesta es requerida' });
    const receta = await affiliateRepository.responderTramiteObservacion(req.params.id, affiliate.id, 'Receta', respuesta);
    if (!receta) return res.status(404).json({ message: 'Receta no encontrada o no está en estado Observada' });
    return res.status(200).json(serializeReceta(receta));
  } catch (error) {
    console.error('Error responderRecetaObservacion:', error);
    return res.status(500).json({ message: 'Error al enviar la respuesta' });
  }
};

const getMyAutorizaciones = async (req, res) => {
  try {
    const affiliate = await affiliateRepository.getAffiliateByUserId(req.user.id);
    if (!affiliate) return res.status(404).json({ message: 'Afiliado no encontrado' });

    const rows = await affiliateRepository.getFamilyTramitesByTipo(affiliate.id, 'Autorizacion');
    return res.status(200).json(rows.map(serializeAutorizacion));
  } catch (error) {
    console.error('Error getMyAutorizaciones:', error);
    return res.status(500).json({ message: 'Error al obtener las autorizaciones' });
  }
};

const submitAutorizacion = async (req, res) => {
  try {
    const affiliate = await resolveAffiliate(req);
    if (!affiliate) return res.status(404).json({ message: 'Afiliado no encontrado o no pertenece al grupo familiar' });

    const fechaPrevista = req.body.fechaPrevista || req.body.fecha;
    const subtipo = String(req.body.subtipo || '').trim();
    const especialidad = String(req.body.especialidad || '').trim();
    const medico = String(req.body.medico || '').trim();
    const lugarPrestacion = String(req.body.lugarPrestacion || req.body.lugarAtencion || '').trim();
    const diasInternacion = Number(req.body.diasInternacion || 0);

    if (!fechaPrevista) return res.status(400).json({ message: 'La fecha prevista es requerida' });
    assertISODate(fechaPrevista);
    if (!subtipo) return res.status(400).json({ message: 'El tipo de autorización es requerido' });
    if (!especialidad) return res.status(400).json({ message: 'La especialidad es requerida' });
    if (!medico) return res.status(400).json({ message: 'El médico solicitante es requerido' });
    if (!lugarPrestacion) return res.status(400).json({ message: 'El lugar de realización es requerido' });
    if (!Number.isInteger(diasInternacion) || diasInternacion < 0) return res.status(400).json({ message: 'Los días de internación no son válidos' });

    // Adjunto (orden médica) — opcional
    const adjunto = req.file ? {
      nombre: req.file.originalname,
      tipo: req.file.mimetype,
      tamanio: req.file.size,
      ruta: req.file.filename,
    } : null;

    const autorizacion = await affiliateRepository.createAutorizacion(affiliate.id, {
      affiliateName: `${affiliate.first_name} ${affiliate.last_name}`.trim(),
      fechaPrevista,
      subtipo,
      especialidad,
      medico,
      lugarPrestacion,
      diasInternacion,
      observaciones: req.body.observaciones || null,
      adjunto,
    });

    return res.status(201).json(serializeAutorizacion(autorizacion));
  } catch (error) {
    console.error('Error submitAutorizacion:', error);
    return res.status(500).json({ message: 'Error al enviar la autorización' });
  }
};

const responderAutorizacionObservacion = async (req, res) => {
  try {
    const affiliate = await affiliateRepository.getAffiliateByUserId(req.user.id);
    if (!affiliate) return res.status(404).json({ message: 'Afiliado no encontrado' });
    const respuesta = String(req.body.respuesta || '').trim();
    if (!respuesta) return res.status(400).json({ message: 'La respuesta es requerida' });
    const autorizacion = await affiliateRepository.responderTramiteObservacion(req.params.id, affiliate.id, 'Autorizacion', respuesta);
    if (!autorizacion) return res.status(404).json({ message: 'Autorización no encontrada o no está en estado Observada' });
    return res.status(200).json(serializeAutorizacion(autorizacion));
  } catch (error) {
    console.error('Error responderAutorizacionObservacion:', error);
    return res.status(500).json({ message: 'Error al enviar la respuesta' });
  }
};

// ── Admin — Reintegros ────────────────────────────────────────────────────────

const ESTADOS_REINTEGRO_VALIDOS = new Set(['Pendiente', 'En análisis', 'Observada', 'Aprobada', 'Rechazada']);

const adminGetReintegros = async (req, res) => {
  try {
    const { estado, status, page = 1, limit = 20 } = req.query;
    const { rows, total } = await affiliateRepository.getAllReintegrosForAdmin({
      status: estado || status || null,
      page: Number(page),
      limit: Number(limit),
    });
    return res.status(200).json({
      data: rows.map(serializeReintegro),
      total,
      page: Number(page),
      totalPages: Math.ceil(total / Number(limit)),
    });
  } catch (error) {
    console.error('Error adminGetReintegros:', error);
    return res.status(500).json({ message: 'Error al obtener los reintegros' });
  }
};

const adminUpdateReintegroStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const estado = req.body.estado || req.body.status;
    const motivo = req.body.motivo || req.body.reason;

    if (!estado || !ESTADOS_REINTEGRO_VALIDOS.has(estado))
      return res.status(400).json({ message: 'Estado inválido' });
    if (['Aprobada', 'Rechazada', 'Observada'].includes(estado) && !String(motivo || '').trim())
      return res.status(400).json({ message: 'El motivo es requerido para este estado' });

    const reintegro = await affiliateRepository.updateReintegroStatus(id, {
      status: estado,
      motivo: String(motivo || '').trim() || null,
      userId: req.user.id,
    });
    if (!reintegro) return res.status(404).json({ message: 'Reintegro no encontrado' });

    return res.status(200).json(serializeReintegro(reintegro));
  } catch (error) {
    console.error('Error adminUpdateReintegroStatus:', error);
    return res.status(500).json({ message: 'Error al actualizar el estado' });
  }
};

const getAffiliateByDocument = async (req, res) => {
  try {
    const affiliate = await affiliateRepository.getAffiliateByIdentifier(req.params.identifier);
    if (!affiliate) return res.status(404).json({ message: 'El afiliado no existe' });
    return res.status(200).json(await serializeAffiliate(affiliate));
  } catch (error) {
    console.error('[AFFILIATES] Error en getAffiliateByDocument:', error.message);
    return res.status(500).json({ message: 'Error interno al obtener el afiliado' });
  }
};

const getMyProfile = async (req, res) => {
  try {
    const affiliate = await affiliateRepository.getAffiliateByUserId(req.user.id);
    if (!affiliate) {
      return res.status(404).json({ message: 'Afiliado no encontrado' });
    }

    const holderId = affiliate.holder_affiliate_id || affiliate.id;
    const family = await affiliateRepository.getFamilyByHolderId(holderId);

    return res.status(200).json({
      afiliado: await serializeAffiliate(affiliate),
      grupoFamiliar: await serializeAffiliates(family),
    });
  } catch (error) {
    console.error('[AFFILIATES] Error en getMyProfile:', error.message);
    return res.status(500).json({ message: 'Error interno al obtener el perfil' });
  }
};

module.exports = {
  createAffiliate,
  getAffiliatesList,
  getAffiliatesByStatus: getAffiliatesList,
  getAffiliateById,
  getAffiliateByDocument,
  getMyProfile,
  updateAffiliate,
  removeAffiliate,
  getFamilyGroup,
  createFamilyMember,
  deleteFamilyMember,
  scheduleDeleteAffiliate,
  getScheduledAffiliates,
  activateAffiliate,
  deactivateAffiliate,
  getAffiliateByUserId,
  getMyAppointments,
  getAvailableSlots,
  bookAppointment,
  cancelAppointment,
  getMyReintegros,
  submitReintegro,
  responderObservacion,
  getMyRecetas,
  submitReceta,
  responderRecetaObservacion,
  getMyAutorizaciones,
  submitAutorizacion,
  responderAutorizacionObservacion,
  adminGetReintegros,
  adminUpdateReintegroStatus,
  _private: {
    normalizeReintegroPayload
  }
};
