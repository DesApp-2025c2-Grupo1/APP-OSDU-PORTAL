const db = require('../../../database/db');

const getAll = async (req, res) => {
  try {
    const specialties = await db('especialidades').select('*');
    // frontend expects an array of Especialidad: {id, nombre}
    return res.status(200).json(specialties.map(e => ({ id: e.id, nombre: e.nombre })));
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

const getById = async (req, res) => {
  try {
    const e = await db('especialidades').where('id', req.params.id).first();
    if (!e) return res.status(404).json({ error: 'Specialty not found' });
    
    return res.status(200).json({ id: e.id, nombre: e.nombre });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

module.exports = { getAll, getById };
