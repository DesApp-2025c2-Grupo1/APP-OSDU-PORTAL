const db = require('../../../database/db');

const createAffiliate = async (affiliate, trx = db) => {
    const [created] = await trx('afiliados').insert(affiliate).returning('id');
    const id = created.id || created;
    const row = await getAffiliateById(id, trx);
    return [row];
}

const existsAffiliate = async (document_number, document_type, trx = db) => {
    return trx('afiliados').where({ nro_documento: document_number, tipo_documento: document_type }).first();
}

const affiliateColumns = [
    'afiliados.id',
    'afiliados.usuario_id as user_id',
    'afiliados.nro_credencial as credencial_number',
    'afiliados.nro_documento as document_number',
    'afiliados.tipo_documento as document_type',
    'afiliados.fecha_nacimiento as birth_date',
    'afiliados.nombre as first_name',
    'afiliados.apellido as last_name',
    'afiliados.telefono as phone',
    'afiliados.email',
    'afiliados.direccion as address',
    'afiliados.localidad as city',
    'afiliados.provincia as province',
    'afiliados.codigo_postal as postal_code',
    'afiliados.pais as country',
    'afiliados.activo as status',
    'afiliados.plan_id',
    'afiliados.afiliado_titular_id as holder_affiliate_id',
    'afiliados.parentesco as relationship',
    'afiliados.baja_programada_en as deactivation_scheduled_at',
    'afiliados.ruta_documento_dni as dni_document_path',
    'afiliados.ruta_recibo_sueldo as payslip_document_path',
    'afiliados.creado_en as created_at',
    'afiliados.actualizado_en as updated_at',
    'planes.nombre as plan_type',
    'planes.codigo as plan_code'
];

const getAffiliateById = async (id, trx = db) => {
    return trx('afiliados')
        .join('planes', 'afiliados.plan_id', '=', 'planes.id')
        .select(affiliateColumns)
        .where('afiliados.id', id)
        .first();
}

const affiliateWithPlanQuery = (trx = db) => trx('afiliados')
    .join('planes', 'afiliados.plan_id', '=', 'planes.id')
    .select(affiliateColumns);

const getAffiliateByIdentifier = async (identifier, trx = db) => {
    const value = String(identifier || '').trim();
    const query = affiliateWithPlanQuery(trx)
        .where('afiliados.nro_documento', value)
        .orWhere('afiliados.nro_credencial', value);

    if (/^\d+$/.test(value)) {
        query.orWhere('afiliados.id', Number(value));
    }

    return query.first();
}

const getAffiliatesByStatus = async (status, trx = db) => {
    return affiliateWithPlanQuery(trx)
        .where('afiliados.activo', status);
}

const getAllAffiliates = async (trx = db) => {
    return affiliateWithPlanQuery(trx);
}

// Metodo para obtener el afiliado por id de usuario
const getAffiliateByUserId = async (userId, trx = db) => {
    return trx('afiliados')
        .join('planes', 'afiliados.plan_id', '=', 'planes.id')
        .select(affiliateColumns)
        .where('afiliados.usuario_id', userId)
        .first();
}

const activateAffiliate = async (id, trx = db) => {
    return trx('afiliados').where({ id }).update({ activo: true, actualizado_en: trx.fn.now() });
}

const deactivateAffiliate = async (id, trx = db) => {
    return trx('afiliados').where({ id }).update({ activo: false, actualizado_en: trx.fn.now() });
}

const getLastCredencialNumber = async (trx = db) => {
    return trx('afiliados').max('nro_credencial').first();
}

const updateAffiliateById = async (id, patch, trx = db) => {
    const fieldMap = {
        user_id: 'usuario_id',
        credencial_number: 'nro_credencial',
        document_number: 'nro_documento',
        document_type: 'tipo_documento',
        birth_date: 'fecha_nacimiento',
        first_name: 'nombre',
        last_name: 'apellido',
        phone: 'telefono',
        address: 'direccion',
        city: 'localidad',
        province: 'provincia',
        postal_code: 'codigo_postal',
        country: 'pais',
        status: 'activo',
        holder_affiliate_id: 'afiliado_titular_id',
        relationship: 'parentesco',
        deactivation_scheduled_at: 'baja_programada_en',
    };
    const normalizedPatch = Object.entries(patch).reduce((acc, [key, value]) => {
        acc[fieldMap[key] || key] = value;
        return acc;
    }, {});

    const [updated] = await trx('afiliados')
        .where({ id })
        .update({ ...normalizedPatch, actualizado_en: trx.fn.now() })
        .returning('*');
    return updated;
}

