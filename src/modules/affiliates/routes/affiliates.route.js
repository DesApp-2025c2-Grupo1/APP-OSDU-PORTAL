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


// Perfil y grupo familiar del afiliado autenticado
router.get('/me', authorize('AFILIADO'), affiliatesService.getMyProfile);

// Turnos del afiliado autenticado
router.get('/turnos/disponibles', authorize('AFILIADO'), affiliatesService.getAvailableSlots);
router.get('/turnos', authorize('AFILIADO'), affiliatesService.getMyAppointments);
router.post('/turnos', authorize('AFILIADO'), affiliatesService.bookAppointment);
router.put('/turnos/:id/cancelar', authorize('AFILIADO'), affiliatesService.cancelAppointment);

// Reintegros del afiliado autenticado
router.get('/reintegros', authorize('AFILIADO'), affiliatesService.getMyReintegros);
router.post('/reintegros', authorize('AFILIADO'), affiliatesService.submitReintegro);
router.put('/reintegros/:id/respuesta', authorize('AFILIADO'), affiliatesService.responderObservacion);

// Recetas del afiliado autenticado
router.get('/recetas', authorize('AFILIADO'), affiliatesService.getMyRecetas);
router.post('/recetas', authorize('AFILIADO'), affiliatesService.submitReceta);
router.put('/recetas/:id/respuesta', authorize('AFILIADO'), affiliatesService.responderRecetaObservacion);

// Autorizaciones del afiliado autenticado
router.get('/autorizaciones', authorize('AFILIADO'), affiliatesService.getMyAutorizaciones);
router.post('/autorizaciones', authorize('AFILIADO'), upload.single('orden'), affiliatesService.submitAutorizacion);
router.put('/autorizaciones/:id/respuesta', authorize('AFILIADO'), affiliatesService.responderAutorizacionObservacion);

// Admin — gestión de reintegros
router.get('/reintegros/admin', authorize('ADMIN'), affiliatesService.adminGetReintegros);
router.put('/reintegros/:id/admin/estado', authorize('ADMIN'), affiliatesService.adminUpdateReintegroStatus);

router.get('/scheduled', authorize('ADMIN'), affiliatesService.getScheduledAffiliates);
router.get('/affiliate/:identifier', authorize('ADMIN'), affiliatesService.getAffiliateByDocument);
router.get('/family/:identifier', authorize('ADMIN'), affiliatesService.getFamilyGroup);
router.post('/family/:identifier', authorize('ADMIN'), affiliatesService.createFamilyMember);
router.delete('/family/member/:identifier', authorize('ADMIN'), affiliatesService.deleteFamilyMember);
router.post('/:id/schedule-delete', authorize('ADMIN'), affiliatesService.scheduleDeleteAffiliate);

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
router.put('/:id', authorize('ADMIN'), affiliatesService.updateAffiliate);

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
 *             required: [nroDocumento, tipoDocumento, fechaNacimiento, nombre, apellido, email, telefono, idPlan]
 *             properties:
 *               nroDocumento:
 *                 type: string
 *                 example: "12345678"
 *               tipoDocumento:
 *                 type: string
 *                 example: DNI
 *               fechaNacimiento:
 *                 type: string
 *                 format: date
 *               nombre:
 *                 type: string
 *               apellido:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *               telefono:
 *                 type: string
 *               idPlan:
 *                 type: integer
 *               grupoFamiliar:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     nombreCompleto:
 *                       type: string
 *                     parentesco:
 *                       type: string
 *                     nroDocumento:
 *                       type: string
 *     responses:
 *       200:
 *         description: Afiliado creado correctamente
 */
const affiliateDocumentUpload = upload.fields([
  { name: 'dni_document', maxCount: 1 },
  { name: 'payslip_document', maxCount: 1 }
]);

router.post('/register', affiliateDocumentUpload, affiliatesService.createAffiliate);
router.post('/', authorize('ADMIN'), affiliateDocumentUpload, affiliatesService.createAffiliate);

module.exports = router;
