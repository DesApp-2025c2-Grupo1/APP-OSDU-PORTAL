const express = require('express');
const router = express.Router();
const agendasService = require('../services/agendas.service');
const authorize = require('../../auth/middleware/token.middleware');

router.get('/', authorize('ADMIN', 'PRESTADOR', 'AFILIADO'), agendasService.getAll);
router.get('/:id', authorize('ADMIN', 'PRESTADOR', 'AFILIADO'), agendasService.getById);
router.post('/', authorize('ADMIN', 'PRESTADOR'), agendasService.create);
router.put('/:id', authorize('ADMIN', 'PRESTADOR'), agendasService.update);
router.delete('/:id', authorize('ADMIN'), agendasService.remove);

module.exports = router;
