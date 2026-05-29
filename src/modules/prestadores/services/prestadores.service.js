const bcrypt = require('bcryptjs');
const { generateToken } = require('../../auth/utils/jwt.service');
const { getSessionCookieOptions } = require('../../auth/utils/cookie-options');
const { notify } = require('../../mail/notification.service');
const prestadoresRepository = require('../repository/prestadores.repository');
const db = require('../../../database/db');

class HttpError extends Error {
  constructor(status, message, details = undefined) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

const sendError = (res, error, fallbackMessage = 'Error interno del servidor') => {
  if (error instanceof HttpError) {
    return res.status(error.status).json({
      message: error.message,
      error: error.message,
      details: error.details
    });
  }

  console.error(fallbackMessage, error);
  return res.status(500).json({ message: 'Error interno del servidor', error: 'Error interno del servidor' });
};

const ESTADOS_SOLICITUD = new Set(['Pendiente', 'En análisis', 'Observada', 'Aprobada', 'Rechazada']);
const ESTADOS_TURNO = new Set(['reservado', 'confirmado', 'atendido', 'cancelado', 'ausente']);

const formatDate = (value) => {
  const date = new Date(value);
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const yyyy = date.getUTCFullYear();
  return `${mm}/${dd}/${yyyy}`;
};

const toISODate = (value) => {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(value).trim());
  if (!match) return value;

  const [, mm, dd, yyyy] = match;
  return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
};

const initials = (name) => name
  .split(' ')
  .filter(Boolean)
  .slice(0, 2)
  .map((part) => part[0])
  .join('')
  .toUpperCase();

const ageFromBirthDate = (birthDate) => {
  const date = new Date(birthDate);
  const now = new Date();
  let age = now.getUTCFullYear() - date.getUTCFullYear();
  const monthDiff = now.getUTCMonth() - date.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < date.getUTCDate())) age -= 1;
  return age;
};

const statusColor = (status) => {
  const map = {
    Pendiente: 'bg-amber-100 text-amber-700',
    'En análisis': 'bg-indigo-100 text-indigo-700',
    Observada: 'bg-violet-100 text-violet-700',
    Aprobada: 'bg-emerald-100 text-emerald-700',
    Rechazada: 'bg-rose-100 text-rose-700',
  };
  return map[status] || 'bg-slate-100 text-slate-600';
};

const serializeRequest = (request) => ({
  id: request.id,
  nro: request.request_number,
  afiliadoId: request.affiliate_id,
  afiliado: request.affiliate_name,
  tipo: request.type,
  estado: request.status,
  motivoEstado: request.status_reason,
  fecha: formatDate(request.request_date),
  descripcion: request.description,
  adjunto: request.attachment_name ? {
    nombre: request.attachment_name,
    tipo: request.attachment_type,
    tamanio: request.attachment_size
  } : null,
});

const serializeActivity = (request) => ({
  id: request.request_number,
  texto: request.affiliate_name,
  tipo: request.type,
  tiempo: formatDate(request.request_date),
  color: statusColor(request.status),
});

const serializeAppointment = (appointment) => ({
  id: appointment.id,
  afiliadoId: appointment.afiliado_id || appointment.affiliate_id,
  agendaId: appointment.agenda_id,
  especialidadId: appointment.especialidad_id,
  lugarId: appointment.lugar_id,
  hora: appointment.end_time
    ? `${appointment.start_time} - ${appointment.end_time}`
    : appointment.start_time,
  horaInicio: appointment.start_time,
  horaFin: appointment.end_time,
  nombre: appointment.affiliate_name,
  motivo: appointment.reason,
  nota: appointment.note,
  estado: appointment.status || 'reservado',
  motivoCancelacion: appointment.cancellation_reason,
});

const serializeAffiliate = (affiliate) => {
  const nombre = `${affiliate.first_name} ${affiliate.last_name}`.trim();
  return {
    id: affiliate.id,
    nombre,
    nro: affiliate.credencial_number,
    tipo: affiliate.plan_type || 'Plan UNAHUR',
    edad: ageFromBirthDate(affiliate.birth_date),
    iniciales: initials(nombre),
    color: 'bg-teal-100 text-teal-700',
  };
};

