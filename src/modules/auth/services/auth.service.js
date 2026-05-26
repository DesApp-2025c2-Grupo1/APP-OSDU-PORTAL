const bcrypt = require('bcryptjs');

const affiliateRepository = require('../../affiliates/repository/affiliate.repository');
const authRepository = require('../repository/auth.repository');
const { generateToken } = require('../utils/jwt.service');
const { getSessionCookieOptions, getClearSessionCookieOptions } = require('../utils/cookie-options');
const { notify } = require('../../mail/notification.service');

const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

const validatePasswordPolicy = (password) => {
    if (typeof password !== 'string' || !PASSWORD_REGEX.test(password)) {
        throw new Error('La contraseña debe tener al menos 8 caracteres, incluir mayúsculas, minúsculas y números');
    }
};

const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ message: 'Faltan datos requeridos' });
        }

        const user = await authRepository.getUserByUsername(email);

        if (!user) {
            return res.status(401).json({ message: 'Credenciales inválidas' });
        }

        if (user.role_name === 'PRESTADOR') {
            return res.status(403).json({ message: 'Acceso denegado: los prestadores deben ingresar por su portal específico' });
        }


        if (user.role_name !== 'ADMIN') {
            const affiliate = await affiliateRepository.getAffiliateByUserId(user.id);
            if (affiliate && !affiliate.status) {
                return res.status(401).json({ message: 'Su cuenta de afiliado no esta activa' });
            }
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);

        if (!isPasswordValid) {
            return res.status(401).json({ message: 'Credenciales inválidas' });
        }

        const token = await generateToken(user);

        const cookieName = user.role_name === 'ADMIN' ? 'token_admin' : 'token_affiliate';

        res.cookie(cookieName, token, getSessionCookieOptions());

        return res.status(200).json({
            message: 'OK',
            user: {
                id: user.id,
                email: user.email,
                role: user.role_name,
                debeCambiarPassword: !!user.must_change_password,
                must_change_password: !!user.must_change_password
            }
        });
    } catch (error) {
        console.error('[AUTH] Error en login:', error.message);
        return res.status(500).json({ message: 'Error interno del servidor' });
    }
};

const changePassword = async (req, res) => {
    try {
        const currentPassword = req.body.currentPassword || req.body.passwordActual;
        const newPassword = req.body.newPassword || req.body.nuevaPassword;
        const userId = req.user.id;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ message: 'La contraseña actual y la nueva contraseña son requeridas' });
        }
        if (newPassword.length < PASSWORD_MIN_LENGTH) {
            return res.status(400).json({ message: `La nueva contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres` });
        }

        if (!PASSWORD_REGEX.test(newPassword)) {
            return res.status(400).json({
                message: 'La nueva contraseña debe contener al menos una letra mayúscula, una minúscula y un número'
            });
        }

        // Una sola consulta con rol y password
        const user = await authRepository.getUserByIdFull(userId);
        if (!user) {
            return res.status(404).json({ message: 'Usuario no encontrado' });
        }

        const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
        if (!isPasswordValid) {
            return res.status(401).json({ message: 'La contraseña actual es incorrecta' });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 12);
        await authRepository.updateUserPassword(userId, hashedPassword);

        // Notificación desacoplada: no bloquea ni rompe el flujo si falla
        await notify('PWD_CHANGE', user.email, { name: user.first_name || user.email.split('@')[0] });

        return res.status(200).json({ message: 'Contraseña actualizada correctamente' });
    } catch (error) {
        console.error('[AUTH] Error en changePassword:', error.message);
        return res.status(500).json({ message: 'Error al cambiar la contraseña' });
    }
};

const me = async (req, res) => {
    try {
        const user = await authRepository.getUserById(req.user.id);

        if (!user) {
            return res.status(404).json({ message: 'Usuario no encontrado' });
        }

        return res.status(200).json({
            user: {
                id: user.id,
                email: user.email,
                role: user.role_name,
                debeCambiarPassword: !!user.must_change_password,
                must_change_password: !!user.must_change_password
            }
        });
    } catch (error) {
        console.error('[AUTH] Error en me:', error.message);
        return res.status(500).json({ message: 'Error interno del servidor' });
    }
};

const logout = async (req, res) => {
    const COOKIE_OPTIONS = getClearSessionCookieOptions();
    res.clearCookie('token_admin', COOKIE_OPTIONS);
    res.clearCookie('token_affiliate', COOKIE_OPTIONS);
    res.clearCookie('token_prestador', COOKIE_OPTIONS);
    res.clearCookie('token', COOKIE_OPTIONS);
    return res.status(200).json({ message: 'OK' });
};

/**
 * Registra un usuario interno (afiliado) dentro de una transacción existente.
 * La notificación de bienvenida se envía DESPUÉS de que la transacción externa haga commit,
 * por lo tanto la llamada a notify() debe hacerse en el caller, no aquí.
 */
const registerInternal = async (email, trx) => {
    const existing = await authRepository.getUserByUsername(email, trx);
    if (existing) {
        throw new Error('El usuario ya existe');
    }

    const defaultPassword = process.env.DEFAULT_USER_PASSWORD;
    if (!defaultPassword) {
        throw new Error('DEFAULT_USER_PASSWORD no configurada');
    }

    const hashedPassword = await bcrypt.hash(defaultPassword, 10);
    const newUser = await authRepository.createUser(email, hashedPassword, trx);

    const role = await authRepository.getRoleByRoleName('AFILIADO', trx);
    if (!role) throw new Error('Rol AFILIADO no encontrado en la base de datos');
    await authRepository.createUserRole(newUser[0].id, role.id, trx);

    return newUser[0];
};

module.exports = {
    login,
    me,
    logout,
    registerInternal,
    changePassword,
    validatePasswordPolicy
};
