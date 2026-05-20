const db = require('../../../database/db');

const createAffiliateState = async (affiliate_id, state, modificated_by) => {
    const newAffiliateState = await db('affiliate_states').insert({ affiliate_id, state, modificated_by }).returning('*');
    return newAffiliateState;
}

const updateAffiliateState = async (affiliate_id, state, modificated_by) => {
    const updatedAffiliateState = await db('affiliate_states').where('id_affiliate', affiliate_id).update({ state, modificated_by }).returning('*');
    return updatedAffiliateState;
}

module.exports = {
    createAffiliateState,
    updateAffiliateState
}