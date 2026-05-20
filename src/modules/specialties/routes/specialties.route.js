const express = require('express');
const router = express.Router();
const specialtiesService = require('../services/specialties.service');
const authorize = require('../../auth/middleware/token.middleware');

router.get('/', authorize('ADMIN', 'PRESTADOR', 'AFILIADO'), specialtiesService.getAll);
router.get('/:id', authorize('ADMIN', 'PRESTADOR', 'AFILIADO'), specialtiesService.getById);

module.exports = router;
