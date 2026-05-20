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

const prestadorColumns = [
  'prestadores.id',
  'prestadores.usuario_id',
  'prestadores.cuit',
  'prestadores.nombre as first_name',
  'prestadores.apellido as last_name',
  'prestadores.nro_documento as document_number',
  'prestadores.email',
  'prestadores.telefono as phone',
  'prestadores.especialidad as specialty',
  'prestadores.activo as status',
  'prestadores.tipo_prestador',
  'prestadores.centro_medico_id',
  'prestadores.telefonos',
  'prestadores.mails',
  'prestadores.estado',
  'prestadores.baja_en as deactivated_at',
  'prestadores.motivo_baja as deactivation_reason',
  'prestadores.suspendido_en as suspended_at',
  'prestadores.motivo_suspension as suspension_reason',
  'prestadores.credenciales_enviadas_en as credentials_sent_at',
  'prestadores.contrasenia_reseteada_en as password_reset_at',
  'prestadores.creado_en as created_at',
  'prestadores.actualizado_en as updated_at',
];

const requestColumns = [
  'prestador_requests.*',
  'afiliado_id as affiliate_id',
  'nro_solicitud as request_number',
  'afiliado_nombre as affiliate_name',
  'tipo as type',
  'estado as status',
  'fecha_solicitud as request_date',
  'descripcion as description',
  'adjunto_nombre as attachment_name',
  'adjunto_tipo as attachment_type',
  'adjunto_tamanio as attachment_size',
  'motivo_estado as status_reason',
  'resuelto_por_usuario_id as resolved_by_usuario_id',
  'resuelto_en as resolved_at',
  'creado_en as created_at',
  'actualizado_en as updated_at',
];

const appointmentColumns = [
  'prestador_appointments.*',
  'afiliado_id as affiliate_id',
  'afiliado_nombre as affiliate_name',
  'fecha_turno as appointment_date',
  'hora_inicio as start_time',
  'hora_fin as end_time',
  'motivo as reason',
  'nota as note',
  'estado as status',
  'motivo_cancelacion as cancellation_reason',
  'atendido_en as attended_at',
  'creado_en as created_at',
  'actualizado_en as updated_at',
];

const situationColumns = [
  'prestador_affiliate_situations.*',
  'afiliado_id as affiliate_id',
  'tipo_situacion_id as situation_type_id',
  'tipo as type',
  'fecha_inicio as start_date',
  'fecha_fin as end_date',
  'activa as active',
  'observacion as observation',
  'motivo_finalizacion as end_reason',
  'creado_en as created_at',
  'actualizado_en as updated_at',
];

const historyColumns = [
  'prestador_clinical_history.*',
  'afiliado_id as affiliate_id',
  'turno_id as appointment_id',
  'fecha as entry_date',
  'profesional as doctor',
  'especialidad as specialty',
  'modalidad as modality',
  'nota as note',
  'nota_propia as own_note',
  'creado_en as created_at',
  'actualizado_en as updated_at',
];

const getPrestadorByCuit = async (cuit, trx = db) => {
  return trx('prestadores')
    .select(
      ...prestadorColumns,
      'usuarios.contrasenia as password',
      'usuarios.debe_cambiar_password as must_change_password',
      'usuarios.email as user_email',
      'roles.nombre_rol as role_name'
    )
    .join('usuarios', 'prestadores.usuario_id', 'usuarios.id')
    .join('usuarios_roles', 'usuarios.id', 'usuarios_roles.usuario_id')
    .join('roles', 'usuarios_roles.rol_id', 'roles.id')
    .where('prestadores.cuit', cuit)
    .first();
};

const getPrestadorByUserId = async (userId, trx = db) => {
  return trx('prestadores').select(prestadorColumns).where({ usuario_id: userId }).first();
};

const getDefaultPrestador = async (trx = db) => {
  return trx('prestadores').select(prestadorColumns).orderBy('id').first();
};

const getDashboardStats = async (prestadorId, trx = db) => {
  const requests = await trx('prestador_requests')
    .select(requestColumns)
    .where({ prestador_id: prestadorId })
    .orderBy('fecha_solicitud', 'desc')
    .orderBy('id', 'desc');

  return {
    pendientes: requests.filter((item) => item.status === 'Pendiente').length,
    observadas: requests.filter((item) => item.status === 'Observada').length,
    actividadReciente: requests.slice(0, 5),
  };
};

