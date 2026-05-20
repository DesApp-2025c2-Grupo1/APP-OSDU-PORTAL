const express = require('express');
const router = express.Router();

// service
const authService = require('../services/auth.service');
const authorize = require('../middleware/token.middleware');

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Inicia sesión
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Sesión iniciada correctamente
 */
router.post('/login', authService.login);

router.get('/me', authorize('ADMIN', 'AFILIADO', 'PRESTADOR'), authService.me);

/**
 * @swagger
 * /auth/change-password:
 *   post:
 *     summary: Cambia la contraseña del usuario autenticado
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nuevaPassword]
 *             properties:
 *               nuevaPassword:
 *                 type: string
 *                 minLength: 8
 *                 example: Clave123
 *                 description: Debe incluir letras, números y no contener espacios.
 *     responses:
 *       200:
 *         description: Contraseña actualizada correctamente
 *       400:
 *         description: La contraseña no cumple la política de seguridad
 */
router.post('/change-password', authorize('ADMIN', 'AFILIADO', 'PRESTADOR'), authService.changePassword);

router.post('/logout', authService.logout);

module.exports = router;
