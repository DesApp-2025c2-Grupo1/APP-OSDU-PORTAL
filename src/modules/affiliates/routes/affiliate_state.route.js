const express = require("express");
const router = express.Router();

const affiliate_stateService = require('../services/affiliate_state.service');
const authorize = require('../../auth/middleware/token.middleware');

/**
 * @swagger
 * /affiliate_state:
 *   put:
 *     summary: Actualiza el estado de un afiliado
 *     tags: [Affiliates]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               id:
 *                 type: string
 *               state:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Estado del afiliado actualizado correctamente
 */
router.put("/", authorize('ADMIN'), affiliate_stateService.updateAffiliateState);

module.exports = router;
