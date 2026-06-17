const db = require('../../../database/db');

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const getActorUserId = (req) => req.user?.id || req.user?.id_usuario || req.user?.userId || null;

const DIA_MAP = {
  Domingo: 0, domingo: 0, Sunday: 0,
  Lunes: 1, lunes: 1, Monday: 1,
  Martes: 2, martes: 2, Tuesday: 2,
  Miercoles: 3, miercoles: 3, Miércoles: 3, miércoles: 3, Wednesday: 3,
  Jueves: 4, jueves: 4, Thursday: 4,
  Viernes: 5, viernes: 5, Friday: 5,
  Sabado: 6, sabado: 6, Sábado: 6, sábado: 6, Saturday: 6,
};

const normalizeDia = (dia) => typeof dia === 'number' ? dia : (DIA_MAP[dia] ?? -1);

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

const toDateOnly = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).split('T')[0];
};

const toMinutes = (value) => {
  const [hh, mm] = String(value || '').split(':').map(Number);
  return hh * 60 + mm;
};

const dateRangesOverlap = (aStart, aEnd, bStart, bEnd) => {
  const startA = toDateOnly(aStart) || '0001-01-01';
  const endA = toDateOnly(aEnd) || '9999-12-31';
  const startB = toDateOnly(bStart) || '0001-01-01';
  const endB = toDateOnly(bEnd) || '9999-12-31';
  return startA <= endB && startB <= endA;
};

const blocksOverlap = (left = [], right = []) => {
  return left.some((a) => right.some((b) => {
    const aDays = (a.dias || []).map(normalizeDia).filter((dia) => dia >= 0);
    const bDays = (b.dias || []).map(normalizeDia).filter((dia) => dia >= 0);
    const sameDay = aDays.length === 0 || bDays.length === 0 || aDays.some((dia) => bDays.includes(dia));
    if (!sameDay) return false;

    return toMinutes(a.desde) < toMinutes(b.hasta) && toMinutes(b.desde) < toMinutes(a.hasta);
  }));
};

const assertNoOverlappingAgenda = async (trx, { prestadorId, fechaInicio, fechaFin, bloques, estaActivo = true, ignoreId = null }) => {
  if (!estaActivo) return;
  const nextBlocks = parseJsonArray(bloques);
  if (nextBlocks.length === 0) return;

  const query = trx('agendas')
    .where({ prestador_id: prestadorId, esta_activo: true });

  if (ignoreId) query.whereNot('id', ignoreId);

  const agendas = await query.select('id', 'fecha_inicio', 'fecha_fin', 'bloques');
  const overlapping = agendas.find((agenda) => {
    return dateRangesOverlap(fechaInicio, fechaFin, agenda.fecha_inicio, agenda.fecha_fin)
      && blocksOverlap(nextBlocks, parseJsonArray(agenda.bloques));
  });

  if (overlapping) {
    throw new HttpError(409, 'Ya existe una agenda activa para este prestador que se superpone con esos días y horarios.');
  }
};

const createPrestadorAuditLog = async (trx, req, { prestadorId, action, reason = null, metadata = {} }) => {
  if (!prestadorId) return;

  await trx('prestador_audit_logs').insert({
    prestador_id: prestadorId,
    admin_usuario_id: getActorUserId(req),
    accion: action,
    motivo: reason || null,
    metadata: JSON.stringify({
      actorRole: req.user?.role || null,
      ...metadata
    }),
    creado_en: trx.fn.now()
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
  if (e instanceof HttpError) {
    return res.status(e.status).json({ message: e.message, error: e.message });
  }

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
  const p = await db('prestadores').where('usuario_id', userId).first();
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
    if ((p.estado || (p.activo ? 'activo' : 'baja')) !== 'activo') {
      return res.status(422).json({ message: 'No se puede crear una agenda para un prestador dado de baja' });
    }

    // Un PRESTADOR solo puede crear agendas para sí mismo
    if (req.user?.role === 'PRESTADOR') {
      const userId = req.user?.id || req.user?.id_usuario;
      const own = await db('prestadores').where('usuario_id', userId).first();
      if (!own || own.id !== p.id) {
        return res.status(403).json({ message: 'No tienes permiso para crear agendas de otro prestador' });
      }
    }

    const id = await db.transaction(async (trx) => {
      await assertNoOverlappingAgenda(trx, {
        prestadorId: p.id,
        fechaInicio: fechaInicio || null,
        fechaFin: fechaFin || null,
        bloques: bloques || [],
        estaActivo: true
      });

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
      const own = await db('prestadores').where('usuario_id', userId).first();
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
        await assertNoOverlappingAgenda(trx, {
          prestadorId: updateData.prestador_id || existing.prestador_id,
          fechaInicio: updateData.fecha_inicio !== undefined ? updateData.fecha_inicio : existing.fecha_inicio,
          fechaFin: updateData.fecha_fin !== undefined ? updateData.fecha_fin : existing.fecha_fin,
          bloques: updateData.bloques !== undefined ? updateData.bloques : existing.bloques,
          estaActivo: updateData.esta_activo !== undefined ? updateData.esta_activo : existing.esta_activo,
          ignoreId: existing.id
        });

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
