const db = require('../../../database/db');

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

const getPrestadorByCuit = async (cuit, trx = db) => {
  return trx('prestadores')
    .select(
      'prestadores.*',
      'users.password',
      'users.must_change_password',
      'users.email as user_email',
      'roles.role_name'
    )
    .join('users', 'prestadores.user_id', 'users.id')
    .join('user_roles', 'users.id', 'user_roles.user_id')
    .join('roles', 'user_roles.role_id', 'roles.id')
    .where('prestadores.cuit', cuit)
    .first();
};

const getPrestadorByUserId = async (userId, trx = db) => {
  return trx('prestadores').where({ user_id: userId }).first();
};

const getDefaultPrestador = async (trx = db) => {
  return trx('prestadores').orderBy('id').first();
};

const getDashboardStats = async (prestadorId, trx = db) => {
  const requests = await trx('prestador_requests')
    .where({ prestador_id: prestadorId })
    .orderBy('request_date', 'desc')
    .orderBy('id', 'desc');

  return {
    pendientes: requests.filter((item) => item.status === 'Pendiente').length,
    observadas: requests.filter((item) => item.status === 'Observada').length,
    actividadReciente: requests.slice(0, 5),
  };
};

const getRequests = async (prestadorId, trx = db) => {
  return trx('prestador_requests')
    .where({ prestador_id: prestadorId })
    .orderBy('request_date', 'desc')
    .orderBy('id', 'desc');
};

const getRequestByIdForPrestador = async (id, prestadorId, trx = db) => {
  return trx('prestador_requests').where({ id, prestador_id: prestadorId }).first();
};

const updateRequestStatus = async (id, prestadorId, status, reason, userId, trx = db) => {
  const [request] = await trx('prestador_requests')
    .where({ id, prestador_id: prestadorId })
    .update({
      status,
      status_reason: reason || null,
      resolved_by_user_id: ['Aprobada', 'Rechazada'].includes(status) ? userId : null,
      resolved_at: ['Aprobada', 'Rechazada'].includes(status) ? trx.fn.now() : null,
      updated_at: trx.fn.now()
    })
    .returning('*');

  return request;
};

const createRequest = async (prestadorId, data, trx = db) => {
  const requestNumber = data.nro || `SOL-${Date.now()}`;
  const [request] = await trx('prestador_requests')
    .insert({
      prestador_id: prestadorId,
      affiliate_id: data.affiliateId || null,
      request_number: requestNumber,
      affiliate_name: data.afiliado,
      type: data.tipo,
      status: data.estado || 'Pendiente',
      request_date: data.fecha,
      description: data.descripcion,
      attachment_name: data.adjunto?.nombre || null,
      attachment_type: data.adjunto?.tipo || null,
      attachment_size: data.adjunto?.tamanio || null,
    })
    .returning('*');

  return request;
};

const getAppointmentsByDate = async (prestadorId, date, trx = db) => {
  return trx('prestador_appointments')
    .where({ prestador_id: prestadorId, appointment_date: date })
    .orderBy('start_time', 'asc');
};

const getAppointmentsByMonth = async (prestadorId, year, month, trx = db) => {
  // SQLite and Postgres support might vary for native dates, but we can just use string LIKE for `YYYY-MM-%` since `appointment_date` is likely standard YYYY-MM-DD
  const prefix = `${year}-${String(month).padStart(2, '0')}-%`;
  return trx('prestador_appointments')
    .where('prestador_id', prestadorId)
    .andWhere('appointment_date', 'like', prefix)
    .select('appointment_date')
    .groupBy('appointment_date');
};

const createAppointment = async (prestadorId, data, trx = db) => {
  const [appointment] = await trx('prestador_appointments')
    .insert({
      prestador_id: prestadorId,
      affiliate_id: data.affiliateId,
      agenda_id: data.agendaId || null,
      especialidad_id: data.especialidadId || null,
      lugar_id: data.lugarId || null,
      affiliate_name: data.afiliado,
      appointment_date: data.date,
      start_time: data.horaIni,
      end_time: data.horaFin,
      reason: data.motivo,
      note: data.notas || null,
      status: data.estado || 'reservado',
    })
    .returning('*');

  return appointment;
};

const findAgendaForAppointment = async (prestadorId, date, startTime, endTime, trx = db) => {
  const agendas = await trx('agendas')
    .where({ prestador_id: prestadorId, esta_activo: true })
    .andWhere((builder) => {
      builder.whereNull('fecha_inicio').orWhere('fecha_inicio', '<=', date);
    })
    .andWhere((builder) => {
      builder.whereNull('fecha_fin').orWhere('fecha_fin', '>=', date);
    });

  const day = new Date(`${date}T00:00:00`).getDay();
  return agendas.find((agenda) => {
    const bloques = parseJsonArray(agenda.bloques);
    return bloques.some((bloque) => {
      const dias = bloque.dias || [];
      if (dias.length > 0 && !dias.map(normalizeDia).includes(day)) return false;
      return String(bloque.desde || '') <= startTime && String(bloque.hasta || '') >= endTime;
    });
  }) || null;
};

