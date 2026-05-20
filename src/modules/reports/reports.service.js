const db = require('../../database/db');

const toDateStr = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().split('T')[0];
  return String(value).split('T')[0];
};

const providerName = (row) => `${row.nombre || ''} ${row.apellido || ''}`.trim();

const serializeProviderRow = (row, extra = {}) => ({
  id: row.id,
  cuitCuil: row.cuit,
  nombreCompleto: providerName(row),
  tipoPrestador: row.tipo_prestador || 'profesional',
  fechaAlta: row.creado_en,
  ...extra
});

const serializeSituation = (row) => ({
  idSituacionAfiliado: row.id,
  situacion: row.tipo,
  fechaInicio: toDateStr(row.fecha_inicio),
  fechaFin: row.fecha_fin ? toDateStr(row.fecha_fin) : null,
  estado: row.activa ? 'Activa' : 'Finalizada'
});

const getDateRange = (req) => {
  const { from, to } = req.query;
  if (!from || !to) {
    const error = new Error('Debe indicar from y to');
    error.status = 400;
    throw error;
  }
  return { from: `${from} 00:00:00`, to: `${to} 23:59:59` };
};

const sendError = (res, error, fallback) => {
  if (error.status) return res.status(error.status).json({ message: error.message });
  console.error(fallback, error);
  return res.status(500).json({ message: 'Error al generar el reporte' });
};

const altasAfiliados = async (req, res) => {
  try {
    const { from, to } = getDateRange(req);
    const rows = await db('afiliados')
      .leftJoin('planes', 'afiliados.plan_id', 'planes.id')
      .whereBetween('afiliados.creado_en', [from, to])
      .select(
        'afiliados.id',
        'afiliados.nro_documento',
        'afiliados.nombre',
        'afiliados.apellido',
        'afiliados.creado_en',
        'planes.id as plan_id',
        'planes.nombre as plan_nombre'
      )
      .orderBy('afiliados.creado_en', 'desc');

    return res.status(200).json(rows.map((row) => ({
      id: row.id,
      dni: row.nro_documento,
      nombre: row.nombre,
      apellido: row.apellido,
      plan: { idPlan: row.plan_id, nombre: row.plan_nombre || '' },
      fechaAlta: row.creado_en
    })));
  } catch (error) {
    return sendError(res, error, 'Error altasAfiliados:');
  }
};

const altasPrestadores = async (req, res) => {
  try {
    const { from, to } = getDateRange(req);
    const rows = await db('prestadores')
      .whereBetween('creado_en', [from, to])
      .orderBy('creado_en', 'desc');

    return res.status(200).json(rows.map((row) => serializeProviderRow(row)));
  } catch (error) {
    return sendError(res, error, 'Error altasPrestadores:');
  }
};

const prestadoresPorEspecialidad = async (req, res) => {
  try {
    const { specialtyId } = req.query;
    if (!specialtyId) return res.status(400).json({ message: 'specialtyId es requerido' });

    const rows = await db('prestadores as p')
      .join('prestador_especialidades as pe', 'p.id', 'pe.prestador_id')
      .join('especialidades as e', 'pe.especialidad_id', 'e.id')
      .where('e.id', specialtyId)
      .select('p.*', 'e.nombre as especialidad_nombre')
      .orderBy('p.apellido')
      .orderBy('p.nombre');

    return res.status(200).json(rows.map((row) => serializeProviderRow(row, {
      especialidadNombre: row.especialidad_nombre
    })));
  } catch (error) {
    return sendError(res, error, 'Error prestadoresPorEspecialidad:');
  }
};

const prestadoresPorCodigoPostal = async (req, res) => {
  try {
    const { cp } = req.query;
    if (!cp) return res.status(400).json({ message: 'cp es requerido' });

    const rows = await db('prestadores as p')
      .join('lugares_atencion as l', 'p.id', 'l.prestador_id')
      .where('l.cp', cp)
      .select('p.*', 'l.cp as codigo_postal')
      .distinct()
      .orderBy('p.apellido')
      .orderBy('p.nombre');

    return res.status(200).json(rows.map((row) => serializeProviderRow(row, {
      codigoPostal: row.codigo_postal
    })));
  } catch (error) {
    return sendError(res, error, 'Error prestadoresPorCodigoPostal:');
  }
};

const prestadoresSinAgendas = async (req, res) => {
  try {
    const rows = await db('prestadores as p')
      .leftJoin('agendas as a', 'p.id', 'a.prestador_id')
      .whereNull('a.id')
      .select('p.*')
      .orderBy('p.apellido')
      .orderBy('p.nombre');

    return res.status(200).json(rows.map((row) => serializeProviderRow(row)));
  } catch (error) {
    return sendError(res, error, 'Error prestadoresSinAgendas:');
  }
};

const findAffiliateByDni = (dni) => db('afiliados')
  .leftJoin('planes', 'afiliados.plan_id', 'planes.id')
  .select('afiliados.*', 'planes.nombre as plan_nombre')
  .where('afiliados.nro_documento', dni)
  .first();

const situacionesPorAfiliado = async (req, res) => {
  try {
    const { dni } = req.query;
    if (!dni) return res.status(400).json({ message: 'dni es requerido' });

    const affiliate = await findAffiliateByDni(dni);
    if (!affiliate) return res.status(404).json({ message: 'Afiliado no encontrado' });

    const rows = await db('prestador_affiliate_situations')
      .where('afiliado_id', affiliate.id)
      .orderBy('fecha_inicio', 'desc')
      .orderBy('id', 'desc');

    return res.status(200).json({
      afiliado: {
        dni: affiliate.nro_documento,
        nombre: affiliate.nombre,
        apellido: affiliate.apellido
      },
      situaciones: rows.map(serializeSituation)
    });
  } catch (error) {
    return sendError(res, error, 'Error situacionesPorAfiliado:');
  }
};

const situacionesPorGrupo = async (req, res) => {
  try {
    const { dni } = req.query;
    if (!dni) return res.status(400).json({ message: 'dni es requerido' });

    const affiliate = await findAffiliateByDni(dni);
    if (!affiliate) return res.status(404).json({ message: 'Afiliado no encontrado' });

    const holderId = affiliate.afiliado_titular_id || affiliate.id;
    const members = await db('afiliados')
      .where('id', holderId)
      .orWhere('afiliado_titular_id', holderId)
      .orderBy('afiliado_titular_id', 'asc')
      .orderBy('id', 'asc');
    const situations = await db('prestador_affiliate_situations')
      .whereIn('afiliado_id', members.map((member) => member.id))
      .orderBy('fecha_inicio', 'desc')
      .orderBy('id', 'desc');

    const byAffiliate = situations.reduce((acc, row) => {
      acc[row.afiliado_id] = acc[row.afiliado_id] || [];
      acc[row.afiliado_id].push(serializeSituation(row));
      return acc;
    }, {});

    return res.status(200).json(members.map((member) => ({
      dni: member.nro_documento,
      nombre: member.nombre,
      apellido: member.apellido,
      parentesco: member.parentesco || (member.afiliado_titular_id ? 'Familiar a cargo' : 'Titular'),
      situaciones: byAffiliate[member.id] || []
    })));
  } catch (error) {
    return sendError(res, error, 'Error situacionesPorGrupo:');
  }
};

module.exports = {
  altasAfiliados,
  altasPrestadores,
  prestadoresPorEspecialidad,
  prestadoresPorCodigoPostal,
  prestadoresSinAgendas,
  situacionesPorAfiliado,
  situacionesPorGrupo
};
