const familyGroupRepository = require('../repository/family_group.repository');

const increaseCredencialNumber = (credential_number) => {
    const [number, sequence] = credential_number.split('-');
    return `${number}-${(parseInt(sequence, 10) + 1).toString().padStart(2, '0')}`;
};

const createFamilyGroup = async (req, res) => {
    try {
        const { affiliate_id, holder_credential_number } = req.body;
        if (!affiliate_id || !holder_credential_number) {
            return res.status(400).json({ message: 'affiliate_id y holder_credential_number son requeridos' });
        }
        const credential_number = increaseCredencialNumber(holder_credential_number);
        await familyGroupRepository.createFamilyGroup(affiliate_id, credential_number);
        return res.status(201).json({ message: 'Grupo familiar creado exitosamente' });
    } catch (error) {
        console.error('[FAMILY_GROUP] Error en createFamilyGroup:', error.message);
        return res.status(500).json({ message: 'Error interno al crear el grupo familiar' });
    }
};

const getFamilyGroupById = async (req, res) => {
    try {
        const { id } = req.params;
        const group = await familyGroupRepository.getFamilyGroupById(id);
        if (!group) {
            return res.status(404).json({ message: 'Grupo familiar no encontrado' });
        }
        return res.status(200).json(group);
    } catch (error) {
        console.error('[FAMILY_GROUP] Error en getFamilyGroupById:', error.message);
        return res.status(500).json({ message: 'Error interno al obtener el grupo familiar' });
    }
};

const deleteFamilyGroup = async (req, res) => {
    try {
        const { id } = req.params;
        const deleted = await familyGroupRepository.deleteFamilyGroup(id);
        if (!deleted) {
            return res.status(404).json({ message: 'Grupo familiar no encontrado' });
        }
        return res.status(200).json({ message: 'Grupo familiar eliminado exitosamente' });
    } catch (error) {
        console.error('[FAMILY_GROUP] Error en deleteFamilyGroup:', error.message);
        return res.status(500).json({ message: 'Error interno al eliminar el grupo familiar' });
    }
};

module.exports = {
    createFamilyGroup,
    getFamilyGroupById,
    deleteFamilyGroup,
};
