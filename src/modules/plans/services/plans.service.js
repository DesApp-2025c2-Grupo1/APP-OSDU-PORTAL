const db = require('../../../database/db');

const getAll = async (req, res) => {
  try {
    const plans = await db('plans').select('*');
    // Frontend expects { plans: [...] } based on planService.ts
    // or sometimes just an array, but the code says: return data.plans || [];
    return res.status(200).json({
      plans: plans.map(p => ({ idPlan: p.id, nombre: p.plan_name }))
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};

const getById = async (req, res) => {
  try {
    const p = await db('plans').where('id', req.params.id).first();
    if (!p) return res.status(404).json({ error: 'Plan not found' });
    
    return res.status(200).json({ idPlan: p.id, nombre: p.plan_name });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};

module.exports = { getAll, getById };