const getFamilyByHolderId = async (holderId, trx = db) => {
    return affiliateWithPlanQuery(trx)
        .where('afiliados.id', holderId)
        .orWhere('afiliados.afiliado_titular_id', holderId)
        .orderBy('afiliados.afiliado_titular_id', 'asc')
        .orderBy('afiliados.id', 'asc');
}

const getScheduledDeletions = async (trx = db) => {
    return affiliateWithPlanQuery(trx)
        .whereNotNull('afiliados.baja_programada_en')
        .orderBy('afiliados.baja_programada_en', 'asc');
}

const getAppointmentsByAffiliate = async (affiliateId, status = null, trx = db) => {
    let query = trx('prestador_appointments as pa')
        .leftJoin('prestadores as p', 'pa.prestador_id', 'p.id')
        .leftJoin('especialidades as e', 'pa.especialidad_id', 'e.id')
        .leftJoin('lugares_atencion as l', 'pa.lugar_id', 'l.id')
        .select(
            'pa.id',
            'pa.afiliado_id as affiliate_id',
            'pa.fecha_turno as appointment_date',
            'pa.hora_inicio as start_time',
            'pa.hora_fin as end_time',
            'pa.motivo as reason',
            'pa.estado as status',
            'pa.motivo_cancelacion as cancellation_reason',
            'pa.nota as note',
            'p.nombre as prestador_first_name',
            'p.apellido as prestador_last_name',
            'e.nombre as especialidad',
            'l.calle as lugar_calle', 'l.localidad as lugar_localidad'
        )
        .where('pa.afiliado_id', affiliateId)
        .orderBy('pa.fecha_turno', 'desc')
        .orderBy('pa.hora_inicio', 'asc');

    if (status) query = query.where('pa.estado', status);

    return query;
};

const getAppointmentsByPrestadorAndDate = async (prestadorId, date, trx = db) => {
    return trx('prestador_appointments')
        .where({ prestador_id: prestadorId, fecha_turno: date })
        .whereNot('estado', 'cancelado')
        .select('hora_inicio as start_time', 'hora_fin as end_time');
};

const getAppointmentById = async (id, trx = db) => {
    return trx('prestador_appointments')
        .select(
            '*',
            'afiliado_id as affiliate_id',
            'fecha_turno as appointment_date',
            'hora_inicio as start_time',
            'hora_fin as end_time',
            'motivo as reason',
            'estado as status',
            'motivo_cancelacion as cancellation_reason',
            'nota as note'
        )
        .where({ id })
        .first();
};

const createAffiliateAppointment = async (data, trx = db) => {
    const [appointment] = await trx('prestador_appointments')
        .insert({
            prestador_id: data.prestadorId,
            afiliado_id: data.affiliateId,
            afiliado_nombre: data.affiliateName,
            agenda_id: data.agendaId,
            especialidad_id: data.especialidadId,
            lugar_id: data.lugarId,
            fecha_turno: data.fecha,
            hora_inicio: data.horaIni,
            hora_fin: data.horaFin,
            motivo: data.motivo,
            estado: 'reservado',
        })
        .returning('*');
    return getAppointmentById(appointment.id, trx);
};

const cancelAppointment = async (id, motivo, trx = db) => {
    const [updated] = await trx('prestador_appointments')
        .where({ id })
        .update({ estado: 'cancelado', motivo_cancelacion: motivo, actualizado_en: trx.fn.now() })
        .returning('*');
    return getAppointmentById(updated.id, trx);
};

// ── Reintegros ────────────────────────────────────────────────────────────────

const getReintegrosByAffiliate = async (affiliateId, trx = db) => {
    return trx('prestador_requests')
        .select(
            '*',
            'afiliado_id as affiliate_id',
            'nro_solicitud as request_number',
            'afiliado_nombre as affiliate_name',
            'tipo as type',
            'estado as status',
            'fecha_solicitud as request_date',
            'descripcion as description',
            'motivo_estado as status_reason',
            'respuesta_afiliado as affiliate_response',
            'creado_en as created_at',
            'actualizado_en as updated_at'
        )
        .where({ afiliado_id: affiliateId, tipo: 'Reintegro' })
        .whereNull('prestador_id')   // solo reintegros iniciados por el afiliado
        .orderBy('fecha_solicitud', 'desc')
        .orderBy('id', 'desc');
};

