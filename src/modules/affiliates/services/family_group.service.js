const familyGroupRepository = require('../repository/family_group.repository');

const createFamilyGroup = async (req, res) => {
    const { affiliate_id, holder_credential_number } = req.body;
    await familyGroupRepository.createFamilyGroup(affiliate_id, increaseCredencialNumber(holder_credential_number));
    return res.status(201).json({ message: 'Grupo familiar creado exitosamente' });
}

//metodo auxiliar para aumentarle el numero de credencial despues del - 
const increaseCredencialNumber = async (credential_number) => {
    const [number, sequence] = credential_number.split('-');
    return `${number}-${(parseInt(sequence) + 1).toString().padStart(2, '0')}`;
}



module.exports = {
    createFamilyGroup,
}