const serializeHistory = (entry) => ({
  id: entry.id,
  afiliadoId: entry.affiliate_id,
  prestadorId: entry.prestador_id,
  turnoId: entry.appointment_id,
  fecha: formatDate(entry.entry_date),
  doctor: entry.doctor,
  especialidad: entry.specialty,
  modalidad: entry.modality,
  nota: entry.note,
  mia: !!entry.own_note,
  iniciales: initials(entry.doctor.replace(/^Dr\.?\s+|^Dra\.?\s+/i, '')),
  color: entry.own_note ? 'bg-teal-100 text-teal-700' : 'bg-slate-100 text-slate-600',
});

const serializeSituation = (situation) => ({
  id: situation.id,
  afiliadoId: situation.affiliate_id,
  prestadorId: situation.prestador_id,
  tipo: situation.type,
  fechaInicio: formatDate(situation.start_date),
  fechaFin: situation.end_date ? formatDate(situation.end_date) : '',
  activa: !!situation.active,
  estado: situation.active ? 'activa' : 'finalizada',
  observacion: situation.observation || '',
  motivoFinalizacion: situation.end_reason || '',
});

const getCurrentPrestadorId = async (req) => {
  if (!req.user || !req.user.id) {
    throw new HttpError(401, 'No autenticado');
  }

  const prestador = await prestadoresRepository.getPrestadorByUserId(req.user.id);
  if (!prestador) {
    throw new HttpError(403, 'No tienes un perfil de prestador configurado en el sistema');
  }

  return prestador.id;
};

const getUserId = (req) => req.user?.id || req.user?.id_usuario || req.user?.userId || null;

const ensureAffiliate = async (affiliateId) => {
  const affiliate = await prestadoresRepository.getAffiliateById(affiliateId);
  if (!affiliate) throw new HttpError(404, 'El afiliado no existe');
  if (affiliate.status === false) throw new HttpError(422, 'El afiliado no se encuentra activo');
  return affiliate;
};

const validateRelationship = async (req, affiliateId) => {
  const role = req.user?.role || req.user?.role_name;
  if (role === 'PRESTADOR') {
    const prestadorId = await getCurrentPrestadorId(req);
    const hasRelationship = await prestadoresRepository.hasAppointmentWithAffiliate(prestadorId, affiliateId);
    if (!hasRelationship) {
      throw new HttpError(403, 'Acceso denegado. No tienes una relación de atención activa con este afiliado para consultar su información clínica.');
    }
  }
};

const affiliateName = (affiliate) => `${affiliate.first_name} ${affiliate.last_name}`.trim();

const requireText = (value, field, message) => {
  const text = String(value || '').trim();
  if (!text) throw new HttpError(400, message, [{ field, message }]);
  return text;
};

const assertISODate = (value, field = 'fecha') => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) {
    throw new HttpError(422, 'Fecha inválida', [{ field, message: 'La fecha debe tener formato YYYY-MM-DD' }]);
  }
  return value;
};

const assertTime = (value, field) => {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || ''))) {
    throw new HttpError(422, 'Horario inválido', [{ field, message: 'El horario debe tener formato HH:mm' }]);
  }
};

const toMinutes = (value) => {
  const [hh, mm] = String(value).split(':').map(Number);
  return hh * 60 + mm;
};

