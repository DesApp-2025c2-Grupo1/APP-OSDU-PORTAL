const db = require('../../../database/db');

const getActorUserId = (req) => req.user?.id || req.user?.id_usuario || req.user?.userId || null;

const createPrestadorAuditLog = async (trx, req, { prestadorId, action, reason = null, metadata = {} }) => {
  if (!prestadorId) return;

  await trx('prestador_audit_logs').insert({
    prestador_id: prestadorId,
    admin_user_id: getActorUserId(req),
    action,
    reason: reason || null,
    metadata: JSON.stringify({
      actorRole: req.user?.role || null,
      ...metadata
    }),
    created_at: trx.fn.now()
  });
};

// Carga todas las agendas enriquecidas con un único JOIN — evita N+1
const fetchAgendasWithJoins = async (whereClause = {}) => {
  return db('agendas as a')
    .leftJoin('prestadores as p', 'a.prestador_id', 'p.id')
    .leftJoin('especialidades as e', 'a.especialidad_id', 'e.id')
    .leftJoin('lugares_atencion as l', 'a.lugar_id', 'l.id')
    .where(whereClause)
    .select(
      'a.id',
      'a.prestador_id',
      'a.especialidad_id',
      'a.lugar_id',
      'a.duracion_turno',
      'a.fecha_inicio',
      'a.fecha_fin',
      'a.esta_activo',
      'a.bloques',
      'p.nombre as prestador_first_name',
      'p.apellido as prestador_last_name',
      'p.cuit as prestador_cuit',
      'p.tipo_prestador',
      'e.nombre as especialidad_nombre',
      'l.calle as lugar_calle',
      'l.localidad as lugar_localidad',
      'l.provincia as lugar_provincia',
      'l.cp as lugar_cp'
    );
};

const serializeAgenda = (row) => ({
  id: String(row.id),
  prestador: row.prestador_first_name
    ? `${row.prestador_first_name} ${row.prestador_last_name}`.trim()
    : '',
  cuitCuil: row.prestador_cuit || '',
  tipoPrestador: row.tipo_prestador || '',
  especialidad: row.especialidad_nombre || '',
  idEspecialidad: row.especialidad_id,
  lugar: row.lugar_calle
    ? `${row.lugar_calle}, ${row.lugar_localidad || ''}`.trim().replace(/,$/, '')
    : '',
  idLugar: row.lugar_id,
  lugarCompleto: row.lugar_calle ? {
    idLugar: row.lugar_id,
    direccion: row.lugar_calle,
    localidad: row.lugar_localidad || '',
    provincia: row.lugar_provincia || '',
    codigoPostal: row.lugar_cp || ''
  } : null,
  duracion: row.duracion_turno,
  fechaInicio: row.fecha_inicio || '',
  fechaFin: row.fecha_fin || null,
  estaActivo: row.esta_activo,
  bloques: row.bloques || [],
  dias: row.bloques ? [...new Set(row.bloques.flatMap(b => b.dias))] : [],
  diasCompletos: row.bloques ? [...new Set(row.bloques.flatMap(b => b.dias))] : [],
  horario: ''
});

const sendError = (res, e, context) => {
  console.error(`[AGENDAS] Error en ${context}:`, e.message);
  return res.status(500).json({ message: 'Error interno del servidor' });
};

const normalizeAgendaQuery = (query = {}) => ({
  ...query,
  cuitCuil: query.cuitCuil || query.cuit || query.prestadorCuit,
  idEspecialidad: query.idEspecialidad || query.especialidadId || query.specialtyId,
});

const normalizeAgendaPayload = (body = {}) => ({
  ...body,
  cuitCuil: body.cuitCuil || body.cuit || body.prestadorCuit,
  idEspecialidad: body.idEspecialidad || body.especialidadId || body.specialtyId,
  idLugar: body.idLugar || body.lugarId || body.placeId,
  duracionTurno: body.duracionTurno || body.duracion || body.duration,
  fechaInicio: body.fechaInicio || body.fecha_inicio || body.startDate,
  fechaFin: body.fechaFin || body.fecha_fin || body.endDate,
  estaActivo: body.estaActivo ?? body.activo ?? body.active,
  bloques: body.bloques || body.blocks,
});

// Devuelve el prestador_id del usuario autenticado, o null si es ADMIN
const getPrestadorIdFromReq = async (req) => {
  const role = req.user?.role;
  if (role !== 'PRESTADOR') return null;
  const userId = req.user?.id || req.user?.id_usuario;
  const p = await db('prestadores').where('user_id', userId).first();
  return p ? p.id : null;
};

const getAll = async (req, res) => {
  try {
    const { cuitCuil, idEspecialidad } = normalizeAgendaQuery(req.query);
    const filters = {};

    if (cuitCuil) {
      const p = await db('prestadores').where('cuit', cuitCuil).first();
      if (!p) return res.status(200).json([]);
      filters['a.prestador_id'] = p.id;
    }
    if (idEspecialidad) {
      filters['a.especialidad_id'] = idEspecialidad;
    }

    const rows = await fetchAgendasWithJoins(filters);
    return res.status(200).json(rows.map(serializeAgenda));
  } catch (e) {
    return sendError(res, e, 'getAll');
  }
};

