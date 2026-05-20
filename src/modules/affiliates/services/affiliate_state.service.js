const affiliateStateRepository = require('../repository/affiliate_state.repository');

const createAffiliateState = async (req, res) => {
    const { affiliate_id, state, modificated_by } = req.body;
    const newAffiliateState = await affiliateStateRepository.createAffiliateState(affiliate_id, state, modificated_by);
    return res.status(201).json({ message: 'Estado del afiliado creado exitosamente' });
}

const updateAffiliateState = async (req, res) => {
    const { affiliate_id, state, modificated_by } = req.body;
    const updatedAffiliateState = await affiliateStateRepository.updateAffiliateState(affiliate_id, state, modificated_by);
    return res.status(200).json({ message: 'Estado del afiliado actualizado exitosamente' });
}

module.exports = {
    createAffiliateState,
    updateAffiliateState
}