const express = require('express');
const router = express.Router();

const authorize = require('../auth/middleware/token.middleware');
const reportsService = require('./reports.service');

router.get('/altas-afiliados', authorize('ADMIN'), reportsService.altasAfiliados);
router.get('/altas-prestadores', authorize('ADMIN'), reportsService.altasPrestadores);
router.get('/prestadores-por-especialidad', authorize('ADMIN'), reportsService.prestadoresPorEspecialidad);
router.get('/prestadores-por-codigo-postal', authorize('ADMIN'), reportsService.prestadoresPorCodigoPostal);
router.get('/prestadores-sin-agendas', authorize('ADMIN'), reportsService.prestadoresSinAgendas);
router.get('/situaciones-por-afiliado', authorize('ADMIN'), reportsService.situacionesPorAfiliado);
router.get('/situaciones-por-grupo', authorize('ADMIN'), reportsService.situacionesPorGrupo);

module.exports = router;
