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

const serializeAgenda = async (a) => {
  const p = await db('prestadores').where('id', a.prestador_id).first();
  const esp = await db('especialidades').where('id', a.especialidad_id).first();
  const lugar = await db('lugares_atencion').where('id', a.lugar_id).first();

  return {
    id: String(a.id),
    prestador: p ? `${p.first_name} ${p.last_name}` : '',
    cuitCuil: p ? p.cuit : '',
    tipoPrestador: p ? p.tipo_prestador : '',
    especialidad: esp ? esp.nombre : '',
    idEspecialidad: a.especialidad_id,
    lugar: lugar ? `${lugar.calle}, ${lugar.localidad || ''}` : '',
    idLugar: a.lugar_id,
    lugarCompleto: lugar ? {
      idLugar: lugar.id,
      direccion: lugar.calle,
      localidad: lugar.localidad || '',
      provincia: lugar.provincia || '',
      codigoPostal: lugar.cp || ''
    } : null,
    duracion: a.duracion_turno,
    fechaInicio: a.fecha_inicio || '',
    fechaFin: a.fecha_fin || null,
    estaActivo: a.esta_activo,
    bloques: a.bloques || [],
    dias: a.bloques ? [...new Set(a.bloques.flatMap(b => b.dias))] : [],
    diasCompletos: a.bloques ? [...new Set(a.bloques.flatMap(b => b.dias))] : [],
    horario: '' // mocked summary
  };
};

const getAll = async (req, res) => {
  try {
    const { cuitCuil, idEspecialidad } = req.query;
    let query = db('agendas');
    
    if (cuitCuil) {
      const p = await db('prestadores').where('cuit', cuitCuil).first();
      if (p) query = query.where('prestador_id', p.id);
      else return res.status(200).json([]);
    }
    if (idEspecialidad) {
      query = query.where('especialidad_id', idEspecialidad);
    }
    
    const agendas = await query;
    const promises = agendas.map(serializeAgenda);
    const result = await Promise.all(promises);
    return res.status(200).json(result);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};

const getById = async (req, res) => {
  try {
    const a = await db('agendas').where('id', req.params.id).first();
    if (!a) return res.status(404).json({ error: 'Agenda not found' });
    return res.status(200).json(await serializeAgenda(a));
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};

const create = async (req, res) => {
  try {
    const { cuitCuil, idEspecialidad, idLugar, duracionTurno, bloques, fechaInicio, fechaFin } = req.body;
    
    const p = await db('prestadores').where('cuit', cuitCuil).first();
    if (!p) return res.status(404).json({ error: 'Prestador no encontrado' });

    const id = await db.transaction(async (trx) => {
      const [newId] = await trx('agendas').insert({
        prestador_id: p.id,
        especialidad_id: idEspecialidad,
        lugar_id: idLugar,
        duracion_turno: duracionTurno || 30,
        fecha_inicio: fechaInicio || null,
        fecha_fin: fechaFin || null,
        bloques: JSON.stringify(bloques || [])
      }).returning('id');

      const agendaId = newId.id || newId;
      await createPrestadorAuditLog(trx, req, {
        prestadorId: p.id,
        action: 'agenda_create',
        metadata: {
          agendaId,
          idEspecialidad,
          idLugar,
          duracionTurno: duracionTurno || 30,
          fechaInicio: fechaInicio || null,
          fechaFin: fechaFin || null
        }
      });
      return agendaId;
    });

    const created = await db('agendas').where('id', id).first();
    return res.status(201).json(await serializeAgenda(created));
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};

const update = async (req, res) => {
  try {
    const { cuitCuil, idEspecialidad, idLugar, duracionTurno, bloques, fechaInicio, fechaFin } = req.body;
    const a = await db('agendas').where('id', req.params.id).first();
    if (!a) return res.status(404).json({ error: 'Agenda not found' });

    const updateData = {};
    if (cuitCuil) {
       const p = await db('prestadores').where('cuit', cuitCuil).first();
       if (p) updateData.prestador_id = p.id;
    }
    if (idEspecialidad) updateData.especialidad_id = idEspecialidad;
    if (idLugar) updateData.lugar_id = idLugar;
    if (duracionTurno) updateData.duracion_turno = duracionTurno;
    if (fechaInicio !== undefined) updateData.fecha_inicio = fechaInicio;
    if (fechaFin !== undefined) updateData.fecha_fin = fechaFin;
    if (bloques) updateData.bloques = JSON.stringify(bloques);

    if (Object.keys(updateData).length > 0) {
      await db.transaction(async (trx) => {
        await trx('agendas').where('id', req.params.id).update(updateData);
        await createPrestadorAuditLog(trx, req, {
          prestadorId: updateData.prestador_id || a.prestador_id,
          action: 'agenda_update',
          metadata: {
            agendaId: a.id,
            previousPrestadorId: a.prestador_id,
            changedFields: Object.keys(updateData)
          }
        });
      });
    }
    
    const updated = await db('agendas').where('id', req.params.id).first();
    return res.status(200).json(await serializeAgenda(updated));
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};

const remove = async (req, res) => {
  try {
    const a = await db('agendas').where('id', req.params.id).first();
    if (!a) return res.status(404).json({ error: 'Agenda not found' });

    await db.transaction(async (trx) => {
      await trx('agendas').where('id', req.params.id).del();
      await createPrestadorAuditLog(trx, req, {
        prestadorId: a.prestador_id,
        action: 'agenda_delete',
        reason: req.body?.motivo || null,
        metadata: { agendaId: a.id }
      });
    });
    return res.status(200).json({ message: 'Deleted' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};

module.exports = {
  getAll, getById, create, update, remove
};
