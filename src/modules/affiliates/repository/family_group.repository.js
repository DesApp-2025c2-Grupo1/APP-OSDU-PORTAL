const db = require('../../../database/db');

const createFamilyGroup = async (affiliate_id, credential_number) => {
    return db('family_groups').insert({ affiliate_id, credential_number }).returning('*');
}

module.exports = {
    createFamilyGroup,
}
