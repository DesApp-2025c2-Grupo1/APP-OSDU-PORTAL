const db = require('../../../database/db');
const { sendError } = require('../../../utils/api-error');

const getAll = async (req, res) => {
  try {
    const plans = await db('planes').select('*');
    return res.status(200).json({
      plans: plans.map(p => ({ idPlan: p.id, nombre: p.nombre }))
    });
  } catch (e) {
    return sendError(res, e, 'Error al obtener planes');
  }
};

const getById = async (req, res) => {
  try {
    const p = await db('planes').where('id', req.params.id).first();
    if (!p) return res.status(404).json({ error: 'Plan no encontrado', message: 'Plan no encontrado' });
    
    return res.status(200).json({ idPlan: p.id, nombre: p.nombre });
  } catch (e) {
    return sendError(res, e, 'Error al obtener el plan');
  }
};

module.exports = { getAll, getById };
