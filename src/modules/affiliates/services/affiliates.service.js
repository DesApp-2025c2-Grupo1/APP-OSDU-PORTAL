const affiliateRepository = require('../repository/affiliate.repository');
const authService = require('../../auth/services/auth.service');
const affiliateModel = require('../model/affiliate.model');
const { notify } = require('../../mail/notification.service');
const { affiliateSchema } = require('../utils/validation');
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

  const { error, value } = affiliateSchema.validate(req.body);
  if (error) {
    return res.status(400).json({ message: 'Datos inválidos', details: error.details });
  }

  const affiliate = new affiliateModel(value);

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

    // Notificación DESPUÉS del commit para no contaminar la transacción
    await notify('WELCOME', affiliate.email, {
      name: value.first_name,
    });

    return res.status(200).json({ id: newAffiliate.id, message: 'Afiliado creado exitosamente' });

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
    const { status } = req.query;

    if (status !== undefined) {
      const parsedStatus = status === 'true' || status === true;
      const affiliates = await affiliateRepository.getAffiliatesByStatus(parsedStatus);
      return res.status(200).json(affiliates);
    }

    const affiliates = await affiliateRepository.getAllAffiliates();
    return res.status(200).json(affiliates);
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

    return res.status(200).json(affiliate);
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

    await affiliateRepository.activateAffiliate(id);

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
    email: affiliate.email ? [{ idEmail: 0, email: affiliate.email }] : [],
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
    estado: affiliate.status ? 'Activo' : 'Pendiente',
    fechaAlta: affiliate.created_at,
    fecha_alta: affiliate.deactivation_scheduled_at || affiliate.created_at,
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
    const familyIds = family.map((m) => m.id);
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

const getMyReintegros = async (req, res) => {
  try {
    const affiliate = await affiliateRepository.getAffiliateByUserId(req.user.id);
    if (!affiliate) return res.status(404).json({ message: 'Afiliado no encontrado' });

    const rows = await affiliateRepository.getReintegrosByAffiliate(affiliate.id);
    return res.status(200).json(rows.map(serializeReintegro));
  } catch (error) {
    console.error('Error getMyReintegros:', error);
    return res.status(500).json({ message: 'Error al obtener los reintegros' });
  }
};

const submitReintegro = async (req, res) => {
  try {
    const affiliate = await affiliateRepository.getAffiliateByUserId(req.user.id);
    if (!affiliate) return res.status(404).json({ message: 'Afiliado no encontrado' });

    const { fechaPrestacion, medico, especialidad, lugarAtencion, facturaCuit, facturaValor, formaPago, cbu, observaciones } = req.body;

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
    const { estado, motivo } = req.body;

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
  adminGetReintegros,
  adminUpdateReintegroStatus,
};