const login = async (req, res) => {
  try {
    const { cuit: rawCuit, password } = req.body;

    if (!rawCuit || !password) {
      return res.status(400).json({ message: 'Faltan datos requeridos' });
    }

    // Strip dashes so both '20-30405060-7' and '20304050607' work
    const cuit = rawCuit.replace(/-/g, '');

    const prestador = await prestadoresRepository.getPrestadorByCuit(cuit);

    if (!prestador) {
      return res.status(401).json({ message: 'CUIT o contraseña incorrectos' });
    }

    const providerState = prestador.estado || (prestador.status ? 'activo' : 'baja');
    if (providerState !== 'activo') {
      return res.status(403).json({ message: 'La cuenta del prestador no se encuentra activa. Contactá a administración.' });
    }

    const isPasswordValid = await bcrypt.compare(password, prestador.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'CUIT o contraseña incorrectos' });
    }

    const token = await generateToken({
      id: prestador.usuario_id,
      email: prestador.user_email,
      role_name: prestador.role_name,
    });

    res.cookie('token_prestador', token, getSessionCookieOptions());

    return res.status(200).json({
      message: 'OK',
      user: {
        id: prestador.id,
        id_usuario: prestador.usuario_id,
        nombre: prestador.first_name,
        apellido: prestador.last_name,
        dni: prestador.document_number || '',
        email: prestador.email,
        cuit: prestador.cuit,
        role: prestador.role_name,
        debeCambiarPassword: !!prestador.must_change_password,
        must_change_password: !!prestador.must_change_password,
      },
    });
  } catch (error) {
    console.error('Error al iniciar sesion de prestador:', error);
    return res.status(500).json({ message: 'Error interno del servidor' });
  }
};

const getDashboardStats = async (req, res) => {
  try {
    const prestadorId = await getCurrentPrestadorId(req);
    const stats = await prestadoresRepository.getDashboardStats(prestadorId);
    return res.status(200).json({
      pendientes: stats.pendientes,
      observadas: stats.observadas,
      actividadReciente: stats.actividadReciente.map(serializeActivity),
    });
  } catch (error) {
    return sendError(res, error, 'Error getDashboardStats:');
  }
};

const getRequests = async (req, res) => {
  try {
    const prestadorId = await getCurrentPrestadorId(req);
    if (!prestadorId) return res.status(404).json({ message: 'No hay prestador configurado' });

    const requests = await prestadoresRepository.getRequests(prestadorId);
    return res.status(200).json(requests.map(serializeRequest));
  } catch (error) {
    return sendError(res, error, 'Error getRequests:');
  }
};

const updateRequestStatus = async (req, res) => {
  try {
    const prestadorId = await getCurrentPrestadorId(req);
    const { id } = req.params;
    const { estado } = req.body;
    const motivo = String(req.body.motivo || '').trim();

    if (!prestadorId) return res.status(404).json({ message: 'No hay prestador configurado' });
    if (!estado) throw new HttpError(400, 'El estado es requerido');
    if (!ESTADOS_SOLICITUD.has(estado)) throw new HttpError(422, 'Estado de solicitud inválido');
    if (['Aprobada', 'Rechazada', 'Observada'].includes(estado) && !motivo) {
      throw new HttpError(400, 'El motivo es requerido para cambiar la solicitud a ese estado');
    }

    const request = await db.transaction(async (trx) => {
      const updated = await prestadoresRepository.updateRequestStatus(id, prestadorId, estado, motivo, getUserId(req), trx);
      if (!updated) throw new HttpError(404, 'La solicitud no existe');
      await prestadoresRepository.createWorkflowAuditLog(trx, {
        prestadorId,
        affiliateId: updated.affiliate_id,
        userId: getUserId(req),
        module: 'solicitudes',
        action: 'cambiar_estado',
        reason: motivo || null,
        metadata: { solicitudId: updated.id, estado }
      });
      const affiliate = await prestadoresRepository.getAffiliateById(updated.affiliate_id);
      await notify('REQ_STATUS', affiliate.email, {
        name: `${affiliate.first_name} ${affiliate.last_name}`.trim(),
        requestNumber: updated.request_number || '',
        type: updated.type,
        status: estado,
        date: updated.request_date ? formatDate(updated.request_date) : '',
        motivo: motivo || '',
      });
      return updated;
    });

    return res.status(200).json(serializeRequest(request));
  } catch (error) {
    return sendError(res, error, 'Error updateRequestStatus:');
  }
};