const getById = async (req, res) => {
  try {
    const rows = await fetchAgendasWithJoins({ 'a.id': req.params.id });
    if (!rows.length) return res.status(404).json({ message: 'Agenda no encontrada' });
    return res.status(200).json(serializeAgenda(rows[0]));
  } catch (e) {
    return sendError(res, e, 'getById');
  }
};

const create = async (req, res) => {
  try {
    const { cuitCuil, idEspecialidad, idLugar, duracionTurno, bloques, fechaInicio, fechaFin } = normalizeAgendaPayload(req.body);

    if (!cuitCuil) return res.status(400).json({ message: 'cuitCuil es requerido' });
    if (!idEspecialidad) return res.status(400).json({ message: 'idEspecialidad es requerido' });
    if (!idLugar) return res.status(400).json({ message: 'idLugar es requerido' });

    const p = await db('prestadores').where('cuit', cuitCuil).first();
    if (!p) return res.status(404).json({ message: 'Prestador no encontrado' });

    // Un PRESTADOR solo puede crear agendas para sí mismo
    if (req.user?.role === 'PRESTADOR') {
      const userId = req.user?.id || req.user?.id_usuario;
      const own = await db('prestadores').where('user_id', userId).first();
      if (!own || own.id !== p.id) {
        return res.status(403).json({ message: 'No tienes permiso para crear agendas de otro prestador' });
      }
    }

    const id = await db.transaction(async (trx) => {
      const [newId] = await trx('agendas').insert({
        prestador_id: p.id,
        especialidad_id: idEspecialidad,
        lugar_id: idLugar,
        duracion_turno: duracionTurno ?? 30,
        fecha_inicio: fechaInicio || null,
        fecha_fin: fechaFin || null,
        bloques: JSON.stringify(bloques || [])
      }).returning('id');

      const agendaId = newId.id ?? newId;
      await createPrestadorAuditLog(trx, req, {
        prestadorId: p.id,
        action: 'agenda_create',
        metadata: { agendaId, idEspecialidad, idLugar, duracionTurno: duracionTurno ?? 30 }
      });
      return agendaId;
    });

    const rows = await fetchAgendasWithJoins({ 'a.id': id });
    return res.status(201).json(serializeAgenda(rows[0]));
  } catch (e) {
    return sendError(res, e, 'create');
  }
};

const update = async (req, res) => {
  try {
    const existing = await db('agendas').where('id', req.params.id).first();
    if (!existing) return res.status(404).json({ message: 'Agenda no encontrada' });

    // Un PRESTADOR solo puede modificar sus propias agendas
    if (req.user?.role === 'PRESTADOR') {
      const userId = req.user?.id || req.user?.id_usuario;
      const own = await db('prestadores').where('user_id', userId).first();
      if (!own || own.id !== existing.prestador_id) {
        return res.status(403).json({ message: 'No tienes permiso para modificar agendas de otro prestador' });
      }
    }

    const { cuitCuil, idEspecialidad, idLugar, duracionTurno, bloques, fechaInicio, fechaFin, estaActivo } = normalizeAgendaPayload(req.body);
    const updateData = {};

    if (cuitCuil) {
      const p = await db('prestadores').where('cuit', cuitCuil).first();
      if (p) updateData.prestador_id = p.id;
    }
    if (idEspecialidad !== undefined) updateData.especialidad_id = idEspecialidad;
    if (idLugar !== undefined) updateData.lugar_id = idLugar;
    if (duracionTurno !== undefined) updateData.duracion_turno = duracionTurno;
    if (fechaInicio !== undefined) updateData.fecha_inicio = fechaInicio;
    if (fechaFin !== undefined) updateData.fecha_fin = fechaFin;
    if (bloques !== undefined) updateData.bloques = JSON.stringify(bloques);
    if (estaActivo !== undefined) updateData.esta_activo = estaActivo;

    if (Object.keys(updateData).length > 0) {
      await db.transaction(async (trx) => {
        await trx('agendas').where('id', req.params.id).update(updateData);
        await createPrestadorAuditLog(trx, req, {
          prestadorId: updateData.prestador_id || existing.prestador_id,
          action: 'agenda_update',
          metadata: { agendaId: existing.id, changedFields: Object.keys(updateData) }
        });
      });
    }

    const rows = await fetchAgendasWithJoins({ 'a.id': req.params.id });
    return res.status(200).json(serializeAgenda(rows[0]));
  } catch (e) {
    return sendError(res, e, 'update');
  }
};

const remove = async (req, res) => {
  try {
    const existing = await db('agendas').where('id', req.params.id).first();
    if (!existing) return res.status(404).json({ message: 'Agenda no encontrada' });

    await db.transaction(async (trx) => {
      await trx('agendas').where('id', req.params.id).del();
      await createPrestadorAuditLog(trx, req, {
        prestadorId: existing.prestador_id,
        action: 'agenda_delete',
        reason: req.body?.motivo || null,
        metadata: { agendaId: existing.id }
      });
    });
    return res.status(200).json({ message: 'Agenda eliminada' });
  } catch (e) {
    return sendError(res, e, 'remove');
  }
};

module.exports = {
  getAll, getById, create, update, remove,
  _private: {
    normalizeAgendaPayload,
    normalizeAgendaQuery
  }
};
