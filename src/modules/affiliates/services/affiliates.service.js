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
  if (req.body.family_group && typeof req.body.family_group === 'string') {
    try {
      req.body.family_group = JSON.parse(req.body.family_group);
    } catch (e) {
      // Joi manejará el error de validación
    }
  }

  const { error, value } = affiliateSchema.validate(req.body);
  if (error) {
    return res.status(400).json({ message: 'Datos inválidos', details: error.details });
  }

  const affiliate = new affiliateModel(value);

  if (req.files) {
    if (req.files.dni_document && req.files.dni_document[0]) {
      affiliate.dni_document_path = `/uploads/${req.files.dni_document[0].filename}`;
    }
    if (req.files.payslip_document && req.files.payslip_document[0]) {
      affiliate.payslip_document_path = `/uploads/${req.files.payslip_document[0].filename}`;
    }
  }

  const trx = await db.transaction();

  try {
    if (await existsAffiliate(affiliate.document_number, affiliate.document_type, trx)) {
      await trx.rollback();
      return res.status(400).json({ message: 'El afiliado ya existe' });
    }

    const credencialNumber = await generateCredencialNumber(trx);

    // registerInternal ya NO llama a notify — lo hacemos aquí después del commit
    const user = await authService.registerInternal(affiliate.email, trx);

    affiliate.user_id = user.id;
    affiliate.credencial_number = credencialNumber;

    const newAffiliate = await affiliateRepository.createAffiliate(affiliate, trx);

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

    // Solo ADMIN puede listar todos los afiliados o filtrar por estado
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({ message: 'Permisos insuficientes' });
    }

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

const serializeAppointment = (row) => ({
  id: row.id,
  fecha: toDateStr(row.appointment_date),
  horaIni: row.start_time,
  horaFin: row.end_time,
  motivo: row.reason,
  nota: row.note || null,
  status: row.status,
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

const getMyAppointments = async (req, res) => {
  try {
    const affiliate = await affiliateRepository.getAffiliateByUserId(req.user.id);
    if (!affiliate) return res.status(404).json({ message: 'Afiliado no encontrado' });

    const { status } = req.query;
    const rows = await affiliateRepository.getAppointmentsByAffiliate(affiliate.id, status || null);
    return res.status(200).json(rows.map(serializeAppointment));
  } catch (error) {
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

    const { agendaId, fecha, horaIni, horaFin, motivo } = req.body;

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
      affiliateId: affiliate.id,
      affiliateName: `${affiliate.first_name} ${affiliate.last_name}`,
      agendaId: agenda.id,
      especialidadId: agenda.especialidad_id,
      lugarId: agenda.lugar_id,
      fecha,
      horaIni,
      horaFin,
      motivo: String(motivo).trim(),
    });

    // Notificación al afiliado
    await notify('APPT_CREATE', affiliate.email, {
      name: `${affiliate.first_name} ${affiliate.last_name}`.trim(),
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
      status: appointment.status,
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

    // IDOR: verificar que el turno pertenece al afiliado autenticado
    if (appointment.affiliate_id !== affiliate.id)
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
      motivoCancelacion: updated.cancellation_reason,
    });
  } catch (error) {
    console.error('[AFFILIATES] Error cancelAppointment:', error.message);
    return res.status(500).json({ message: 'Error al cancelar el turno' });
  }
};

module.exports = {
  createAffiliate,
  getAffiliatesList,
  getAffiliateById,
  activateAffiliate,
  deactivateAffiliate,
  getAffiliateByUserId,
  getMyAppointments,
  getAvailableSlots,
  bookAppointment,
  cancelAppointment,
};