const createRequest = async (req, res) => {
  try {
    const prestadorId = await getCurrentPrestadorId(req);
    if (!prestadorId) return res.status(404).json({ message: 'No hay prestador configurado' });
    const affiliateId = Number(req.body.afiliadoId || req.body.affiliateId);
    if (!affiliateId) throw new HttpError(400, 'El afiliado es requerido');
    const affiliate = await ensureAffiliate(affiliateId);
    const tipo = requireText(req.body.tipo, 'tipo', 'El tipo de solicitud es requerido');
    const descripcion = requireText(req.body.descripcion, 'descripcion', 'La descripción es requerida');
    const fecha = assertISODate(toISODate(req.body.fecha) || new Date().toISOString().slice(0, 10));
    const adjunto = req.body.adjunto || null;
    if (adjunto && !adjunto.nombre) throw new HttpError(422, 'El adjunto informado no es válido');

    const request = await db.transaction(async (trx) => {
      const created = await prestadoresRepository.createRequest(prestadorId, {
        affiliateId,
        afiliado: affiliateName(affiliate),
        tipo,
        estado: 'Pendiente',
        fecha,
        descripcion,
        adjunto,
      }, trx);
      await prestadoresRepository.createWorkflowAuditLog(trx, {
        prestadorId,
        affiliateId,
        userId: getUserId(req),
        module: 'solicitudes',
        action: 'crear',
        metadata: { solicitudId: created.id, tipo }
      });
      return created;
    });

    await notify('REQ_STATUS', affiliate.email, {
      name: affiliateName(affiliate),
      type: tipo,
      requestNumber: request.request_number || '',
      status: 'Pendiente',
      date: fecha,
      motivo: '',
    });

    return res.status(201).json(serializeRequest(request));
  } catch (error) {
    return sendError(res, error, 'Error createRequest:');
  }
};

const getAppointments = async (req, res) => {
  try {
    const prestadorId = await getCurrentPrestadorId(req);
    const date = req.query.date;

    if (!prestadorId) return res.status(404).json({ message: 'No hay prestador configurado' });
    if (!date) return res.status(400).json({ message: 'La fecha es requerida' });
    assertISODate(date);

    const appointments = await prestadoresRepository.getAppointmentsByDate(prestadorId, date);
    return res.status(200).json(appointments.map(serializeAppointment));
  } catch (error) {
    return sendError(res, error, 'Error getAppointments:');
  }
};

const getAppointmentsByMonth = async (req, res) => {
  try {
    const prestadorId = await getCurrentPrestadorId(req);
    const { year, month } = req.query;

    if (!year || !month) return res.status(400).json({ message: 'El año y mes son requeridos' });
    if (!/^\d{4}$/.test(year) || !/^\d{1,2}$/.test(month)) {
      return res.status(422).json({ message: 'Año o mes inválido' });
    }

    const rows = await prestadoresRepository.getAppointmentsByMonth(prestadorId, year, month);
    const dias = rows.map(r => {
      const dateStr = r.appointment_date instanceof Date
        ? r.appointment_date.toISOString().split('T')[0]
        : String(r.appointment_date).split('T')[0];
      return parseInt(dateStr.split('-')[2], 10);
    });

    return res.status(200).json(dias);
  } catch (error) {
    return sendError(res, error, 'Error getAppointmentsByMonth:');
  }
};