const getRequests = async (prestadorId, trx = db) => {
  return trx('prestador_requests')
    .select(requestColumns)
    .where({ prestador_id: prestadorId })
    .orderBy('fecha_solicitud', 'desc')
    .orderBy('id', 'desc');
};

const getRequestByIdForPrestador = async (id, prestadorId, trx = db) => {
  return trx('prestador_requests').select(requestColumns).where({ id, prestador_id: prestadorId }).first();
};

const updateRequestStatus = async (id, prestadorId, status, reason, userId, trx = db) => {
  const [request] = await trx('prestador_requests')
    .where({ id, prestador_id: prestadorId })
    .update({
      estado: status,
      motivo_estado: reason || null,
      resuelto_por_usuario_id: ['Aprobada', 'Rechazada'].includes(status) ? userId : null,
      resuelto_en: ['Aprobada', 'Rechazada'].includes(status) ? trx.fn.now() : null,
      actualizado_en: trx.fn.now()
    })
    .returning('*');

  return getRequestByIdForPrestador(request.id, prestadorId, trx);
};

const createRequest = async (prestadorId, data, trx = db) => {
  const requestNumber = data.nro || `SOL-${Date.now()}`;
  const [request] = await trx('prestador_requests')
    .insert({
      prestador_id: prestadorId,
      afiliado_id: data.affiliateId || null,
      nro_solicitud: requestNumber,
      afiliado_nombre: data.afiliado,
      tipo: data.tipo,
      estado: data.estado || 'Pendiente',
      fecha_solicitud: data.fecha,
      descripcion: data.descripcion,
      adjunto_nombre: data.adjunto?.nombre || null,
      adjunto_tipo: data.adjunto?.tipo || null,
      adjunto_tamanio: data.adjunto?.tamanio || null,
    })
    .returning('*');

  return getRequestByIdForPrestador(request.id, prestadorId, trx);
};

const getAppointmentsByDate = async (prestadorId, date, trx = db) => {
  return trx('prestador_appointments')
    .select(appointmentColumns)
    .where({ prestador_id: prestadorId, fecha_turno: date })
    .orderBy('hora_inicio', 'asc');
};

const getAppointmentsByMonth = async (prestadorId, year, month, trx = db) => {
  // SQLite and Postgres support might vary for native dates, but we can just use string LIKE for `YYYY-MM-%` since `appointment_date` is likely standard YYYY-MM-DD
  const prefix = `${year}-${String(month).padStart(2, '0')}-%`;
  return trx('prestador_appointments')
    .where('prestador_id', prestadorId)
    .andWhere('fecha_turno', 'like', prefix)
    .select('fecha_turno as appointment_date')
    .groupBy('fecha_turno');
};

const createAppointment = async (prestadorId, data, trx = db) => {
  const [appointment] = await trx('prestador_appointments')
    .insert({
      prestador_id: prestadorId,
      afiliado_id: data.affiliateId,
      agenda_id: data.agendaId || null,
      especialidad_id: data.especialidadId || null,
      lugar_id: data.lugarId || null,
      afiliado_nombre: data.afiliado,
      fecha_turno: data.date,
      hora_inicio: data.horaIni,
      hora_fin: data.horaFin,
      motivo: data.motivo,
      nota: data.notas || null,
      estado: data.estado || 'reservado',
    })
    .returning('*');

  return trx('prestador_appointments').select(appointmentColumns).where({ id: appointment.id }).first();
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
    .where({ prestador_id: prestadorId, fecha_turno: date })
    .whereNotIn('estado', ['cancelado'])
    .andWhere('hora_inicio', '<', endTime)
    .andWhere('hora_fin', '>', startTime);

  if (ignoreId) query.whereNot('id', ignoreId);
  return !!await query.first();
};

const updateAppointmentNote = async (id, note, trx = db) => {
  const [appointment] = await trx('prestador_appointments')
    .where({ id })
    .update({ nota: note, actualizado_en: trx.fn.now() })
    .returning('*');

  return trx('prestador_appointments').select(appointmentColumns).where({ id: appointment.id }).first();
};

