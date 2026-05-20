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

router.post('/change-password', authorize('ADMIN', 'AFILIADO', 'PRESTADOR'), authService.changePassword);

router.post('/logout', (req, res) => {
    res.clearCookie('token');
    res.status(200).json({ message: 'Sesión cerrada correctamente' });
});

module.exports = router;