const createReintegro = async (affiliateId, data, trx = db) => {
    const [req] = await trx('prestador_requests')
        .insert({
            prestador_id: null,
            afiliado_id: affiliateId,
            nro_solicitud: `REI-${Date.now()}`,
            afiliado_nombre: data.affiliateName,
            tipo: 'Reintegro',
            estado: 'Pendiente',
            fecha_solicitud: data.fechaPrestacion,
            descripcion: data.observaciones || null,
            medico_nombre: data.medico,
            especialidad: data.especialidad,
            lugar_atencion: data.lugarAtencion,
            factura_cuit: data.facturaCuit,
            factura_valor_total: data.facturaValor,
            forma_pago: data.formaPago,
            cbu: data.cbu || null,
        })
        .returning('*');
    return getReintegrosByAffiliate(affiliateId, trx).where('prestador_requests.id', req.id).first();
};

const responderObservacion = async (id, affiliateId, respuesta, trx = db) => {
    const [req] = await trx('prestador_requests')
        .where({ id, afiliado_id: affiliateId, estado: 'Observada' })
        .update({ estado: 'En análisis', respuesta_afiliado: respuesta, actualizado_en: trx.fn.now() })
        .returning('*');
    return getReintegrosByAffiliate(affiliateId, trx).where('prestador_requests.id', req.id).first();
};

// ── Admin ─────────────────────────────────────────────────────────────────────

const getAllReintegrosForAdmin = async ({ status, page = 1, limit = 20 } = {}, trx = db) => {
    // Base sin select para que el count no mezcle columnas con agregados
    let base = trx('prestador_requests as pr')
        .leftJoin('afiliados as a', 'pr.afiliado_id', 'a.id')
        .where('pr.tipo', 'Reintegro')
        .whereNull('pr.prestador_id');   // solo reintegros iniciados por afiliado
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
            'pr.respuesta_afiliado as affiliate_response',
            'pr.creado_en as created_at',
            'pr.actualizado_en as updated_at',
            'a.nombre as affiliate_first_name',
            'a.apellido as affiliate_last_name',
            'a.nro_credencial as credencial_number'
        )
        .orderBy('pr.creado_en', 'desc')
        .limit(limit)
        .offset((page - 1) * limit);

    return { rows, total: Number(countResult.count) };
};

const updateReintegroStatus = async (id, { status, motivo, userId }, trx = db) => {
    const patch = { estado: status, actualizado_en: trx.fn.now() };
    if (motivo) patch.motivo_estado = motivo;
    if (['Aprobada', 'Rechazada'].includes(status)) {
        patch.resuelto_por_usuario_id = userId;
        patch.resuelto_en = trx.fn.now();
    }
    const [req] = await trx('prestador_requests')
        .where({ id, tipo: 'Reintegro' })
        .update(patch)
        .returning('*');
    return trx('prestador_requests')
        .select(
            '*',
            'afiliado_id as affiliate_id',
            'nro_solicitud as request_number',
            'afiliado_nombre as affiliate_name',
            'tipo as type',
            'estado as status',
            'fecha_solicitud as request_date',
            'descripcion as description',
            'motivo_estado as status_reason',
            'respuesta_afiliado as affiliate_response',
            'creado_en as created_at',
            'actualizado_en as updated_at'
        )
        .where({ id: req.id })
        .first();
};

module.exports = {
    createAffiliate,
    existsAffiliate,
    getAffiliateById,
    getAffiliateByIdentifier,
    getAffiliatesByStatus,
    getAllAffiliates,
    activateAffiliate,
    deactivateAffiliate,
    updateAffiliateById,
    getFamilyByHolderId,
    getScheduledDeletions,
    getAffiliateByUserId,
    getLastCredencialNumber,
    getAppointmentsByAffiliate,
    getAppointmentsByPrestadorAndDate,
    getAppointmentById,
    createAffiliateAppointment,
    cancelAppointment,
    getReintegrosByAffiliate,
    createReintegro,
    responderObservacion,
    getAllReintegrosForAdmin,
    updateReintegroStatus,
}