const updateAppointmentStatus = async (id, prestadorId, data, trx = db) => {
  const patch = {
    estado: data.estado,
    actualizado_en: trx.fn.now()
  };

  if (data.nota !== undefined) patch.nota = data.nota;
  if (data.motivoCancelacion !== undefined) patch.motivo_cancelacion = data.motivoCancelacion || null;
  if (data.estado === 'atendido') patch.atendido_en = trx.fn.now();

  const [appointment] = await trx('prestador_appointments')
    .where({ id, prestador_id: prestadorId })
    .update(patch)
    .returning('*');

  return trx('prestador_appointments').select(appointmentColumns).where({ id: appointment.id }).first();
};

const searchAffiliates = async (query, trx = db) => {
  const like = `%${query.toLowerCase()}%`;

  return trx('afiliados')
    .select(
      'id',
      'nombre as first_name',
      'apellido as last_name',
      'nro_documento as document_number',
      'nro_credencial as credencial_number',
      'fecha_nacimiento as birth_date',
      'activo as status'
    )
    .where(function () {
      this.whereRaw('LOWER(nombre) LIKE ?', [like])
        .orWhereRaw('LOWER(apellido) LIKE ?', [like])
        .orWhereRaw('LOWER(nro_credencial) LIKE ?', [like])
        .orWhereRaw('LOWER(nro_documento) LIKE ?', [like]);
    })
    .limit(10);
};

const getClinicalHistoryByAffiliate = async (affiliateId, trx = db) => {
  return trx('prestador_clinical_history')
    .select(historyColumns)
    .where({ afiliado_id: affiliateId })
    .orderBy('fecha', 'desc')
    .orderBy('id', 'desc');
};

const createClinicalHistoryEntry = async (affiliateId, prestadorId, data, trx = db) => {
  const prestador = await trx('prestadores').where({ id: prestadorId }).first();
  const specialty = data.especialidad || await trx('prestador_especialidades')
    .join('especialidades', 'prestador_especialidades.especialidad_id', 'especialidades.id')
    .where('prestador_especialidades.prestador_id', prestadorId)
    .select('especialidades.nombre')
    .first();

  const doctor = data.doctor || `${prestador.nombre} ${prestador.apellido}`.trim();
  const [entry] = await trx('prestador_clinical_history')
    .insert({
      afiliado_id: affiliateId,
      prestador_id: prestadorId,
      turno_id: data.turnoId || null,
      fecha: data.fecha,
      profesional: doctor,
      especialidad: typeof specialty === 'string' ? specialty : specialty?.nombre || 'Sin especialidad',
      modalidad: data.modalidad || 'Consulta',
      nota: data.nota,
      nota_propia: true,
    })
    .returning('*');

  return trx('prestador_clinical_history').select(historyColumns).where({ id: entry.id }).first();
};

const getSituationTypes = async (trx = db) => {
  return trx('prestador_situation_types').select('id', 'nombre as name').orderBy('nombre');
};

const getSituationsByAffiliate = async (affiliateId, trx = db) => {
  return trx('prestador_affiliate_situations')
    .select(situationColumns)
    .where({ afiliado_id: affiliateId })
    .orderBy('fecha_inicio', 'desc')
    .orderBy('id', 'desc');
};

const createSituation = async (affiliateId, data, trx = db) => {
  const [situation] = await trx('prestador_affiliate_situations')
    .insert({
      afiliado_id: affiliateId,
      prestador_id: data.prestadorId || null,
      tipo: data.tipo,
      fecha_inicio: data.fechaInicio,
      fecha_fin: data.fechaFin || null,
      activa: data.activa !== false,
      observacion: data.observacion || null,
      motivo_finalizacion: data.motivoFinalizacion || null,
    })
    .returning('*');

  return trx('prestador_affiliate_situations').select(situationColumns).where({ id: situation.id }).first();
};

const updateSituation = async (affiliateId, situationId, data, trx = db) => {
  const patch = {
    actualizado_en: trx.fn.now(),
  };

  if (data.tipo !== undefined) patch.tipo = data.tipo;
  if (data.fechaInicio !== undefined) patch.fecha_inicio = data.fechaInicio;
  if (data.fechaFin !== undefined) patch.fecha_fin = data.fechaFin || null;
  if (data.activa !== undefined) patch.activa = data.activa;
  if (data.observacion !== undefined) patch.observacion = data.observacion || null;
  if (data.motivoFinalizacion !== undefined) patch.motivo_finalizacion = data.motivoFinalizacion || null;

  const [situation] = await trx('prestador_affiliate_situations')
    .where({ id: situationId, afiliado_id: affiliateId })
    .update(patch)
    .returning('*');

  return trx('prestador_affiliate_situations').select(situationColumns).where({ id: situation.id }).first();
};