const hasOverlappingAppointment = async (prestadorId, date, startTime, endTime, ignoreId = null, trx = db) => {
  const query = trx('prestador_appointments')
    .where({ prestador_id: prestadorId, appointment_date: date })
    .whereNotIn('status', ['cancelado'])
    .andWhere('start_time', '<', endTime)
    .andWhere('end_time', '>', startTime);

  if (ignoreId) query.whereNot('id', ignoreId);
  return !!await query.first();
};

const updateAppointmentNote = async (id, note, trx = db) => {
  const [appointment] = await trx('prestador_appointments')
    .where({ id })
    .update({ note, updated_at: trx.fn.now() })
    .returning('*');

  return appointment;
};

const updateAppointmentStatus = async (id, prestadorId, data, trx = db) => {
  const patch = {
    status: data.estado,
    updated_at: trx.fn.now()
  };

  if (data.nota !== undefined) patch.note = data.nota;
  if (data.motivoCancelacion !== undefined) patch.cancellation_reason = data.motivoCancelacion || null;
  if (data.estado === 'atendido') patch.attended_at = trx.fn.now();

  const [appointment] = await trx('prestador_appointments')
    .where({ id, prestador_id: prestadorId })
    .update(patch)
    .returning('*');

  return appointment;
};

const searchAffiliates = async (query, trx = db) => {
  const like = `%${query.toLowerCase()}%`;

  return trx('affiliates')
    .select('*')
    .where(function () {
      this.whereRaw('LOWER(first_name) LIKE ?', [like])
        .orWhereRaw('LOWER(last_name) LIKE ?', [like])
        .orWhereRaw('LOWER(credencial_number) LIKE ?', [like])
        .orWhereRaw('LOWER(document_number) LIKE ?', [like]);
    })
    .limit(10);
};

const getClinicalHistoryByAffiliate = async (affiliateId, trx = db) => {
  return trx('prestador_clinical_history')
    .where({ affiliate_id: affiliateId })
    .orderBy('entry_date', 'desc')
    .orderBy('id', 'desc');
};

const createClinicalHistoryEntry = async (affiliateId, prestadorId, data, trx = db) => {
  const prestador = await trx('prestadores').where({ id: prestadorId }).first();
  const specialty = data.especialidad || await trx('prestador_especialidades')
    .join('especialidades', 'prestador_especialidades.especialidad_id', 'especialidades.id')
    .where('prestador_especialidades.prestador_id', prestadorId)
    .select('especialidades.nombre')
    .first();

  const doctor = data.doctor || `${prestador.first_name} ${prestador.last_name}`.trim();
  const [entry] = await trx('prestador_clinical_history')
    .insert({
      affiliate_id: affiliateId,
      prestador_id: prestadorId,
      appointment_id: data.turnoId || null,
      entry_date: data.fecha,
      doctor,
      specialty: typeof specialty === 'string' ? specialty : specialty?.nombre || 'Sin especialidad',
      modality: data.modalidad || 'Consulta',
      note: data.nota,
      own_note: true,
    })
    .returning('*');

  return entry;
};

const getSituationTypes = async (trx = db) => {
  return trx('prestador_situation_types').select('id', 'name').orderBy('name');
};

const getSituationsByAffiliate = async (affiliateId, trx = db) => {
  return trx('prestador_affiliate_situations')
    .where({ affiliate_id: affiliateId })
    .orderBy('start_date', 'desc')
    .orderBy('id', 'desc');
};

const createSituation = async (affiliateId, data, trx = db) => {
  const [situation] = await trx('prestador_affiliate_situations')
    .insert({
      affiliate_id: affiliateId,
      prestador_id: data.prestadorId || null,
      type: data.tipo,
      start_date: data.fechaInicio,
      end_date: data.fechaFin || null,
      active: data.activa !== false,
      observation: data.observacion || null,
      end_reason: data.motivoFinalizacion || null,
    })
    .returning('*');

  return situation;
};

