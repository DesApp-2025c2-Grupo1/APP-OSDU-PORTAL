const db = require('../../../database/db');

const createAffiliate = async (affiliate, trx = db) => {
    return trx('affiliates').insert(affiliate);
}

const existsAffiliate = async (document_number, document_type, trx = db) => {
    return trx('affiliates').where({ document_number, document_type }).first();
}

const getAffiliateById = async (id, trx = db) => {
    return trx('affiliates')
        .join('plans', 'affiliates.plan_id', '=', 'plans.id')
        .select('affiliates.*', 'plans.plan_name as plan_type', 'plans.plan_code')
        .where('affiliates.id', id)
        .first();
}

const getAffiliatesByStatus = async (status, trx = db) => {
    return trx('affiliates')
        .join('plans', 'affiliates.plan_id', '=', 'plans.id')
        .select('affiliates.*', 'plans.plan_name as plan_type', 'plans.plan_code')
        .where('affiliates.status', status);
}

const getAllAffiliates = async (trx = db) => {
    return trx('affiliates')
        .join('plans', 'affiliates.plan_id', '=', 'plans.id')
        .select('affiliates.*', 'plans.plan_name as plan_type', 'plans.plan_code');
}

// Metodo para obtener el afiliado por id de usuario
const getAffiliateByUserId = async (userId, trx = db) => {
    return trx('affiliates')
        .join('plans', 'affiliates.plan_id', '=', 'plans.id')
        .select('affiliates.*', 'plans.plan_name as plan_type', 'plans.plan_code')
        .where('affiliates.user_id', userId)
        .first();
}

const activateAffiliate = async (id, trx = db) => {
    return trx('affiliates').where({ id }).update({ status: true });
}

const deactivateAffiliate = async (id, trx = db) => {
    return trx('affiliates').where({ id }).update({ status: false });
}

const getLastCredencialNumber = async (trx = db) => {
    return trx('affiliates').max('credencial_number').first();
}

const getAppointmentsByAffiliate = async (affiliateId, status = null, trx = db) => {
    let query = trx('prestador_appointments as pa')
        .leftJoin('prestadores as p', 'pa.prestador_id', 'p.id')
        .leftJoin('especialidades as e', 'pa.especialidad_id', 'e.id')
        .leftJoin('lugares_atencion as l', 'pa.lugar_id', 'l.id')
        .select(
            'pa.id', 'pa.appointment_date', 'pa.start_time', 'pa.end_time',
            'pa.reason', 'pa.status', 'pa.cancellation_reason', 'pa.note',
            'p.first_name as prestador_first_name', 'p.last_name as prestador_last_name',
            'e.nombre as especialidad',
            'l.calle as lugar_calle', 'l.localidad as lugar_localidad'
        )
        .where('pa.affiliate_id', affiliateId)
        .orderBy('pa.appointment_date', 'desc')
        .orderBy('pa.start_time', 'asc');

    if (status) query = query.where('pa.status', status);

    return query;
};

const getAppointmentsByPrestadorAndDate = async (prestadorId, date, trx = db) => {
    return trx('prestador_appointments')
        .where({ prestador_id: prestadorId, appointment_date: date })
        .whereNot('status', 'cancelado')
        .select('start_time', 'end_time');
};

const getAppointmentById = async (id, trx = db) => {
    return trx('prestador_appointments').where({ id }).first();
};

const createAffiliateAppointment = async (data, trx = db) => {
    const [appointment] = await trx('prestador_appointments')
        .insert({
            prestador_id: data.prestadorId,
            affiliate_id: data.affiliateId,
            affiliate_name: data.affiliateName,
            agenda_id: data.agendaId,
            especialidad_id: data.especialidadId,
            lugar_id: data.lugarId,
            appointment_date: data.fecha,
            start_time: data.horaIni,
            end_time: data.horaFin,
            reason: data.motivo,
            status: 'reservado',
        })
        .returning('*');
    return appointment;
};

const cancelAppointment = async (id, motivo, trx = db) => {
    const [updated] = await trx('prestador_appointments')
        .where({ id })
        .update({ status: 'cancelado', cancellation_reason: motivo })
        .returning('*');
    return updated;
};

module.exports = {
    createAffiliate,
    existsAffiliate,
    getAffiliateById,
    getAffiliatesByStatus,
    getAllAffiliates,
    activateAffiliate,
    deactivateAffiliate,
    getAffiliateByUserId,
    getLastCredencialNumber,
    getAppointmentsByAffiliate,
    getAppointmentsByPrestadorAndDate,
    getAppointmentById,
    createAffiliateAppointment,
    cancelAppointment,
}