const express = require('express');
const router = express.Router();

const familyGroupService = require('../services/family_group.service');
const authorize = require('../../auth/middleware/token.middleware');

router.get('/:id', authorize('AFILIADO', 'ADMIN'), familyGroupService.getFamilyGroupById);
router.post('/', authorize('ADMIN'), familyGroupService.createFamilyGroup);
router.delete('/:id', authorize('AFILIADO', 'ADMIN'), familyGroupService.deleteFamilyGroup);

module.exports = router;
