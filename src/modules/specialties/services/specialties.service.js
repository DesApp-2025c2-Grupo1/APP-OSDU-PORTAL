const db = require('../../../database/db');
const { sendError } = require('../../../utils/api-error');

const getAll = async (req, res) => {
  try {
    const specialties = await db('especialidades').select('*');
    // frontend expects an array of Especialidad: {id, nombre}
    return res.status(200).json(specialties.map(e => ({ id: e.id, nombre: e.nombre })));
  } catch (e) {
    return sendError(res, e, 'Error al obtener especialidades');
  }
}

const getById = async (req, res) => {
  try {
    const e = await db('especialidades').where('id', req.params.id).first();
    if (!e) return res.status(404).json({ error: 'Especialidad no encontrada', message: 'Especialidad no encontrada' });
    
    return res.status(200).json({ id: e.id, nombre: e.nombre });
  } catch (e) {
    return sendError(res, e, 'Error al obtener la especialidad');
  }
}

module.exports = { getAll, getById };
