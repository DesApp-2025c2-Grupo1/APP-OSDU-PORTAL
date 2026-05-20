const db = require('../../../database/db');

const getAllTherapeuticSituationsByAffiliateId = async (affiliate_id) => {
    const therapeuticSituations = await db('therapeutic_situations').where('id_affiliate', affiliate_id);
    return therapeuticSituations;
}

const createTherapeuticSituation = async (therapeuticSituation) => {
    const newTherapeuticSituation = await db('therapeutic_situations').insert(therapeuticSituation).returning('*');
    return newTherapeuticSituation;
}

module.exports = {
    getAllTherapeuticSituationsByAffiliateId,
    createTherapeuticSituation
}