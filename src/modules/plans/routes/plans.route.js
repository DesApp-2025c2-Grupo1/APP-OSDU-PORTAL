const express = require('express');
const router = express.Router();
const plansService = require('../services/plans.service');
const authorize = require('../../auth/middleware/token.middleware');

router.get('/', authorize('ADMIN', 'AFILIADO', 'PRESTADOR'), plansService.getAll);
router.get('/:id', authorize('ADMIN', 'AFILIADO', 'PRESTADOR'), plansService.getById);

module.exports = router;