const createAppointment = async (req, res) => {
  try {
    const prestadorId = await getCurrentPrestadorId(req);
    if (!prestadorId) return res.status(404).json({ message: 'No hay prestador configurado' });

    const affiliateId = Number(req.body.afiliadoId || req.body.affiliateId);
    if (!affiliateId) throw new HttpError(400, 'El afiliado es requerido');
    const affiliate = await ensureAffiliate(affiliateId);
    const date = assertISODate(toISODate(req.body.fecha));
    const horaIni = req.body.horaIni || req.body.horaInicio;
    const horaFin = req.body.horaFin;
    assertTime(horaIni, 'horaInicio');
    assertTime(horaFin, 'horaFin');
    if (toMinutes(horaFin) <= toMinutes(horaIni)) throw new HttpError(422, 'La hora de fin debe ser posterior a la de inicio');
    const motivo = requireText(req.body.motivo, 'motivo', 'El motivo del turno es requerido');

    const appointment = await db.transaction(async (trx) => {
      const agenda = await prestadoresRepository.findAgendaForAppointment(prestadorId, date, horaIni, horaFin, trx);
      if (!agenda) throw new HttpError(422, 'El horario no pertenece a una agenda disponible');
      const overlap = await prestadoresRepository.hasOverlappingAppointment(prestadorId, date, horaIni, horaFin, null, trx);
      if (overlap) throw new HttpError(409, 'Ese horario ya está ocupado');

      const created = await prestadoresRepository.createAppointment(prestadorId, {
        affiliateId,
        agendaId: agenda.id,
        especialidadId: agenda.especialidad_id,
        lugarId: agenda.lugar_id,
        afiliado: affiliateName(affiliate),
        date,
        horaIni,
        horaFin,
        motivo,
        notas: req.body.notas,
        estado: 'reservado'
      }, trx);
      await prestadoresRepository.createWorkflowAuditLog(trx, {
        prestadorId,
        affiliateId,
        userId: getUserId(req),
        module: 'turnos',
        action: 'crear',
        metadata: { turnoId: created.id, fecha: date, horaIni, horaFin }
      });
      return created;
    });

    await notify('APPT_CREATE', affiliate.email, {
        name: affiliateName(affiliate),
        date,
        time: `${horaIni} - ${horaFin}`,
        doctor: req.user?.first_name || '',
        motivo
      });
      return res.status(201).json(serializeAppointment(appointment));
  } catch (error) {
    return sendError(res, error, 'Error createAppointment:');
  }
};

const updateAppointmentNote = async (req, res) => {
  try {
    const prestadorId = await getCurrentPrestadorId(req);
    const { id } = req.params;
    const { nota } = req.body;
    if (!prestadorId) return res.status(404).json({ message: 'No hay prestador configurado' });
    const text = requireText(nota, 'nota', 'La nota es requerida');

    const appointment = await db.transaction(async (trx) => {
      const updated = await prestadoresRepository.updateAppointmentNote(id, text, trx);
      if (!updated || updated.prestador_id !== prestadorId) throw new HttpError(404, 'El turno no existe');
      await prestadoresRepository.createWorkflowAuditLog(trx, {
        prestadorId,
        affiliateId: updated.affiliate_id,
        userId: getUserId(req),
        module: 'turnos',
        action: 'agregar_nota',
        metadata: { turnoId: updated.id }
      });
      return updated;
    });

    return res.status(200).json(serializeAppointment(appointment));
  } catch (error) {
    return sendError(res, error, 'Error updateAppointmentNote:');
  }
};

const updateAppointmentStatus = async (req, res) => {
  try {
    const prestadorId = await getCurrentPrestadorId(req);
    const { id } = req.params;
    const estado = req.body.estado;
    const motivo = String(req.body.motivo || '').trim();
    if (!prestadorId) return res.status(404).json({ message: 'No hay prestador configurado' });
    if (!ESTADOS_TURNO.has(estado)) throw new HttpError(422, 'Estado de turno inválido');
    if (['cancelado', 'ausente'].includes(estado) && !motivo) {
      throw new HttpError(400, 'El motivo es requerido para cancelar o marcar ausente el turno');
    }

    const appointment = await db.transaction(async (trx) => {
      const updated = await prestadoresRepository.updateAppointmentStatus(id, prestadorId, {
        estado,
        nota: req.body.nota,
        motivoCancelacion: motivo
      }, trx);
      if (!updated) throw new HttpError(404, 'El turno no existe');

      if (estado === 'atendido' && req.body.nota) {
        await prestadoresRepository.createClinicalHistoryEntry(updated.affiliate_id, prestadorId, {
          turnoId: updated.id,
          fecha: updated.appointment_date,
          nota: req.body.nota,
          modalidad: 'Consulta'
        }, trx);
      }

      await prestadoresRepository.createWorkflowAuditLog(trx, {
        prestadorId,
        affiliateId: updated.affiliate_id,
        userId: getUserId(req),
        module: 'turnos',
        action: 'cambiar_estado',
        reason: motivo || null,
        metadata: { turnoId: updated.id, estado }
      });
      return updated;
    });

    // Notificar al afiliado si el estado cambia a algo relevante
    if (['confirmado', 'cancelado', 'ausente', 'atendido'].includes(estado)) {
      const affiliateData = await prestadoresRepository.getAffiliateById(appointment.affiliate_id);
      if (affiliateData) {
        await notify('APPT_STATUS', affiliateData.email, {
          name: `${affiliateData.first_name} ${affiliateData.last_name}`.trim(),
          status: estado,
          date: appointment.appointment_date instanceof Date
            ? appointment.appointment_date.toISOString().split('T')[0]
            : String(appointment.appointment_date).split('T')[0],
          motivo: motivo || '',
        });
      }
    }

    return res.status(200).json(serializeAppointment(appointment));
  } catch (error) {
    return sendError(res, error, 'Error updateAppointmentStatus:');
  }
};