const updateSituation = async (affiliateId, situationId, data, trx = db) => {
  const patch = {
    updated_at: trx.fn.now(),
  };

  if (data.tipo !== undefined) patch.type = data.tipo;
  if (data.fechaInicio !== undefined) patch.start_date = data.fechaInicio;
  if (data.fechaFin !== undefined) patch.end_date = data.fechaFin || null;
  if (data.activa !== undefined) patch.active = data.activa;
  if (data.observacion !== undefined) patch.observation = data.observacion || null;
  if (data.motivoFinalizacion !== undefined) patch.end_reason = data.motivoFinalizacion || null;

  const [situation] = await trx('prestador_affiliate_situations')
    .where({ id: situationId, affiliate_id: affiliateId })
    .update(patch)
    .returning('*');

  return situation;
};

const findActiveSituation = async (affiliateId, type, prestadorId, ignoreId = null, trx = db) => {
  const query = trx('prestador_affiliate_situations')
    .where({ affiliate_id: affiliateId, type, active: true })
    .andWhere((builder) => {
      builder.whereNull('prestador_id').orWhere('prestador_id', prestadorId);
    });

  if (ignoreId) query.whereNot('id', ignoreId);
  return query.first();
};

const getAffiliateById = async (affiliateId, trx = db) => {
  return trx('affiliates').where({ id: affiliateId }).first();
};

const createWorkflowAuditLog = async (trx, { prestadorId, affiliateId = null, userId = null, module, action, reason = null, metadata = {} }) => {
  await trx('prestador_workflow_audit_logs').insert({
    prestador_id: prestadorId,
    affiliate_id: affiliateId,
    user_id: userId,
    module,
    action,
    reason: reason || null,
    metadata: JSON.stringify(metadata || {}),
    created_at: trx.fn.now()
  });
};

const deleteSituation = async (affiliateId, situationId, trx = db) => {
  const [deleted] = await trx('prestador_affiliate_situations')
    .where({ id: situationId, affiliate_id: affiliateId })
    .del()
    .returning('*');
  return deleted;
};

const getNotifications = async (prestadorId, trx = db) => {
  return trx('prestador_notifications')
    .where({ prestador_id: prestadorId })
    .orderBy('created_at', 'desc');
};

const markNotificationAsRead = async (id, prestadorId, trx = db) => {
  const [notification] = await trx('prestador_notifications')
    .where({ id, prestador_id: prestadorId })
    .update({ unread: false })
    .returning('*');
  return notification;
};

// ── Admin solicitudes ─────────────────────────────────────────────────────────

const getAllRequestsForAdmin = async ({ status, page = 1, limit = 20 } = {}, trx = db) => {
  let base = trx('prestador_requests as pr')
    .leftJoin('prestadores as p', 'pr.prestador_id', 'p.id')
    .leftJoin('affiliates as a', 'pr.affiliate_id', 'a.id')
    .whereNotNull('pr.prestador_id');   // solo solicitudes iniciadas por prestador
  if (status) base = base.where('pr.status', status);

  const countResult = await base.clone().count('pr.id as count').first();

  const rows = await base.clone()
    .select(
      'pr.*',
      'p.first_name as prestador_first_name',
      'p.last_name as prestador_last_name',
      'p.cuit as prestador_cuit',
      'a.first_name as affiliate_first_name',
      'a.last_name as affiliate_last_name',
      'a.credencial_number'
    )
    .orderBy('pr.created_at', 'desc')
    .limit(limit)
    .offset((page - 1) * limit);

  return { rows, total: Number(countResult.count) };
};

const updateRequestStatusAdmin = async (id, { status, motivo, userId }, trx = db) => {
  const patch = {
    status,
    updated_at: trx.fn.now(),
    status_reason: motivo || null,
  };
  if (['Aprobada', 'Rechazada'].includes(status)) {
    patch.resolved_by_user_id = userId;
    patch.resolved_at = trx.fn.now();
  }
  const [req] = await trx('prestador_requests')
    .where({ id })
    .whereNotNull('prestador_id')
    .update(patch)
    .returning('*');
  return req;
};

module.exports = {
  getPrestadorByCuit,
  getPrestadorByUserId,
  getDefaultPrestador,
  getDashboardStats,
  getRequests,
  getRequestByIdForPrestador,
  updateRequestStatus,
  createRequest,
  getAllRequestsForAdmin,
  updateRequestStatusAdmin,
  getAppointmentsByDate,
  getAppointmentsByMonth,
  createAppointment,
  findAgendaForAppointment,
  hasOverlappingAppointment,
  updateAppointmentNote,
  updateAppointmentStatus,
  searchAffiliates,
  getClinicalHistoryByAffiliate,
  createClinicalHistoryEntry,
  getSituationTypes,
  getSituationsByAffiliate,
  createSituation,
  updateSituation,
  deleteSituation,
  findActiveSituation,
  getAffiliateById,
  createWorkflowAuditLog,
  getNotifications,
  markNotificationAsRead,
};
