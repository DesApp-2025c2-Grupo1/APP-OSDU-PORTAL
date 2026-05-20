const affiliateRepository = require('../repository/affiliate.repository');
const authService = require('../../auth/services/auth.service');
const affiliateModel = require('../model/affiliate.model');
const mailService = require('../../mail/mail.service');
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
  // If family_group is string (sent from FormData), parse it
  if (req.body.family_group && typeof req.body.family_group === 'string') {
    try {
      req.body.family_group = JSON.parse(req.body.family_group);
    } catch (e) {
      // Ignore if not parseable, Joi will handle validation error
    }
  }

  // 1. Validar el input
  const { error, value } = affiliateSchema.validate(req.body);
  if (error) {
    console.error("Joi Validation Error:", error.details);
    return res.status(400).json({ message: 'Datos inválidos', details: error.details });
  }

  const affiliate = new affiliateModel(value);

  // Attach document paths if uploaded
  if (req.files) {
    if (req.files.dni_document && req.files.dni_document[0]) {
      affiliate.dni_document_path = `/uploads/${req.files.dni_document[0].filename}`;
    }
    if (req.files.payslip_document && req.files.payslip_document[0]) {
      affiliate.payslip_document_path = `/uploads/${req.files.payslip_document[0].filename}`;
    }
  }

  // 2. Iniciar Transacción
  const trx = await db.transaction();

  try {
    if (await existsAffiliate(affiliate.document_number, affiliate.document_type, trx)) {
      await trx.rollback();
      return res.status(400).json({ message: 'El afiliado ya existe' });
    }

    const credencialNumber = await generateCredencialNumber(trx);
    
    // Crear usuario vinculado en la misma transacción
    const user = await authService.registerInternal(affiliate.email, trx);

    affiliate.user_id = user.id;
    affiliate.credencial_number = credencialNumber;

    const newAffiliate = await affiliateRepository.createAffiliate(affiliate, trx);

    await trx.commit();
    return res.status(200).json({ id: newAffiliate.id, message: 'Afiliado creado exitosamente' });

  } catch (error) {
    await trx.rollback();
    console.error('Error al crear afiliado:', error);
    return res.status(500).json({ message: 'Error interno al procesar la solicitud' });
  }
}

const getAffiliatesByStatus = async (req, res) => {
  const { status } = req.query;

  if (status) {
    return res.status(200).json(await affiliateRepository.getAffiliatesByStatus(status));
  }

  return res.status(200).json(await affiliateRepository.getAllAffiliates());
}

const getAffiliateById = async (req, res) => {
  const { id } = req.params;
  const affiliate = await affiliateRepository.getAffiliateById(id);

  if (!affiliate) {
    return res.status(404).json({ message: 'El afiliado no existe' });
  }

  return res.status(200).json(affiliate);
}

const getAffiliateByUserId = async (id) => {
  const affiliate = await affiliateRepository.getAffiliateByUserId(id);

  if (!affiliate) {
    return null;
  }

  return affiliate;
}

const activateAffiliate = async (req, res) => {
  const { id } = req.params;

  // Obtener el afiliado para tener su email y nombre
  const affiliate = await affiliateRepository.getAffiliateById(id);
  if (!affiliate) {
    return res.status(404).json({ message: 'El afiliado no existe' });
  }

  const result = await affiliateRepository.activateAffiliate(id);

  if (result) {
    // Enviar email de activación
    try {
      await mailService.sendEmail(
        affiliate.email,
        'Tu cuenta ha sido activada - Portal UNAHUR',
        'account_activated',
        { name: `${affiliate.first_name} ${affiliate.last_name}` }
      );
    } catch (mailError) {
      console.error('Error al enviar email de activación:', mailError);
    }
  }

  return res.status(200).json({ message: 'Afiliado activado exitosamente' });
}

const deactivateAffiliate = async (req, res) => {
  const { id } = req.params;

  // Obtener el afiliado para tener su email y nombre
  const affiliate = await affiliateRepository.getAffiliateById(id);
  if (!affiliate) {
    return res.status(404).json({ message: 'El afiliado no existe' });
  }

  const result = await affiliateRepository.deactivateAffiliate(id);

  if (result) {
    // Enviar email de desactivación
    try {
      await mailService.sendEmail(
        affiliate.email,
        'Tu cuenta ha sido desactivada - Portal UNAHUR',
        'account_deactivated',
        { name: `${affiliate.first_name} ${affiliate.last_name}` }
      );
    } catch (mailError) {
      console.error('Error al enviar email de desactivación:', mailError);
    }
  }

  return res.status(200).json({ message: 'Afiliado desactivado exitosamente' });
}


const getAllAffiliates = async (req, res) => {
  const affiliates = await affiliateRepository.getAllAffiliates();
  return res.status(200).json(affiliates);
}


/* metodos auxiliares para la creacion de un afiliado */

const existsAffiliate = async (document_number, document_type, trx) => {
  return affiliateRepository.existsAffiliate(document_number, document_type, trx);
}

const generateCredencialNumber = async (trx) => {
  const result = await affiliateRepository.getLastCredencialNumber(trx);
  const max = result ? result.max : null;

  if (!max) {
    return '0000001-01';
  }
  
  // max es algo como "0000001-01"
  const [numberPart] = max.split('-');
  const nextNumber = parseInt(numberPart) + 1;
  return `${nextNumber.toString().padStart(7, '0')}-01`;
}

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
    console.error('Error getMyAppointments:', error);
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

    const dayOfWeek = new Date(fecha + 'T00:00:00').getDay();
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
    console.error('Error getAvailableSlots:', error);
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

    return res.status(201).json({
      id: appointment.id,
      fecha: toDateStr(appointment.appointment_date),
      horaIni: appointment.start_time,
      horaFin: appointment.end_time,
      status: appointment.status,
      motivo: appointment.reason,
    });
  } catch (error) {
    console.error('Error bookAppointment:', error);
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
    if (appointment.affiliate_id !== affiliate.id)
      return res.status(403).json({ message: 'No tenés permiso para cancelar este turno' });
    if (appointment.status !== 'reservado')
      return res.status(422).json({ message: 'El turno no puede cancelarse en su estado actual' });

    const today = new Date().toISOString().split('T')[0];
    if (appointment.appointment_date < today)
      return res.status(422).json({ message: 'No se puede cancelar un turno pasado' });

    const updated = await affiliateRepository.cancelAppointment(id, motivo);
    return res.status(200).json({
      id: updated.id,
      status: updated.status,
      motivoCancelacion: updated.cancellation_reason,
    });
  } catch (error) {
    console.error('Error cancelAppointment:', error);
    return res.status(500).json({ message: 'Error al cancelar el turno' });
  }
};

module.exports = {
  createAffiliate,
  getAffiliatesByStatus,
  getAffiliateById,
  activateAffiliate,
  deactivateAffiliate,
  getAffiliateByUserId,
  getAllAffiliates,
  getMyAppointments,
  getAvailableSlots,
  bookAppointment,
  cancelAppointment,
}