const searchAffiliates = async (req, res) => {
  const query = String(req.query.q || '').trim();
  if (!query) return res.status(200).json([]);

  const affiliates = await prestadoresRepository.searchAffiliates(query);
  return res.status(200).json(affiliates.map(serializeAffiliate));
};

const getClinicalHistory = async (req, res) => {
  try {
    const { id } = req.params;
    await ensureAffiliate(id);
    await validateRelationship(req, id);
    const history = await prestadoresRepository.getClinicalHistoryByAffiliate(id);
    return res.status(200).json(history.map(serializeHistory));
  } catch (error) {
    return sendError(res, error, 'Error getClinicalHistory:');
  }
};

const createClinicalHistory = async (req, res) => {
  try {
    const prestadorId = await getCurrentPrestadorId(req);
    const { id } = req.params;
    await ensureAffiliate(id);
    await validateRelationship(req, id);
    const nota = requireText(req.body.nota, 'nota', 'La evolución es requerida');
    const fecha = assertISODate(toISODate(req.body.fecha) || new Date().toISOString().slice(0, 10));

    const entry = await db.transaction(async (trx) => {
      const created = await prestadoresRepository.createClinicalHistoryEntry(id, prestadorId, {
        fecha,
        nota,
        modalidad: req.body.modalidad || 'Consulta',
        especialidad: req.body.especialidad
      }, trx);
      await prestadoresRepository.createWorkflowAuditLog(trx, {
        prestadorId,
        affiliateId: id,
        userId: getUserId(req),
        module: 'historia_clinica',
        action: 'crear_evolucion',
        metadata: { entradaId: created.id }
      });
      return created;
    });

    return res.status(201).json(serializeHistory(entry));
  } catch (error) {
    return sendError(res, error, 'Error createClinicalHistory:');
  }
};

const getSituationTypes = async (req, res) => {
  const types = await prestadoresRepository.getSituationTypes();
  return res.status(200).json(types.map((item) => ({ idSituacion: item.id, nombre: item.name })));
};

const getSituations = async (req, res) => {
  try {
    const { affiliateId } = req.params;
    await ensureAffiliate(affiliateId);
    await validateRelationship(req, affiliateId);
    const situations = await prestadoresRepository.getSituationsByAffiliate(affiliateId);
    return res.status(200).json(situations.map(serializeSituation));
  } catch (error) {
    return sendError(res, error, 'Error getSituations:');
  }
};

