const express = require('express');
const router = express.Router();

// services
const affiliatesService = require('../services/affiliates.service');

// middleware
const authorize = require('../../auth/middleware/token.middleware');
const upload = require('../../../middlewares/upload');

/**
 * @swagger
 * /affiliates:
 *   get:
 *     summary: Obtiene todos los afiliados por estado
 *     tags: [Affiliates]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: status
 *         in: query
 *         required: false
 *         schema:
 *           type: boolean
 *     responses:
 *       200:
 *         description: Afiliados obtenidos correctamente
 */
router.get('/', authorize('ADMIN'), affiliatesService.getAffiliatesList);

// Turnos del afiliado autenticado
router.get('/turnos/disponibles', authorize('AFILIADO'), affiliatesService.getAvailableSlots);
router.get('/turnos', authorize('AFILIADO'), affiliatesService.getMyAppointments);
router.post('/turnos', authorize('AFILIADO'), affiliatesService.bookAppointment);
router.put('/turnos/:id/cancelar', authorize('AFILIADO'), affiliatesService.cancelAppointment);

/**
 * @swagger
 * /affiliates/{id}:
 *   get:
 *     summary: Obtiene un afiliado por ID
 *     tags: [Affiliates]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Afiliado obtenido correctamente
 */
router.get('/:id', authorize('ADMIN'), affiliatesService.getAffiliateById);

/**
 * @swagger
 * /affiliates/{id}/activate:
 *   put:
 *     summary: Activa un afiliado
 *     tags: [Affiliates]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Afiliado activado correctamente
 */
router.put('/:id/activate', authorize('ADMIN'), affiliatesService.activateAffiliate);

/**
 * @swagger
 * /affiliates/{id}/deactivate:
 *   put:
 *     summary: Desactiva un afiliado
 *     tags: [Affiliates]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Afiliado desactivado correctamente
 */
router.put('/:id/deactivate', authorize('ADMIN'), affiliatesService.deactivateAffiliate);

/**
 * @swagger
 * /affiliates:
 *   post:
 *     summary: Crea un nuevo afiliado
 *     tags: [Affiliates]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               document_number:
 *                 type: string
 *               document_type:
 *                 type: string
 *     responses:
 *       200:
 *         description: Afiliado creado correctamente
 */
router.post('/', authorize('ADMIN'), upload.fields([
  { name: 'dni_document', maxCount: 1 },
  { name: 'payslip_document', maxCount: 1 }
]), affiliatesService.createAffiliate);

module.exports = router;
