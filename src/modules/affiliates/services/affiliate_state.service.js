const affiliateStateRepository = require('../repository/affiliate_state.repository');

const createAffiliateState = async (req, res) => {
    try {
        const { affiliate_id, state, modificated_by } = req.body;
        if (!affiliate_id || state === undefined) {
            return res.status(400).json({ message: 'affiliate_id y state son requeridos' });
        }
        await affiliateStateRepository.createAffiliateState(affiliate_id, state, modificated_by);
        return res.status(201).json({ message: 'Estado del afiliado creado exitosamente' });
    } catch (error) {
        console.error('[AFFILIATE_STATE] Error en createAffiliateState:', error.message);
        return res.status(500).json({ message: 'Error interno al crear el estado del afiliado' });
    }
};

const updateAffiliateState = async (req, res) => {
    try {
        const { affiliate_id, state, modificated_by } = req.body;
        if (!affiliate_id || state === undefined) {
            return res.status(400).json({ message: 'affiliate_id y state son requeridos' });
        }
        await affiliateStateRepository.updateAffiliateState(affiliate_id, state, modificated_by);
        return res.status(200).json({ message: 'Estado del afiliado actualizado exitosamente' });
    } catch (error) {
        console.error('[AFFILIATE_STATE] Error en updateAffiliateState:', error.message);
        return res.status(500).json({ message: 'Error interno al actualizar el estado del afiliado' });
    }
};

module.exports = {
    createAffiliateState,
    updateAffiliateState,
};