const createSituation = async (req, res) => {
  try {
    const prestadorId = await getCurrentPrestadorId(req);
    const { affiliateId } = req.params;
    if (!prestadorId) return res.status(404).json({ message: 'No hay prestador configurado' });
    await ensureAffiliate(affiliateId);
    const tipo = requireText(req.body.tipo, 'tipo', 'El tipo de situación es requerido');
    const fechaInicio = assertISODate(toISODate(req.body.fechaInicio), 'fechaInicio');
    const fechaFin = req.body.fechaFin ? assertISODate(toISODate(req.body.fechaFin), 'fechaFin') : null;
    if (fechaFin && fechaFin < fechaInicio) throw new HttpError(422, 'La fecha de fin no puede ser anterior a la fecha de inicio');

    const situation = await db.transaction(async (trx) => {
      const duplicate = await prestadoresRepository.findActiveSituation(affiliateId, tipo, prestadorId, null, trx);
      if (duplicate) throw new HttpError(409, 'Ya existe una situación activa de ese tipo para el afiliado');
      const created = await prestadoresRepository.createSituation(affiliateId, {
        prestadorId,
        tipo,
        fechaInicio,
        fechaFin,
        activa: req.body.activa !== false,
        observacion: req.body.observacion,
      }, trx);
      await prestadoresRepository.createWorkflowAuditLog(trx, {
        prestadorId,
        affiliateId,
        userId: getUserId(req),
        module: 'situaciones_terapeuticas',
        action: 'crear',
        metadata: { situacionId: created.id, tipo }
      });
      return created;
    });

    return res.status(201).json(serializeSituation(situation));
  } catch (error) {
    return sendError(res, error, 'Error createSituation:');
  }
};

const updateSituation = async (req, res) => {
  try {
    const prestadorId = await getCurrentPrestadorId(req);
    const { affiliateId, situationId } = req.params;
    if (!prestadorId) return res.status(404).json({ message: 'No hay prestador configurado' });
    await ensureAffiliate(affiliateId);
    const motivoFinalizacion = String(req.body.motivoFinalizacion || req.body.motivo || '').trim();
    if (req.body.activa === false && !motivoFinalizacion) throw new HttpError(400, 'El motivo es requerido para finalizar la situación');
    const fechaInicio = req.body.fechaInicio ? assertISODate(toISODate(req.body.fechaInicio), 'fechaInicio') : undefined;
    const fechaFin = req.body.fechaFin ? assertISODate(toISODate(req.body.fechaFin), 'fechaFin') : req.body.fechaFin;
    if (fechaInicio && fechaFin && fechaFin < fechaInicio) throw new HttpError(422, 'La fecha de fin no puede ser anterior a la fecha de inicio');

    const situation = await db.transaction(async (trx) => {
      if (req.body.tipo) {
        const duplicate = await prestadoresRepository.findActiveSituation(affiliateId, req.body.tipo, prestadorId, situationId, trx);
        if (duplicate) throw new HttpError(409, 'Ya existe una situación activa de ese tipo para el afiliado');
      }
      const updated = await prestadoresRepository.updateSituation(affiliateId, situationId, {
        ...req.body,
        fechaInicio,
        fechaFin,
        motivoFinalizacion
      }, trx);
      if (!updated) throw new HttpError(404, 'La situación no existe');
      await prestadoresRepository.createWorkflowAuditLog(trx, {
        prestadorId,
        affiliateId,
        userId: getUserId(req),
        module: 'situaciones_terapeuticas',
        action: req.body.activa === false ? 'finalizar' : 'editar',
        reason: motivoFinalizacion || null,
        metadata: { situacionId: updated.id }
      });
      return updated;
    });

    return res.status(200).json(serializeSituation(situation));
  } catch (error) {
    return sendError(res, error, 'Error updateSituation:');
  }
};

const deleteSituation = async (req, res) => {
  try {
    const { affiliateId, situationId } = req.params;
    await ensureAffiliate(affiliateId);
    await validateRelationship(req, affiliateId);

    if (req.user.role === 'PRESTADOR') {
      const prestadorId = await getCurrentPrestadorId(req);
      const sit = await prestadoresRepository.getSituationById(situationId);
      if (!sit || sit.prestador_id !== prestadorId) {
        return res.status(403).json({ error: 'Acceso denegado', message: 'No tienes permiso para eliminar esta situación.' });
      }
    }

    const situation = await prestadoresRepository.deleteSituation(affiliateId, situationId);
    if (!situation) return res.status(404).json({ message: 'La situacion no existe' });
    return res.status(200).json({ message: 'OK' });
  } catch (error) {
    return sendError(res, error, 'Error deleteSituation:');
  }
};