const findActiveSituation = async (affiliateId, type, prestadorId, ignoreId = null, trx = db) => {
  const query = trx('prestador_affiliate_situations')
    .where({ afiliado_id: affiliateId, tipo: type, activa: true })
    .andWhere((builder) => {
      builder.whereNull('prestador_id').orWhere('prestador_id', prestadorId);
    });

  if (ignoreId) query.whereNot('id', ignoreId);
  return query.select(situationColumns).first();
};

const getAffiliateById = async (affiliateId, trx = db) => {
  return trx('afiliados')
    .select(
      'id',
      'nombre as first_name',
      'apellido as last_name',
      'nro_documento as document_number',
      'nro_credencial as credencial_number',
      'fecha_nacimiento as birth_date',
      'activo as status'
    )
    .where({ id: affiliateId })
    .first();
};

const createWorkflowAuditLog = async (trx, { prestadorId, affiliateId = null, userId = null, module, action, reason = null, metadata = {} }) => {
  await trx('prestador_workflow_audit_logs').insert({
    prestador_id: prestadorId,
    afiliado_id: affiliateId,
    usuario_id: userId,
    modulo: module,
    accion: action,
    motivo: reason || null,
    metadata: JSON.stringify(metadata || {}),
    creado_en: trx.fn.now()
  });
};

const deleteSituation = async (affiliateId, situationId, trx = db) => {
  const [deleted] = await trx('prestador_affiliate_situations')
    .where({ id: situationId, afiliado_id: affiliateId })
    .del()
    .returning('*');
  return deleted;
};

const getNotifications = async (prestadorId, trx = db) => {
  return trx('prestador_notifications')
    .select(
      '*',
      'titulo as title',
      'texto as text',
      'clase_icono as icon_class',
      'no_leida as unread',
      'creado_en as created_at'
    )
    .where({ prestador_id: prestadorId })
    .orderBy('creado_en', 'desc');
};

const markNotificationAsRead = async (id, prestadorId, trx = db) => {
  const [notification] = await trx('prestador_notifications')
    .where({ id, prestador_id: prestadorId })
    .update({ no_leida: false })
    .returning('*');
  return notification;
};

// ── Admin solicitudes ─────────────────────────────────────────────────────────

const getAllRequestsForAdmin = async ({ status, page = 1, limit = 20 } = {}, trx = db) => {
  let base = trx('prestador_requests as pr')
    .leftJoin('prestadores as p', 'pr.prestador_id', 'p.id')
    .leftJoin('afiliados as a', 'pr.afiliado_id', 'a.id')
    .whereNotNull('pr.prestador_id');   // solo solicitudes iniciadas por prestador
  if (status) base = base.where('pr.estado', status);

  const countResult = await base.clone().count('pr.id as count').first();

  const rows = await base.clone()
    .select(
      'pr.*',
      'pr.afiliado_id as affiliate_id',
      'pr.nro_solicitud as request_number',
      'pr.afiliado_nombre as affiliate_name',
      'pr.tipo as type',
      'pr.estado as status',
      'pr.fecha_solicitud as request_date',
      'pr.descripcion as description',
      'pr.motivo_estado as status_reason',
      'pr.creado_en as created_at',
      'pr.actualizado_en as updated_at',
      'p.nombre as prestador_first_name',
      'p.apellido as prestador_last_name',
      'p.cuit as prestador_cuit',
      'a.nombre as affiliate_first_name',
      'a.apellido as affiliate_last_name',
      'a.nro_credencial as credencial_number'
    )
    .orderBy('pr.creado_en', 'desc')
    .limit(limit)
    .offset((page - 1) * limit);

  return { rows, total: Number(countResult.count) };
};

const updateRequestStatusAdmin = async (id, { status, motivo, userId }, trx = db) => {
  const patch = {
    estado: status,
    actualizado_en: trx.fn.now(),
    motivo_estado: motivo || null,
  };
  if (['Aprobada', 'Rechazada'].includes(status)) {
    patch.resuelto_por_usuario_id = userId;
    patch.resuelto_en = trx.fn.now();
  }
  const [req] = await trx('prestador_requests')
    .where({ id })
    .whereNotNull('prestador_id')
    .update(patch)
    .returning('*');
  return trx('prestador_requests').select(requestColumns).where({ id: req.id }).first();
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
