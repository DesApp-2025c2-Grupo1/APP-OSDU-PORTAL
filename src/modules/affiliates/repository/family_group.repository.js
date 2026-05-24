const db = require('../../../database/db');

const createFamilyGroup = async (affiliate_id, credential_number, trx = db) => {
    const [row] = await trx('family_groups')
        .insert({ affiliate_id, credential_number })
        .returning('*');
    return row;
};

const getFamilyGroupById = async (id, trx = db) => {
    return trx('family_groups').where({ id }).first();
};

const deleteFamilyGroup = async (id, trx = db) => {
    const [row] = await trx('family_groups').where({ id }).del().returning('*');
    return row;
};

module.exports = {
    createFamilyGroup,
    getFamilyGroupById,
    deleteFamilyGroup,
};