const getNotifications = async (req, res) => {
  const prestadorId = await getCurrentPrestadorId(req);
  if (!prestadorId) return res.status(404).json({ message: 'No hay prestador configurado' });

  const notifications = await prestadoresRepository.getNotifications(prestadorId);
  return res.status(200).json(notifications.map(n => ({
    id: n.id,
    title: n.title,
    text: n.text,
    time: formatDate(n.created_at || new Date()),
    unread: n.unread,
    iconClass: n.icon_class || 'bg-teal-50 text-teal-600',
  })));
};

const markNotificationAsRead = async (req, res) => {
  const prestadorId = await getCurrentPrestadorId(req);
  const { id } = req.params;
  if (!prestadorId) return res.status(404).json({ message: 'No hay prestador configurado' });

  const notif = await prestadoresRepository.markNotificationAsRead(id, prestadorId);
  if (!notif) return res.status(404).json({ message: 'Notificación no encontrada' });
  return res.status(200).json({ message: 'OK' });
};

// ── Admin solicitudes ─────────────────────────────────────────────────────────

const serializeRequestAdmin = (r) => ({
  id: r.id,
  nro: r.request_number,
  prestador: r.prestador_first_name
    ? `${r.prestador_first_name} ${r.prestador_last_name}`.trim()
    : null,
  prestadorCuit: r.prestador_cuit || null,
  afiliado: r.affiliate_first_name
    ? `${r.affiliate_first_name} ${r.affiliate_last_name}`.trim()
    : (r.affiliate_name || null),
  credencial: r.credencial_number || null,
  tipo: r.type,
  estado: r.status,
  motivoEstado: r.status_reason || null,
  fecha: formatDate(r.request_date),
  fechaEstado: formatDate(r.updated_at || r.created_at),
  descripcion: r.description || '',
  adjunto: r.attachment_name ? {
    nombre: r.attachment_name,
    tipo: r.attachment_type,
    tamanio: r.attachment_size,
  } : null,
});

const normalizeSolicitudStatusPayload = (body = {}) => ({
  estado: body.estado || body.status,
  motivo: body.motivo || body.reason,
});

const adminGetSolicitudes = async (req, res) => {
  try {
    const { estado, status, page = 1, limit = 20 } = req.query;
    const { rows, total } = await prestadoresRepository.getAllRequestsForAdmin({
      status: estado || status || null,
      page: Number(page),
      limit: Number(limit),
    });
    return res.status(200).json({
      data: rows.map(serializeRequestAdmin),
      total,
      page: Number(page),
      totalPages: Math.ceil(total / Number(limit)),
    });
  } catch (error) {
    return sendError(res, error, 'Error adminGetSolicitudes:');
  }
};

const adminUpdateSolicitudStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { estado, motivo } = normalizeSolicitudStatusPayload(req.body);
    if (!estado || !ESTADOS_SOLICITUD.has(estado))
      return res.status(400).json({ message: 'Estado inválido' });
    if (['Aprobada', 'Rechazada', 'Observada'].includes(estado) && !String(motivo || '').trim())
      return res.status(400).json({ message: 'El motivo es requerido para este estado' });
    const updated = await prestadoresRepository.updateRequestStatusAdmin(id, {
      status: estado,
      motivo: String(motivo || '').trim() || null,
      userId: req.user.id,
    });
    if (!updated) return res.status(404).json({ message: 'Solicitud no encontrada' });
    return res.status(200).json(serializeRequestAdmin(updated));
  } catch (error) {
    return sendError(res, error, 'Error adminUpdateSolicitudStatus:');
  }
};

module.exports = {
  login,
  getDashboardStats,
  getRequests,
  createRequest,
  updateRequestStatus,
  adminGetSolicitudes,
  adminUpdateSolicitudStatus,
  getAppointments,
  getAppointmentsByMonth,
  createAppointment,
  updateAppointmentNote,
  updateAppointmentStatus,
  searchAffiliates,
  getClinicalHistory,
  createClinicalHistory,
  getSituationTypes,
  getSituations,
  createSituation,
  updateSituation,
  deleteSituation,
  getNotifications,
  markNotificationAsRead,
  _private: {
    normalizeSolicitudStatusPayload
  }
};
